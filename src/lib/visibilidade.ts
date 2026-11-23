import { useAuth } from '@/context/AuthContext';
import { useOrg } from '@/context/OrgContext';
import { useEscopoEquipe } from '@/v2/data/config/equipes';

/* ------------------------------------------------------------------
   Visibilidade da carteira (pedido do dono, 22/10): só o ADMIN vê os
   clientes de todo mundo — aba Todos, Não atribuídos, filtro por
   atendente e as telas de gestão. Os demais papéis veem SÓ os clientes
   de que são responsáveis (contatos.responsavel_id), inclusive no
   Kanban, Contatos, Pós-venda, Pendências, Portabilidades e avisos.
   Cliente sem dono também fica só com o admin (decisão do dono).
   Modo demonstração (sem Supabase) vê tudo: o seed não tem dono real.
   EQUIPES (Reviza, 23/11): o GERENTE de uma equipe vê também as conversas
   das pessoas da equipe e tudo o que chega nos números de WhatsApp dela
   (v2/data/config/equipes.ts). O atendente continua vendo só as dele.
   ------------------------------------------------------------------ */

export function veTodosClientes(role: string | undefined): boolean {
  return role === 'admin';
}

export interface Visibilidade {
  /** true = vê a carteira inteira (admin ou demonstração). */
  veTodos: boolean;
  /** id do usuário logado (dono dos clientes que ele pode ver). */
  uid: string | null;
  /** gerente de equipe (e não administrador): vê a equipe inteira, não só a própria carteira. */
  veEquipe: boolean;
  /** o cliente deste responsável pode aparecer para o usuário? O número (canal) da conversa, quando
      informado, vale para o gerente: o que chega no WhatsApp da equipe é da equipe, mesmo sem dono. */
  podeVer: (responsavelId: string | null | undefined, canalId?: string | null) => boolean;
}

export function useVisibilidade(): Visibilidade {
  const { user, mode } = useAuth();
  const { currentOrg } = useOrg();
  const veTodos = mode !== 'supabase' || veTodosClientes(currentOrg?.role);
  const uid = user?.id ?? null;
  const equipe = useEscopoEquipe();
  const veEquipe = !veTodos && equipe.gerente;
  return {
    veTodos,
    uid,
    veEquipe,
    podeVer: (responsavelId, canalId) => veTodos || (!!uid && responsavelId === uid)
      || (veEquipe && ((!!responsavelId && equipe.pessoas.has(responsavelId)) || (!!canalId && equipe.canais.has(canalId)))),
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
