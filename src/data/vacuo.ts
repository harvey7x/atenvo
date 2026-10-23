// Radar de Atendimento (nome interno: vácuo) — dados do front (risco ao vivo,
// repasses/punições + ranking de conversão).
// O motor vive no banco (vacuo_avaliar, cron 1 min); aqui é só leitura RLS.
// Os AVISOS chegam pelo canal de sempre (sla_alertas, tipo 'vacuo_aviso') — este
// módulo cuida da MARCAÇÃO do repasse ("era do Matheus → foi pra Juliana → fechou")
// e do painel do admin.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { useSlaAlertas, useSlaAlvos } from '@/data/sla';

export const VACUO_REAL = isSupabaseConfigured && !!supabase;

export interface VacuoRepasse {
  id: string;
  conversaId: string;
  contatoId: string | null;
  oportunidadeId: string | null;
  contatoNome: string | null;
  deNome: string;
  paraNome: string;
  avisos: number;
  minutos: number | null;
  criadoEm: string;
  /** o lead já era PRIORITÁRIO quando foi vacuado (docs/interesse) — agrava a punição */
  prioritario: boolean;
  prioMotivo: string | null;
  /** desfecho da oportunidade amarrada ao repasse (null = sem oportunidade) */
  desfecho: 'fechado' | 'perdido' | 'andamento' | null;
  fechadoEm: string | null;
}

export interface VacuoRankItem {
  usuarioId: string;
  nome: string;
  fechados: number;
  recebidos: number;
  taxa: number;     // % de conversão na janela
  punicoes: number; // repasses sofridos na janela
}

function um<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null); }

/* ---- demo (vite --mode demo): fixtures amarradas às conversas do seed ---- */
export const REPASSES_DEMO: VacuoRepasse[] = [
  {
    id: 'vr-demo-1', conversaId: 'wa-ivone', contatoId: null, oportunidadeId: null,
    contatoNome: 'Ivone Camargo', deNome: 'Matheus', paraNome: 'Juliana',
    avisos: 3, minutos: 64, criadoEm: new Date(Date.now() - 2 * 3600e3).toISOString(),
    prioritario: true, prioMotivo: 'documentação enviada',
    desfecho: 'andamento', fechadoEm: null,
  },
  {
    id: 'vr-demo-2', conversaId: 'wa-terezinha', contatoId: null, oportunidadeId: null,
    contatoNome: 'Terezinha Lopes', deNome: 'Juliana', paraNome: 'Isadora',
    avisos: 3, minutos: 71, criadoEm: new Date(Date.now() - 26 * 3600e3).toISOString(),
    prioritario: false, prioMotivo: null,
    desfecho: 'fechado', fechadoEm: new Date(Date.now() - 20 * 3600e3).toISOString(),
  },
];
/** Prioridade do aviso, codificada no 1º caractere do título do alerta
    (o motor prefixa 📄 = documentação enviada, 🔥 = quente/IA entregou/robô completo). */
export type VacuoPrio = 'docs' | 'quente' | null;
export function prioDoTitulo(titulo: string | null | undefined): VacuoPrio {
  if (!titulo) return null;
  if (titulo.startsWith('📄')) return 'docs';
  if (titulo.startsWith('🔥')) return 'quente';
  return null;
}

/** demo: avisos escalonados visíveis nos chips (conversaId → estágio + prioridade) */
export const AVISOS_DEMO = new Map<string, { n: 1 | 2 | 3; prio: VacuoPrio }>([
  ['wa-jose', { n: 1, prio: null }],
  ['wa-antonio', { n: 2, prio: 'quente' }],
  ['wa-sebastiao', { n: 3, prio: 'docs' }],
]);

/** Um aviso do Radar pronto pra TELA do atendente. */
export interface GuardiaoAviso {
  alertaId: string;
  conversaId: string;
  n: 1 | 2 | 3;
  prio: VacuoPrio;
  nome: string;
  detalhe: string | null;
  desde: string; // início do episódio (criado_em do alerta)
}

