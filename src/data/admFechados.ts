import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   Fechado pelo administrativo (29/10). A coluna Fechado do funil só muda
   pelo sistema do administrativo: a cada 5 min o cron chama a edge fn
   adm-fechados, que lê a lista de completos de lá → adm_sincronizar. Aqui só
   a situação da leitura, para o selo do dashboard e a trava da tela.
   Demo: sempre ligado.
   ------------------------------------------------------------------ */

export interface AdmStatus { ativo: boolean; ultimaLeituraEm: string | null; completos: number }

const REAL = isSupabaseConfigured && !!supabase;

export function useAdmStatus() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg?.id;
  return useQuery({
    queryKey: ['adm-status', orgId],
    enabled: !REAL || !!orgId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<AdmStatus> => {
      if (!REAL) return { ativo: true, ultimaLeituraEm: new Date(Date.now() - 3 * 60_000).toISOString(), completos: 327 };
      const { data, error } = await supabase!.rpc('adm_status', { p_org: orgId });
      if (error) throw error;
      const d = (data ?? {}) as { ativo?: boolean; ultima_leitura_em?: string | null; completos?: number };
      return { ativo: !!d.ativo, ultimaLeituraEm: d.ultima_leitura_em ?? null, completos: d.completos ?? 0 };
    },
  });
}
