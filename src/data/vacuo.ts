// Radar de Atendimento (nome interno: vácuo) — dados do front (avisos ao vivo,
// decisões do gestor, histórico de repasses + ranking de conversão).
// O motor vive no banco (vacuo_avaliar, cron 1 min) e NÃO transfere cliente: com 1 dia
// útil sem resposta ele pede a decisão do GESTOR, que repassa (pra quem escolher) ou
// mantém via vacuo_decidir. Os AVISOS chegam pela RPC radar_avisos (dado estruturado).
// Cliente FECHADO tem fila própria ('vacuo_fechado'), separada da negociação (dono 29/10).
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { nomeContatoExib } from '@/data/slaView';
import { DEMO_USER } from '@/data/demo';

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
    contatoNome: 'Ivone Castro dos Santos', deNome: 'Matheus', paraNome: 'Juliana',
    avisos: 3, minutos: 560, criadoEm: new Date(Date.now() - 3 * 86400e3).toISOString(),
    prioritario: true, prioMotivo: 'documentação enviada',
    decisao: 'repassado', decididoPorNome: 'Matheus', desfeito: false,
    desfecho: 'andamento', fechadoEm: null,
  },
  {
    id: 'vr-demo-2', conversaId: 'wa-terezinha', contatoId: null, oportunidadeId: null,
    contatoNome: 'Terezinha M. Alves', deNome: 'Juliana', paraNome: 'Isadora',
    avisos: 3, minutos: 600, criadoEm: new Date(Date.now() - 26 * 3600e3).toISOString(),
    prioritario: false, prioMotivo: null,
    decisao: 'repassado', decididoPorNome: 'Matheus', desfeito: false,
    desfecho: 'fechado', fechadoEm: new Date(Date.now() - 20 * 3600e3).toISOString(),
  },
];
/* ============================================================================
   AVISOS DO RADAR (v5, 29/10) — dado ESTRUTURADO da RPC radar_avisos: categoria
   (negociação × cliente fechado × ligar × pedido do gestor), degrau 1–3, desde quando
   o cliente espera, tempo útil ao vivo e prioridade. Uma fonte para barra, central,
   telas cheias, inbox e painel — nada de ler emoji ou texto do alerta.
   Atendente recebe só os próprios avisos; o gestor recebe a equipe (o painel usa).
   ============================================================================ */
export type RadarCategoria = 'negociacao' | 'fechado' | 'ligar' | 'cutucada';
export type RadarEstagio = 1 | 2 | 3;

export interface RadarItem {
  alertaId: string;
  categoria: RadarCategoria;
  /** degrau do aviso (negociação/fechado); 0 em ligar e pedido do gestor */
  estagio: 0 | RadarEstagio;
  conversaId: string;
  nome: string;
  donoId: string | null;
  donoNome: string | null;
  /** quando o cliente começou a esperar (ligar: a última mensagem do robô) */
  desde: string;
  /** minutos ÚTEIS de espera (seg–sex, horário do Radar), calculados no banco a cada leitura */
  minutosUteis: number;
  /** 'Documentação enviada' | 'Interesse confirmado' — só em negociação */
  prioridade: string | null;
  cutucadoEm: string | null;
  cutucadas: number;
  cutucadoPorNome: string | null;
  decisaoPedidaEm: string | null;
  /** minutos ÚTEIS até o gestor ser acionado (só negociação; null = não se aplica). "Já acionado" = decisaoPedidaEm. */
  decisaoEmMin: number | null;
  /** trecho da última mensagem do cliente (até 60 caracteres, números longos mascarados pelo banco) */
  ultimaMsg: string | null;
  criadoEm: string;
}

type RowRadar = {
  alerta_id: string; tipo: string; categoria: RadarCategoria; estagio: number | null;
  conversa_id: string | null; contato_nome: string | null; contato_telefone: string | null;
  responsavel_id: string | null; responsavel_nome: string | null;
  desde: string; minutos_uteis: number | null; prioritario: boolean | null; prioridade: string | null;
  cutucado_em: string | null; cutucadas: number | null; cutucado_por_nome: string | null;
  decisao_pedida_em: string | null; decisao_em_min: number | null; ultima_msg: string | null; criado_em: string;
};

