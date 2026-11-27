/* Lixeira de clientes — blindagem contra perda (pedido do dono 14/09).
   Todo lead excluído é capturado no banco (trigger → private.leads_lixeira);
   aqui o gestor/admin lista e restaura. Reviza real: RPCs lixeira_listar /
   lead_restaurar. Demo: sem lixeira (a demo não persiste exclusão em banco). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isRevizaMode, supabase } from '@/lib/supabase';
import { registrarBloqueada } from '../desfazer';
import { chavesCobranca } from './keys';

export interface ItemLixeira {
  id: string; lead_id: string; nome: string; comercial: string | null;
  valor: number | null; pagamentos_qtd: number; deletado_em: string; deletado_por: string;
}

export function useLixeira(habilitado = true) {
  return useQuery<ItemLixeira[]>({
    queryKey: ['reviza', 'lixeira'],
    enabled: habilitado && isRevizaMode && !!supabase,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('lixeira_listar');
      if (error) throw new Error(error.message);
      return (data ?? []) as ItemLixeira[];
    },
  });
}

export function useRestaurarLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (trashId: string) => {
      const { error } = await supabase!.rpc('lead_restaurar', { p_trash_id: trashId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reviza', 'lixeira'] });
      void qc.invalidateQueries({ queryKey: chavesCobranca.dados });
      void qc.invalidateQueries({ queryKey: ['reviza', 'registros'] }); // o restore gera linha de auditoria
      // restaurar é uma escrita: não deixa o slot de Desfazer apontando pra ação
      // anterior (que poderia ser desfeita "sem querer"). Bloqueia com aviso claro.
      registrarBloqueada('restaurar cliente', 'O cliente voltou da lixeira — se precisar, exclua de novo na Gestão.');
    },
  });
}
