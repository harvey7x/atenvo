/* Central de notificações da COBRANÇA (sino do topo) — pedido do dono 14/09:
   o comercial é avisado de TUDO (pagamento confirmado/recusado pelo financeiro,
   recebido na grade; avisos e mensagens entram como linhas agregadas no sino).
   Reviza: tabela `notificacoes` (RLS: cada um vê só as suas; produzidas pelas
   RPCs do financeiro na mesma transação). Demo: seed verossímil + lido em
   localStorage (padrão alfa_*). A FORMA é a mesma do sino do Atenvo
   (Notificacao de @/data/remarketing) — o painel do shell não muda. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isRevizaMode, supabase } from '@/lib/supabase';
import type { Notificacao } from '@/data/remarketing';

const K = ['reviza', 'notif'] as const;
const LS = 'alfa_notif_v1';   // demo: mapa id → lida_em ISO

const lerLS = (): Record<string, string> => {
  try { const m = JSON.parse(localStorage.getItem(LS) ?? '{}'); return m && typeof m === 'object' ? m : {}; }
  catch { return {}; }
};

const hAtras = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const DEMO_BASE: Omit<Notificacao, 'lidaEm'>[] = [
  { id: 'nd-1', tipo: 'pagamento_confirmado', titulo: 'Pagamento confirmado: MARIA APARECIDA SOUZA', corpo: 'R$ 65,00 de ago/26 — o financeiro conferiu e confirmou. ✓', rota: '/cobrancas/planilha', criadoEm: hAtras(2) },
  { id: 'nd-2', tipo: 'celula_recebida', titulo: 'Recebido: JOSÉ CARLOS PEREIRA · ago/26', corpo: 'R$ 110,00 marcado como pago na grade.', rota: '/cobrancas/planilha', criadoEm: hAtras(7) },
  { id: 'nd-3', tipo: 'pagamento_recusado', titulo: 'Pagamento não localizado: ANTÔNIA FERREIRA LIMA', corpo: 'R$ 89,00 de ago/26 — o financeiro não achou a entrada no extrato. Confira com o cliente.', rota: '/cobrancas/planilha', criadoEm: hAtras(28) },
];

/** notificações da cobrança na MESMA forma do sino (Notificacao do remarketing) */
export function useNotificacoesCob(habilitado = true) {
  return useQuery<Notificacao[]>({
    queryKey: K,
    enabled: habilitado,
    staleTime: 10_000,
    refetchInterval: 25_000,
    queryFn: async () => {
      if (!isRevizaMode || !supabase) {
        const lidas = lerLS();
        return DEMO_BASE.map((n) => ({ ...n, lidaEm: lidas[n.id] ?? null }));
      }
      const { data, error } = await supabase.from('notificacoes')
        .select('id, tipo, titulo, corpo, rota, lida_em, created_at')
        .order('created_at', { ascending: false }).limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: String(r.id), tipo: String(r.tipo), titulo: String(r.titulo),
        corpo: (r.corpo as string) || null, rota: (r.rota as string) || null,
        lidaEm: (r.lida_em as string) ?? null, criadoEm: String(r.created_at),
      }));
    },
  });
}

export function useMarcarNotifCob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { id?: string; todas?: boolean }) => {
      if (!isRevizaMode || !supabase) {
        const lidas = lerLS(); const agora = new Date().toISOString();
        if (a.todas) for (const n of DEMO_BASE) lidas[n.id] = lidas[n.id] ?? agora;
        else if (a.id) lidas[a.id] = agora;
        localStorage.setItem(LS, JSON.stringify(lidas));
        return;
      }
      const { error } = a.todas
        ? await supabase.rpc('notif_marcar_todas')
        : await supabase.rpc('notif_marcar_lida', { p_id: a.id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: K }); },
  });
}
