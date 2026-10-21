import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { periodoDash } from '@/data/dashboard';
import {
  faixasEscalaV5, fmtDuracaoH, fmtDuracaoMin, fmtInt, fmtPct, fmtTelefone, fmtVariacao, pctDe, rotuloMotivoNe, variacao,
} from '@/data/dashboardV5.formato';
import { demoDashV5, DEMO_CANAIS } from '@/data/dashboardV5.demo';
import { janelaV5, normalizarDashV5, traduzErroDashV5 } from '@/data/dashboardV5';
import { janelaMapaV5, periodoAnteriorV5, rotuloComparacaoV5 } from '@/data/dashboardV5.periodo';
import type { DashV5 } from '@/data/dashboardV5.tipos';

/** instante em São Paulo (UTC-3 fixo) */
const SP = (s: string) => new Date(`${s}-03:00`);
const AGORA = SP('2026-10-21T17:30:00');
const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);

/* ====================================================================== */
/* Formato                                                                 */
/* ====================================================================== */
describe('formato', () => {
  it('inteiros e porcentagens em pt-BR; ausência vira traço', () => {
    expect(fmtInt(1234)).toBe('1.234');
    expect(fmtInt(12.6)).toBe('13');
    expect(fmtInt(null)).toBe('—');
    expect(fmtInt(Number.NaN)).toBe('—');
    expect(fmtPct(34.4)).toBe('34%');
    expect(fmtPct(8.33)).toBe('8,3%');
    expect(fmtPct(4)).toBe('4%');
    expect(fmtPct(null)).toBe('—');
    expect(pctDe(1, 4)).toBe(25);
    expect(pctDe(1, 0)).toBeNull();
  });

  it('durações: min, h + min, dias com uma casa', () => {
    expect(fmtDuracaoMin(0.4)).toBe('< 1 min');
    expect(fmtDuracaoMin(4)).toBe('4 min');
    expect(fmtDuracaoMin(59.4)).toBe('59 min');
    expect(fmtDuracaoMin(59.6)).toBe('1 h');
    expect(fmtDuracaoMin(200)).toBe('3 h 20');
    expect(fmtDuracaoMin(125)).toBe('2 h 05');
    expect(fmtDuracaoMin(24 * 60 * 1.4)).toBe('1,4 dia');
    expect(fmtDuracaoMin(24 * 60 * 4.8)).toBe('4,8 dias');
    expect(fmtDuracaoMin(null)).toBe('—');
    expect(fmtDuracaoMin(-3)).toBe('—');
    expect(fmtDuracaoH(0.5)).toBe('30 min');
    expect(fmtDuracaoH(3 + 1 / 3)).toBe('3 h 20');
    expect(fmtDuracaoH(26.9)).toBe('1,1 dia');
    expect(fmtDuracaoH(114)).toBe('4,8 dias');
    expect(fmtDuracaoH(undefined)).toBe('—');
  });

  it('telefone: (DDD) e nono dígito do celular na exibição', () => {
    expect(fmtTelefone('555194266757')).toBe('(51) 99426-6757');
    expect(fmtTelefone('5551994266757')).toBe('(51) 99426-6757');
    expect(fmtTelefone('555133334444')).toBe('(51) 3333-4444');
    expect(fmtTelefone(null)).toBe('—');
    expect(fmtTelefone('abc')).toBe('abc');
  });

  it('motivo de não elegível usa o rótulo do Kanban; nulo vira Sem categoria', () => {
    expect(rotuloMotivoNe('sem_beneficio_inss')).toBe('Não recebe benefício do INSS');
    expect(rotuloMotivoNe('nao_mora_rs')).toBe('Não mora no RS');
    expect(rotuloMotivoNe('sem_categoria')).toBe('Sem categoria');
    expect(rotuloMotivoNe(null)).toBe('Sem categoria');
    expect(rotuloMotivoNe('motivo_novo')).toBe('Motivo novo');
  });

  it('variação: % relativo, +N quando o anterior é zero, estável', () => {
    expect(fmtVariacao(variacao(120, 100))).toBe('+20%');
    expect(fmtVariacao(variacao(95, 100))).toBe('−5%');
    expect(fmtVariacao(variacao(103.5, 100))).toBe('+3,5%');
    expect(fmtVariacao(variacao(4, 0))).toBe('+4');
    expect(fmtVariacao(variacao(7, 7))).toBe('estável');
    expect(fmtVariacao(variacao(null, 7))).toBe('—');
  });
});

