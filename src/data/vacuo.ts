// Radar de Atendimento (nome interno: vácuo) — dados do front (risco ao vivo,
// decisões do gestor, histórico de repasses + ranking de conversão).
// O motor vive no banco (vacuo_avaliar, cron 1 min) e NÃO transfere cliente: com 1 dia
// útil sem resposta ele pede a decisão do GESTOR, que repassa (pra quem escolher) ou
// mantém via vacuo_decidir. Os AVISOS chegam por sla_alertas (tipo 'vacuo_aviso').
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  /** decisão do gestor: repassou ou manteve com o mesmo dono */
  decisao: 'repassado' | 'mantido';
  decididoPorNome: string | null;
  /** repasse automático antigo desfeito a pedido do dono (23/10) */
  desfeito: boolean;
  /** desfecho da oportunidade amarrada ao repasse (null = sem oportunidade) */
  desfecho: 'fechado' | 'perdido' | 'andamento' | null;
  fechadoEm: string | null;
}

/** Repasse que vale como marcação "era de X → Y" (decidido e não desfeito). */
export function repasseEfetivo(r: VacuoRepasse): boolean {
  return r.decisao === 'repassado' && !r.desfeito;
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
    decisao: 'repassado', decididoPorNome: 'Matheus', desfeito: false,
    desfecho: 'andamento', fechadoEm: null,
  },
  {
    id: 'vr-demo-2', conversaId: 'wa-terezinha', contatoId: null, oportunidadeId: null,
    contatoNome: 'Terezinha Lopes', deNome: 'Juliana', paraNome: 'Isadora',
    avisos: 3, minutos: 71, criadoEm: new Date(Date.now() - 26 * 3600e3).toISOString(),
    prioritario: false, prioMotivo: null,
    decisao: 'repassado', decididoPorNome: 'Matheus', desfeito: false,
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
    detalhe: 'LEAD PRIORITÁRIO (documentação enviada) — escada acelerada. Responda o cliente para interromper a escalada. Com 1 dia útil sem resposta, o gestor decide se o cliente será repassado.',
    desde: new Date(Date.now() - 48 * 60e3).toISOString(),
  },
  {
    alertaId: 'gav-2', conversaId: 'wa-antonio', n: 2, prio: 'quente', nome: 'Antônio Pereira Lima',
    detalhe: 'LEAD PRIORITÁRIO (lead quente — interesse confirmado) — escada acelerada. Responda o cliente para interromper a escalada.',
    desde: new Date(Date.now() - 27 * 60e3).toISOString(),
  },
  {
    alertaId: 'gav-1', conversaId: 'wa-jose', n: 1, prio: null, nome: 'José Carlos Ferreira',
    detalhe: 'Responda o cliente para interromper a escalada. Com 1 dia útil sem resposta, o gestor decide o repasse.',
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
  decisao: string | null; desfeito_em: string | null;
  decidido: { nome: string } | { nome: string }[] | null;
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
    decisao: r.decisao === 'mantido' ? 'mantido' : 'repassado',
    decididoPorNome: um(r.decidido)?.nome ?? null,
    desfeito: !!r.desfeito_em,
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
        .select(`id, conversa_id, contato_id, oportunidade_id, avisos, minutos_vacuo, prioritario, prio_motivo, decisao, desfeito_em, criado_em,
          decidido:usuarios!vacuo_repasses_decidido_por_fkey(nome),
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

/** Último repasse EFETIVO por conversa (o selo "era de X"); "mantido" e desfeito não marcam. */
export function repassesPorConversa(itens: VacuoRepasse[]): Map<string, VacuoRepasse> {
  const m = new Map<string, VacuoRepasse>();
  for (const r of itens) if (repasseEfetivo(r) && !m.has(r.conversaId)) m.set(r.conversaId, r); // já vem desc
  return m;
}

/** Último repasse por oportunidade (selo no card do Kanban). */
export function repassesPorOportunidade(itens: VacuoRepasse[]): Map<string, VacuoRepasse> {
  const m = new Map<string, VacuoRepasse>();
  for (const r of itens) if (repasseEfetivo(r) && r.oportunidadeId && !m.has(r.oportunidadeId)) m.set(r.oportunidadeId, r);
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
  aviso1: 30, aviso2: 120, aviso3: 300, repasse: 540,
  prioAviso1: 15, prioAviso2: 60, prioAviso3: 180, prioRepasse: 540,
  horaInicio: 9, horaFim: 18, janelaDias: 30, minRecebidos: 30, maxRepassesDia: 0,
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

/* ---- decisões do GESTOR (1 dia útil sem resposta → ele decide repassar ou manter) ---- */
export interface VacuoDecisao {
  conversaId: string;
  contatoNome: string;
  donoId: string | null;
  donoNome: string;
  desde: string;            // início do vácuo
  pedidaEm: string;         // quando o motor pediu a decisão
  minutos: number | null;   // minutos úteis sem resposta no pedido
  prioritario: boolean;
  prioMotivo: string | null;
  sugeridoId: string | null;   // maior conversão (sugestão, o gestor escolhe)
  sugeridoNome: string | null;
}

export const DECISOES_DEMO: VacuoDecisao[] = [
  {
    conversaId: 'wa-sebastiao', contatoNome: 'Sebastião R. Nunes', donoId: 'u-juliana', donoNome: 'Juliana',
    desde: new Date(Date.now() - 26 * 3600e3).toISOString(), pedidaEm: new Date(Date.now() - 40 * 60e3).toISOString(),
    minutos: 600, prioritario: true, prioMotivo: 'documentação enviada', sugeridoId: 'u-isadora', sugeridoNome: 'Isadora',
  },
  {
    conversaId: 'wa-odete', contatoNome: 'Odete F. Carvalho', donoId: 'u-matheus', donoNome: 'Matheus',
    desde: new Date(Date.now() - 30 * 3600e3).toISOString(), pedidaEm: new Date(Date.now() - 2 * 3600e3).toISOString(),
    minutos: 640, prioritario: false, prioMotivo: null, sugeridoId: 'u-isadora', sugeridoNome: 'Isadora',
  },
];

/** Fila de decisões pendentes — só o gestor (admin) consulta; a RPC também confere. */
export function useVacuoDecisoes() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;
  const gestor = currentOrg.role === 'admin';
  return useQuery({
    queryKey: ['vacuo-decisoes', orgId],
    enabled: !!orgId && gestor,
    staleTime: 50_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<VacuoDecisao[]> => {
      if (!VACUO_REAL) return DECISOES_DEMO;
      const { data, error } = await supabase!.rpc('vacuo_decisoes_pendentes', { p_org: orgId });
      if (error) throw new Error(error.message);
      type Row = {
        conversa_id: string; contato_nome: string | null; dono_id: string | null; dono_nome: string | null;
        desde: string; decisao_pedida_em: string; minutos_vacuo: number | null;
        prioritario: boolean; prio_motivo: string | null; sugerido_id: string | null; sugerido_nome: string | null;
      };
      return ((data as Row[]) ?? []).map((r) => ({
        conversaId: r.conversa_id, contatoNome: r.contato_nome ?? 'Cliente',
        donoId: r.dono_id, donoNome: r.dono_nome ?? 'Atendente',
        desde: r.desde, pedidaEm: r.decisao_pedida_em, minutos: r.minutos_vacuo,
        prioritario: !!r.prioritario, prioMotivo: r.prio_motivo,
        sugeridoId: r.sugerido_id, sugeridoNome: r.sugerido_nome,
      }));
    },
  });
}

/** Decide: destinoId = outro atendente → repassa; null → mantém com o dono atual. */
export function useDecidirRepasse() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;
  return useMutation({
    mutationFn: async (p: { conversaId: string; destinoId: string | null }) => {
      if (!VACUO_REAL) return { decisao: p.destinoId ? 'repassado' : 'mantido' };
      const { data, error } = await supabase!.rpc('vacuo_decidir', { p_conversa: p.conversaId, p_destino: p.destinoId });
      if (error) throw new Error(error.message);
      return data as { decisao: string; para: string };
    },
    onSuccess: (_r, p) => {
      if (!VACUO_REAL) {
        qc.setQueryData<VacuoDecisao[]>(['vacuo-decisoes', orgId], (old) => (old ?? []).filter((d) => d.conversaId !== p.conversaId));
        return;
      }
      for (const k of ['vacuo-decisoes', 'vacuo-repasses', 'vacuo-ranking', 'sla-alertas', 'wa-conversas']) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });
}

/* ---- "LIGAR PRO CLIENTE": lead parou de responder o ROBÔ por 2 h úteis ---- */
export interface LigarItem {
  alertaId: string;
  conversaId: string;
  nome: string;
  donoId: string | null;
  donoNome?: string;
  desde: string; // quando o aviso foi criado
}

export const LIGAR_DEMO: LigarItem[] = [
  { alertaId: 'lig-1', conversaId: 'wa-neusa', nome: 'Neusa Trindade', donoId: null, donoNome: 'Matheus', desde: new Date(Date.now() - 25 * 60e3).toISOString() },
  { alertaId: 'lig-2', conversaId: 'wa-joaob', nome: 'João Batista Ramos', donoId: null, donoNome: 'Juliana', desde: new Date(Date.now() - 70 * 60e3).toISOString() },
];

function useLigarBase(soMeus: boolean): LigarItem[] {
  const { user } = useAuth();
  const slaQ = useSlaAlertas();
  const itens = useMemo(
    () => (slaQ.data?.itens ?? []).filter((a) =>
      a.tipo === 'robo_ligar' && !!a.conversa_id && (!soMeus || (!!user?.id && a.responsavel_id === user.id))),
    [slaQ.data, user?.id, soMeus],
  );
  const alvos = useSlaAlvos(itens);
  return useMemo(() => {
    if (!VACUO_REAL) return soMeus ? LIGAR_DEMO.slice(0, 1) : LIGAR_DEMO;
    return itens.map((a) => ({
      alertaId: a.id, conversaId: a.conversa_id!, nome: alvos.get(a.id)?.nome ?? 'Cliente',
      donoId: a.responsavel_id, desde: a.criado_em,
    })).sort((x, y) => x.desde.localeCompare(y.desde));
  }, [itens, alvos, soMeus]);
}

/** Clientes pra LIGAR do próprio usuário (aviso pessoal — só o dono vê). */
export function useLigarMeus(): LigarItem[] { return useLigarBase(true); }
/** Visão de equipe (painel /radar, admin). */
export function useLigarEquipe(): LigarItem[] { return useLigarBase(false); }

/** "Já liguei": encerra o aviso e registra a ligação na conversa. */
export function useConcluirLigacao() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;
  return useMutation({
    mutationFn: async (conversaId: string) => {
      if (!VACUO_REAL) return { ok: true };
      const { data, error } = await supabase!.rpc('robo_ligar_concluir', { p_conversa: conversaId });
      if (error) throw new Error(error.message);
      return data as { ok: boolean };
    },
    onSuccess: (_r, conversaId) => {
      if (!VACUO_REAL) return;
      qc.setQueryData(['sla-alertas', orgId], (old: unknown) => {
        const o = old as { itens?: Array<{ tipo: string; conversa_id: string | null }> } | undefined;
        if (!o?.itens) return old;
        return { ...o, itens: o.itens.filter((a) => !(a.tipo === 'robo_ligar' && a.conversa_id === conversaId)) };
      });
      qc.invalidateQueries({ queryKey: ['sla-alertas'] });
    },
  });
}

/** Horário útil do Radar (seg–sex, horaInicio ≤ hora < horaFim, America/Sao_Paulo).
    Fora dele a pílula e o takeover ficam escondidos — ninguém é avisado no fim de semana/noite. */
export function radarHorarioAberto(cfg: { horaInicio: number; horaFim: number } | null | undefined, agora = new Date()): boolean {
  const ini = cfg?.horaInicio ?? 9, fim = cfg?.horaFim ?? 18;
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(agora);
  const dia = partes.find((x) => x.type === 'weekday')?.value ?? '';
  const hora = Number(partes.find((x) => x.type === 'hour')?.value ?? '0') % 24;
  return !['Sat', 'Sun'].includes(dia) && hora >= ini && hora < fim;
}
