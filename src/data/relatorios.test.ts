import { describe, it, expect } from 'vitest';
import { kpi, agregaFinanceiro, tempoMedioPrimeiraResposta, conversao, passaOpp, resolvePeriodo, addDias, chaveConexao, chaveCanonicaTelefone, montaLinhasConexao, montaLinhasEquipe, melhorConexao, type ParcelaLite, type RelFiltros, type ConexaoInput, type EquipeData } from './relatorios';

const F = (extra: Partial<RelFiltros> = {}): RelFiltros => ({ preset: '30d', ...extra });

describe('kpi() — comparação de períodos', () => {
  it('denominador anterior zero com valor atual → deltaPct null (não 100%/Infinity)', () => {
    expect(kpi(5, 0).deltaPct).toBeNull();
  });
  it('ambos zero → deltaPct 0', () => { expect(kpi(0, 0).deltaPct).toBe(0); });
  it('variação normal', () => { const k = kpi(10, 5); expect(k.deltaAbs).toBe(5); expect(k.deltaPct).toBe(100); });
});

describe('tempoMedioPrimeiraResposta()', () => {
  const entradas = [{ c: 'A', t: 1_000_000 }, { c: 'B', t: 5_000_000 }, { c: 'C', t: 2_000_000 }];
  const respostas = [{ c: 'A', t: 1_600_000 }, { c: 'C', t: 1_000_000 }]; // C: saída ANTES da entrada
  it('conversa com resposta posterior → minutos corretos; sem resposta (B) e saída anterior (C) são ignoradas', () => {
    expect(tempoMedioPrimeiraResposta(entradas, respostas)).toBe(10); // (1.6M-1.0M)/60000 = 10 min, só A
  });
  it('conversa sem nenhuma resposta → null', () => {
    expect(tempoMedioPrimeiraResposta([{ c: 'X', t: 1_000_000 }], [])).toBeNull();
  });
  it('saída anterior à entrada não conta', () => {
    expect(tempoMedioPrimeiraResposta([{ c: 'Z', t: 2_000_000 }], [{ c: 'Z', t: 1_000_000 }])).toBeNull();
  });
});

describe('conversao() — comercial', () => {
  it('oportunidade ganha entra em ganhas e na taxa', () => {
    const c = conversao([{ status: 'ganho' }, { status: 'ganho' }, { status: 'perdido' }, { status: 'em_andamento' }]);
    expect(c.criadas).toBe(4); expect(c.ganhas).toBe(2); expect(c.perdidas).toBe(1); expect(c.taxa).toBe(50);
  });
  it('sem oportunidades → taxa 0 (sem divisão por zero)', () => { expect(conversao([]).taxa).toBe(0); });
});

describe('agregaFinanceiro() — receita e inadimplência', () => {
  const hoje = '2026-02-15';
  const par: ParcelaLite[] = [
    { status: 'paga', valor: 100, valor_pago: 100, data_prevista: '2026-02-05', data_pagamento: '2026-02-10' }, // paga (de cobrança que pode estar cancelada): receita histórica
    { status: 'cancelada', valor: 100, valor_pago: null, data_prevista: '2026-02-20', data_pagamento: null },    // cancelada: não entra em prevista
    { status: 'prevista', valor: 100, valor_pago: null, data_prevista: '2026-01-01', data_pagamento: null },     // vencida não paga
  ];
  const a = agregaFinanceiro(par, '2026-02-01', '2026-03-01', hoje);
  it('recebida = soma de valor_pago das pagas pela data_pagamento (parcela paga de cancelada permanece)', () => { expect(a.recebida).toBe(100); });
  it('prevista exclui canceladas (cobrança cancelada não gera previsão futura)', () => { expect(a.prevista).toBe(100); });
  it('cancelada contabilizada à parte', () => { expect(a.cancelada).toBe(100); });
  it('inadimplência só sobre parcelas vencidas (2 vencidas, 1 paga → 50%)', () => { expect(a.inadimplencia).toBe(50); expect(a.taxaRecebimento).toBe(50); });
});