/** Cliente em risco AGORA (fila ao vivo do painel do admin): aviso ativo + quem é o dono. */
export interface RadarRisco extends GuardiaoAviso {
  donoId: string | null;
  /** nome do dono quando já conhecido (demo); no real o painel resolve via useOrgUsuarios */
  donoNome?: string;
}

export const GUARDIAO_AVISOS_DEMO: GuardiaoAviso[] = [
  {
    alertaId: 'gav-3', conversaId: 'wa-sebastiao', n: 3, prio: 'docs', nome: 'Sebastião R. Nunes',
    detalhe: 'LEAD PRIORITÁRIO (documentação enviada) — escada acelerada. Responda o cliente para interromper a escalada. Depois do 3º aviso ignorado, o cliente é repassado para quem mais fecha e a punição fica registrada.',
    desde: new Date(Date.now() - 48 * 60e3).toISOString(),
  },
  {
    alertaId: 'gav-2', conversaId: 'wa-antonio', n: 2, prio: 'quente', nome: 'Antônio Pereira Lima',
    detalhe: 'LEAD PRIORITÁRIO (lead quente — interesse confirmado) — escada acelerada. Responda o cliente para interromper a escalada.',
    desde: new Date(Date.now() - 27 * 60e3).toISOString(),
  },
  {
    alertaId: 'gav-1', conversaId: 'wa-jose', n: 1, prio: null, nome: 'José Carlos Ferreira',
    detalhe: 'Responda o cliente para interromper a escalada. Depois do 3º aviso ignorado, o cliente é repassado para quem mais fecha.',
    desde: new Date(Date.now() - 17 * 60e3).toISOString(),
  },
];

/** Avisos do Radar pro usuário LOGADO (pra pilha na tela + takeover do 3º aviso).
    Ordena prioritário primeiro, depois estágio mais grave. */
export const RADAR_RISCO_DEMO: RadarRisco[] = [
  { ...GUARDIAO_AVISOS_DEMO[0], donoId: null, donoNome: 'Matheus' },
  { ...GUARDIAO_AVISOS_DEMO[1], donoId: null, donoNome: 'Juliana' },
  { ...GUARDIAO_AVISOS_DEMO[2], donoId: null, donoNome: 'Isadora' },
];

/** Fila "em risco agora" do PAINEL (admin): TODOS os avisos ativos da org, com o dono.
    Prioritário primeiro, depois estágio mais grave, depois o mais antigo. */
export function useRadarRisco(): RadarRisco[] {
  const slaQ = useSlaAlertas();
  const todos = useMemo(
    () => (slaQ.data?.itens ?? []).filter((a) => a.tipo === 'vacuo_aviso' && !!a.conversa_id),
    [slaQ.data],
  );
  const alvos = useSlaAlvos(todos);
  return useMemo(() => {
    const lista: RadarRisco[] = !VACUO_REAL ? [...RADAR_RISCO_DEMO] : todos.map((a) => ({
      alertaId: a.id,
      conversaId: a.conversa_id!,
      n: estagioAviso(a.severidade),
      prio: prioDoTitulo(a.titulo),
      nome: alvos.get(a.id)?.nome ?? 'Cliente',
      detalhe: a.detalhe,
      desde: a.criado_em,
      donoId: a.responsavel_id,
    }));
    return lista.sort((x, y) => (y.prio ? 1 : 0) - (x.prio ? 1 : 0) || y.n - x.n || x.desde.localeCompare(y.desde));
  }, [todos, alvos]);
}