/* ====================================================================== */
/* Período                                                                 */
/* ====================================================================== */
describe('período anterior: mesmo tempo decorrido', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(SP('2026-10-14T14:00:00')); });
  afterAll(() => { vi.useRealTimers(); });

  it('hoje às 14:00 compara com ontem até 14:00', () => {
    const p = periodoDash('hoje');
    const a = periodoAnteriorV5(p, SP('2026-10-14T14:00:30'));
    expect(a).toMatchObject({ parcial: true, rotulo: '13/10 até 14:00' });
    expect(a.fimISO).toBe(SP('2026-10-13T14:00:00').toISOString());
    expect(a.decorridoH).toBeCloseTo(14, 1);
    expect(rotuloComparacaoV5(a, p, '2026-10-14')).toBe('vs ontem até 14:00');
  });
  it('7 dias: o anterior vai até o mesmo minuto, 7 dias antes', () => {
    const p = periodoDash('7d');
    const a = periodoAnteriorV5(p, SP('2026-10-14T14:00:00'));
    expect(a.parcial).toBe(true);
    expect(a.fimISO).toBe(SP('2026-10-07T14:00:00').toISOString());
    expect(a.rotulo).toBe('01/10 a 07/10 até 14:00');
    expect(rotuloComparacaoV5(a, p, '2026-10-14')).toBe('vs 01/10 a 07/10 até 14:00');
  });
  it('período fechado: o anterior inteiro', () => {
    const p = periodoDash('custom', '2026-10-01', '2026-10-07');
    const a = periodoAnteriorV5(p, SP('2026-10-14T14:00:00'));
    expect(a).toMatchObject({ parcial: false, fimISO: p.iniISO, rotulo: '24/09 a 30/09' });
    const um = periodoAnteriorV5(periodoDash('custom', '2026-10-07', '2026-10-07'), SP('2026-10-14T14:00:00'));
    expect(um.rotulo).toBe('06/10');
  });
  it('mês comercial FECHADO compara com o mês anterior inteiro (10→10), mesmo com 31 dias', () => {
    // 10/09–09/10 (30 dias) × 10/08–09/09 (31 dias): nada de "10/08 a 08/09"
    const p = periodoDash('mes_caf', undefined, undefined, -1);
    expect(p.iniDate).toBe('2026-09-10');
    const a = periodoAnteriorV5(p, SP('2026-10-14T14:00:00'));
    expect(a).toMatchObject({ parcial: false, iniISO: p.prevIniISO, fimISO: p.iniISO, rotulo: '10/08 a 09/09' });
  });
  it('mês comercial EM ANDAMENTO segue cortado no mesmo tempo decorrido', () => {
    const p = periodoDash('mes_caf');
    const a = periodoAnteriorV5(p, SP('2026-10-14T14:00:00'));
    expect(a.parcial).toBe(true);
    expect(a.fimISO).toBe(SP('2026-09-14T14:00:00').toISOString());
  });
  it('logo depois da meia-noite ainda manda pelo menos 1 minuto de anterior', () => {
    const p = periodoDash('hoje');
    const a = periodoAnteriorV5(p, SP('2026-10-14T00:00:20'));
    expect(Date.parse(a.fimISO)).toBeGreaterThan(Date.parse(a.iniISO));
  });
});

describe('janela do mapa', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AGORA); });
  afterAll(() => { vi.useRealTimers(); });

  it('Hoje e 3 dias desenham os últimos 7 dias terminando hoje', () => {
    for (const preset of ['hoje', '3d'] as const) {
      const m = janelaMapaV5(periodoDash(preset), '2026-10-21');
      expect(m.estendido).toBe(true);
      expect(m.iniDate).toBe('2026-10-15');
      expect(m.dias).toHaveLength(7);
      expect(m.dias[6]).toBe('2026-10-21');
      expect(m.modo).toBe('dias');
      expect(m.iniISO).toBe('2026-10-15T00:00:00-03:00');
    }
  });
  it('7 dias: o próprio período, uma linha por data', () => {
    const m = janelaMapaV5(periodoDash('7d'), '2026-10-21');
    expect(m.estendido).toBe(false);
    expect(m.dias).toHaveLength(7);
    expect(m.modo).toBe('dias');
  });
  it('mês comercial em andamento conta só os dias que já começaram', () => {
    const m = janelaMapaV5(periodoDash('mes_caf'), '2026-10-21');
    expect(m.iniDate).toBe('2026-10-10');
    expect(m.dias).toHaveLength(12);
    expect(m.modo).toBe('dias');
  });
  it('mês fechado (mais de 14 dias) vira média por dia da semana', () => {
    const m = janelaMapaV5(periodoDash('mes_caf', undefined, undefined, -1), '2026-10-21');
    expect(m.dias.length).toBeGreaterThan(14);
    expect(m.modo).toBe('semana');
  });
});

