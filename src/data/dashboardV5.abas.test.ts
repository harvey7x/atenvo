import { describe, expect, it } from 'vitest';
import { periodoDash } from '@/data/dashboard';
import {
  baldesDe, chaveBalde, leituraOnda, melhorCampanha, mesCafDe, semanaDe, somarEmBaldes,
} from '@/data/dashboardV5.series';
import { janelaV5 } from '@/data/dashboardV5';
import { normalizarAtendentesAbaV5, normalizarCampanhasV5, normalizarIrisV5 } from '@/data/dashboardV5.abas';
import { demoAtendentesAbaV5, demoCampanhasV5, demoIrisV5 } from '@/data/dashboardV5.abas.demo';

/** instante em São Paulo (UTC-3 fixo) — a mesma âncora do teste do demo v5 */
const SP = (s: string) => new Date(`${s}-03:00`);
const AGORA = SP('2026-11-12T17:30:00');
const soma = (v: number[]) => v.reduce((a, b) => a + b, 0);

const janela = (p: ReturnType<typeof periodoDash>) => {
  const j = janelaV5(p, AGORA, '2026-11-12');
  return { iniISO: j.iniISO, fimISO: j.fimISO, antIniISO: j.antIniISO, antFimISO: j.antFimISO };
};

/* ====================================================================== */
describe('baldes (dia · semana · mês CAF)', () => {
  it('semana é a segunda-feira de São Paulo', () => {
    expect(semanaDe('2026-11-12')).toBe('2026-11-09'); // quinta → segunda 09/11
    expect(semanaDe('2026-11-09')).toBe('2026-11-09');
    expect(semanaDe('2026-11-08')).toBe('2026-11-02'); // domingo fecha a semana anterior
  });

  it('mês CAF vai do dia 11 ao dia 10 — nunca mês-calendário', () => {
    expect(mesCafDe('2026-11-12')).toBe('2026-11-11');
    expect(mesCafDe('2026-11-11')).toBe('2026-11-11');
    expect(mesCafDe('2026-11-10')).toBe('2026-10-11');
    expect(mesCafDe('2026-01-05')).toBe('2025-12-11'); // vira o ano
  });

  it('baldesDe cobre o período inteiro, inclusive os vazios, com fim exclusivo', () => {
    const dias = baldesDe('2026-11-06', '2026-11-13', 'dia');
    expect(dias).toHaveLength(7);
    expect(dias[0]).toMatchObject({ chave: '2026-11-06', fim: '2026-11-07' });
    const semanas = baldesDe('2026-11-06', '2026-11-13', 'semana');
    expect(semanas.map((b) => b.chave)).toEqual(['2026-11-02', '2026-11-09']);
    const meses = baldesDe('2026-10-11', '2026-11-11', 'mes');
    expect(meses.map((b) => b.chave)).toEqual(['2026-10-11']);
    expect(meses[0].fim).toBe('2026-11-11');
    expect(meses[0].rotulo).toBe('11/10–10/11');
  });

  it('somarEmBaldes agrega pela chave e ignora dia inválido', () => {
    const m = somarEmBaldes([
      { dia: '2026-11-09', valor: 2 }, { dia: '2026-11-12', valor: 3 },
      { dia: '2026-11-08', valor: 5 }, { dia: 'lixo', valor: 99 },
    ], 'semana');
    expect(m.get('2026-11-09')).toBe(5);
    expect(m.get('2026-11-02')).toBe(5);
    expect([...m.values()].includes(99)).toBe(false);
  });

  it('chaveBalde no modo dia é o próprio dia', () => {
    expect(chaveBalde('2026-11-12', 'dia')).toBe('2026-11-12');
  });
});