describe('passaOpp() — filtros por domínio', () => {
  it('filtro por atendente (responsável) usa responsavel_id', () => {
    expect(passaOpp({ status: 'ganho', responsavel_id: 'u1' }, F({ responsavel: 'u1' }))).toBe(true);
    expect(passaOpp({ status: 'ganho', responsavel_id: 'u2' }, F({ responsavel: 'u1' }))).toBe(false);
  });
  it('filtro por etapa usa coluna_id', () => {
    expect(passaOpp({ status: 'x', coluna_id: 'c1' }, F({ coluna: 'c1' }))).toBe(true);
    expect(passaOpp({ status: 'x', coluna_id: 'c2' }, F({ coluna: 'c1' }))).toBe(false);
  });
  it('sem filtro → passa', () => { expect(passaOpp({ status: 'x' }, F())).toBe(true); });
});

describe('resolvePeriodo() — janelas, SP, virada de mês/ano', () => {
  it('início inclusivo / fim exclusivo (df = último dia + 1)', () => {
    const p = resolvePeriodo('custom', '2026-02-25', '2026-02-28');
    expect(p.iniDate).toBe('2026-02-25'); expect(p.fimDate).toBe('2026-03-01'); // exclusivo
    expect(p.iniISO).toBe('2026-02-25T00:00:00-03:00'); // America/Sao_Paulo
    expect(p.fimISO).toBe('2026-03-01T00:00:00-03:00');
  });
  it('período anterior tem a MESMA duração e termina onde o atual começa', () => {
    const p = resolvePeriodo('custom', '2026-02-25', '2026-02-28'); // 4 dias
    expect(p.dias).toBe(4);
    expect(p.prevIniDate).toBe('2026-02-21'); // 25 - 4
    expect(p.prevIniISO).toBe('2026-02-21T00:00:00-03:00');
  });
  it('virada de mês', () => {
    const p = resolvePeriodo('custom', '2026-02-26', '2026-03-02');
    expect(p.fimDate).toBe('2026-03-03'); expect(p.dias).toBe(5);
  });
  it('virada de ano', () => {
    expect(addDias('2025-12-31', 1)).toBe('2026-01-01');
    const p = resolvePeriodo('custom', '2025-12-30', '2026-01-02');
    expect(p.fimDate).toBe('2026-01-03'); expect(p.dias).toBe(4); expect(p.prevIniDate).toBe('2025-12-26');
  });
});

describe('chaveConexao() — agrupamento por conexão de aquisição', () => {
  it('id presente → o próprio id', () => { expect(chaveConexao('chip1', null)).toBe('chip1'); });
  it('id nulo + snapshot → snap:numero (conexão removida)', () => { expect(chaveConexao(null, { numero: '999', nome: 'Chip X' })).toBe('snap:999'); });
  it('id nulo + sem snapshot → sem', () => { expect(chaveConexao(null, null)).toBe('sem'); });
});