function mapRadar(r: RowRadar): RadarItem {
  const e = Number(r.estagio ?? 0);
  return {
    alertaId: r.alerta_id,
    categoria: r.categoria,
    estagio: (r.categoria === 'negociacao' || r.categoria === 'fechado') ? (Math.min(3, Math.max(1, e)) as RadarEstagio) : 0,
    conversaId: r.conversa_id!,
    nome: nomeContatoExib(r.contato_nome, r.contato_telefone),
    donoId: r.responsavel_id, donoNome: r.responsavel_nome,
    desde: r.desde, minutosUteis: Number(r.minutos_uteis ?? 0),
    prioridade: r.categoria === 'negociacao' ? (r.prioridade || null) : null,
    cutucadoEm: r.cutucado_em, cutucadas: Number(r.cutucadas ?? 0), cutucadoPorNome: r.cutucado_por_nome,
    decisaoPedidaEm: r.decisao_pedida_em,
    decisaoEmMin: r.decisao_em_min == null ? null : Number(r.decisao_em_min),
    ultimaMsg: r.ultima_msg || null,
    criadoEm: r.criado_em,
  };
}

/* ---- demo (vite --mode demo): fixtures amarradas às conversas do seed ---- */
const minAtras = (m: number) => new Date(Date.now() - m * 60e3).toISOString();
function itemDemo(p: Partial<RadarItem> & Pick<RadarItem, 'alertaId' | 'categoria' | 'conversaId' | 'nome'>): RadarItem {
  return {
    estagio: 0, donoId: DEMO_USER.id, donoNome: 'Henrique', desde: minAtras(40), minutosUteis: 40,
    prioridade: null, cutucadoEm: null, cutucadas: 0, cutucadoPorNome: null, decisaoPedidaEm: null,
    decisaoEmMin: null, ultimaMsg: null, criadoEm: minAtras(5), ...p,
  };
}
export function radarDemo(): RadarItem[] {
  return [
    itemDemo({ alertaId: 'rd-n3', categoria: 'negociacao', estagio: 3, conversaId: 'wa-sebastiao', nome: 'Sebastião R. Nunes',
      prioridade: 'Documentação enviada', desde: minAtras(26 * 60), minutosUteis: 600, criadoEm: minAtras(2),
      decisaoPedidaEm: minAtras(40), decisaoEmMin: 0, ultimaMsg: 'Já mandei todos os documentos. Falta mais alguma coisa?' }),
    itemDemo({ alertaId: 'rd-n2', categoria: 'negociacao', estagio: 2, conversaId: 'wa-antonio', nome: 'Antônio Pereira Lima',
      prioridade: 'Interesse confirmado', desde: minAtras(96), minutosUteis: 96, criadoEm: minAtras(30),
      decisaoEmMin: 444, ultimaMsg: 'Recebi a carta do banco aqui' }),
    itemDemo({ alertaId: 'rd-n1', categoria: 'negociacao', estagio: 1, conversaId: 'wa-jose', nome: 'José Carlos Ferreira',
      desde: minAtras(44), minutosUteis: 44, criadoEm: minAtras(14), decisaoEmMin: 496 }),
    itemDemo({ alertaId: 'rd-f3', categoria: 'fechado', estagio: 3, conversaId: 'wa-odete', nome: 'Odete F. Carvalho',
      desde: minAtras(330), minutosUteis: 330, criadoEm: minAtras(1),
      ultimaMsg: 'Bom dia, tem alguma novidade do meu processo?' }),
    itemDemo({ alertaId: 'rd-f1', categoria: 'fechado', estagio: 1, conversaId: 'wa-pedro', nome: 'Pedro Henrique Dias',
      desde: minAtras(52), minutosUteis: 52, criadoEm: minAtras(20) }),
    itemDemo({ alertaId: 'rd-l1', categoria: 'ligar', conversaId: 'wa-maria', nome: 'Maria Aparecida Souza',
      desde: minAtras(150), minutosUteis: 150, criadoEm: minAtras(30) }),
    // equipe (só o painel do gestor vê)
    itemDemo({ alertaId: 'rd-e1', categoria: 'negociacao', estagio: 3, conversaId: 'wa-ivone', nome: 'Ivone Castro dos Santos',
      donoId: 'u-juliana', donoNome: 'Juliana', desde: minAtras(610), minutosUteis: 610, criadoEm: minAtras(70),
      decisaoPedidaEm: minAtras(40), decisaoEmMin: 0, prioridade: 'Interesse confirmado' }),
    itemDemo({ alertaId: 'rd-e2', categoria: 'fechado', estagio: 2, conversaId: 'wa-terezinha', nome: 'Terezinha M. Alves',
      donoId: 'u-isadora', donoNome: 'Isadora', desde: minAtras(140), minutosUteis: 140, criadoEm: minAtras(20) }),
    itemDemo({ alertaId: 'rd-e3', categoria: 'ligar', conversaId: 'wa-cleusa', nome: 'Cleusa M. Barros',
      donoId: 'u-juliana', donoNome: 'Juliana', desde: minAtras(200), minutosUteis: 200, criadoEm: minAtras(80) }),
  ];
}

