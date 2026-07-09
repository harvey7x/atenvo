import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import type { SlaAlertasResumo } from '@/data/slaView';

export const SLA_REAL = isSupabaseConfigured && !!supabase;

const VAZIO: SlaAlertasResumo = { total: 0, imediatos: 0, criticos: 0, vermelhos: 0, amarelos: 0, leves: 0, itens: [] };

/** Alertas de SLA ativos (role-aware no backend). Refetch leve + realtime na tabela sla_alertas. */
export function useSlaAlertas() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
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

  useEffect(() => {
    if (!SLA_REAL || !orgId) return;
    const ch = supabase!
      .channel(`sla-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sla_alertas', filter: `organizacao_id=eq.${orgId}` }, () => {
        qc.invalidateQueries({ queryKey: ['sla-alertas', orgId] });
      })
      .subscribe();
    return () => { supabase!.removeChannel(ch); };
  }, [orgId, qc]);

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
