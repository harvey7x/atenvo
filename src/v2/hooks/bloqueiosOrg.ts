import { useQuery } from '@tanstack/react-query';
import { useOrg } from '@/context/OrgContext';
import { supabase } from '@/lib/supabase';
import { REL_REAL } from '@/data/relacionamento';

/* Opt-out ("não incomodar") da org inteira para a LISTA de contatos.
   ESPELHA useBloqueio (src/data/relacionamento.ts) — mesma tabela
   relacionamento_bloqueio, mesma RLS, mesmo custo — ampliando de 1
   contato para o conjunto: uma query no lugar de N. O opt-out é
   cidadão de primeira classe na página de Contatos (precedente do
   hook-espelho declarado na sessão de Scripts). Nenhuma mutação. */

export function useBloqueiosOrg() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['v2-bloqueios-org', currentOrg.id],
    enabled: REL_REAL,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase!
        .from('relacionamento_bloqueio')
        .select('contato_id');
      if (error) throw new Error(error.message);
      return new Set(((data as { contato_id: string }[]) ?? []).map((r) => r.contato_id));
    },
  });
}