/** Avisos ativos do Radar (RPC radar_avisos). Refetch 60s — o motor roda a cada 1 min. */
export function useRadarAvisos() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;
  return useQuery({
    queryKey: ['radar-avisos', orgId],
    enabled: !!orgId,
    // demo: as fixtures nascem uma vez — refazer a cada minuto desfaria "Já liguei" e "Pedir resposta"
    ...(VACUO_REAL
      ? { staleTime: 50_000, refetchInterval: 60_000, refetchOnWindowFocus: true }
      : { staleTime: Infinity, refetchInterval: false as const, refetchOnWindowFocus: false }),
    queryFn: async (): Promise<RadarItem[]> => {
      if (!VACUO_REAL) return radarDemo();
      const { data, error } = await supabase!.rpc('radar_avisos', { p_org: orgId });
      if (error) throw new Error(error.message);
      return ((data as RowRadar[]) ?? []).filter((r) => !!r.conversa_id).map(mapRadar);
    },
  });
}

/** As quatro filas, já ordenadas. `pedidos` = conversas com pedido do gestor ativo (fixadas no topo). */
export interface RadarFilas {
  negociacao: RadarItem[];
  fechado: RadarItem[];
  ligar: RadarItem[];
  cutucadas: RadarItem[];
  pedidos: Set<string>;
}

const PESO_PRIO: Record<string, number> = { 'Documentação enviada': 2, 'Interesse confirmado': 1 };

/** Último aviso → 1º; dentro do degrau, quem tem pedido do gestor, depois prioridade
    (documentação, interesse), depois quem espera há mais tempo. */
function ordenarAvisos(lista: RadarItem[], pedidos: Set<string>): RadarItem[] {
  return [...lista].sort((a, b) =>
    b.estagio - a.estagio
    || (pedidos.has(b.conversaId) ? 1 : 0) - (pedidos.has(a.conversaId) ? 1 : 0)
    || (PESO_PRIO[b.prioridade ?? ''] ?? 0) - (PESO_PRIO[a.prioridade ?? ''] ?? 0)
    || a.desde.localeCompare(b.desde));
}

export function filasDoRadar(itens: RadarItem[]): RadarFilas {
  const cutucadas = itens.filter((i) => i.categoria === 'cutucada').sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const pedidos = new Set(cutucadas.map((c) => c.conversaId));
  return {
    negociacao: ordenarAvisos(itens.filter((i) => i.categoria === 'negociacao'), pedidos),
    fechado: ordenarAvisos(itens.filter((i) => i.categoria === 'fechado'), pedidos),
    ligar: itens.filter((i) => i.categoria === 'ligar').sort((a, b) => a.desde.localeCompare(b.desde)),
    cutucadas,
    pedidos,
  };
}

