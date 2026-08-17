import { describe, it, expect } from 'vitest';
import {
  calcularContrato, calcularCartao, parseValorBR, parseInteiro,
  mensagemCliente, resumoInterno, totaisSimulacao,
  type DadosSimulacao,
} from './simulador';

describe('calcularContrato() — Price, recálculo pela taxa de referência', () => {
  it('sanidade do dono: parcela 400, 84x, 12% vs 1,85% → ≈ R$ 27.000 (±5%)', () => {
    const r = calcularContrato({ parcela: 400, prazo: 84, taxaContratada: 12, taxaReferencia: 1.85 });
    expect(r.dentroDaReferencia).toBe(false);
    expect(r.totalProjetado).toBeGreaterThan(27000 * 0.95);
    expect(r.totalProjetado).toBeLessThan(27000 * 1.05);
    // parcela justa + economia fecham a conta da projeção
    expect(r.parcelaJusta! + r.economiaMensal).toBeCloseTo(400, 6);
    expect(r.economiaMensal * 84).toBeCloseTo(r.totalProjetado, 6);
  });

  it('taxa contratada ≤ referência → dentro da referência, sem indébito', () => {
    const r = calcularContrato({ parcela: 400, prazo: 84, taxaContratada: 1.5, taxaReferencia: 1.85 });
    expect(r).toEqual({ dentroDaReferencia: true, economiaMensal: 0, totalProjetado: 0 });
  });

  it('jaDescontado = economia × parcelas pagas, com teto no prazo', () => {
    const base = { parcela: 400, prazo: 84, taxaContratada: 12, taxaReferencia: 1.85 };
    const r10 = calcularContrato({ ...base, parcelasPagas: 10 });
    expect(r10.jaDescontado).toBeCloseTo(r10.economiaMensal * 10, 6);
    const r200 = calcularContrato({ ...base, parcelasPagas: 200 });
    expect(r200.jaDescontado).toBeCloseTo(r200.economiaMensal * 84, 6);
  });
});

describe('calcularCartao() — meses corridos × valor mensal', () => {
  it('sanidade do dono: R$ 90 de 03/2020 a 08/2026 → 78 meses, R$ 7.020, dobro R$ 14.040', () => {
    const r = calcularCartao({ valorMensal: 90, inicio: { mes: 3, ano: 2020 }, fim: { mes: 8, ano: 2026 } });
    expect(r).toEqual({ meses: 78, total: 7020, totalEmDobro: 14040 });
  });

  it('fim anterior ao início não fica negativo', () => {
    const r = calcularCartao({ valorMensal: 90, inicio: { mes: 5, ano: 2026 }, fim: { mes: 1, ano: 2026 } });
    expect(r).toEqual({ meses: 0, total: 0, totalEmDobro: 0 });
  });
});

describe('parseValorBR() / parseInteiro()', () => {
  it('aceita os formatos pt-BR usuais', () => {
    expect(parseValorBR('1.234,56')).toBe(1234.56);
    expect(parseValorBR('1234,56')).toBe(1234.56);
    expect(parseValorBR('1.234')).toBe(1234);
    expect(parseValorBR('400')).toBe(400);
    expect(parseValorBR('1,85')).toBe(1.85);
    expect(parseValorBR('R$ 90')).toBe(90);
  });
  it('rejeita lixo', () => {
    expect(parseValorBR('')).toBeNull();
    expect(parseValorBR('abc')).toBeNull();
    expect(parseValorBR('1.2.3')).toBeNull();
    expect(parseInteiro('84')).toBe(84);
    expect(parseInteiro('8,5')).toBeNull();
    expect(parseInteiro('')).toBeNull();
  });
});

/* ------------------------------------------------------------------
   Moldes de cópia: BYTE A BYTE (copy do dono é literal — regra da casa).
   ------------------------------------------------------------------ */
const DADOS: DadosSimulacao = {
  nome: 'Maria Aparecida',
  taxaReferencia: 1.85,
  emprestimos: [{
    banco: 'AGIBANK', parcela: 400, prazo: 84, modo: 'media',
    taxaMin: 8, taxaMax: 20, totalMin: 20000, totalMax: 35000,
  }],
  cartoes: [{
    tipo: 'RMC', banco: 'BMG', valorMensal: 90, inicio: { mes: 3, ano: 2020 },
    meses: 78, total: 7020, totalEmDobro: 14040,
  }],
};

