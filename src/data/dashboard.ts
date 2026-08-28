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

/* ====================== Fatia IA (client-side) ======================
   Lê direto do banco (RLS org + GRANT conferidos 28/08): ia_sessoes é
   pequena (~centenas de linhas por org) e mensagens entram só como
   COUNT head — quatro consultas leves em paralelo, cacheadas 60s. */
export interface DashIa {
  sessoesAtivas: number;
  /** sessões VIVAS (ativa/handoff) com pedido de humano de pé. */
  aguardandoHumano: number;
  handoffs: number;
  pausadas: number;
  /** distribuição de etapa só do fluxo VIVO (ativa/handoff). */
  porEtapa: { etapa: string; qtd: number }[];
  msgsBot: number;
  msgsHumano: number;
  /** conversas com precisa_humano aberto AGORA (não é do período). */
  precisaHumanoAgora: number;
}

export function useDashboardIa(periodo: Periodo) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['dashboard-ia', org, periodo.iniISO, periodo.fimISO],
    enabled: DASH_REAL && !!org,
    staleTime: 60_000,
    queryFn: async (): Promise<DashIa> => {
      const sessQ = supabase!.from('ia_sessoes').select('status, etapa, dados').eq('organizacao_id', org);
      const base = () => supabase!.from('mensagens').select('id', { count: 'exact', head: true })
        .eq('organizacao_id', org).eq('direcao', 'saida')
        .gte('criado_em', periodo.iniISO).lt('criado_em', periodo.fimISO);
      // humano ≠ bot é por ORIGEM (regra da casa) — e origem NULA é humano do painel,
      // então o "não-bot" precisa do or() (neq sozinho descartaria os NULL).
      const botQ = base().eq('origem', 'bot');
      const humQ = base().or('origem.is.null,origem.neq.bot');
      const pedQ = supabase!.from('conversas').select('id', { count: 'exact', head: true })
        .eq('organizacao_id', org).eq('precisa_humano', true);
      const [sess, mb, mh, ped] = await Promise.all([sessQ, botQ, humQ, pedQ]);
      if (sess.error) throw sess.error;
      const rows = (sess.data ?? []) as { status: string; etapa: string | null; dados: { aguardando_humano?: string | null } | null }[];
      const vivas = rows.filter((r) => r.status === 'ativa' || r.status === 'handoff');
      const mapa = new Map<string, number>();
      for (const r of vivas) { const e = r.etapa || 'sem_etapa'; mapa.set(e, (mapa.get(e) ?? 0) + 1); }
      return {
        sessoesAtivas: rows.filter((r) => r.status === 'ativa').length,
        handoffs: rows.filter((r) => r.status === 'handoff').length,
        pausadas: rows.filter((r) => r.status === 'pausada').length,
        aguardandoHumano: vivas.filter((r) => !!r.dados?.aguardando_humano).length,
        porEtapa: [...mapa.entries()].map(([etapa, qtd]) => ({ etapa, qtd })).sort((a, b) => b.qtd - a.qtd),
        msgsBot: mb.count ?? 0,
        msgsHumano: mh.count ?? 0,
        precisaHumanoAgora: ped.count ?? 0,
      };
    },
  });
}

/* ====================== Seeds do modo demonstração ======================
   O demo deixava o Dashboard em "Sem conexão" — agora sintetiza a foto
   completa (números coerentes entre si) para a tela viver sem backend. */
