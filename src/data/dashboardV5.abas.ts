import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { spHoje, type Periodo } from '@/data/relatorios';
import { DASH_V5_REAL, traduzErroDashV5 } from '@/data/dashboardV5';
import { janelaMapaV5, periodoAnteriorV5 } from '@/data/dashboardV5.periodo';
import { cenarioDemoV5 } from '@/data/dashboardV5.demo';
import { demoAtendentesAbaV5, demoCampanhasV5, demoIrisV5 } from '@/data/dashboardV5.abas.demo';
import type {
  AtendenteAbaV5, AtendentesAbaV5, CampanhaV5, CampanhasV5, IrisFaltasV5, IrisFunilV5, IrisV5,
  ParenteV5, PontoSerieV5, QuadroJanelaV5, ResumoCampanhaV5,
} from '@/data/dashboardV5.abas.tipos';

/* ------------------------------------------------------------------
   Camada de dados das ABAS do Dashboard (12/11): três RPCs irmãs da dashboard_v5
   (dashboard_v5_campanhas / _atendentes / _iris), UMA chamada por aba + período,
   chamada SÓ com a aba aberta (enabled) — a Visão geral continua na dashboard_v5.
   O período anterior vai cortado no mesmo tempo decorrido (periodoAnteriorV5),
   a MESMA régua das variações dos KPIs. DEMO É O CONTRATO: sem backend, o mesmo
   hook devolve a fixture de dashboardV5.abas.demo com os mesmos tipos.
   ------------------------------------------------------------------ */

const CINCO_MIN = 5 * 60_000;

/* ---------------- normalização defensiva (jsonb snake_case → tipos) ---------------- */
type Bruto = Record<string, unknown>;
const obj = (v: unknown): Bruto => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Bruto) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const numOuNulo = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const txt = (v: unknown, padrao = ''): string => (typeof v === 'string' ? v : v == null ? padrao : String(v));
const contagens = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, q] of Object.entries(obj(v))) out[k] = num(q);
  return out;
};
const dia10 = (v: unknown): string => txt(v).slice(0, 10);

function normalizarResumo(v: unknown): ResumoCampanhaV5 {
  const r = obj(v);
  return { campanha: txt(r.campanha, 'outros') || 'outros', entradas: num(r.entradas), ganhos: num(r.ganhos), ne: num(r.ne) };
}

function normalizarQuadroJanela(v: unknown): QuadroJanelaV5 {
  const q = obj(v);
  return { ini: txt(q.ini), atual: arr(q.atual).map(normalizarResumo), anterior: arr(q.anterior).map(normalizarResumo) };
}

function normalizarCampanha(v: unknown): CampanhaV5 {
  const c = obj(v);
  const quem = obj(c.ne_quem);
  return {
    campanha: txt(c.campanha, 'outros') || 'outros',
    canais: arr(c.canais).map((x) => ({
      id: txt(obj(x).id), nome: txt(obj(x).nome, 'Sem nome'), numero: txt(obj(x).numero) || null,
    })).filter((x) => x.id !== ''),
    entradas: num(c.entradas),
    ganhos: num(c.ganhos),
    fechMedianaH: numOuNulo(c.fech_mediana_h),
    fechN: num(c.fech_n),
    ne: num(c.ne),
    neMotivos: contagens(c.ne_motivos),
    neQuem: { ia: num(quem.ia), regraRs: num(quem.regra_rs), equipe: num(quem.equipe) },
    peloAnuncio: num(c.pelo_anuncio),
    retornos: num(c.retornos),
    retornosMesma: num(c.retornos_mesma),
    retornosOrigens: arr(c.retornos_origens)
      .map((x) => ({ campanha: txt(obj(x).campanha, 'outros') || 'outros', n: num(obj(x).n) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n || a.campanha.localeCompare(b.campanha)),
    parenteRec: num(c.parente_rec),
  };
}

function normalizarParente(v: unknown): ParenteV5 {
  const p = obj(v);
  const f = obj(p.funil);
  const d = obj(p.desfecho);
  return {
    total: num(p.total),
    serie: arr(p.serie).map((x) => ({ dia: dia10(obj(x).dia), n: num(obj(x).n) }))
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dia)),
    funil: {
      semBeneficio: num(f.sem_beneficio), familiarSim: num(f.familiar_sim), familiarNao: num(f.familiar_nao),
      semResposta: num(f.sem_resposta), neTimer: num(f.ne_timer),
    },
    desfecho: {
      ganho: num(d.ganho), emAndamento: num(d.em_andamento), perdido: num(d.perdido),
      semOpp: num(d.sem_opp), perdidoMotivos: contagens(d.perdido_motivos),
    },
    neDesfeito: num(p.ne_desfeito),
  };
}

