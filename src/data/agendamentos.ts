import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

export const AG_REAL = isSupabaseConfigured && !!supabase;
/** São Paulo é UTC-3 o ano todo (Brasil sem horário de verão desde 2019). */
export const SP_OFFSET = '-03:00';

export type AgStatus = 'pendente' | 'confirmado' | 'realizado' | 'cancelado' | 'remarcado' | 'nao_compareceu';
export const AG_STATUS: { id: AgStatus; label: string; cor: string }[] = [
  { id: 'confirmado', label: 'Confirmado', cor: '#1d9e75' },
  { id: 'pendente', label: 'Pendente', cor: '#d9a441' },
  { id: 'realizado', label: 'Realizado', cor: '#378add' },
  { id: 'cancelado', label: 'Cancelado', cor: '#e24b4a' },
  { id: 'nao_compareceu', label: 'Não compareceu', cor: '#c0564c' },
  { id: 'remarcado', label: 'Remarcado', cor: '#8a63d4' },
];
export const agStatusInfo = (s: string) => AG_STATUS.find((x) => x.id === s) ?? { id: s as AgStatus, label: s, cor: '#888' };

export const AG_TIPOS = ['Reunião inicial', 'Entrega de documentos', 'Assinatura de procuração', 'Coleta de senha/documentos', 'Revisão de contrato', 'Retorno presencial', 'Outro'];

export interface Agendamento {
  id: string; contatoId: string | null; oportunidadeId: string | null; atendenteId: string | null;
  tipo: string; titulo: string | null; clienteNome: string | null; telefone: string | null;
  inicioEm: string; fimEm: string; status: AgStatus;
  local: string | null; endereco: string | null; observacoes: string | null;
  atendenteNome: string | null; atualizadoEm: string | null; criadoPor: string | null;
}

interface DbRow {
  id: string; contato_id: string | null; oportunidade_id: string | null; atendente_id: string | null;
  tipo: string; titulo: string | null; cliente_nome: string | null; telefone: string | null;
  inicio_em: string; fim_em: string; status: AgStatus;
  local: string | null; endereco: string | null; observacoes: string | null; atualizado_em: string | null; criado_por: string | null;
  atendente: { nome: string } | { nome: string }[] | null;
  contatos: { nome: string; telefone: string | null } | { nome: string; telefone: string | null }[] | null;
}
const nomeDe = (x: { nome: string } | { nome: string }[] | null): string | null => (Array.isArray(x) ? x[0]?.nome : x?.nome) ?? null;
const AG_SELECT = 'id, contato_id, oportunidade_id, atendente_id, tipo, titulo, cliente_nome, telefone, inicio_em, fim_em, status, local, endereco, observacoes, atualizado_em, criado_por, atendente:usuarios!agendamentos_atendente_id_fkey(nome), contatos(nome, telefone)';
function mapRow(r: DbRow): Agendamento {
  return {
    id: r.id, contatoId: r.contato_id, oportunidadeId: r.oportunidade_id, atendenteId: r.atendente_id,
    tipo: r.tipo, titulo: r.titulo, clienteNome: r.cliente_nome ?? nomeDe(r.contatos), telefone: r.telefone ?? (Array.isArray(r.contatos) ? r.contatos[0]?.telefone : r.contatos?.telefone) ?? null,
    inicioEm: r.inicio_em, fimEm: r.fim_em, status: r.status,
    local: r.local, endereco: r.endereco, observacoes: r.observacoes,
    atendenteNome: nomeDe(r.atendente), atualizadoEm: r.atualizado_em, criadoPor: r.criado_por,
  };
}

/** Agendamentos no intervalo [inicioISO, fimISO). RLS isola por organização. */
export function useAgendamentos(inicioISO: string, fimISO: string) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['agendamentos', currentOrg.id, inicioISO, fimISO],
    enabled: AG_REAL,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Agendamento[]> => {
      const { data, error } = await supabase!
        .from('agendamentos')
        .select(AG_SELECT)
        .eq('organizacao_id', currentOrg.id)
        .gte('inicio_em', inicioISO).lt('inicio_em', fimISO)
        .order('inicio_em', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as unknown as DbRow[]) ?? []).map(mapRow);
    },
  });
}

/** Próximos agendamentos a partir de "agora" (lookahead de N dias), independente da visão do calendário. */
export function useProximosAgendamentos(desdeISO: string, ateISO: string) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['agendamentos-prox', currentOrg.id, desdeISO, ateISO],
    enabled: AG_REAL,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Agendamento[]> => {
      const { data, error } = await supabase!
        .from('agendamentos').select(AG_SELECT)
        .eq('organizacao_id', currentOrg.id)
        .gte('inicio_em', desdeISO).lt('inicio_em', ateISO)
        .neq('status', 'cancelado')
        .order('inicio_em', { ascending: true }).limit(30);
      if (error) throw new Error(error.message);
      return ((data as unknown as DbRow[]) ?? []).map(mapRow);
    },
  });
}

export interface AgInput {
  contatoId?: string | null; oportunidadeId?: string | null; atendenteId?: string | null;
  tipo: string; titulo?: string | null; clienteNome?: string | null; telefone?: string | null;
  inicioEm: string; fimEm: string; status: AgStatus;
  local?: string | null; endereco?: string | null; observacoes?: string | null;
}

