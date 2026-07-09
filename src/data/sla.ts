import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import type { SlaAlertasResumo } from '@/data/slaView';

export const SLA_REAL = isSupabaseConfigured && !!supabase;

const VAZIO: SlaAlertasResumo = { total: 0, imediatos: 0, criticos: 0, vermelhos: 0, amarelos: 0, leves: 0, itens: [] };

/** Alertas de SLA ativos (role-aware no backend). Refetch leve (30s); o cron atualiza a cada 1 min.
    Sem canal realtime: este hook é montado em vários componentes ao mesmo tempo (barra/sino/Inbox/
    Kanban) e um canal de topic único (sla-<org>) colidiria (.on após subscribe). O refetch cobre. */
export function useSlaAlertas() {
  const { currentOrg } = useOrg();
  const orgId = currentOrg.id;

  const query = useQuery({
    queryKey: ['sla-alertas', orgId],
    enabled: SLA_REAL && !!orgId,
    staleTime: 20_000,
    refetchInterval: 30_000,           // backstop; o cron atualiza a cada 1 min
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SlaAlertasResumo> => {
      const { data, error } = await supabase!.rpc('sla_alertas_ativos', { p_org: orgId });
      if (error) throw new Error(error.message);
      return (data ?? VAZIO) as SlaAlertasResumo;
    },
  });

  return query;
}

/** Silenciar alerta (admin/supervisor OU responsável — validado no backend). */
export function useSilenciarSlaAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { alertaId: string; ate: string | null; motivo: string }) => {
      const { error } = await supabase!.rpc('sla_silenciar', { p_alerta: p.alertaId, p_ate: p.ate, p_motivo: p.motivo });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sla-alertas'] }); },
  });
}

/** Resolver alerta (admin/supervisor OU responsável — validado no backend). */
export function useResolverSlaAlerta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertaId: string) => {
      const { error } = await supabase!.rpc('sla_resolver', { p_alerta: alertaId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sla-alertas'] }); },
  });
}