export function useGuardiaoAvisos(): GuardiaoAviso[] {
  const { user } = useAuth();
  const slaQ = useSlaAlertas();
  const meus = useMemo(
    () => (slaQ.data?.itens ?? []).filter((a) =>
      // só os clientes do PRÓPRIO usuário (sem usuário carregado = nenhum, nunca "todos")
      a.tipo === 'vacuo_aviso' && !!a.conversa_id && !!user?.id && a.responsavel_id === user.id),
    [slaQ.data, user?.id],
  );
  const alvos = useSlaAlvos(meus);
  return useMemo(() => {
    const lista: GuardiaoAviso[] = !VACUO_REAL ? [...GUARDIAO_AVISOS_DEMO] : meus.map((a) => ({
      alertaId: a.id,
      conversaId: a.conversa_id!,
      n: estagioAviso(a.severidade),
      prio: prioDoTitulo(a.titulo),
      nome: alvos.get(a.id)?.nome ?? 'Cliente',
      detalhe: a.detalhe,
      desde: a.criado_em,
    }));
    return lista.sort((x, y) => (y.prio ? 1 : 0) - (x.prio ? 1 : 0) || y.n - x.n || x.desde.localeCompare(y.desde));
  }, [meus, alvos]);
}

type RowRepasse = {
  id: string; conversa_id: string; contato_id: string | null; oportunidade_id: string | null;
  avisos: number; minutos_vacuo: number | null; criado_em: string;
  prioritario: boolean | null; prio_motivo: string | null;
  de: { nome: string } | { nome: string }[] | null;
  para: { nome: string } | { nome: string }[] | null;
  contato: { nome: string | null } | { nome: string | null }[] | null;
  opp: { status: string; fechado_em: string | null } | { status: string; fechado_em: string | null }[] | null;
};

function mapRepasse(r: RowRepasse): VacuoRepasse {
  const opp = um(r.opp);
  return {
    id: r.id, conversaId: r.conversa_id, contatoId: r.contato_id, oportunidadeId: r.oportunidade_id,
    contatoNome: um(r.contato)?.nome ?? null,
    deNome: um(r.de)?.nome ?? 'Atendente', paraNome: um(r.para)?.nome ?? 'Atendente',
    avisos: r.avisos, minutos: r.minutos_vacuo, criadoEm: r.criado_em,
    prioritario: !!r.prioritario, prioMotivo: r.prio_motivo,
    desfecho: !opp ? null : opp.status === 'ganho' ? 'fechado' : opp.status === 'perdido' ? 'perdido' : 'andamento',
    fechadoEm: opp?.fechado_em ?? null,
  };
}

/** Repasses do Radar (mais recentes primeiro). Refetch 60s — o cron roda a cada 1 min. */
export function useVacuoRepasses() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;
  return useQuery({
    queryKey: ['vacuo-repasses', orgId],
    enabled: !!orgId,
    staleTime: 50_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<VacuoRepasse[]> => {
      if (!VACUO_REAL) return REPASSES_DEMO;
      const { data, error } = await supabase!
        .from('vacuo_repasses')
        .select(`id, conversa_id, contato_id, oportunidade_id, avisos, minutos_vacuo, prioritario, prio_motivo, criado_em,
          de:usuarios!vacuo_repasses_de_usuario_id_fkey(nome),
          para:usuarios!vacuo_repasses_para_usuario_id_fkey(nome),
          contato:contatos(nome),
          opp:oportunidades(status, fechado_em)`)
        .eq('organizacao_id', orgId)
        .order('criado_em', { ascending: false })
        .limit(400);
      if (error) throw new Error(error.message);
      return ((data as unknown as RowRepasse[]) ?? []).map(mapRepasse);
    },
  });
}

/** Último repasse por conversa (o selo "era de X"). */
export function repassesPorConversa(itens: VacuoRepasse[]): Map<string, VacuoRepasse> {
  const m = new Map<string, VacuoRepasse>();
  for (const r of itens) if (!m.has(r.conversaId)) m.set(r.conversaId, r); // já vem desc
  return m;
}

/** Último repasse por oportunidade (selo no card do Kanban). */
export function repassesPorOportunidade(itens: VacuoRepasse[]): Map<string, VacuoRepasse> {
  const m = new Map<string, VacuoRepasse>();
  for (const r of itens) if (r.oportunidadeId && !m.has(r.oportunidadeId)) m.set(r.oportunidadeId, r);
  return m;
}