/** Filas do PRÓPRIO usuário (barra, central, telas cheias e selos do inbox) — avisos são pessoais. */
export function useRadarMeus(): RadarFilas & { carregando: boolean } {
  const { user } = useAuth();
  const q = useRadarAvisos();
  const uid = user?.id ?? null;
  const filas = useMemo(
    () => filasDoRadar((q.data ?? []).filter((i) => !!uid && i.donoId === uid)),
    [q.data, uid],
  );
  return useMemo(() => ({ ...filas, carregando: q.isLoading }), [filas, q.isLoading]);
}

/** Filas da EQUIPE (painel /radar do gestor). */
export function useRadarEquipe(): RadarFilas & { carregando: boolean } {
  const q = useRadarAvisos();
  const filas = useMemo(() => filasDoRadar(q.data ?? []), [q.data]);
  return useMemo(() => ({ ...filas, carregando: q.isLoading }), [filas, q.isLoading]);
}

/** Por conversa (selos do inbox): o aviso (negociação OU fechado), o ligar e o pedido do gestor. */
export interface RadarDaConversa { aviso?: RadarItem; ligar?: RadarItem; pedido?: RadarItem }
export function radarPorConversa(f: RadarFilas): Map<string, RadarDaConversa> {
  const m = new Map<string, RadarDaConversa>();
  const pega = (cid: string) => { let x = m.get(cid); if (!x) { x = {}; m.set(cid, x); } return x; };
  for (const i of [...f.negociacao, ...f.fechado]) pega(i.conversaId).aviso = i;
  for (const i of f.ligar) pega(i.conversaId).ligar = i;
  for (const i of f.cutucadas) pega(i.conversaId).pedido = i;
  return m;
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
    ...(VACUO_REAL
      ? { staleTime: 50_000, refetchInterval: 60_000 }
      : { staleTime: Infinity, refetchInterval: false as const, refetchOnWindowFocus: false }),
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
  cutucadoEm: string | null;   // último "👉 cutucar" do gestor
  cutucadas: number;
}

export const DECISOES_DEMO: VacuoDecisao[] = [
  {
    conversaId: 'wa-sebastiao', contatoNome: 'Sebastião R. Nunes', donoId: DEMO_USER.id, donoNome: 'Henrique',
    desde: new Date(Date.now() - 26 * 3600e3).toISOString(), pedidaEm: new Date(Date.now() - 40 * 60e3).toISOString(),
    minutos: 600, prioritario: true, prioMotivo: 'documentação enviada', sugeridoId: 'u-isadora', sugeridoNome: 'Isadora',
    cutucadoEm: null, cutucadas: 0,
  },
  {
    // cliente FECHADO nunca vira decisão de repasse — a fixture usa só negociação
    conversaId: 'wa-ivone', contatoNome: 'Ivone Castro dos Santos', donoId: 'u-juliana', donoNome: 'Juliana',
    desde: new Date(Date.now() - 610 * 60e3).toISOString(), pedidaEm: new Date(Date.now() - 40 * 60e3).toISOString(),
    minutos: 610, prioritario: true, prioMotivo: 'lead quente (interesse confirmado)', sugeridoId: 'u-isadora', sugeridoNome: 'Isadora',
    cutucadoEm: null, cutucadas: 0,
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
    ...(VACUO_REAL
      ? { staleTime: 50_000, refetchInterval: 60_000 }
      : { staleTime: Infinity, refetchInterval: false as const, refetchOnWindowFocus: false }),
    queryFn: async (): Promise<VacuoDecisao[]> => {
      if (!VACUO_REAL) return DECISOES_DEMO;
      const { data, error } = await supabase!.rpc('vacuo_decisoes_pendentes', { p_org: orgId });
      if (error) throw new Error(error.message);
      type Row = {
        conversa_id: string; contato_nome: string | null; dono_id: string | null; dono_nome: string | null;
        desde: string; decisao_pedida_em: string; minutos_vacuo: number | null;
        prioritario: boolean; prio_motivo: string | null; sugerido_id: string | null; sugerido_nome: string | null;
        cutucado_em: string | null; cutucadas: number | null;
      };
      return ((data as Row[]) ?? []).map((r) => ({
        conversaId: r.conversa_id, contatoNome: r.contato_nome ?? 'Cliente',
        donoId: r.dono_id, donoNome: r.dono_nome ?? 'Atendente',
        desde: r.desde, pedidaEm: r.decisao_pedida_em, minutos: r.minutos_vacuo,
        prioritario: !!r.prioritario, prioMotivo: r.prio_motivo,
        sugeridoId: r.sugerido_id, sugeridoNome: r.sugerido_nome,
        cutucadoEm: r.cutucado_em, cutucadas: Number(r.cutucadas ?? 0),
      }));
    },
  });
}