describe('melhor campanha e leitura das ondas', () => {
  it('melhor por métrica, desempate pela segunda; zero não elege ninguém', () => {
    const l = [
      { campanha: 'diego', g: 10, e: 100 },
      { campanha: 'antonio', g: 10, e: 200 },
      { campanha: 'juros', g: 2, e: 500 },
    ];
    expect(melhorCampanha(l, (x) => x.g, (x) => x.e)?.campanha).toBe('antonio');
    expect(melhorCampanha(l, (x) => x.e, (x) => x.g)?.campanha).toBe('juros');
    expect(melhorCampanha([{ campanha: 'a', g: 0, e: 0 }], (x) => x.g, (x) => x.e)).toBeNull();
  });

  it('tendência olha o último balde FECHADO; recaída = zerou no meio e voltou', () => {
    expect(leituraOnda('juros', [20, 12, 0, 9, 15], 4)).toMatchObject({ tendencia: 'cresceu', recaida: true });
    expect(leituraOnda('juros', [20, 12, 5, 9], 3)).toMatchObject({ tendencia: 'caiu', recaida: false });
    // dois baldes fechados zerados: linha morta não ganha rótulo (a recaída conta a volta)
    expect(leituraOnda('juros', [20, 12, 0, 0, 9], 4)).toMatchObject({ tendencia: null, recaida: true });
    expect(leituraOnda('diego', [10, 14, 30], 3)).toMatchObject({ tendencia: 'cresceu', recaida: false });
    // contagens miúdas não viram seta (régua VAR_MIN dos KPIs)
    expect(leituraOnda('x', [1, 2, 3], 3).tendencia).toBe('estavel');
    // um balde fechado só: sem tendência
    expect(leituraOnda('x', [5, 8], 1).tendencia).toBeNull();
  });
});

