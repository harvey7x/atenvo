import { keepPreviousData, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { spHoje, type Periodo } from '@/data/relatorios';
import type {
  AtendenteV5, CanalV5, CelulaMapaV5, DashV5, JanelaV5, KpisV5, MotivoQtdV5, NeV5,
} from '@/data/dashboardV5.tipos';
import { cenarioDemoV5, demoDashV5 } from '@/data/dashboardV5.demo';
import { janelaMapaV5, periodoAnteriorV5 } from '@/data/dashboardV5.periodo';

/* ------------------------------------------------------------------
   Camada de dados do Dashboard v5. UMA chamada por período: a RPC
   public.dashboard_v5 (SECURITY DEFINER, portão igual ao de dashboard_resumo)
   devolve os seis blocos da tela de uma vez. A matemática de período é a de
   @/data/relatorios (fim exclusivo, fuso SP) — a mesma dos Relatórios.

   DEMO É O CONTRATO: sem backend (vite --mode demo) o MESMO hook devolve a
   fixture de dashboardV5.demo, já na forma normalizada. A página tem um
   caminho só.
   ------------------------------------------------------------------ */

export const DASH_V5_REAL: boolean = isSupabaseConfigured && !!supabase;

export { periodoDash, type PresetDash } from '@/data/dashboard';
export type { Periodo } from '@/data/relatorios';

const CINCO_MIN = 5 * 60_000;

/* ABERTURA RÁPIDA (dono 30/10: "o dashboard demora para carregar… deixa mais rápido para
   entrar"). A RPC leva ~0,9 s em média, mas tem picos de 5–8 s no horário cheio. A última foto
   de cada período fica guardada NESTE navegador e aparece na hora ao entrar — esmaecida, com
   "Atualizando…" — enquanto a RPC traz a nova. A chave é a da query (org + janela): o "Hoje" de
   ontem nunca aparece hoje. Até 6 períodos; sem storage, só não acelera. E o gcTime de 30 min
   faz a volta ao Dashboard na mesma sessão ser imediata. */
const GUARDA_DASH = 'atenvo-dash-v5';
const MAX_GUARDADOS = 6;
type Guardados = Record<string, { em: number; d: DashV5 }>;
function lerGuardados(): Guardados {
  try { return (JSON.parse(localStorage.getItem(GUARDA_DASH) ?? '{}') as Guardados) ?? {}; } catch { return {}; }
}
function fotoGuardada(chave: string): DashV5 | undefined {
  return lerGuardados()[chave]?.d;
}
function guardarFoto(chave: string, d: DashV5): void {
  try {
    const todos = lerGuardados();
    todos[chave] = { em: Date.now(), d };
    const ficam = Object.entries(todos).sort((a, b) => b[1].em - a[1].em).slice(0, MAX_GUARDADOS);
    localStorage.setItem(GUARDA_DASH, JSON.stringify(Object.fromEntries(ficam)));
  } catch { /* sem storage (ou cheio): só não acelera */ }
}

/** Janela completa de uma busca: período, trecho comparado e início do mapa. */
export function janelaV5(periodo: Periodo, agora: Date, hoje = spHoje()): JanelaV5 {
  const ant = periodoAnteriorV5(periodo, agora);
  const mapa = janelaMapaV5(periodo, hoje);
  return {
    iniISO: periodo.iniISO,
    fimISO: periodo.fimISO,
    antIniISO: ant.iniISO,
    antFimISO: ant.fimISO,
    mapaIniISO: mapa.iniISO,
  };
}

/* ---------------- normalização defensiva da RPC ----------------
   O jsonb sai em snake_case; aqui vira camelCase e todo campo ausente ganha
   um valor neutro (lista vazia, 0, null) — a tela nunca quebra com um bloco
   faltando (ex.: RPC antiga, período sem nada). */
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
const txtOuNulo = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

function normalizarKpis(v: unknown): KpisV5 {
  const k = obj(v);
  return {
    entradas: num(k.entradas), ne: num(k.ne), ganhos: num(k.ganhos),
    fechMedianaH: numOuNulo(k.fech_mediana_h ?? k.fechMedianaH),
    fechMediaH: numOuNulo(k.fech_media_h ?? k.fechMediaH),
    fechN: num(k.fech_n ?? k.fechN),
  };
}

function normalizarCanal(v: unknown): CanalV5 {
  const c = obj(v);
  const motivos = obj(c.ne_motivos ?? c.neMotivos);
  const neMotivos: Record<string, number> = {};
  for (const [k, q] of Object.entries(motivos)) neMotivos[k] = num(q);
  return {
    canalId: txtOuNulo(c.canal_id ?? c.canalId),
    nome: txt(c.nome, 'Sem nome'),
    numero: txtOuNulo(c.numero),
    situacao: c.situacao === 'antigo' ? 'antigo' : 'conectado',
    entradas: num(c.entradas), ne: num(c.ne), neMotivos, ganhos: num(c.ganhos),
    fechMedianaH: numOuNulo(c.fech_mediana_h ?? c.fechMedianaH),
    fechMediaH: numOuNulo(c.fech_media_h ?? c.fechMediaH),
    fechN: num(c.fech_n ?? c.fechN),
  };
}

function normalizarNe(v: unknown): NeV5 {
  const n = obj(v);
  const q = obj(n.quem);
  const motivos: MotivoQtdV5[] = arr(n.motivos)
    .map((m) => ({ motivo: txt(obj(m).motivo, 'sem_categoria') || 'sem_categoria', qtd: num(obj(m).qtd) }))
    .filter((m) => m.qtd > 0)
    .sort((a, b) => b.qtd - a.qtd);
  const quem = { ia: num(q.ia), regraRs: num(q.regra_rs ?? q.regraRs), equipe: num(q.equipe) };
  const total = n.total == null ? motivos.reduce((s, m) => s + m.qtd, 0) : num(n.total);
  return { total, motivos, quem };
}

function normalizarAtendente(v: unknown): AtendenteV5 {
  const a = obj(v);
  return {
    usuarioId: txt(a.usuario_id ?? a.usuarioId),
    nome: txt(a.nome, 'Sem nome') || 'Sem nome',
    recebidos: num(a.recebidos), transferidos: num(a.transferidos),
    ganhos: num(a.ganhos), neMarcados: num(a.ne_marcados ?? a.neMarcados),
    respN: num(a.resp_n ?? a.respN), respCelularN: num(a.resp_celular_n ?? a.respCelularN),
    respMedianaMin: numOuNulo(a.resp_mediana_min ?? a.respMedianaMin),
    respMediaMin: numOuNulo(a.resp_media_min ?? a.respMediaMin),
    fechN: num(a.fech_n ?? a.fechN),
    fechMedianaH: numOuNulo(a.fech_mediana_h ?? a.fechMedianaH),
    fechMediaH: numOuNulo(a.fech_media_h ?? a.fechMediaH),
  };
}

function normalizarCelula(v: unknown): CelulaMapaV5 | null {
  const c = obj(v);
  const dia = txt(c.dia).slice(0, 10);
  // hora ausente NÃO vira 0h (desenharia a entrada de madrugada): célula descartada
  const hora = numOuNulo(c.hora);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || hora == null || !Number.isInteger(hora) || hora < 0 || hora > 23) return null;
  return { dia, hora, entradas: num(c.entradas) };
}