/* ====================================================================== */
/* Demo — invariantes (construído por lead, então os totais fecham)        */
/* ====================================================================== */
describe('demo — invariantes', () => {
  beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AGORA); });
  afterAll(() => { vi.useRealTimers(); });

  const casos = () => ({
    hoje: periodoDash('hoje'),
    '3d': periodoDash('3d'),
    '7d': periodoDash('7d'),
    mes_caf: periodoDash('mes_caf'),
    mes_caf_anterior: periodoDash('mes_caf', undefined, undefined, -1),
    custom_1d: periodoDash('custom', '2026-10-07', '2026-10-07'),
  });

  for (const nome of ['hoje', '3d', '7d', 'mes_caf', 'mes_caf_anterior', 'custom_1d'] as const) {
    describe(nome, () => {
      const pegar = (): DashV5 => demoDashV5(janelaV5(casos()[nome], AGORA, '2026-10-21'), AGORA);

      it('números: todos os conectados aparecem; soma = KPIs', () => {
        const d = pegar();
        const conectados = d.canais.filter((c) => c.situacao === 'conectado');
        expect(conectados.map((c) => c.nome).sort()).toEqual(DEMO_CANAIS.filter((c) => c.id).map((c) => c.nome).sort());
        expect(d.canais.filter((c) => c.situacao === 'antigo').length).toBeLessThanOrEqual(1);
        // no demo cada lead é um cliente diferente: soma das entradas = clientes distintos
        expect(soma(d.canais.map((c) => c.entradas))).toBe(d.kpis.entradas);
        expect(soma(d.canais.map((c) => c.ne))).toBe(d.kpis.ne);
        expect(soma(d.canais.map((c) => c.ganhos))).toBe(d.kpis.ganhos);
        for (const c of d.canais) {
          expect(soma(Object.values(c.neMotivos))).toBe(c.ne);
          expect(c.fechN).toBeLessThanOrEqual(c.ganhos);
          if (c.fechN === 0) expect(c.fechMedianaH).toBeNull();
        }
        // ordem: entradas decrescentes, antigos por último
        const ent = conectados.map((c) => c.entradas);
        expect(ent).toEqual([...ent].sort((a, b) => b - a));
        if (d.canais.some((c) => c.situacao === 'antigo')) expect(d.canais[d.canais.length - 1].situacao).toBe('antigo');
        expect(d.canais.find((c) => c.nome === 'OFICIAL')?.entradas).toBe(0);
      });

      it('não elegíveis: motivos = total = IA + regra RS + equipe = KPI', () => {
        const d = pegar();
        expect(soma(d.ne.motivos.map((m) => m.qtd))).toBe(d.ne.total);
        expect(d.ne.quem.ia + d.ne.quem.regraRs + d.ne.quem.equipe).toBe(d.ne.total);
        expect(d.ne.total).toBe(d.kpis.ne);
        const q = d.ne.motivos.map((m) => m.qtd);
        expect(q).toEqual([...q].sort((a, b) => b - a));
      });

      it('atendentes: fechados ≤ KPI, NE marcados ≤ equipe, ordem por recebidos', () => {
        const d = pegar();
        expect(soma(d.atendentes.map((a) => a.ganhos))).toBeLessThanOrEqual(d.kpis.ganhos);
        expect(soma(d.atendentes.map((a) => a.neMarcados))).toBeLessThanOrEqual(d.ne.quem.equipe);
        const rec = d.atendentes.map((a) => a.recebidos);
        expect(rec).toEqual([...rec].sort((a, b) => b - a));
        for (const a of d.atendentes) {
          expect(a.respCelularN).toBeLessThanOrEqual(a.respN);
          expect(a.fechN).toBeLessThanOrEqual(a.ganhos);
          if (a.respN === 0) expect(a.respMedianaMin).toBeNull();
          if (a.respMedianaMin != null) expect(a.respMedianaMin).toBeGreaterThanOrEqual(0);
        }
      });

      it('mapa: células válidas, dentro da janela do mapa', () => {
        const d = pegar();
        const ini = d.periodo.mapaInicio.slice(0, 10);
        for (const c of d.mapa) {
          expect(c.hora).toBeGreaterThanOrEqual(0);
          expect(c.hora).toBeLessThanOrEqual(23);
          expect(c.entradas).toBeGreaterThan(0);
          expect(c.dia >= ini).toBe(true);
        }
      });
    });
  }

  it('7 dias: o mapa soma exatamente as entradas do período', () => {
    const d = demoDashV5(janelaV5(periodoDash('7d'), AGORA, '2026-10-21'), AGORA);
    expect(soma(d.mapa.map((c) => c.entradas))).toBe(soma(d.canais.map((c) => c.entradas)));
  });

  it('proporções parecidas com o banco real (7 dias)', () => {
    const d = demoDashV5(janelaV5(periodoDash('7d'), AGORA, '2026-10-21'), AGORA);
    const emp = d.canais.find((c) => c.nome === 'EMPRESTIMO')!;
    expect(emp.entradas).toBeGreaterThan(550);
    expect(emp.entradas).toBeLessThan(1000);
    expect(d.ne.total / d.kpis.entradas).toBeGreaterThan(0.3);
    expect(d.ne.total / d.kpis.entradas).toBeLessThan(0.7);
    expect(d.atendentes.map((a) => a.nome)).toEqual(expect.arrayContaining(['Juliana', 'Matheus', 'Isadora', 'Luiz']));
    expect(d.kpis.ganhos).toBeGreaterThan(5);
  });

  it('determinístico e estável: o relógio só acrescenta', () => {
    const p = periodoDash('hoje');
    const a = demoDashV5(janelaV5(p, AGORA, '2026-10-21'), AGORA);
    const b = demoDashV5(janelaV5(p, AGORA, '2026-10-21'), AGORA);
    expect(b).toEqual(a);
    const depois = new Date(AGORA.getTime() + 30 * 60_000);
    const c = demoDashV5(janelaV5(p, depois, '2026-10-21'), depois);
    expect(c.kpis.entradas).toBeGreaterThanOrEqual(a.kpis.entradas);
    expect(c.kpis.ne).toBeGreaterThanOrEqual(a.kpis.ne);
    for (const x of a.canais) {
      const y = c.canais.find((k) => k.canalId === x.canalId);
      if (y) expect(y.entradas).toBeGreaterThanOrEqual(x.entradas);
    }
  });
});