export function normalizarCampanhasV5(bruto: unknown): CampanhasV5 {
  const b = obj(bruto);
  const p = obj(b.periodo);
  const q = obj(b.quadro);
  const serie: PontoSerieV5[] = arr(b.serie).map((x) => {
    const s = obj(x);
    return {
      dia: dia10(s.dia), campanha: txt(s.campanha, 'outros') || 'outros',
      entradas: num(s.entradas), ganhos: num(s.ganhos), ne: num(s.ne),
    };
  }).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dia));
  return {
    geradoEm: txt(b.gerado_em) || new Date().toISOString(),
    periodo: { inicio: txt(p.inicio), fim: txt(p.fim) },
    campanhas: arr(b.campanhas).map(normalizarCampanha),
    serie,
    anterior: arr(b.anterior).map(normalizarResumo),
    quadro: {
      dia: normalizarQuadroJanela(q.dia),
      semana: normalizarQuadroJanela(q.semana),
      mes: normalizarQuadroJanela(q.mes),
    },
    parente: normalizarParente(b.parente),
    retornosConfiavelDesde: dia10(b.retornos_confiavel_desde),
  };
}

function normalizarAtendenteAba(v: unknown): AtendenteAbaV5 {
  const a = obj(v);
  return {
    usuarioId: txt(a.usuario_id),
    nome: txt(a.nome, 'Sem nome') || 'Sem nome',
    recebidos: num(a.recebidos),
    transferidos: num(a.transferidos),
    ganhos: num(a.ganhos),
    ganhosAnt: num(a.ganhos_ant),
    neMarcados: num(a.ne_marcados),
    respN: num(a.resp_n),
    respCelularN: num(a.resp_celular_n),
    respMedianaMin: numOuNulo(a.resp_mediana_min),
    respMediaMin: numOuNulo(a.resp_media_min),
    fechN: num(a.fech_n),
    fechMedianaH: numOuNulo(a.fech_mediana_h),
    fechMediaH: numOuNulo(a.fech_media_h),
    fechSemRelogio: num(a.fech_sem_relogio),
    cliN: num(a.cli_n),
    cliMedianaH: numOuNulo(a.cli_mediana_h),
    cliMediaH: numOuNulo(a.cli_media_h),
    campanhas: arr(a.campanhas)
      .map((x) => ({ campanha: txt(obj(x).campanha, 'outros') || 'outros', ganhos: num(obj(x).ganhos) }))
      .filter((x) => x.ganhos > 0)
      .sort((x, y) => y.ganhos - x.ganhos || x.campanha.localeCompare(y.campanha)),
    vacuo3o: num(a.vacuo_3o),
    carteira: num(a.carteira),
    parados7d: num(a.parados_7d),
  };
}

export function normalizarAtendentesAbaV5(bruto: unknown): AtendentesAbaV5 {
  const b = obj(bruto);
  const p = obj(b.periodo);
  return {
    geradoEm: txt(b.gerado_em) || new Date().toISOString(),
    periodo: { inicio: txt(p.inicio), fim: txt(p.fim) },
    atendentes: arr(b.atendentes).map(normalizarAtendenteAba).filter((a) => a.usuarioId !== ''),
    serieGanhos: arr(b.serie_ganhos).map((x) => {
      const s = obj(x);
      return { dia: dia10(s.dia), usuarioId: txt(s.usuario_id), ganhos: num(s.ganhos) };
    }).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dia) && x.usuarioId !== ''),
  };
}

function normalizarFunilIris(v: unknown): IrisFunilV5 {
  const f = obj(v);
  return {
    atendidasSessoes: num(f.atendidas_sessoes),
    atendidasContatos: num(f.atendidas_contatos),
    coorteNovas: num(f.coorte_novas),
    qualificadas: num(f.qualificadas),
    reprovadas: num(f.reprovadas),
    propostasPortab: num(f.propostas_portab),
    aceiteSim: num(f.aceite_sim),
    aceiteDuvida: num(f.aceite_duvida),
    aceiteNao: num(f.aceite_nao),
    docsAlgum: num(f.docs_algum),
    docsCompletos: num(f.docs_completos),
    docsCompletosEstrito: num(f.docs_completos_estrito),
    fechouAceite: num(f.fechou_aceite),
  };
}

