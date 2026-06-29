import { describe, it, expect } from 'vitest';
import { kpi, agregaFinanceiro, tempoMedioPrimeiraResposta, conversao, passaOpp, resolvePeriodo, addDias, chaveConexao, montaLinhasConexao, melhorConexao, type ParcelaLite, type RelFiltros, type ConexaoInput } from './relatorios';

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
      { id: 'k1', chip: 'chip1', criadoEm: dEm }, { id: 'k2', chip: 'chip1', criadoEm: dEm }, { id: 'k3', chip: 'chip1', criadoEm: dEm },
      { id: 'kprev', chip: 'chip1', criadoEm: dPrev }, // período anterior
      { id: 'k4', chip: 'chip2', criadoEm: dEm }, { id: 'k5', chip: 'chip2', criadoEm: dEm },
      { id: 'kr', chip: 'snap:999', criadoEm: dEm }, { id: 'ks', chip: 'sem', criadoEm: dEm },
    ],
    identidade: {
      chip1: { nome: 'Chip 1', numero: '111', tipo: 'trafego', gestor: 'Gestor X', removida: false },
      chip2: { nome: 'Chip 2', numero: '222', tipo: 'ura', gestor: '', removida: false },
      'snap:999': { nome: 'Chip Antigo', numero: '999', tipo: 'trafego', gestor: '', removida: true },
      sem: { nome: 'Sem conexão', numero: '', tipo: '', gestor: '', removida: false },
    },
    conversas: [{ id: 'c1a', chip: 'chip1', criadoEm: dEm }, { id: 'c1b', chip: 'chip1', criadoEm: dEm }, { id: 'c2', chip: 'chip2', criadoEm: dEm }],
    comEntrada: new Set(['c1a', 'c1b', 'c2']), resp: new Set(['c1a', 'c2']),
    firstIn: [{ conversa: 'c1a', chip: 'chip1', t: 1_000_000 }, { conversa: 'c2', chip: 'chip2', t: 1_000_000 }],
    firstResp: [{ conversa: 'c1a', chip: 'chip1', t: 1_600_000 }, { conversa: 'c2', chip: 'chip2', t: 2_200_000 }],
    opps: [
      { chip: 'chip1', status: 'ganho', qualificada: true, tempoFechDias: 5 }, { chip: 'chip1', status: 'perdido', qualificada: true, tempoFechDias: null }, { chip: 'chip1', status: 'em_andamento', qualificada: false, tempoFechDias: null },
      { chip: 'chip2', status: 'ganho', qualificada: true, tempoFechDias: 3 }, { chip: 'chip2', status: 'ganho', qualificada: true, tempoFechDias: 4 },
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
  it('chip1 mais leads, MENOR conversão; chip2 menos leads, conversão maior', () => {
    expect(c1.taxaConversao).toBeCloseTo(33.33, 1); expect(c2.taxaConversao).toBe(100); expect(c1.taxaConversao).toBeLessThan(c2.taxaConversao);
  });
  it('chip2 maior qualificação', () => { expect(c2.taxaQualificacao).toBe(100); expect(c2.taxaQualificacao).toBeGreaterThan(c1.taxaQualificacao); });
  it('atendimento por conversa (chip1: 2 conversas, 1 atendida, 1 sem resposta)', () => { expect(c1.conversas).toBe(2); expect(c1.conversasAtendidas).toBe(1); expect(c1.semResposta).toBe(1); expect(c1.taxaAtendimento).toBe(50); });
  it('1ª resposta por chip (chip1=10min)', () => { expect(c1.primeiraRespostaMin).toBe(10); });
  it('cobrança paga ligada ao lead original entra na receita do chip', () => { expect(c1.receitaRecebida).toBe(1000); expect(c1.clientesPagantes).toBe(1); expect(c1.ticketMedio).toBe(1000); });
  it('conexão removida preservada via snapshot (removida=true)', () => { const r = linhas.find((l) => l.chave === 'snap:999')!; expect(r.removida).toBe(true); expect(r.nome).toBe('Chip Antigo'); expect(r.leadsRecebidos).toBe(1); });
  it('lead sem canal agrupado em "sem" (não some)', () => { expect(linhas.find((l) => l.chave === 'sem')!.leadsRecebidos).toBe(1); });
  it('melhorConexao = chip com mais leads, ignorando "sem"', () => { expect(melhorConexao(linhas)?.chave).toBe('chip1'); });
  it('economia não preenchida não vira zero falso', () => { expect(c1.economiaPreenchida).toBe(false); });
});