/* ====================================================================== */
/* Normalizador                                                            */
/* ====================================================================== */
describe('normalizarDashV5', () => {
  it('aguenta resposta vazia ou nula', () => {
    for (const bruto of [null, undefined, {}, [], 'x']) {
      const d = normalizarDashV5(bruto);
      expect(d.canais).toEqual([]);
      expect(d.atendentes).toEqual([]);
      expect(d.mapa).toEqual([]);
      expect(d.ne).toEqual({ total: 0, motivos: [], quem: { ia: 0, regraRs: 0, equipe: 0 } });
      expect(d.kpis).toEqual({ entradas: 0, ne: 0, ganhos: 0, fechMedianaH: null, fechMediaH: null, fechN: 0 });
      expect(d.kpisAnterior).toBeNull();
      expect(typeof d.geradoEm).toBe('string');
    }
  });

  it('converte snake_case, tolera campos faltando e números como texto', () => {
    const d = normalizarDashV5({
      gerado_em: '2026-10-21T20:30:00Z',
      periodo: { inicio: 'a', fim: 'b' },
      kpis: { entradas: '127', ne: 79, ganhos: 5, fech_mediana_h: 162.5 },
      kpis_anterior: { entradas: 85 },
      canais: [
        { canal_id: 'c1', nome: 'EMPRESTIMO', numero: '555194266757', situacao: 'conectado', entradas: 82, ne_motivos: { sem_beneficio_inss: '45' } },
        { nome: 'Números antigos', situacao: 'antigo', ne: 1 },
      ],
      ne: { motivos: [{ motivo: 'sem_interesse', qtd: 2 }, { motivo: null, qtd: 3 }], quem: { regra_rs: 1 } },
      atendentes: [{ usuario_id: 'u1', nome: 'Juliana', resp_mediana_min: 4.2 }, { nome: 'sem id' }],
      mapa: [
        { dia: '2026-10-21', hora: 14, entradas: 12 }, { dia: 'ruim', hora: 3 }, { dia: '2026-10-21', hora: 25 },
        // sem hora (ou hora quebrada) NÃO vira 0h
        { dia: '2026-10-21', entradas: 3 }, { dia: '2026-10-21', hora: null, entradas: 2 }, { dia: '2026-10-21', hora: 2.5, entradas: 1 },
        { dia: '2026-10-21', hora: '0', entradas: 4 },
      ],
    });
    expect(d.kpis).toEqual({ entradas: 127, ne: 79, ganhos: 5, fechMedianaH: 162.5, fechMediaH: null, fechN: 0 });
    expect(d.kpisAnterior?.entradas).toBe(85);
    expect(d.periodo.mapaInicio).toBe('a');
    expect(d.canais[0]).toMatchObject({ canalId: 'c1', neMotivos: { sem_beneficio_inss: 45 }, ganhos: 0, fechMedianaH: null });
    expect(d.canais[1]).toMatchObject({ canalId: null, situacao: 'antigo', numero: null, entradas: 0, ne: 1 });
    expect(d.ne.total).toBe(5);
    expect(d.ne.motivos).toEqual([{ motivo: 'sem_categoria', qtd: 3 }, { motivo: 'sem_interesse', qtd: 2 }]);
    expect(d.ne.quem).toEqual({ ia: 0, regraRs: 1, equipe: 0 });
    expect(d.atendentes).toHaveLength(1);
    expect(d.atendentes[0]).toMatchObject({ usuarioId: 'u1', respMedianaMin: 4.2, respMediaMin: null, recebidos: 0 });
    expect(d.mapa).toEqual([{ dia: '2026-10-21', hora: 14, entradas: 12 }, { dia: '2026-10-21', hora: 0, entradas: 4 }]);
    // sem busca_em, o instante da busca cai no da foto (o hook sobrescreve com o seu relógio)
    expect(d.buscaEm).toBe('2026-10-21T20:30:00Z');
  });

  it('erro da RPC vira frase em português', () => {
    expect(traduzErroDashV5(new Error('periodo_longo'))).toMatch(/45 dias/);
    // statement_timeout (57014) do papel authenticated: frase amigável, não SQL
    expect(traduzErroDashV5({ code: '57014', message: 'canceling statement due to statement timeout' })).toMatch(/demorou demais/);
    expect(traduzErroDashV5(new Error('canceling statement due to statement timeout'))).toMatch(/demorou demais/);
    expect(traduzErroDashV5({ message: 'sem_permissao' })).toMatch(/acesso/);
    expect(traduzErroDashV5('qualquer coisa')).toMatch(/Não foi possível/);
  });
});