describe('montaLinhasConexao() — desempenho por chip', () => {
  const P = { iniDate: '2026-06-01', fimDate: '2026-07-01', prevIniDate: '2026-05-02', hoje: '2026-06-29' };
  const dEm = '2026-06-10T12:00:00-03:00', dPrev = '2026-05-10T12:00:00-03:00';
  const input: ConexaoInput = {
    contatos: [
      { id: 'k1', chip: 'chip1', criadoEm: dEm, tel: '5551900000001' }, { id: 'k2', chip: 'chip1', criadoEm: dEm, tel: '5551900000002' }, { id: 'k3', chip: 'chip1', criadoEm: dEm, tel: '5551900000003' },
      { id: 'kprev', chip: 'chip1', criadoEm: dPrev, tel: '5551900000009' }, // período anterior
      { id: 'k4', chip: 'chip2', criadoEm: dEm, tel: '5551900000004' }, { id: 'k5', chip: 'chip2', criadoEm: dEm, tel: '5551900000005' },
      { id: 'kr', chip: 'snap:999', criadoEm: dEm, tel: '5551900000006' }, { id: 'ks', chip: 'sem', criadoEm: dEm, tel: '5551900000007' },
    ],
    identidade: {
      chip1: { nome: 'Chip 1', numero: '111', tipo: 'trafego', gestor: 'Gestor X', fonte: 'Tráfego 1', campanha: '', removida: false },
      chip2: { nome: 'Chip 2', numero: '222', tipo: 'ura', gestor: '', fonte: '', campanha: '', removida: false },
      'snap:999': { nome: 'Chip Antigo', numero: '999', tipo: 'trafego', gestor: 'Gestor Y', fonte: '', campanha: 'Camp 1', removida: true },
      sem: { nome: 'Sem conexão', numero: '', tipo: '', gestor: '', fonte: '', campanha: '', removida: false },
    },
    conversas: [{ id: 'c1a', chip: 'chip1', criadoEm: dEm }, { id: 'c1b', chip: 'chip1', criadoEm: dEm }, { id: 'c2', chip: 'chip2', criadoEm: dEm }],
    comEntrada: new Set(['c1a', 'c1b', 'c2']), resp: new Set(['c1a', 'c2']),
    contatosComInbound: new Set(['k1', 'k2', 'k3', 'k4', 'k5', 'kr']),
    firstIn: [{ conversa: 'c1a', chip: 'chip1', t: 1_000_000 }, { conversa: 'c2', chip: 'chip2', t: 1_000_000 }],
    firstResp: [{ conversa: 'c1a', chip: 'chip1', t: 1_600_000 }, { conversa: 'c2', chip: 'chip2', t: 2_200_000 }],
    outbound: [{ chip: 'chip1' }, { chip: 'chip1' }, { chip: 'chip1' }, { chip: 'chip2' }, { chip: 'chip2' }],
    opps: [
      { chip: 'chip1', status: 'ganho', qualificada: true, tempoFechDias: 5 }, { chip: 'chip1', status: 'perdido', qualificada: true, tempoFechDias: null }, { chip: 'chip1', status: 'em_andamento', qualificada: false, tempoFechDias: null },
      { chip: 'chip2', status: 'ganho', qualificada: true, tempoFechDias: 3 }, { chip: 'chip2', status: 'ganho', qualificada: true, tempoFechDias: 4 },
    ],
    // fechamentos (fechado_em): chip1 tem 3 negócios em 2 clientes distintos (k1 duas vezes); chip2 tem 1 negócio/1 cliente
    fechamentos: [
      { chip: 'chip1', contato: 'k1' }, { chip: 'chip1', contato: 'k1' }, { chip: 'chip1', contato: 'k2' },
      { chip: 'chip2', contato: 'k4' },
    ],
    parcelas: [{ chip: 'chip1', contato: 'k1', status: 'paga', valor: 1000, valorPago: 1000, dataPrevista: '2026-06-05', dataPagamento: '2026-06-15' }],
    economiaPorChip: {},
    ...P,
  };
  const linhas = montaLinhasConexao(input);
  const c1 = linhas.find((l) => l.chave === 'chip1')!;
  const c2 = linhas.find((l) => l.chave === 'chip2')!;
  it('dois chips com volumes diferentes (chip1 mais leads, no período)', () => { expect(c1.leadsRecebidos).toBe(3); expect(c2.leadsRecebidos).toBe(2); });
  it('período anterior contabilizado separadamente', () => { expect(c1.leadsAnterior).toBe(1); expect(c2.leadsAnterior).toBe(0); });
  it('P2/P4: clientes distintos vs negócios fechados (por fechado_em)', () => {
    expect(c1.fechados).toBe(2); expect(c1.negociosFechados).toBe(3); // 3 negócios, 2 clientes (k1 repetido)
    expect(c2.fechados).toBe(1); expect(c2.negociosFechados).toBe(1);
  });
  it('P3: taxa principal = clientes fechados ÷ pessoas que chamaram', () => {
    expect(c1.taxaConversao).toBeCloseTo(66.67, 1); // 2 clientes / 3 pessoas
    expect(c2.taxaConversao).toBe(50);              // 1 cliente / 2 pessoas
  });
  it('conversão de oportunidades (detalhe) = ganhas criadas ÷ criadas', () => {
    expect(c1.conversaoOportunidades).toBeCloseTo(33.33, 1); expect(c2.conversaoOportunidades).toBe(100);
  });
  it('chip2 maior qualificação', () => { expect(c2.taxaQualificacao).toBe(100); expect(c2.taxaQualificacao).toBeGreaterThan(c1.taxaQualificacao); });
  it('atendimento por conversa (chip1: 2 conversas, 1 atendida, 1 sem resposta)', () => { expect(c1.conversas).toBe(2); expect(c1.conversasAtendidas).toBe(1); expect(c1.semResposta).toBe(1); expect(c1.taxaAtendimento).toBe(50); });
  it('1ª resposta por chip (chip1=10min)', () => { expect(c1.primeiraRespostaMin).toBe(10); });
  it('cobrança paga ligada ao lead original entra na receita do chip', () => { expect(c1.receitaRecebida).toBe(1000); expect(c1.clientesPagantes).toBe(1); expect(c1.ticketMedio).toBe(1000); });
  it('conexão removida preservada via snapshot (removida=true)', () => { const r = linhas.find((l) => l.chave === 'snap:999')!; expect(r.removida).toBe(true); expect(r.nome).toBe('Chip Antigo'); expect(r.leadsRecebidos).toBe(1); });
  it('lead sem canal agrupado em "sem" (não some)', () => { expect(linhas.find((l) => l.chave === 'sem')!.leadsRecebidos).toBe(1); });
  it('melhorConexao = chip com mais leads, ignorando "sem"', () => { expect(melhorConexao(linhas)?.chave).toBe('chip1'); });
  it('economia não preenchida não vira zero falso', () => { expect(c1.economiaPreenchida).toBe(false); });
  it('pessoas que chamaram = contatos do chip com inbound, dedup canônica (aqui distintos)', () => {
    expect(c1.pessoasQueChamaram).toBe(3); expect(c2.pessoasQueChamaram).toBe(2);
    expect(c1.contatosCriados).toBe(3); expect(c1.difContatosPessoas).toBe(0);
    expect(c1.conversasRecebidas).toBe(2); expect(c1.msgsInbound).toBe(1);
    expect(c1.msgsOutbound).toBe(3); expect(c2.msgsOutbound).toBe(2); // saída por chip
  });
});

