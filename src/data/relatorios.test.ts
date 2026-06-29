import { describe, it, expect } from 'vitest';
import { kpi, agregaFinanceiro, tempoMedioPrimeiraResposta, conversao, passaOpp, resolvePeriodo, addDias, type ParcelaLite, type RelFiltros } from './relatorios';

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
