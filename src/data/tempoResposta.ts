import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { spHoje, type Periodo } from '@/data/relatorios';
import { janelaMapaV5 } from '@/data/dashboardV5.periodo';

/* ------------------------------------------------------------------
   TEMPO DE RESPOSTA DA EQUIPE com meta (dono 25/11, do sistema que a Reviza usava antes: "SLA do
   atendimento humano", "desempenho por operador, do mais lento ao mais rápido"). Rotina
   dash_tempo_resposta (migration 97), só administrador. A régua: da 1ª mensagem do cliente até a
   próxima mensagem nossa; se quem respondeu foi uma PESSOA (painel ou celular) entra na conta, se foi
   a IA não entra (a IA não é a equipe). Horário comercial (padrão): só seg–sex, 8h–18h. A resposta do
   celular vai para o responsável pela conversa. DEMO É O CONTRATO: sem backend, a fixture abaixo.
   ------------------------------------------------------------------ */

export const TEMPO_REAL: boolean = isSupabaseConfigured && !!supabase;
export type ModoTempo = 'uteis' | 'corrido';

export interface ResumoTempo { respondidos: number; dentroMeta: number; medianaMin: number | null; mediaMin: number | null; p90Min: number | null; piorMin: number | null }
export interface PessoaTempo { id: string | null; nome: string; respondidos: number; dentroMeta: number; medianaMin: number | null; mediaMin: number | null; piorMin: number | null }
export interface EsperandoAgora { conversaId: string; contato: string; desde: string; esperaMin: number; responsavel: string | null }
export interface DashTempo {
  metaMin: number; modo: ModoTempo;
  totais: ResumoTempo; anterior: ResumoTempo | null;
  /** a série dos gráficos: o período, ou os últimos 7 dias quando ele é mais curto */
  porDia: { dia: string; respondidos: number; dentroMeta: number; medianaMin: number | null }[];
  porHora: { hora: number; respondidos: number; medianaMin: number | null }[];
  atendentes: PessoaTempo[];
  aguardando: number; fila: EsperandoAgora[];
  /** esperas que a IA respondeu (não entram na conta) */
  pelaIa: number;
  geradoEm: string;
}