/** Decide: destinoId = outro atendente → repassa; null → mantém com o dono atual. */
/** Tudo que uma decisão do gestor mexe. O lote recarrega UMA vez, no fim (não a cada cliente). */
const CHAVES_DECISAO = ['vacuo-decisoes', 'vacuo-repasses', 'vacuo-ranking', 'radar-avisos', 'sla-alertas', 'notificacoes', 'wa-conversas'];
export function recarregarRadar(qc: QueryClient) {
  for (const k of CHAVES_DECISAO) qc.invalidateQueries({ queryKey: [k] });
}

/** Demo: reproduz o que vacuo_decidir faz no banco (sai da fila e dos avisos; entra no histórico). */
function decidirNaDemo(qc: QueryClient, orgId: string, p: { conversaId: string; destinoId: string | null }) {
  const dec = (qc.getQueryData<VacuoDecisao[]>(['vacuo-decisoes', orgId]) ?? []).find((d) => d.conversaId === p.conversaId);
  qc.setQueryData<VacuoDecisao[]>(['vacuo-decisoes', orgId], (old) => (old ?? []).filter((d) => d.conversaId !== p.conversaId));
  qc.setQueryData<RadarItem[]>(['radar-avisos', orgId], (old) =>
    (old ?? []).filter((i) => !(i.conversaId === p.conversaId && i.categoria !== 'ligar')));
  if (!dec) return;
  const repassado = !!p.destinoId && p.destinoId !== dec.donoId;
  const ranking = qc.getQueryData<VacuoRankItem[]>(['vacuo-ranking', orgId]) ?? [];
  const paraNome = repassado
    ? (ranking.find((r) => r.usuarioId === p.destinoId)?.nome ?? dec.sugeridoNome ?? 'Atendente')
    : dec.donoNome;
  const novo: VacuoRepasse = {
    id: 'vr-demo-' + p.conversaId + '-' + Date.now(), conversaId: p.conversaId, contatoId: null, oportunidadeId: null,
    contatoNome: dec.contatoNome, deNome: dec.donoNome, paraNome, avisos: 3, minutos: dec.minutos,
    criadoEm: new Date().toISOString(), prioritario: dec.prioritario, prioMotivo: dec.prioMotivo,
    decisao: repassado ? 'repassado' : 'mantido', decididoPorNome: DEMO_USER.name, desfeito: false,
    desfecho: repassado ? 'andamento' : null, fechadoEm: null,
  };
  qc.setQueryData<VacuoRepasse[]>(['vacuo-repasses', orgId], (old) => [novo, ...(old ?? REPASSES_DEMO)]);
}

/** Decide: destinoId = outro atendente → repassa; null → mantém com o dono atual.
    semRecarga: usado pelo lote, que recarrega tudo uma vez só no fim. */
