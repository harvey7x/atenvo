import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { resolvePeriodo, spHoje, addDias, type Periodo, type Preset } from '@/data/relatorios';

/* ------------------------------------------------------------------
   Camada de dados do Dashboard operacional.
   UMA chamada por período: a RPC public.dashboard_resumo devolve todos
   os blocos da tela de uma vez (trocar de período = 1 request, não 9).
   A matemática de período é reaproveitada de @/data/relatorios — a
   janela do Dashboard tem de significar exatamente o mesmo que a de
   Relatórios (fim exclusivo, fuso SP, anterior de mesma duração).
   ------------------------------------------------------------------ */

export const DASH_REAL = isSupabaseConfigured && !!supabase;

export type PresetDash = 'hoje' | '7d' | '30d' | '90d' | 'custom';

export const PRESETS_DASH: { id: PresetDash; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
  { id: 'custom', label: 'Personalizado' },
];

/** 90d não existe em PRESETS de Relatórios: monta via 'custom' sem tocar naquele módulo. */
export function periodoDash(preset: PresetDash, ini?: string, fim?: string): Periodo {
  if (preset === '90d') { const h = spHoje(); return resolvePeriodo('custom', addDias(h, -89), h); }
  if (preset === 'custom') {
    const h = spHoje();
    return resolvePeriodo('custom', ini || addDias(h, -6), fim || h);
  }
  return resolvePeriodo(preset as Preset);
}

/* ====================== Formato da RPC ====================== */

export interface DashKpis {
  novos_leads: number;
  conversas_ativas: number;
  /** null = ninguém respondeu no período (não é zero: é ausência). */
  mediana_primeira_resposta_min: number | null;
  ganhos_qtd: number;
  ganhos_valor: number;
  /** perda REAL: era ganhável e escapou (já sem os descartes). */
  perdidos_qtd: number;
  /** fora do perfil (ex.: já tem processo) — nunca foi ganhável, não é perda. */
  descartados_qtd: number;
}

export interface DashLinhaOrigem { fonte: string; canal: string; qtd: number }
export interface DashLinhaFunil {
  coluna: string; ordem: number; resultado: 'neutro' | 'ganho' | 'perdido'; qtd: number;
  /** a coluna terminal negativa é balde único: vem quebrada nos dois pesos. */
  qtd_perda: number;
  qtd_descarte: number;
}
export interface DashAtendente {
  nome: string;
  conversas_atribuidas: number;
  msgs_enviadas: number;
  /** só o que saiu PELO PAINEL entra aqui (ver nota de atribuição na página). */
  mediana_resposta_min: number | null;
  ganhos: number;
  perdidos: number;
  descartados: number;
}

export type GrupoSaida = 'perda' | 'descarte';
export interface DashMotivo { motivo: string; qtd: number; grupo: GrupoSaida }

export interface DashResumo {
  periodo: { inicio: string; fim: string };
  /** régua do descarte que o banco aplicou (public.dashboard_motivos_descarte). */
  motivos_descarte: string[];
  kpis: DashKpis;
  kpis_anterior: DashKpis;
  leads_por_dia: { dia: string; qtd: number }[];
  origem_trafego: DashLinhaOrigem[];
  funil: DashLinhaFunil[];
  atendentes: DashAtendente[];
  picos_hora: { hora: number; qtd: number }[];
  motivos_perda: DashMotivo[];
  bancos: { banco: string; qtd: number }[];
}

/** Agrupa as linhas fonte×canal em fonte → canais (a RPC devolve o par cru). */
export function agrupaPorFonte(linhas: DashLinhaOrigem[]) {
  const mapa = new Map<string, { fonte: string; qtd: number; canais: { canal: string; qtd: number }[] }>();
  for (const l of linhas) {
    const g = mapa.get(l.fonte) ?? { fonte: l.fonte, qtd: 0, canais: [] };
    g.qtd += l.qtd;
    g.canais.push({ canal: l.canal, qtd: l.qtd });
    mapa.set(l.fonte, g);
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, canais: g.canais.sort((a, b) => b.qtd - a.qtd) }))
    .sort((a, b) => b.qtd - a.qtd);
}

export function useDashboardResumo(periodo: Periodo) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['dashboard-resumo', org, periodo.iniISO, periodo.fimISO],
    enabled: DASH_REAL && !!org,
    staleTime: 60_000,
    queryFn: async (): Promise<DashResumo> => {
      const { data, error } = await supabase!.rpc('dashboard_resumo', {
        p_inicio: periodo.iniISO,
        p_fim: periodo.fimISO,
        p_org: org,
      });
      if (error) throw error;
      return data as DashResumo;
    },
  });
}
