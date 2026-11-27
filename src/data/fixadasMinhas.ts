import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { temRecurso } from '@/v2/data/config/recursos';

/* ------------------------------------------------------------------
   FIXAR SÓ PARA MIM (26/11, "igual" à lista de conversas do sistema que a Reviza usava antes: "fixar para mim" e "fixar
   para todos"). O fixar de sempre vale para a equipe toda; este deixa a conversa no topo só da lista de quem fixou.
   Servidor: migration 121 (atd_fixadas_minhas + atd_fixar_para_mim). Recurso 'crm-extra' (só na Reviza).
   DEMO É O CONTRATO: sem backend, guarda no navegador.
   ------------------------------------------------------------------ */

export const FIXAR_MINHA_LIGADO = (): boolean => temRecurso('crm-extra');
const REAL: boolean = isSupabaseConfigured && !!supabase;
const G = 'previa-fixadas-minhas';
const C = 'atd-fixadas-minhas';
const VAZIO: ReadonlySet<string> = new Set();

function lerDemo(): string[] { try { return JSON.parse(localStorage.getItem(G) || '[]') as string[]; } catch { return []; } }

/** as conversas que EU fixei só para mim */
export function useMinhasFixadas(): ReadonlySet<string> {
  const { currentOrg } = useOrg();
  const ligado = FIXAR_MINHA_LIGADO();
  const q = useQuery({
    queryKey: [C, currentOrg.id],
    enabled: ligado && !!currentOrg.id,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      if (!REAL) return lerDemo();
      const { data, error } = await supabase!.from('atd_fixadas_minhas').select('conversa_id').eq('organizacao_id', currentOrg.id);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => String((r as { conversa_id: string }).conversa_id));
    },
  });
  const ids = q.data;
  return ids && ids.length ? new Set(ids) : VAZIO;
}

export function useFixarParaMim() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversaId, fixar }: { conversaId: string; fixar: boolean }) => {
      if (!REAL) {
        const s = new Set(lerDemo());
        if (fixar) s.add(conversaId); else s.delete(conversaId);
        try { localStorage.setItem(G, JSON.stringify([...s])); } catch { /* sem navegador */ }
        return;
      }
      const { error } = await supabase!.rpc('atd_fixar_para_mim', { p_conversa: conversaId, p_fixar: fixar });
      if (error) throw new Error(error.message.includes('sem_permissao') ? 'Você não está ativo nesta empresa.' : error.message);
    },
    onMutate: async ({ conversaId, fixar }) => {
      const k = [C, currentOrg.id];
      await qc.cancelQueries({ queryKey: k });
      const antes = qc.getQueryData<string[]>(k);
      qc.setQueryData<string[]>(k, (cur) => { const s = new Set(cur ?? []); if (fixar) s.add(conversaId); else s.delete(conversaId); return [...s]; });
      return { antes };
    },
    onError: (_e, _v, ctx) => { if (ctx) qc.setQueryData([C, currentOrg.id], ctx.antes); },
    onSettled: () => { qc.invalidateQueries({ queryKey: [C, currentOrg.id] }); },
  });
}