export const pctDentro = (r: { respondidos: number; dentroMeta: number }): number | null => (r.respondidos > 0 ? (r.dentroMeta / r.respondidos) * 100 : null);
/** "12 min", "1 h 40", "2,3 dias" */
export function fmtMin(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 1) return '< 1 min';
  if (m < 60) return `${Math.round(m)} min`;
  if (m < 60 * 24) { const h = Math.floor(m / 60), r = Math.round(m % 60); return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`; }
  return `${(m / 1440).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
}

/* ---------------- normalização (jsonb → tipos) ---------------- */
type B = Record<string, unknown>;
const o = (v: unknown): B => (v && typeof v === 'object' && !Array.isArray(v) ? (v as B) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const n = (v: unknown): number => { const x = typeof v === 'number' ? v : Number(v); return Number.isFinite(x) ? x : 0; };
const nn = (v: unknown): number | null => { if (v == null || v === '') return null; const x = Number(v); return Number.isFinite(x) ? x : null; };
const t = (v: unknown, p = ''): string => (typeof v === 'string' ? v : v == null ? p : String(v));
const resumo = (v: unknown): ResumoTempo => { const r = o(v); return { respondidos: n(r.respondidos), dentroMeta: n(r.dentro_meta), medianaMin: nn(r.mediana_min), mediaMin: nn(r.media_min), p90Min: nn(r.p90_min), piorMin: nn(r.pior_min) }; };
export function normalizarDashTempo(v: unknown): DashTempo {
  const r = o(v);
  return {
    metaMin: n(r.meta_min) || 30, modo: t(r.modo) === 'corrido' ? 'corrido' : 'uteis',
    totais: resumo(r.totais), anterior: r.anterior ? resumo(r.anterior) : null,
    porDia: a(r.por_dia).map((x) => { const d = o(x); return { dia: t(d.dia).slice(0, 10), respondidos: n(d.respondidos), dentroMeta: n(d.dentro_meta), medianaMin: nn(d.mediana_min) }; }),
    porHora: a(r.por_hora).map((x) => { const d = o(x); return { hora: n(d.hora), respondidos: n(d.respondidos), medianaMin: nn(d.mediana_min) }; }),
    atendentes: a(r.atendentes).map((x) => { const d = o(x); return { id: t(d.id) || null, nome: t(d.nome, 'Sem atendente identificado'), respondidos: n(d.respondidos), dentroMeta: n(d.dentro_meta), medianaMin: nn(d.mediana_min), mediaMin: nn(d.media_min), piorMin: nn(d.pior_min) }; }),
    aguardando: n(r.aguardando),
    fila: a(r.fila).map((x) => { const d = o(x); return { conversaId: t(d.conversa_id), contato: t(d.contato, 'Sem nome'), desde: t(d.desde), esperaMin: n(d.espera_min), responsavel: t(d.responsavel) || null }; }),
    pelaIa: n(r.pela_ia), geradoEm: t(r.gerado_em) || new Date().toISOString(),
  };
}

/* ---------------- demonstração (equipe e números inventados) ---------------- */
const EQUIPE_DEMO: [string, number, number][] = [ // nome, mediana base (min, horário comercial), peso de volume
  ['Juliano', 46, 1.6], ['Rafael', 38, 0.7], ['Alexandra', 22, 1.1], ['Guilherme', 17, 1.0], ['Emillyn', 9, 1.3],
  ['Raissa', 6, 0.9], ['Felipe', 4, 1.4], ['Sem atendente identificado', 3, 0.8],
];
function rnd(seed: number) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
export function demoDashTempo(p: Periodo, metaMin: number, modo: ModoTempo, hoje = spHoje()): DashTempo {
  const ini = janelaMapaV5(p, hoje).iniDate;
  const dias: string[] = [];
  for (let d = ini; d < p.fimDate && d <= hoje; ) { dias.push(d); const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10); }
  const r = rnd(dias.length * 31 + Number(p.iniDate.slice(8)) * 7);
  const fator = modo === 'corrido' ? 3.4 : 1; // noites e fins de semana entram no tempo corrido
  type E = { dia: string; hora: number; quem: string; min: number };
  const esperas: E[] = [];
  for (const dia of dias) {
    const dow = new Date(dia + 'T12:00:00Z').getUTCDay();
    const vol = dow === 0 ? 0.15 : dow === 6 ? 0.35 : 1;
    for (const [nome, base, peso] of EQUIPE_DEMO) {
      const qtd = Math.round(peso * vol * (14 + r() * 10));
      for (let k = 0; k < qtd; k++) {
        const cauda = r() < 0.12 ? 4 + r() * 10 : 0.3 + r() * 1.6; // a maioria rápida, alguns muito demorados
        esperas.push({ dia, hora: 8 + Math.floor(r() * 11), quem: nome, min: Math.max(0.5, base * cauda * fator) });
      }
    }
  }
  const med = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((x, y) => x - y); const m = (s.length - 1) / 2; return Math.round(((s[Math.floor(m)] + s[Math.ceil(m)]) / 2) * 10) / 10; };
  const q = (xs: number[], f: number) => { if (!xs.length) return null; const s = [...xs].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))] * 10) / 10; };
  const res = (es: E[]): ResumoTempo => {
    const ms = es.map((e) => e.min);
    return { respondidos: es.length, dentroMeta: es.filter((e) => e.min <= metaMin).length, medianaMin: med(ms), mediaMin: ms.length ? Math.round((ms.reduce((s, x) => s + x, 0) / ms.length) * 10) / 10 : null, p90Min: q(ms, 0.9), piorMin: ms.length ? Math.round(Math.max(...ms) * 10) / 10 : null };
  };
  const doPeriodo = esperas.filter((e) => e.dia >= p.iniDate);
  const tot = res(doPeriodo);
  const atendentes = EQUIPE_DEMO.map(([nome]) => ({ id: nome === EQUIPE_DEMO[7][0] ? null : 'demo-' + nome, nome, ...res(doPeriodo.filter((e) => e.quem === nome)) }))
    .filter((x) => x.respondidos > 0).sort((x, y) => (y.medianaMin ?? 0) - (x.medianaMin ?? 0));
  const agora = Date.now();
  const fila: EsperandoAgora[] = ['Iracema S.', 'Valdir M.', 'Neusa T.', 'Arlindo P.', 'Cleonice R.', 'Jurema F.', 'Osvaldo L.', 'Dalva C.', 'Ernesto B.']
    .map((contato, i) => ({ conversaId: 'demo-fila-' + i, contato, desde: new Date(agora - (i * i * 37 + 12) * 60_000).toISOString(), esperaMin: Math.round((i * i * 37 + 12) / (modo === 'corrido' ? 1 : 1.6)), responsavel: [null, 'Juliano', 'Rafael', 'Alexandra', null, 'Guilherme', 'Juliano', 'Emillyn', 'Raissa'][i] }))
    .reverse();
  return {
    metaMin, modo, totais: tot,
    anterior: { ...tot, respondidos: Math.round(tot.respondidos * 0.94), dentroMeta: Math.round(tot.dentroMeta * 0.86), medianaMin: tot.medianaMin != null ? Math.round(tot.medianaMin * 1.18 * 10) / 10 : null },
    porDia: dias.map((dia) => { const es = esperas.filter((e) => e.dia === dia); return { dia, respondidos: es.length, dentroMeta: es.filter((e) => e.min <= metaMin).length, medianaMin: med(es.map((e) => e.min)) }; }),
    porHora: Array.from({ length: 24 }, (_, hora) => { const es = doPeriodo.filter((e) => e.hora === hora); return { hora, respondidos: es.length, medianaMin: med(es.map((e) => e.min)) }; }),
    atendentes, aguardando: fila.length, fila,
    pelaIa: Math.round(tot.respondidos * 0.42), geradoEm: new Date().toISOString(),
  };
}