describe('chaveCanonicaTelefone() — dedup por DDD + 8 finais', () => {
  it('9º dígito: com e sem 9 → mesma chave', () => {
    expect(chaveCanonicaTelefone('555181580190')).toBe('5181580190');   // 55 51 8158-0190
    expect(chaveCanonicaTelefone('5551981580190')).toBe('5181580190');  // 55 51 9 8158-0190
    expect(chaveCanonicaTelefone('555181580190')).toBe(chaveCanonicaTelefone('5551981580190'));
  });
  it('com e sem DDI 55 → mesma chave', () => {
    expect(chaveCanonicaTelefone('51981580190')).toBe('5181580190');    // sem DDI (DDD+9+8)
    expect(chaveCanonicaTelefone('5181580190')).toBe('5181580190');     // sem DDI (DDD+8)
  });
  it('formatação (parênteses/traços/espaços) não afeta', () => {
    expect(chaveCanonicaTelefone('(51) 98158-0190')).toBe('5181580190');
  });
  it('DDDs diferentes com mesmos 8 finais NÃO colidem', () => {
    expect(chaveCanonicaTelefone('5551981580190')).not.toBe(chaveCanonicaTelefone('5553981580190'));
  });
  it('vazio/null → null', () => { expect(chaveCanonicaTelefone(null)).toBeNull(); expect(chaveCanonicaTelefone('')).toBeNull(); });
  it('número curto/fora do padrão (não 10-11 díg) → mantém dígitos (sem colisão)', () => {
    expect(chaveCanonicaTelefone('12345')).toBe('12345');
    expect(chaveCanonicaTelefone('abc')).toBeNull();
  });
});

