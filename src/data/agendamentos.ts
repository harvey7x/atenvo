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
  atendenteNome: string | null;
}

interface DbRow {
  id: string; contato_id: string | null; oportunidade_id: string | null; atendente_id: string | null;
  tipo: string; titulo: string | null; cliente_nome: string | null; telefone: string | null;
  inicio_em: string; fim_em: string; status: AgStatus;
  local: string | null; endereco: string | null; observacoes: string | null;
  atendente: { nome: string } | { nome: string }[] | null;
  contatos: { nome: string; telefone: string | null } | { nome: string; telefone: string | null }[] | null;
}
const nomeDe = (x: { nome: string } | { nome: string }[] | null): string | null => (Array.isArray(x) ? x[0]?.nome : x?.nome) ?? null;

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
        .select('id, contato_id, oportunidade_id, atendente_id, tipo, titulo, cliente_nome, telefone, inicio_em, fim_em, status, local, endereco, observacoes, atendente:usuarios!agendamentos_atendente_id_fkey(nome), contatos(nome, telefone)')
        .eq('organizacao_id', currentOrg.id)
        .gte('inicio_em', inicioISO).lt('inicio_em', fimISO)
        .order('inicio_em', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as unknown as DbRow[]) ?? []).map((r) => ({
        id: r.id, contatoId: r.contato_id, oportunidadeId: r.oportunidade_id, atendenteId: r.atendente_id,
        tipo: r.tipo, titulo: r.titulo, clienteNome: r.cliente_nome ?? nomeDe(r.contatos), telefone: r.telefone ?? (Array.isArray(r.contatos) ? r.contatos[0]?.telefone : r.contatos?.telefone) ?? null,
        inicioEm: r.inicio_em, fimEm: r.fim_em, status: r.status,
        local: r.local, endereco: r.endereco, observacoes: r.observacoes,
        atendenteNome: nomeDe(r.atendente),
      }));
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

export function useAtualizarAgendamento() {
  const { currentOrg } = useOrg(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase!.from('agendamentos').update(input.patch).eq('id', input.id);
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['agendamentos', currentOrg.id] }),
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