/* ---------------- a meta e o modo ficam lembrados neste navegador ---------------- */
const GUARDA = 'reviza-tempo-resposta';
export function lerPreferencia(): { meta: number; modo: ModoTempo } {
  try { const g = JSON.parse(localStorage.getItem(GUARDA) ?? '{}') as { meta?: number; modo?: string }; return { meta: g.meta && g.meta > 0 && g.meta <= 1440 ? Math.round(g.meta) : 30, modo: g.modo === 'corrido' ? 'corrido' : 'uteis' }; }
  catch { return { meta: 30, modo: 'uteis' }; }
}
export function guardarPreferencia(p: { meta: number; modo: ModoTempo }) { try { localStorage.setItem(GUARDA, JSON.stringify(p)); } catch { /* privado */ } }

export function useDashTempoResposta(p: Periodo, metaMin: number, modo: ModoTempo, ativo: boolean) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['dash-tempo-resposta', currentOrg.id, p.iniDate, p.fimDate, metaMin, modo],
    enabled: ativo,
    staleTime: 3 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<DashTempo> => {
      if (!TEMPO_REAL) { await new Promise((ok) => setTimeout(ok, 300)); return demoDashTempo(p, metaMin, modo); }
      const { data, error } = await supabase!.rpc('dash_tempo_resposta', {
        p_ini: p.iniDate, p_fim: p.fimDate, p_meta_min: metaMin, p_modo: modo, p_prev_ini: p.prevIniDate, p_serie_ini: janelaMapaV5(p, spHoje()).iniDate,
      });
      if (error) throw new Error(error.message);
      return normalizarDashTempo(data);
    },
  });
}