export function useDecidirRepasse() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;
  return useMutation({
    mutationFn: async (p: { conversaId: string; destinoId: string | null; semRecarga?: boolean }) => {
      if (!VACUO_REAL) return { decisao: p.destinoId ? 'repassado' : 'mantido' };
      const { data, error } = await supabase!.rpc('vacuo_decidir', { p_conversa: p.conversaId, p_destino: p.destinoId });
      if (error) throw new Error(error.message);
      return data as { decisao: string; para: string };
    },
    onSuccess: (_r, p) => {
      if (!VACUO_REAL) { decidirNaDemo(qc, orgId, p); return; }
      if (!p.semRecarga) recarregarRadar(qc);
    },
    // decisão vencida, destino inativo…: relê a fila — "A lista foi atualizada" tem de ser verdade
    onError: (_e, p) => {
      if (!VACUO_REAL || p.semRecarga) return;
      for (const k of ['vacuo-decisoes', 'radar-avisos']) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

/* ---- "LIGAR PARA O CLIENTE": lead parou de responder o ROBÔ por 2 h úteis (fila 'ligar' do Radar) ---- */

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
      // sai da fila na hora (demo e real); no real o refetch confirma
      qc.setQueryData<RadarItem[]>(['radar-avisos', orgId], (old) =>
        (old ?? []).filter((i) => !(i.categoria === 'ligar' && i.conversaId === conversaId)));
      if (!VACUO_REAL) return;
      for (const k of ['radar-avisos', 'sla-alertas', 'notificacoes']) qc.invalidateQueries({ queryKey: [k] });
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

/* ---- "PEDIR RESPOSTA" (antigo cutucar): o gestor pede ao atendente que responda agora ---- */
export const CUTUCAR_INTERVALO_MS = 10 * 60e3; // mesmo intervalo mínimo da RPC

/** Gestor pede resposta ao dono do cliente (tela cheia + sino + nota interna na conversa). */
export function useCutucar() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;
  return useMutation({
    mutationFn: async (conversaId: string) => {
      if (!VACUO_REAL) return { ok: true, atendente: 'Henrique', cutucadas: 1 };
      const { data, error } = await supabase!.rpc('vacuo_cutucar', { p_conversa: conversaId });
      if (error) throw new Error(error.message);
      return data as { ok: boolean; atendente: string; cutucadas: number };
    },
    onSuccess: (_r, conversaId) => {
      const agora = new Date().toISOString();
      const marca = (i: RadarItem): RadarItem => (i.conversaId === conversaId ? { ...i, cutucadoEm: agora, cutucadas: i.cutucadas + 1 } : i);
      qc.setQueryData<VacuoDecisao[]>(['vacuo-decisoes', orgId], (old) =>
        (old ?? []).map((d) => (d.conversaId === conversaId ? { ...d, cutucadoEm: agora, cutucadas: d.cutucadas + 1 } : d)));
      qc.setQueryData<RadarItem[]>(['radar-avisos', orgId], (old) => {
        const lista = (old ?? []).map(marca);
        if (VACUO_REAL) return lista;
        // demo: o próprio usuário faz o papel do atendente e recebe o pedido na tela na hora
        const base = lista.find((i) => i.conversaId === conversaId && (i.categoria === 'negociacao' || i.categoria === 'fechado'))
          ?? (qc.getQueryData<VacuoDecisao[]>(['vacuo-decisoes', orgId]) ?? []).map((d) => itemDemo({
            alertaId: 'dec-' + d.conversaId, categoria: 'negociacao', estagio: 3, conversaId: d.conversaId, nome: d.contatoNome,
            desde: d.desde, minutosUteis: d.minutos ?? 0 })).find((i) => i.conversaId === conversaId);
        if (!base) return lista;
        return [...lista.filter((i) => !(i.categoria === 'cutucada' && i.conversaId === conversaId)),
          { ...base, alertaId: 'cut-demo-' + conversaId + '-' + agora, categoria: 'cutucada', estagio: 0,
            donoId: DEMO_USER.id, donoNome: 'Henrique', prioridade: null, cutucadoEm: agora,
            cutucadoPorNome: DEMO_USER.name, criadoEm: agora }];
      });
      if (VACUO_REAL) for (const k of ['vacuo-decisoes', 'radar-avisos']) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: () => {
      if (VACUO_REAL) for (const k of ['vacuo-decisoes', 'radar-avisos']) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}