describe('Pessoas que chamaram — regras de negócio (dedup/outbound/LID)', () => {
  const P = { iniDate: '2026-06-01', fimDate: '2026-07-01', prevIniDate: '2026-05-02', hoje: '2026-06-29' };
  const dEm = '2026-06-10T12:00:00-03:00';
  const base = (over: Partial<ConexaoInput>): ConexaoInput => ({
    contatos: [], identidade: { A: { nome: 'A', numero: '', tipo: '', gestor: '', fonte: '', campanha: '', removida: false } },
    conversas: [], comEntrada: new Set(), resp: new Set(), contatosComInbound: new Set(),
    firstIn: [], firstResp: [], outbound: [], opps: [], fechamentos: [], parcelas: [], economiaPorChip: {}, ...P, ...over,
  });
  const linhaA = (inp: ConexaoInput) => montaLinhasConexao(inp).find((l) => l.chave === 'A')!;

  it('outbound-only NÃO conta como pessoa que chamou (mas conta como contato criado)', () => {
    const l = linhaA(base({
      contatos: [{ id: 'p1', chip: 'A', criadoEm: dEm, tel: '5551900000010' }, { id: 'p2', chip: 'A', criadoEm: dEm, tel: '5551900000011' }],
      contatosComInbound: new Set(['p1']), // p2 só recebeu outbound
    }));
    expect(l.contatosCriados).toBe(2);
    expect(l.pessoasQueChamaram).toBe(1);
    expect(l.difContatosPessoas).toBe(1);
  });
  it('duplicado por 9º dígito com inbound colapsa em 1 pessoa', () => {
    const l = linhaA(base({
      contatos: [{ id: 'd1', chip: 'A', criadoEm: dEm, tel: '555181580190' }, { id: 'd2', chip: 'A', criadoEm: dEm, tel: '5551981580190' }],
      contatosComInbound: new Set(['d1', 'd2']),
    }));
    expect(l.contatosCriados).toBe(2);
    expect(l.pessoasQueChamaram).toBe(1); // mesma pessoa, chave canônica única
  });
  it('LID puro (sem telefone) com inbound conta como 1 pessoa (fallback por contato)', () => {
    const l = linhaA(base({
      contatos: [{ id: 'lid1', chip: 'A', criadoEm: dEm, tel: null }, { id: 'lid2', chip: 'A', criadoEm: dEm, tel: null }],
      contatosComInbound: new Set(['lid1', 'lid2']),
    }));
    expect(l.pessoasQueChamaram).toBe(2); // sem telefone não deduplica: cada um é 1 pessoa
  });
  it('agregação por canal: cada chip conta suas próprias pessoas', () => {
    const linhas = montaLinhasConexao(base({
      identidade: { A: { nome: 'A', numero: '', tipo: '', gestor: '', fonte: '', campanha: '', removida: false }, B: { nome: 'B', numero: '', tipo: '', gestor: '', fonte: '', campanha: '', removida: false } },
      contatos: [
        { id: 'a1', chip: 'A', criadoEm: dEm, tel: '5551900000020' }, { id: 'a2', chip: 'A', criadoEm: dEm, tel: '5551900000021' },
        { id: 'b1', chip: 'B', criadoEm: dEm, tel: '5551900000022' },
      ],
      contatosComInbound: new Set(['a1', 'a2', 'b1']),
    }));
    expect(linhas.find((l) => l.chave === 'A')!.pessoasQueChamaram).toBe(2);
    expect(linhas.find((l) => l.chave === 'B')!.pessoasQueChamaram).toBe(1);
  });
});

describe('resolvePeriodo — 7 dias contido em 30 dias', () => {
  it('30d contém 7d: mesmo fim, início 30d <= início 7d, durações corretas', () => {
    const p7 = resolvePeriodo('7d'); const p30 = resolvePeriodo('30d');
    expect(p30.fimISO).toBe(p7.fimISO);                 // ambos terminam hoje+1 (exclusivo)
    expect(p30.iniISO <= p7.iniISO).toBe(true);         // 30d começa antes (ou igual)
    expect(p7.dias).toBe(7); expect(p30.dias).toBe(30);
  });
});