/** Estágio do aviso de vácuo a partir da severidade do alerta (amarelo=1º, vermelho=2º, crítico=3º). */
export function estagioAviso(sev: string): 1 | 2 | 3 {
  return sev === 'critico' ? 3 : sev === 'vermelho' ? 2 : 1;
}

const RANKING_DEMO: VacuoRankItem[] = [
  { usuarioId: 'u-isadora', nome: 'Isadora', fechados: 12, recebidos: 209, taxa: 5.7, punicoes: 0 },
  { usuarioId: 'u-matheus', nome: 'Matheus', fechados: 45, recebidos: 1351, taxa: 3.3, punicoes: 1 },
  { usuarioId: 'u-juliana', nome: 'Juliana', fechados: 20, recebidos: 1364, taxa: 1.5, punicoes: 1 },
];

/** Ranking de conversão (a mesma conta que o motor usa pra escolher o destino) + punições. */
export function useVacuoRanking() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;
  return useQuery({
    queryKey: ['vacuo-ranking', orgId],
    enabled: !!orgId,
    staleTime: 120_000,
    refetchInterval: 180_000,
    queryFn: async (): Promise<VacuoRankItem[]> => {
      if (!VACUO_REAL) return RANKING_DEMO;
      const { data, error } = await supabase!.rpc('vacuo_ranking', { p_org: orgId });
      if (error) throw new Error(error.message);
      type Row = { usuario_id: string; nome: string; fechados: number; recebidos: number; taxa: number; punicoes: number };
      return ((data as Row[]) ?? []).map((r) => ({
        usuarioId: r.usuario_id, nome: r.nome,
        fechados: Number(r.fechados), recebidos: Number(r.recebidos),
        taxa: Number(r.taxa), punicoes: Number(r.punicoes),
      }));
    },
  });
}

export interface VacuoConfigView {
  ativo: boolean; ativoDesde: string | null;
  aviso1: number; aviso2: number; aviso3: number; repasse: number;
  prioAviso1: number; prioAviso2: number; prioAviso3: number; prioRepasse: number;
  horaInicio: number; horaFim: number;
  janelaDias: number; minRecebidos: number; maxRepassesDia: number;
}

const CONFIG_DEMO: VacuoConfigView = {
  ativo: true, ativoDesde: new Date().toISOString(),
  aviso1: 15, aviso2: 30, aviso3: 45, repasse: 60,
  prioAviso1: 10, prioAviso2: 20, prioAviso3: 30, prioRepasse: 40,
  horaInicio: 8, horaFim: 20, janelaDias: 30, minRecebidos: 30, maxRepassesDia: 25,
};

/** Regras vigentes (leitura; ajustes por enquanto são feitos pelo suporte). */
export function useVacuoConfig() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;
  return useQuery({
    queryKey: ['vacuo-config', orgId],
    enabled: !!orgId,
    staleTime: 300_000,
    queryFn: async (): Promise<VacuoConfigView | null> => {
      if (!VACUO_REAL) return CONFIG_DEMO;
      const { data, error } = await supabase!
        .from('vacuo_config')
        .select('ativo, ativo_desde, aviso1_min, aviso2_min, aviso3_min, repasse_min, prio_aviso1_min, prio_aviso2_min, prio_aviso3_min, prio_repasse_min, hora_inicio, hora_fim, conversao_janela_dias, conversao_min_recebidos, max_repasses_dia')
        .eq('organizacao_id', orgId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        ativo: data.ativo, ativoDesde: data.ativo_desde,
        aviso1: data.aviso1_min, aviso2: data.aviso2_min, aviso3: data.aviso3_min, repasse: data.repasse_min,
        prioAviso1: data.prio_aviso1_min, prioAviso2: data.prio_aviso2_min, prioAviso3: data.prio_aviso3_min, prioRepasse: data.prio_repasse_min,
        horaInicio: data.hora_inicio, horaFim: data.hora_fim,
        janelaDias: data.conversao_janela_dias, minRecebidos: data.conversao_min_recebidos,
        maxRepassesDia: data.max_repasses_dia,
      };
    },
  });
}
