/* Higiene da conversa — camada de dados dos adiamentos de nome.
 * A regra vive em `src/lib/higieneConversa.ts` (pura, testada). Aqui só entra/sai do banco.
 * Escrita SEMPRE via RPC `higiene_registrar_adiamento` (security definer): a tabela não
 * aceita INSERT do cliente, e a org é resolvida a partir da conversa — nunca do front. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export const HIGIENE_REAL = isSupabaseConfigured && !!supabase;

export interface HigieneConversa {
  /** quantos "Lembrar depois" já foram dados NESTA conversa (qualquer atendente) */
  adiamentos: number;
  /** até quando "cliente ainda não informou" libera a conversa (ISO) — null se não há */
  liberadoAte: string | null;
}

const VAZIO: HigieneConversa = { adiamentos: 0, liberadoAte: null };

/** Estado de higiene da conversa aberta. Leitura por RLS (membro da org). */
export function useHigieneConversa(conversaId: string | null | undefined) {
  return useQuery({
    queryKey: ['higiene-conversa', conversaId],
    enabled: HIGIENE_REAL && !!conversaId,
    staleTime: 15_000,
    queryFn: async (): Promise<HigieneConversa> => {
      const { data, error } = await supabase!
        .from('conversa_higiene_adiamentos')
        .select('tipo, adiar_ate')
        .eq('conversa_id', conversaId!);
      if (error) throw new Error(error.message);
      const rows = (data as { tipo: string; adiar_ate: string | null }[]) ?? [];
      const adiamentos = rows.filter((r) => r.tipo === 'nome_adiado').length;
      // liberação vigente = maior adiar_ate ainda no futuro
      const agora = Date.now();
      const liberadoAte = rows
        .filter((r) => r.tipo === 'nome_nao_informado' && r.adiar_ate && new Date(r.adiar_ate).getTime() > agora)
        .map((r) => r.adiar_ate as string)
        .sort()
        .pop() ?? null;
      return { adiamentos, liberadoAte };
    },
  });
}

export type TipoAdiamento = 'nome_adiado' | 'nome_nao_informado';

/** Registra "Lembrar depois" ou "cliente ainda não informou" (libera 24h). */
export function useRegistrarAdiamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversaId: string; tipo: TipoAdiamento }): Promise<HigieneConversa> => {
      const { data, error } = await supabase!.rpc('higiene_registrar_adiamento', {
        p_conversa: input.conversaId,
        p_tipo: input.tipo,
      });
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as { adiamentos?: number; liberado_ate?: string | null };
      return { adiamentos: d.adiamentos ?? 0, liberadoAte: d.liberado_ate ?? null };
    },
    onSuccess: (r, v) => { qc.setQueryData(['higiene-conversa', v.conversaId], r); },
    onSettled: (_r, _e, v) => { qc.invalidateQueries({ queryKey: ['higiene-conversa', v.conversaId] }); },
  });
}

export const HIGIENE_VAZIO = VAZIO;