export function useCriarAgendamento() {
  const { currentOrg } = useOrg(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AgInput & { criadoPor: string }) => {
      const { data, error } = await supabase!.from('agendamentos').insert({
        organizacao_id: currentOrg.id, contato_id: input.contatoId ?? null, oportunidade_id: input.oportunidadeId ?? null,
        atendente_id: input.atendenteId ?? null, tipo: input.tipo, titulo: input.titulo ?? null,
        cliente_nome: input.clienteNome ?? null, telefone: input.telefone ?? null,
        inicio_em: input.inicioEm, fim_em: input.fimEm, status: input.status,
        local: input.local ?? null, endereco: input.endereco ?? null, observacoes: input.observacoes ?? null,
        criado_por: input.criadoPor,
      }).select('id').single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['agendamentos', currentOrg.id] }),
  });
}

/** Erro de concorrência (duas abas): o registro mudou desde a abertura. */
export const ERRO_CONCORRENCIA = 'conflito_concorrencia';

export function useAtualizarAgendamento() {
  const { currentOrg } = useOrg(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown>; atualizadoEmEsperado?: string | null }) => {
      let up = supabase!.from('agendamentos').update(input.patch).eq('id', input.id);
      // concorrência otimista: só grava se atualizado_em ainda for o que a aba abriu.
      if (input.atualizadoEmEsperado) up = up.eq('atualizado_em', input.atualizadoEmEsperado);
      const { data, error } = await up.select('id');
      if (error) throw new Error(error.message);
      if (input.atualizadoEmEsperado && (!data || data.length === 0)) throw new Error(ERRO_CONCORRENCIA);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['agendamentos', currentOrg.id] }),
  });
}

export interface RemarcarResultado { status: 'ok' | 'conflito'; atualizado_em?: string; atendente?: string; inicio?: string; fim?: string; pode_forcar?: boolean; }

/** Remarcação atômica via RPC: valida permissão/período/conflito, preserva histórico, move o mesmo registro. */
export function useRemarcarAgendamento() {
  const { currentOrg } = useOrg(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; inicioEm: string; fimEm: string; motivo: string; atualizadoEmEsperado?: string | null; forcar?: boolean }): Promise<RemarcarResultado> => {
      const { data, error } = await supabase!.rpc('remarcar_agendamento', {
        p_id: input.id, p_inicio: input.inicioEm, p_fim: input.fimEm, p_motivo: input.motivo,
        p_atualizado_em_esperado: input.atualizadoEmEsperado ?? null, p_forcar: input.forcar ?? false,
      });
      if (error) throw new Error(error.message);
      return data as RemarcarResultado;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['agendamentos', currentOrg.id] }),
  });
}

/** Aviso de conflito: mesmo atendente com agendamento sobreposto (não cancelado). Retorna o 1º conflito ou null. */
export async function checarConflitoAtendente(orgId: string, atendenteId: string, inicioISO: string, fimISO: string, excluirId: string | null): Promise<{ id: string; cliente_nome: string | null } | null> {
  if (!atendenteId) return null;
  let qy = supabase!.from('agendamentos').select('id, cliente_nome')
    .eq('organizacao_id', orgId).eq('atendente_id', atendenteId).neq('status', 'cancelado')
    .lt('inicio_em', fimISO).gt('fim_em', inicioISO);
  if (excluirId) qy = qy.neq('id', excluirId);
  const { data } = await qy.limit(1);
  return (data && data.length) ? (data[0] as { id: string; cliente_nome: string | null }) : null;
}

export interface Atividade {
  id: string; tipo: string;
  de: Record<string, unknown> | null; para: Record<string, unknown> | null;
  motivo: string | null; criadoEm: string; usuarioNome: string | null;
}
interface AtividadeRow {
  id: string; tipo: string; de: Record<string, unknown> | null; para: Record<string, unknown> | null;
  motivo: string | null; criado_em: string;
  usuario: { nome: string } | { nome: string }[] | null;
}
/** Histórico (auditoria) de um agendamento, isolado por org pela RLS. Nome do executor preservado mesmo se desativado. */
export function useHistorico(agendamentoId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['ag-historico', currentOrg.id, agendamentoId],
    enabled: AG_REAL && !!agendamentoId,
    queryFn: async (): Promise<Atividade[]> => {
      const { data, error } = await supabase!.from('agendamento_atividades')
        .select('id, tipo, de, para, motivo, criado_em, usuario:usuarios!agendamento_atividades_usuario_id_fkey(nome)')
        .eq('agendamento_id', agendamentoId!).order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as unknown as AtividadeRow[]) ?? []).map((r) => ({
        id: r.id, tipo: r.tipo, de: r.de, para: r.para, motivo: r.motivo, criadoEm: r.criado_em,
        usuarioNome: nomeDe(r.usuario),
      }));
    },
  });
}

/** Busca contatos por nome/telefone (para o seletor do modal). */
export function useContatosBusca(termo: string) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['ag-contatos', currentOrg.id, termo],
    enabled: AG_REAL && termo.trim().length >= 2,
    queryFn: async (): Promise<{ id: string; nome: string; telefone: string | null }[]> => {
      const t = termo.trim();
      const { data, error } = await supabase!.from('contatos')
        .select('id, nome, telefone').eq('organizacao_id', currentOrg.id)
        .or(`nome.ilike.%${t}%,telefone.ilike.%${t}%`).limit(8);
      if (error) throw new Error(error.message);
      return (data as { id: string; nome: string; telefone: string | null }[]) ?? [];
    },
  });
}