export function seedDashResumo(p: Periodo): DashResumo {
  const dias = Math.max(1, p.dias);
  const serie = Array.from({ length: dias }, (_, i) => ({
    dia: addDias(p.iniDate, i),
    qtd: [6, 9, 4, 11, 8, 5, 7, 10, 6, 8][i % 10],
  }));
  const novos = serie.reduce((s, x) => s + x.qtd, 0);
  return {
    periodo: { inicio: p.iniISO, fim: p.fimISO },
    motivos_descarte: ['nao_elegivel'],
    kpis: {
      novos_leads: novos, conversas_ativas: Math.round(novos * 2.1),
      mediana_primeira_resposta_min: 12, ganhos_qtd: Math.max(1, Math.round(novos * 0.16)),
      ganhos_valor: Math.max(1, Math.round(novos * 0.16)) * 1650,
      perdidos_qtd: Math.round(novos * 0.11), descartados_qtd: Math.round(novos * 0.05),
    },
    kpis_anterior: {
      novos_leads: Math.round(novos * 0.82), conversas_ativas: Math.round(novos * 1.8),
      mediana_primeira_resposta_min: 17, ganhos_qtd: Math.max(1, Math.round(novos * 0.12)),
      ganhos_valor: Math.max(1, Math.round(novos * 0.12)) * 1520,
      perdidos_qtd: Math.round(novos * 0.13), descartados_qtd: Math.round(novos * 0.04),
    },
    leads_por_dia: serie,
    origem_trafego: [
      { fonte: 'Tráfego pago', canal: 'JUROS ABUSIVO (ANDRIUS)', qtd: Math.round(novos * 0.46) },
      { fonte: 'Tráfego pago', canal: 'CAMPANHA DE EMPRÉSTIMO', qtd: Math.round(novos * 0.18) },
      { fonte: 'Orgânico', canal: 'LUIZA', qtd: Math.round(novos * 0.27) },
      { fonte: 'Indicação', canal: 'Atendimento Principal', qtd: Math.round(novos * 0.09) },
    ],
    funil: [
      { coluna: 'Lead novo', ordem: 0, resultado: 'neutro', qtd: 14, qtd_perda: 0, qtd_descarte: 0 },
      { coluna: 'Em atendimento', ordem: 1, resultado: 'neutro', qtd: 19, qtd_perda: 0, qtd_descarte: 0 },
      { coluna: 'Documentação', ordem: 2, resultado: 'neutro', qtd: 11, qtd_perda: 0, qtd_descarte: 0 },
      { coluna: 'Qualificado', ordem: 3, resultado: 'neutro', qtd: 7, qtd_perda: 0, qtd_descarte: 0 },
      { coluna: 'Fechado', ordem: 4, resultado: 'ganho', qtd: Math.max(1, Math.round(novos * 0.16)), qtd_perda: 0, qtd_descarte: 0 },
      { coluna: 'Não elegível', ordem: 5, resultado: 'perdido', qtd: Math.round(novos * 0.16), qtd_perda: Math.round(novos * 0.11), qtd_descarte: Math.round(novos * 0.05) },
    ],
    atendentes: [
      { nome: 'Juliana', conversas_atribuidas: Math.round(novos * 0.9), msgs_enviadas: Math.round(novos * 6.2), mediana_resposta_min: 8, ganhos: Math.max(1, Math.round(novos * 0.09)), perdidos: Math.round(novos * 0.05), descartados: Math.round(novos * 0.02) },
      { nome: 'Matheus', conversas_atribuidas: Math.round(novos * 0.7), msgs_enviadas: Math.round(novos * 4.8), mediana_resposta_min: 11, ganhos: Math.max(1, Math.round(novos * 0.05)), perdidos: Math.round(novos * 0.04), descartados: Math.round(novos * 0.02) },
      { nome: 'Henrique', conversas_atribuidas: Math.round(novos * 0.5), msgs_enviadas: Math.round(novos * 3.1), mediana_resposta_min: 15, ganhos: Math.max(1, Math.round(novos * 0.02)), perdidos: Math.round(novos * 0.02), descartados: Math.round(novos * 0.01) },
    ],
    picos_hora: Array.from({ length: 24 }, (_, h) => ({ hora: h, qtd: [0, 0, 0, 0, 0, 0, 1, 2, 6, 11, 14, 12, 9, 10, 16, 18, 13, 9, 6, 4, 2, 1, 0, 0][h] })),
    motivos_perda: [
      { motivo: 'sem_interesse', qtd: Math.round(novos * 0.06), grupo: 'perda' },
      { motivo: 'nao_respondeu', qtd: Math.round(novos * 0.04), grupo: 'perda' },
      { motivo: 'nao_elegivel', qtd: Math.round(novos * 0.05), grupo: 'descarte' },
    ],
    bancos: [
      { banco: 'MERCANTIL', qtd: 9 }, { banco: 'AGIBANK', qtd: 7 }, { banco: 'BMG', qtd: 6 },
      { banco: 'PAN', qtd: 4 }, { banco: 'BANRISUL', qtd: 3 },
    ],
  };
}

export function seedDashIa(): DashIa {
  return {
    sessoesAtivas: 12, aguardandoHumano: 3, handoffs: 2, pausadas: 21,
    porEtapa: [
      { etapa: 'qualificacao_inss', qtd: 6 }, { etapa: 'extratos', qtd: 4 },
      { etapa: 'coleta_docs', qtd: 3 }, { etapa: 'triagem_govbr', qtd: 1 },
    ],
    msgsBot: 214, msgsHumano: 378, precisaHumanoAgora: 5,
  };
}
