import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { nomeContatoExib, type SlaAlertasResumo, type SlaAlerta } from '@/data/slaView';

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

/* ---- Enriquecimento (só leitura): nome do contato + canal para cada alerta, para o card premium.
   Não altera o SLA engine/RPCs — apenas lê conversas/oportunidades. React Query deduplica entre
   barra/sino/Inbox pela mesma queryKey. ---- */
export interface SlaAlvo { nome: string; canal: string | null }
function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null); }

export function useSlaAlvos(itens: SlaAlerta[]): Map<string, SlaAlvo> {
  const { currentOrg } = useOrg();
  const convIds = [...new Set(itens.filter((a) => a.conversa_id).map((a) => a.conversa_id!))].sort();
  const oppIds = [...new Set(itens.filter((a) => !a.conversa_id && a.oportunidade_id).map((a) => a.oportunidade_id!))].sort();

  const q = useQuery({
    queryKey: ['sla-alvos', currentOrg.id, convIds.join(','), oppIds.join(',')],
    enabled: SLA_REAL && (convIds.length > 0 || oppIds.length > 0),
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, SlaAlvo>> => {
      const map: Record<string, SlaAlvo> = {};
      if (convIds.length) {
        const { data } = await supabase!.from('conversas')
          .select('id, contatos(nome, telefone), canais!conversas_canal_id_fkey(nome_interno)').in('id', convIds);
        for (const r of (data ?? []) as Record<string, unknown>[]) {
          const ct = one(r.contatos as { nome: string; telefone: string | null } | { nome: string; telefone: string | null }[] | null);
          const cn = one(r.canais as { nome_interno: string | null } | { nome_interno: string | null }[] | null);
          map['c:' + (r.id as string)] = { nome: nomeContatoExib(ct?.nome, ct?.telefone), canal: cn?.nome_interno ?? null };
        }
      }
      if (oppIds.length) {
        const { data } = await supabase!.from('oportunidades')
          .select('id, contato_nome, contatos(nome, telefone), canal_origem:canais(nome_interno)').in('id', oppIds);
        for (const r of (data ?? []) as Record<string, unknown>[]) {
          const ct = one(r.contatos as { nome: string; telefone: string | null } | { nome: string; telefone: string | null }[] | null);
          const cn = one(r.canal_origem as { nome_interno: string | null } | { nome_interno: string | null }[] | null);
          map['o:' + (r.id as string)] = { nome: nomeContatoExib((r.contato_nome as string) || ct?.nome, ct?.telefone), canal: cn?.nome_interno ?? null };
        }
      }
      return map;
    },
  });

  const byAlert = new Map<string, SlaAlvo>();
  const data = q.data ?? {};
  for (const a of itens) {
    const key = a.conversa_id ? 'c:' + a.conversa_id : (a.oportunidade_id ? 'o:' + a.oportunidade_id : null);
    if (key && data[key]) byAlert.set(a.id, data[key]);
  }
  return byAlert;
}