export function normalizarDashV5(bruto: unknown): DashV5 {
  const b = obj(bruto);
  const p = obj(b.periodo);
  const kpis = normalizarKpis(b.kpis);
  const ant = b.kpis_anterior ?? b.kpisAnterior;
  const geradoEm = txt(b.gerado_em ?? b.geradoEm) || new Date().toISOString();
  return {
    geradoEm,
    // o hook troca pelo instante em que montou a janela (é dele que sai o corte do anterior)
    buscaEm: txt(b.busca_em ?? b.buscaEm) || geradoEm,
    periodo: {
      inicio: txt(p.inicio), fim: txt(p.fim),
      mapaInicio: txt(p.mapa_inicio ?? p.mapaInicio) || txt(p.inicio),
    },
    kpis,
    kpisAnterior: ant && typeof ant === 'object' ? normalizarKpis(ant) : null,
    canais: arr(b.canais).map(normalizarCanal),
    ne: normalizarNe(b.ne),
    atendentes: arr(b.atendentes).map(normalizarAtendente).filter((a) => a.usuarioId !== ''),
    mapa: arr(b.mapa).map(normalizarCelula).filter((c): c is CelulaMapaV5 => c !== null),
  };
}

/** Teto do período (igual ao da RPC: 'periodo_longo' acima de 45 dias). */
export const DASH_V5_MAX_DIAS = 45;