describe('mensagemCliente() — molde literal', () => {
  it('caso completo, byte a byte', () => {
    expect(mensagemCliente(DADOS)).toBe(
`*Simulação de valores — Maria Aparecida*

Com base nas informações dos seus descontos, fizemos o recálculo pela taxa de referência do Banco Central. A estimativa de valores a recuperar é:

- Empréstimos (1 contrato(s) — AGIBANK): R$ 20.000 a R$ 35.000
- Cartão RMC (BMG): R$ 7.020 já descontados — a ação busca a devolução em dobro: R$ 14.040

*Total estimado: R$ 34.040 a R$ 49.040*

_Os valores não incluem correção monetária e juros, que podem aumentar o total._

Importante: estes valores são uma estimativa e dependem da análise dos contratos e da decisão da Justiça. O processo é conduzido pelo escritório do Dr. Rafael Ribeiro de Menezes (OAB/RS 91.310).`);
  });

  it('bloco vazio some; sem nome o cabeçalho fecha limpo', () => {
    const msg = mensagemCliente({ ...DADOS, nome: '  ', emprestimos: [] });
    expect(msg.startsWith('*Simulação de valores*\n')).toBe(true);
    expect(msg).not.toContain('- Empréstimos');
    expect(msg).toContain('- Cartão RMC (BMG):');
    expect(msg).toContain('*Total estimado: R$ 14.040 a R$ 14.040*');
  });

  it('empréstimo "dentro da referência" (total 0) fica fora da contagem e dos bancos', () => {
    const msg = mensagemCliente({
      ...DADOS,
      emprestimos: [
        ...DADOS.emprestimos,
        { banco: 'BMG', parcela: 300, prazo: 60, modo: 'exata', taxaMin: 1.5, taxaMax: 1.5, totalMin: 0, totalMax: 0 },
      ],
    });
    expect(msg).toContain('- Empréstimos (1 contrato(s) — AGIBANK): R$ 20.000 a R$ 35.000');
  });

  it('múltiplos cartões geram uma linha por cartão', () => {
    const msg = mensagemCliente({
      ...DADOS,
      cartoes: [
        ...DADOS.cartoes,
        { tipo: 'RCC', banco: 'FACTA', valorMensal: 45, inicio: { mes: 1, ano: 2024 }, meses: 32, total: 1440, totalEmDobro: 2880 },
      ],
    });
    expect(msg).toContain('- Cartão RMC (BMG): R$ 7.020 já descontados — a ação busca a devolução em dobro: R$ 14.040');
    expect(msg).toContain('- Cartão RCC (FACTA): R$ 1.440 já descontados — a ação busca a devolução em dobro: R$ 2.880');
  });
});

describe('resumoInterno() — molde literal', () => {
  it('caso completo, byte a byte', () => {
    expect(resumoInterno(DADOS, '17/08/2026')).toBe(
`SIMULAÇÃO 17/08/2026 — Maria Aparecida
Taxa de referência: 1,85% a.m.
[EMPRÉSTIMOS]
- AGIBANK | parcela R$ 400 | 84x | taxa média 8–20% → R$ 20.000 – R$ 35.000
[CARTÕES]
- RMC BMG | R$ 90/mês desde 03/2020 | 78 meses → R$ 7.020 (dobro R$ 14.040)
TOTAL: R$ 34.040 – R$ 49.040`);
  });

  it('taxa exata vira valor único; bloco vazio some inteiro (cabeçalho junto)', () => {
    const r = resumoInterno({
      nome: '',
      taxaReferencia: 2,
      emprestimos: [{ banco: 'FACTA', parcela: 250.5, prazo: 72, modo: 'exata', taxaMin: 12, taxaMax: 12, totalMin: 15000, totalMax: 15000 }],
      cartoes: [],
    }, '01/01/2026');
    expect(r).toBe(
`SIMULAÇÃO 01/01/2026
Taxa de referência: 2% a.m.
[EMPRÉSTIMOS]
- FACTA | parcela R$ 250,50 | 72x | taxa exata 12% → R$ 15.000
TOTAL: R$ 15.000 – R$ 15.000`);
  });
});

describe('totaisSimulacao() — faixa dos empréstimos + dobro dos cartões', () => {
  it('soma como o consolidado da página', () => {
    expect(totaisSimulacao(DADOS)).toEqual({
      empMin: 20000, empMax: 35000, cartTotal: 7020, cartDobro: 14040,
      totalMin: 34040, totalMax: 49040,
    });
  });
});
