import { describe, expect, it } from 'vitest';
import { aplicarDemo, desfazerDemo, parteDoComercial, pctNoMes, totalPagoPeloCliente } from './comissoes';
import { gsCarregar } from './demoStore';
import { beforeEach } from 'vitest';
import { comissoesDe } from '../../pages/RevizaComissoes';
import type { ClienteAnalise } from '../../pages/cobrancaAnalytics';

/* Áudio do dono (29/09): "eu coloco o valor que eu recebo líquido que fica pro escritório; desse mesmo
   valor existe uma parte igual que vai pro comercial — o cliente pagou R$ 50 pra mim, tem que aparecer
   pro comercial que o cliente pagou R$ 50 pra eles". A célula da planilha = líquido do escritório. */
describe('divisão do pagamento: escritório × comercial', () => {
  it('50% (padrão): a parte do comercial é IGUAL ao líquido do escritório', () => {
    expect(parteDoComercial(50, 50)).toBe(50);
    expect(totalPagoPeloCliente(50, 50)).toBe(100);
  });
  it('% menor: o escritório fica com o resto — confere com os dados reais (Alexandra 40%, Rafael 30%)', () => {
    // cliente paga 100: Alexandra 40 / escritório 60; Rafael 30 / escritório 70
    expect(parteDoComercial(60, 40)).toBe(40);
    expect(totalPagoPeloCliente(60, 40)).toBe(100);
    expect(parteDoComercial(70, 30)).toBe(30);
  });
  it('bordas: zero, sem %, 100%', () => {
    expect(parteDoComercial(0, 50)).toBe(0);
    expect(parteDoComercial(80, 0)).toBe(0);
    expect(parteDoComercial(80, 100)).toBe(80);
  });
});

const cli = (id: string, atendente: string, mensalidade: number, celulas: string[]): ClienteAnalise => ({
  id, nome: id, ciclo: 'D24', atendente, mensalidade, comportamento: 'em_dia' as ClienteAnalise['comportamento'],
  meses: [], celulas, whatsapp: null, engajamento: [], faturamentoTotal: 0, ultimaResposta: null, ativo: true,
});

describe('comissões do comercial a partir da planilha', () => {
  it('realizado = parte do comercial sobre o líquido lançado (antes saía a metade)', () => {
    const [ed] = comissoesDe([cli('a', 'EDUARDO', 100, ['50', 'NÃO PAGOU']), cli('b', 'EDUARDO', 60, ['30', '30'])], ['2026-08', '2026-09'], {});
    expect(ed.pct).toBe(50);
    expect(ed.porComp[0]).toEqual({ comp: '2026-08', recebido: 80, comissao: 80, pagoClientes: 160, pct: 50, n: 2 });
    expect(ed.porComp[1].comissao).toBe(30);
    // previsto continua: 50% da mensalidade (o que o cliente paga) = o mesmo que o escritório espera
    expect(ed.comissaoPrevista).toBe(80);
  });
  it('comercial com % configurada (40%): 60 lançados pelo escritório → 40 dele', () => {
    const [al] = comissoesDe([cli('c', 'ALEXANDRA', 100, ['60'])], ['2026-09'], { ALEXANDRA: 40 });
    expect(al.porComp[0].comissao).toBe(40);
    expect(al.porComp[0].pagoClientes).toBe(100);
    expect(al.comissaoPrevista).toBe(40);
  });
  it('histórico da % (mig 62): o mês pago usa a % da ÉPOCA — mudar a % não reescreve o passado', () => {
    const hist = { EDUARDO: [{ desde: '2000-01', pct: 50 }, { desde: '2026-09', pct: 40 }] };
    const [ed] = comissoesDe([cli('a', 'EDUARDO', 100, ['50', '60'])], ['2026-08', '2026-09'], { EDUARDO: 40 }, undefined, hist);
    expect(ed.porComp[0]).toMatchObject({ comp: '2026-08', pct: 50, comissao: 50 });   // agosto: ainda 50% (igual)
    expect(ed.porComp[1]).toMatchObject({ comp: '2026-09', pct: 40, comissao: 40 });   // setembro: 40% → 60 × 40/60
    expect(ed.pct).toBe(40);                   // a previsão usa a % atual
    expect(ed.comissaoPrevista).toBe(40);
  });
});

describe('pctNoMes', () => {
  const hist = { ALEXANDRA: [{ desde: '2000-01', pct: 40 }, { desde: '2026-10', pct: 45 }] };
  it('pega o último ponto de mudança até o mês; sem histórico, a % atual/padrão', () => {
    expect(pctNoMes(hist, { ALEXANDRA: 45 }, 'Alexandra ', '2026-09')).toBe(40);
    expect(pctNoMes(hist, { ALEXANDRA: 45 }, 'ALEXANDRA', '2026-10')).toBe(45);
    expect(pctNoMes(hist, { RAFAEL: 30 }, 'RAFAEL', '2026-09')).toBe(30);
    expect(pctNoMes(hist, {}, 'EDUARDO', '2026-09')).toBe(50);
  });
});

/* dono 29/09: "coloco Augusto 30%, tudo que for do Augusto vai ser calculado 30% … todos os meses
   que ele já fez … tem que atualizar lá os valores" — o líquido lançado é refeito, o cliente pagou o mesmo */
describe('mudar a % refaz os valores lançados (demo = mesma conta do banco)', () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); },
      removeItem: (k: string) => { mem.delete(k); }, clear: () => mem.clear(), key: () => null, length: 0,
    } as Storage;
  });
  const somaDe = (nome: string) => {
    const d = gsCarregar(); let s = 0, n = 0;
    for (const l of d.linhas) if ((l.comercial ?? '').toUpperCase() === nome) for (const c of l.celulas) { const v = Number(String(c).replace(',', '.')); if (/^\d+([.,]\d+)?$/.test(String(c).trim()) && v > 0) { s += v; n += 1; } }
    return { s: Math.round(s * 100) / 100, n };
  };
  it('todos os meses: 50% → 30% faz o escritório ir de 50 para 70 em cada 100; o Desfazer volta tudo', () => {
    const antes = somaDe('AUGUSTO');
    expect(antes.n).toBeGreaterThan(0);
    const r = aplicarDemo('AUGUSTO', 30, '2000-01');
    expect(r.n).toBe(antes.n);
    const depois = somaDe('AUGUSTO');
    expect(Math.abs(depois.s - antes.s * 1.4)).toBeLessThan(antes.n * 0.01);   // ×70/50 (arredondado por pagamento)
    desfazerDemo('AUGUSTO', r);
    expect(somaDe('AUGUSTO').s).toBe(antes.s);
  });
  it('daqui pra frente: meses antes do escolhido não mudam', () => {
    const d0 = gsCarregar(); const ultimo = d0.comps[d0.comps.length - 1];
    const r = aplicarDemo('AUGUSTO', 30, ultimo);
    expect(r.pagamentos.every((p) => p.c >= ultimo)).toBe(true);
  });
});