export function normalizarIrisV5(bruto: unknown): IrisV5 {
  const b = obj(bruto);
  const p = obj(b.periodo);
  const fa = obj(b.faltas);
  const t = obj(b.tempo);
  const faltas: IrisFaltasV5 = {
    universo: num(fa.universo), comprovante: num(fa.comprovante), email: num(fa.email),
    identidade: num(fa.identidade), soOutroLado: num(fa.so_outro_lado), nadaDos3: num(fa.nada_dos_3),
    comprPendenteAnalista: num(fa.compr_pendente_analista),
  };
  return {
    geradoEm: txt(b.gerado_em) || new Date().toISOString(),
    periodo: { inicio: txt(p.inicio), fim: txt(p.fim) },
    exatidaoAtendidas: txt(b.exatidao_atendidas, 'banda_5pct') || 'banda_5pct',
    funil: normalizarFunilIris(b.funil),
    funilAnt: b.funil_ant && typeof b.funil_ant === 'object' ? normalizarFunilIris(b.funil_ant) : null,
    faltas,
    tempo: { n: num(t.n), medianaMin: numOuNulo(t.mediana_min), p90H: numOuNulo(t.p90_h) },
    etapas: contagens(b.etapas),
    porCampanha: arr(b.por_campanha).map((x) => ({
      campanha: txt(obj(x).campanha, 'outros') || 'outros',
      sessoes: num(obj(x).sessoes),
      docsCompletos: num(obj(x).docs_completos),
    })),
    serie: arr(b.serie).map((x) => {
      const s = obj(x);
      return { dia: dia10(s.dia), atendidas: num(s.atendidas), qualificadas: num(s.qualificadas), docsCompletos: num(s.docs_completos) };
    }).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dia)),
  };
}

/* ---------------- hooks (um por aba, chamados só com a aba aberta) ---------------- */
export interface JanelaAbas {
  iniISO: string; fimISO: string; antIniISO: string; antFimISO: string;
  /** início da SÉRIE do gráfico: período curto recua para os últimos 7 dias
   *  (a mesma régua do mapa dia × hora) — um dia só não faz onda */
  serieIniISO: string;
}
const janelaAbas = (periodo: Periodo, agora: Date, hoje: string): JanelaAbas => {
  const ant = periodoAnteriorV5(periodo, agora);
  return {
    iniISO: periodo.iniISO, fimISO: periodo.fimISO,
    antIniISO: ant.iniISO, antFimISO: ant.fimISO,
    serieIniISO: janelaMapaV5(periodo, hoje).iniISO,
  };
};

function usarAba<T>(
  nome: string, periodo: Periodo, ativo: boolean, rpc: string,
  demo: (j: JanelaAbas, agora: Date, cenario: ReturnType<typeof cenarioDemoV5>) => T,
  normalizar: (bruto: unknown) => T,
): UseQueryResult<T> {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  const hoje = spHoje();
  const serieIni = janelaMapaV5(periodo, hoje).iniISO;
  return useQuery({
    queryKey: [nome, org, periodo.iniISO, periodo.fimISO, periodo.prevIniISO, serieIni],
    enabled: !!org && ativo,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: CINCO_MIN,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<T> => {
      const agora = new Date();
      const j = janelaAbas(periodo, agora, hoje);
      if (!DASH_V5_REAL) return demo(j, agora, cenarioDemoV5());
      const { data, error } = await supabase!.rpc(rpc, {
        p_inicio: j.iniISO,
        p_fim: j.fimISO,
        p_org: org,
        p_inicio_ant: j.antIniISO,
        p_fim_ant: j.antFimISO,
        p_serie_inicio: j.serieIniISO,
      });
      if (error) throw new Error(traduzErroDashV5(error));
      return normalizar(data);
    },
  });
}

export function useDashCampanhas(periodo: Periodo, ativo: boolean): UseQueryResult<CampanhasV5> {
  return usarAba('dash-v5-campanhas', periodo, ativo, 'dashboard_v5_campanhas', demoCampanhasV5, normalizarCampanhasV5);
}

export function useDashAtendentesAba(periodo: Periodo, ativo: boolean): UseQueryResult<AtendentesAbaV5> {
  return usarAba('dash-v5-atendentes', periodo, ativo, 'dashboard_v5_atendentes', demoAtendentesAbaV5, normalizarAtendentesAbaV5);
}

export function useDashIris(periodo: Periodo, ativo: boolean): UseQueryResult<IrisV5> {
  return usarAba('dash-v5-iris', periodo, ativo, 'dashboard_v5_iris', demoIrisV5, normalizarIrisV5);
}