/* ====================================================================== */
describe('demo das abas — invariantes (mesmos leads, totais fecham)', () => {
  it('campanhas: série = tabela, quadros presentes, parente consistente', () => {
    const d = demoCampanhasV5(janela(periodoDash('7d')), AGORA);
    const porCampanha = new Map(d.campanhas.map((c) => [c.campanha, c]));
    // a série soma exatamente o que a tabela mostra, campanha a campanha
    for (const [camp, c] of porCampanha) {
      const ent = soma(d.serie.filter((p) => p.campanha === camp).map((p) => p.entradas));
      const gan = soma(d.serie.filter((p) => p.campanha === camp).map((p) => p.ganhos));
      const ne = soma(d.serie.filter((p) => p.campanha === camp).map((p) => p.ne));
      expect(ent).toBe(c.entradas);
      expect(gan).toBe(c.ganhos);
      expect(ne).toBe(c.ne);
    }
    // o demo de 12/11 tem as 4 campanhas do dono
    for (const slug of ['diego', 'antonio', 'antonio2', 'juros']) expect(porCampanha.has(slug)).toBe(true);
    // retornos: origens somam o total; "da própria" nunca excede
    for (const c of d.campanhas) {
      expect(soma(c.retornosOrigens.map((o) => o.n))).toBe(c.retornos);
      expect(c.retornosMesma).toBeLessThanOrEqual(c.retornos);
      expect(soma(Object.values(c.neMotivos))).toBe(c.ne);
      expect(c.neQuem.ia + c.neQuem.regraRs + c.neQuem.equipe).toBe(c.ne);
    }
    // parente: o funil fecha e o desfecho cobre todo mundo
    const f = d.parente.funil;
    expect(f.familiarSim + f.familiarNao + f.semResposta).toBe(f.semBeneficio);
    expect(f.neTimer).toBeLessThanOrEqual(f.semResposta);
    expect(d.parente.total).toBe(f.familiarSim);
    const pd = d.parente.desfecho;
    expect(pd.ganho + pd.emAndamento + pd.perdido + pd.semOpp).toBe(d.parente.total);
    expect(soma(Object.values(pd.perdidoMotivos))).toBe(pd.perdido);
    expect(soma(d.parente.serie.map((x) => x.n))).toBe(d.parente.total);
    // quadros: os três frames vêm com atual e anterior
    for (const q of [d.quadro.dia, d.quadro.semana, d.quadro.mes]) {
      expect(Array.isArray(q.atual)).toBe(true);
      expect(Array.isArray(q.anterior)).toBe(true);
    }
    expect(d.retornosConfiavelDesde).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('atendentes: relógios coerentes, sem relógio = ganhos − medidos, série = tabela', () => {
    const d = demoAtendentesAbaV5(janela(periodoDash('7d')), AGORA);
    expect(d.atendentes.length).toBeGreaterThan(0);
    for (const a of d.atendentes) {
      expect(a.fechSemRelogio).toBe(a.ganhos - a.fechN);
      expect(a.fechSemRelogio).toBeGreaterThanOrEqual(0);
      expect(a.cliN).toBe(a.fechN);
      // o relógio do atendente nunca é maior que o do cliente (começa na atribuição)
      if (a.fechMedianaH != null && a.cliMedianaH != null) {
        expect(a.fechMedianaH).toBeLessThanOrEqual(a.cliMedianaH + 1e-9);
      }
      expect(soma(a.campanhas.map((c) => c.ganhos))).toBe(a.ganhos);
      const serie = soma(d.serieGanhos.filter((p) => p.usuarioId === a.usuarioId).map((p) => p.ganhos));
      expect(serie).toBe(a.ganhos);
    }
  });

  it('iris: funil coerente (estrito ≤ completos; aceite explícito ≤ completos; série = funil)', () => {
    const d = demoIrisV5(janela(periodoDash('7d')), AGORA);
    const f = d.funil;
    expect(f.docsCompletosEstrito).toBeLessThanOrEqual(f.docsCompletos);
    expect(f.fechouAceite).toBeLessThanOrEqual(f.docsCompletos);
    expect(f.qualificadas + f.reprovadas).toBeLessThanOrEqual(f.atendidasSessoes);
    expect(soma(d.serie.map((p) => p.qualificadas))).toBe(f.qualificadas);
    expect(soma(d.serie.map((p) => p.docsCompletos))).toBe(f.docsCompletos);
    expect(soma(d.porCampanha.map((c) => c.docsCompletos))).toBe(f.docsCompletos);
    // faltas: subconjuntos do universo
    const fa = d.faltas;
    for (const n of [fa.comprovante, fa.email, fa.identidade, fa.nadaDos3, fa.soOutroLado, fa.comprPendenteAnalista]) {
      expect(n).toBeLessThanOrEqual(fa.universo);
    }
    expect(d.funilAnt).not.toBeNull();
    expect(d.tempo.n).toBeGreaterThanOrEqual(0);
  });

  it('determinístico: duas leituras no mesmo instante são idênticas', () => {
    const j = janela(periodoDash('3d'));
    expect(demoCampanhasV5(j, AGORA)).toEqual(demoCampanhasV5(j, AGORA));
    expect(demoIrisV5(j, AGORA)).toEqual(demoIrisV5(j, AGORA));
  });

  it('período curto: a série recua para os últimos 7 dias (régua do mapa), a tabela não', () => {
    const j = { ...janela(periodoDash('hoje')), serieIniISO: '2026-11-06T00:00:00-03:00' };
    const d = demoCampanhasV5(j, AGORA);
    const dias = new Set(d.serie.map((p) => p.dia));
    expect(dias.size).toBeGreaterThan(1);
    expect([...dias].every((x) => x >= '2026-11-06')).toBe(true);
    // a tabela continua SÓ no período: série filtrada aos dias do período bate com ela
    for (const c of d.campanhas) {
      const ent = soma(d.serie.filter((p) => p.campanha === c.campanha && p.dia >= '2026-11-12').map((p) => p.entradas));
      expect(ent).toBe(c.entradas);
    }
    const i = demoIrisV5(j, AGORA);
    expect(new Set(i.serie.map((p) => p.dia)).size).toBeGreaterThan(1);
    const a = demoAtendentesAbaV5(j, AGORA);
    const diasEq = new Set(a.serieGanhos.map((p) => p.dia));
    // ganhos por atendente seguem contados SÓ no período
    for (const at of a.atendentes) {
      const g = soma(a.serieGanhos.filter((p) => p.usuarioId === at.usuarioId && p.dia >= '2026-11-12').map((p) => p.ganhos));
      expect(g).toBe(at.ganhos);
    }
    expect(diasEq.size).toBeGreaterThanOrEqual(1);
  });
});

/* ====================================================================== */
describe('normalizadores das abas — lixo nunca derruba a tela', () => {
  it('campanhas: snake_case vira camelCase; ausências viram neutro', () => {
    const d = normalizarCampanhasV5({
      gerado_em: '2026-11-12T20:00:00Z',
      campanhas: [{
        campanha: 'diego', entradas: '12', ganhos: 3, ne: 1,
        ne_quem: { ia: 1, regra_rs: 0, equipe: 0 },
        retornos_origens: [{ campanha: 'antonio', n: 2 }, { campanha: 'x', n: 0 }],
        fech_mediana_h: 48.5, fech_n: 3, retornos: 2, retornos_mesma: 1, pelo_anuncio: 10, parente_rec: 1,
      }],
      serie: [{ dia: '2026-11-12', campanha: 'diego', entradas: 12, ganhos: 3, ne: 1 }, { dia: 'x' }],
      anterior: [{ campanha: 'diego', entradas: 9, ganhos: 1, ne: 0 }],
      quadro: { dia: { ini: 'i', atual: [], anterior: [] } },
      parente: { total: 1, funil: { sem_beneficio: 4, familiar_sim: 1 }, desfecho: { ganho: 1 }, serie: [] },
      retornos_confiavel_desde: '2026-10-29',
    });
    expect(d.campanhas[0].entradas).toBe(12);
    expect(d.campanhas[0].neQuem.ia).toBe(1);
    expect(d.campanhas[0].retornosOrigens).toEqual([{ campanha: 'antonio', n: 2 }]);
    expect(d.campanhas[0].fechMedianaH).toBe(48.5);
    expect(d.serie).toHaveLength(1);
    expect(d.quadro.semana.atual).toEqual([]);
    expect(d.parente.funil.semBeneficio).toBe(4);
    expect(d.retornosConfiavelDesde).toBe('2026-10-29');
    const vazio = normalizarCampanhasV5(null);
    expect(vazio.campanhas).toEqual([]);
    expect(vazio.parente.total).toBe(0);
  });

  it('atendentes: campos novos presentes e lixo tolerado', () => {
    const d = normalizarAtendentesAbaV5({
      atendentes: [{
        usuario_id: 'u1', nome: 'Juliana', ganhos: 5, ganhos_ant: 3, fech_n: 4, fech_sem_relogio: 1,
        cli_n: 4, cli_mediana_h: 100.2, fech_mediana_h: 99.8,
        campanhas: [{ campanha: 'antonio', ganhos: 3 }, { campanha: 'diego', ganhos: 2 }],
        vacuo_3o: 7, carteira: 100, parados_7d: 60,
      }, { nome: 'sem id' }],
      serie_ganhos: [{ dia: '2026-11-12', usuario_id: 'u1', ganhos: 2 }, { dia: 'x', usuario_id: 'u1' }],
    });
    expect(d.atendentes).toHaveLength(1);
    expect(d.atendentes[0].fechSemRelogio).toBe(1);
    expect(d.atendentes[0].cliMedianaH).toBe(100.2);
    expect(d.atendentes[0].campanhas[0]).toEqual({ campanha: 'antonio', ganhos: 3 });
    expect(d.atendentes[0].vacuo3o).toBe(7);
    expect(d.serieGanhos).toHaveLength(1);
    expect(normalizarAtendentesAbaV5('lixo').atendentes).toEqual([]);
  });

  it('iris: funil e faltas em camelCase; funil anterior ausente vira null', () => {
    const d = normalizarIrisV5({
      exatidao_atendidas: 'banda_5pct',
      funil: { atendidas_sessoes: 10, docs_completos: 4, docs_completos_estrito: 3, fechou_aceite: 2, qualificadas: 6 },
      faltas: { universo: 5, comprovante: 4, nada_dos_3: 3, compr_pendente_analista: 1 },
      tempo: { n: 4, mediana_min: 26, p90_h: 5.8 },
      etapas: { coleta_docs: 7 },
      por_campanha: [{ campanha: 'juros', sessoes: 2, docs_completos: 1 }],
      serie: [{ dia: '2026-11-12', atendidas: 3, qualificadas: 2, docs_completos: 1 }],
    });
    expect(d.funil.atendidasSessoes).toBe(10);
    expect(d.funil.docsCompletosEstrito).toBe(3);
    expect(d.funilAnt).toBeNull();
    expect(d.faltas.nadaDos3).toBe(3);
    expect(d.tempo.medianaMin).toBe(26);
    expect(d.etapas.coleta_docs).toBe(7);
    expect(d.porCampanha[0].docsCompletos).toBe(1);
    expect(normalizarIrisV5(undefined).funil.docsCompletos).toBe(0);
  });
});