/* ====================================================================== */
/* Legenda do mapa                                                         */
/* ====================================================================== */
describe('faixasEscalaV5', () => {
  it('contagens: faixas inteiras contíguas; o último degrau leva os picos (≥)', () => {
    expect(faixasEscalaV5(12, false)).toEqual([
      { q: 1, rotulo: '1–2' }, { q: 2, rotulo: '3–4' }, { q: 3, rotulo: '5–7' }, { q: 4, rotulo: '8–9' }, { q: 5, rotulo: '≥ 10' },
    ]);
  });
  it('topo pequeno: degraus que nenhum inteiro alcança somem', () => {
    expect(faixasEscalaV5(3, false)).toEqual([{ q: 2, rotulo: '1' }, { q: 4, rotulo: '2' }, { q: 5, rotulo: '≥ 3' }]);
    expect(faixasEscalaV5(1, false)).toEqual([{ q: 5, rotulo: '≥ 1' }]);
    expect(faixasEscalaV5(0, false)).toEqual([]);
  });
  it('médias (dia da semana): uma casa decimal', () => {
    expect(faixasEscalaV5(10, true).map((f) => f.rotulo)).toEqual(['até 2,0', '2,0–4,0', '4,0–6,0', '6,0–8,0', '> 8,0']);
  });
  it('cada valor cai no degrau da sua faixa', () => {
    const degrau = (v: number, ref: number) => Math.min(5, Math.max(1, Math.ceil((v / ref) * 5)));
    for (const ref of [3, 7, 12, 25]) {
      const fx = faixasEscalaV5(ref, false);
      for (let v = 1; v <= ref + 5; v++) {
        const f = fx.find((x) => x.q === degrau(v, ref))!;
        expect(f).toBeDefined();
        if (f.rotulo.startsWith('≥')) expect(v).toBeGreaterThanOrEqual(Number(f.rotulo.slice(2)));
        else {
          const [lo, hi = lo] = f.rotulo.split('–').map(Number);
          expect(v).toBeGreaterThanOrEqual(lo);
          expect(v).toBeLessThanOrEqual(hi);
        }
      }
    }
  });
});