/** Erro da RPC em português (nunca SQL cru na tela). */
export function traduzErroDashV5(e: unknown): string {
  const m = (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '')).toLowerCase();
  const codigo = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  // 57014 = statement_timeout (o papel authenticated tem 8 s): período longo com cache frio
  if (codigo === '57014' || m.includes('statement timeout') || m.includes('canceling statement')) {
    return 'A consulta demorou demais. Tente de novo em instantes ou escolha um período menor.';
  }
  if (m.includes('periodo_longo')) return `Escolha um período de até ${DASH_V5_MAX_DIAS} dias.`;
  if (m.includes('periodo')) return 'O período escolhido não é válido.';
  if (m.includes('sem_permissao')) return 'Você não tem acesso aos números desta empresa.';
  if (m.includes('org_indefinida')) return 'Não foi possível identificar a sua empresa.';
  if (m.includes('fetch') || m.includes('network')) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
  return 'Não foi possível carregar os números agora.';
}

/** Foto do período: seis blocos numa chamada. Recarrega a cada 5 min (o react-query
 *  já pausa o intervalo com a aba escondida) e ao voltar para ela. O anterior é cortado
 *  no mesmo tempo decorrido. Ao trocar de período, os números do anterior ficam na tela
 *  (esmaecidos pela página) até a nova foto chegar — sem piscar esqueleto. */
export function useDashV5(periodo: Periodo): UseQueryResult<DashV5> {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  const hoje = spHoje();
  const mapaIni = janelaMapaV5(periodo, hoje).iniISO;
  const queryKey = ['dashboard-v5', org, periodo.iniISO, periodo.fimISO, periodo.prevIniISO, mapaIni];
  const chaveGuarda = JSON.stringify(queryKey);
  return useQuery({
    queryKey,
    enabled: !!org,
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchInterval: CINCO_MIN,
    refetchOnWindowFocus: true,
    // a foto guardada DESTE período vence a do período anterior (que é o keepPreviousData)
    placeholderData: (anterior) => (DASH_V5_REAL ? fotoGuardada(chaveGuarda) : undefined) ?? keepPreviousData(anterior),
    queryFn: async (): Promise<DashV5> => {
      const agora = new Date();
      const j = janelaV5(periodo, agora, hoje);
      if (!DASH_V5_REAL) return { ...demoDashV5(j, agora, cenarioDemoV5()), buscaEm: agora.toISOString() };
      const { data, error } = await supabase!.rpc('dashboard_v5', {
        p_inicio: j.iniISO,
        p_fim: j.fimISO,
        p_org: org,
        p_inicio_ant: j.antIniISO,
        p_fim_ant: j.antFimISO,
        p_mapa_inicio: j.mapaIniISO,
      });
      if (error) throw new Error(traduzErroDashV5(error));
      const foto = { ...normalizarDashV5(data), buscaEm: agora.toISOString() };
      guardarFoto(chaveGuarda, foto);
      return foto;
    },
  });
}
