/* ============================================================================
   Pós-venda — complementos de dados da carteira de FECHADOS (ganho).
   A carteira em si vem de useWaConversations (fonte ÚNICA do inbox: ganho
   "grudento", não-lidas, aguardando, últimas 10 mensagens) filtrada por
   situação 'ganho' na página. Aqui ficam só as consultas LEVES que o inbox
   não carrega:
   - pendências ABERTAS do contato (recurso Pendências do processo, no ar);
   - total de mensagens da conversa selecionada (contagem HEAD);
   - contador do menu: conversas NÃO LIDAS de clientes fechados (proxy leve
     do "aguardando resposta" — sem puxar a lista pesada no shell).
   ============================================================================ */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { WA_REAL } from '@/data/whatsapp';
import { useOrg } from '@/context/OrgContext';

export interface PendenciaAberta { id: string; oQue: string; tipo: string | null; status: string | null }

/** Pendências não resolvidas do contato — aparecem no painel do cliente. */
export function usePendenciasAbertas(contatoId: string | null | undefined) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['pv-pendencias', currentOrg.id, contatoId],
    enabled: WA_REAL && !!contatoId,
    staleTime: 60_000,
    queryFn: async (): Promise<PendenciaAberta[]> => {
      const { data, error } = await supabase!
        .from('pendencias')
        .select('id, o_que, tipo, status')
        .eq('organizacao_id', currentOrg.id)
        .eq('contato_id', contatoId!)
        .is('resolvida_em', null)
        .order('criado_em', { ascending: false })
        .limit(6);
      if (error) throw new Error(error.message);
      return (data ?? []).map((p) => ({ id: p.id as string, oQue: (p.o_que as string) ?? '', tipo: (p.tipo as string) ?? null, status: (p.status as string) ?? null }));
    },
  });
}

/** Total de mensagens da conversa (contagem no servidor; nota interna/sistema fora). */
export function useMensagensTotal(conversaId: string | null | undefined) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['pv-msg-total', currentOrg.id, conversaId],
    enabled: WA_REAL && !!conversaId,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase!
        .from('mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('conversa_id', conversaId!)
        .not('tipo', 'in', '(sistema,nota_interna)');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

/** Contador do menu: conversas com NÃO LIDAS de clientes com oportunidade GANHA.
 *  Proxy leve do "aguardando resposta" (que precisa das mensagens pra derivar):
 *  conta no servidor, sem carregar a lista pesada do inbox em todas as telas. */
export function usePosVendaAguardando() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['pv-aguardando', currentOrg.id],
    enabled: WA_REAL && !!currentOrg.id,
    refetchInterval: 180_000,
    staleTime: 120_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase!
        .from('conversas')
        .select('id, contatos!inner(id, oportunidades!inner(id, status))', { count: 'exact', head: true })
        .eq('organizacao_id', currentOrg.id)
        .gt('nao_lidas', 0)
        .eq('contatos.oportunidades.status', 'ganho');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}