describe('métricas por período — 30 dias NUNCA menor que 7 dias', () => {
  // dataset compartilhado; o recorte de 7d é subconjunto do de 30d
  const contatos = [
    { id: 'a1', chip: 'A', criadoEm: '2026-07-06T12:00:00-03:00', tel: '5551990000001' }, // 7d e 30d
    { id: 'a2', chip: 'A', criadoEm: '2026-06-20T12:00:00-03:00', tel: '5551990000002' }, // só 30d
    { id: 'a3', chip: 'A', criadoEm: '2026-07-07T12:00:00-03:00', tel: '555190000001'  }, // 9º-dígito dup de a1 (mesma pessoa), 7d
  ];
  const ident = { A: { nome: 'A', numero: '', tipo: '', gestor: '', fonte: '', campanha: '', removida: false } };
  const mk = (P: { iniDate: string; fimDate: string; prevIniDate: string; hoje: string }, inbound: string[], outN: number, inN: number) =>
    montaLinhasConexao({
      contatos, identidade: ident, conversas: [], comEntrada: new Set(), resp: new Set(),
      contatosComInbound: new Set(inbound),
      firstIn: Array.from({ length: inN }, () => ({ conversa: 'x', chip: 'A', t: 0 })),
      firstResp: [], outbound: Array.from({ length: outN }, () => ({ chip: 'A' })),
      opps: [], fechamentos: [], parcelas: [], economiaPorChip: {}, ...P,
    }).find((l) => l.chave === 'A')!;
  const l30 = mk({ iniDate: '2026-06-12', fimDate: '2026-07-12', prevIniDate: '2026-05-13', hoje: '2026-07-11' }, ['a1', 'a2', 'a3'], 20, 10);
  const l7  = mk({ iniDate: '2026-07-05', fimDate: '2026-07-12', prevIniDate: '2026-06-28', hoje: '2026-07-11' }, ['a1', 'a3'], 6, 3);

  it('pessoas 30d >= 7d; quem chamou no 7d também está no 30d; dedup canônico igual', () => {
    expect(l7.pessoasQueChamaram).toBe(1);   // a1 e a3 = mesma pessoa (canônico)
    expect(l30.pessoasQueChamaram).toBe(2);  // + a2
    expect(l30.pessoasQueChamaram).toBeGreaterThanOrEqual(l7.pessoasQueChamaram);
  });
  it('contatos criados / inbound / outbound: 30d >= 7d', () => {
    expect(l30.contatosCriados).toBeGreaterThanOrEqual(l7.contatosCriados);
    expect(l30.msgsInbound).toBeGreaterThanOrEqual(l7.msgsInbound);
    expect(l30.msgsOutbound).toBeGreaterThanOrEqual(l7.msgsOutbound);
    expect(l30.contatosCriados).toBe(3); expect(l7.contatosCriados).toBe(2);
  });
});

describe('montaLinhasEquipe — fonte única por atendente (reconciliação)', () => {
  const eq: EquipeData = {
    comercial: [
      { id: 'u1', nome: 'A', leads: 10, oppAndamento: 2, oppGanho: 5, oppPerdido: 1, clientesFechados: 8, negociosFechados: 9, taxaConversao: 80, receitaContratada: 0, receitaRecebida: 100 },
      { id: 'u2', nome: 'B', leads: 5, oppAndamento: 0, oppGanho: 0, oppPerdido: 0, clientesFechados: 2, negociosFechados: 2, taxaConversao: 40, receitaContratada: 0, receitaRecebida: 0 },
      { id: '__nao_atribuido__', nome: 'Não atribuído', leads: 0, oppAndamento: 0, oppGanho: 0, oppPerdido: 0, clientesFechados: 2, negociosFechados: 2, taxaConversao: 0, receitaContratada: 0, receitaRecebida: 0 },
    ],
    atendimento: [
      { id: 'u1', nome: 'A', conversasRespondidas: 3, mensagensEnviadas: 50, conversasSemResposta: 2 },
      { id: 'u2', nome: 'B', conversasRespondidas: 1, mensagensEnviadas: 10, conversasSemResposta: 1 },
    ],
    atendimentoAtribuivel: true,
  };
  const rows = montaLinhasEquipe(eq);
  it('soma de clientes/negócios por atendente = total geral (12 clientes, 13 negócios)', () => {
    expect(rows.reduce((s, r) => s + r.clientesFechados, 0)).toBe(12);
    expect(rows.reduce((s, r) => s + r.negociosFechados, 0)).toBe(13);
  });
  it('"Não atribuído" não some e mantém seus fechamentos', () => {
    const na = rows.find((r) => r.id === '__nao_atribuido__');
    expect(na).toBeTruthy(); expect(na!.clientesFechados).toBe(2); expect(na!.negociosFechados).toBe(2);
    expect(na!.mensagensEnviadas).toBe(0); // sem entrada em atendimento
  });
  it('merge com atendimento (msgs enviadas + sem resposta) e oportunidades trabalhadas', () => {
    const a = rows.find((r) => r.id === 'u1')!;
    expect(a.mensagensEnviadas).toBe(50); expect(a.conversasSemResposta).toBe(2);
    expect(a.oppTrabalhadas).toBe(8); // 2 andamento + 5 ganho + 1 perdido
    expect(a.taxaOperacional).toBe(80);
  });
  it('ordena por clientes fechados desc (A no topo)', () => { expect(rows[0].id).toBe('u1'); });
});
