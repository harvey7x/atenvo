import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   Visibilidade da carteira (pedido do dono, 22/10): só o ADMIN vê os
   clientes de todo mundo — aba Todos, Não atribuídos, filtro por
   atendente e as telas de gestão. Os demais papéis veem SÓ os clientes
   de que são responsáveis (contatos.responsavel_id), inclusive no
   Kanban, Contatos, Pós-venda, Pendências, Portabilidades e avisos.
   Cliente sem dono também fica só com o admin (decisão do dono).
   Modo demonstração (sem Supabase) vê tudo: o seed não tem dono real.
   ------------------------------------------------------------------ */

export function veTodosClientes(role: string | undefined): boolean {
  return role === 'admin';
}

export interface Visibilidade {
  /** true = vê a carteira inteira (admin ou demonstração). */
  veTodos: boolean;
  /** id do usuário logado (dono dos clientes que ele pode ver). */
  uid: string | null;
  /** o cliente deste responsável pode aparecer para o usuário? */
  podeVer: (responsavelId: string | null | undefined) => boolean;
}

export function useVisibilidade(): Visibilidade {
  const { user, mode } = useAuth();
  const { currentOrg } = useOrg();
  const veTodos = mode !== 'supabase' || veTodosClientes(currentOrg?.role);
  const uid = user?.id ?? null;
  return {
    veTodos,
    uid,
    podeVer: (responsavelId) => veTodos || (!!uid && responsavelId === uid),
  };
}

/* Escopo da LISTA de conversas por org — lido por consultaListaConversas (carga completa,
   busca-alvo do realtime, deep-link), que é uma função solta chamada fora de componentes.
   useWaConversations grava aqui a cada render, antes da query partir. null = sem recorte. */
const ESCOPO_LISTA = new Map<string, string | null>();

export function definirEscopoLista(orgId: string, responsavelId: string | null): void {
  ESCOPO_LISTA.set(orgId, responsavelId);
}

export function escopoLista(orgId: string): string | null {
  return ESCOPO_LISTA.get(orgId) ?? null;
}
