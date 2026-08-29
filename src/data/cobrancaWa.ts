/* Números de WhatsApp do Modo Cobrança (Fase C-alfa, 29/08).
   ISOLADOS do atendimento: instância própria via edge cobranca-wa
   (sem linha em `canais`, sem webhook) — nada aparece no inbox.
   Um número por atendente (unique org+atendente em cobranca_numeros). */
import { useQuery } from '@tanstack/react-query';
import { supabase, isDemoMode } from '@/lib/supabase';

export type CobNumeroEstado = 'desconectado' | 'aguardando_qr' | 'conectado';
export interface CobNumero {
  id: string;
  atendente_id: string;
  rotulo: string | null;
  instancia: string | null;
  telefone: string | null;
  estado: CobNumeroEstado;
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  if (isDemoMode) throw new Error('Ação indisponível no modo demonstração.');
  const { data, error } = await supabase!.functions.invoke('cobranca-wa', { body });
  if (error) {
    let msg = error.message;
    const ed = data as { error?: string } | null;
    if (ed?.error) msg = ed.error;
    else {
      // supabase-js não parseia o corpo em respostas non-2xx (mesmo padrão de whatsapp.ts)
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        try { msg = ((await ctx.clone().json()) as { error?: string })?.error ?? msg; } catch { /* corpo não-JSON */ }
      }
    }
    throw new Error(msg);
  }
  return data as T;
}

export function useCobNumeros(orgId?: string) {
  return useQuery({
    queryKey: ['cob-numeros', orgId],
    enabled: !!orgId && !isDemoMode,
    refetchInterval: 30_000, // estado muda por fora (leitura do QR no celular)
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('cobranca_numeros')
        .select('id, atendente_id, rotulo, instancia, telefone, estado')
        .eq('organizacao_id', orgId!)
        .eq('ativo', true);
      if (error) throw error;
      return (data ?? []) as CobNumero[];
    },
  });
}

export interface ConectarResult { numero_id: string; instancia: string; qr_base64: string | null; expires_in: number }
export const cobWaConectar = (orgId: string, atendenteId: string) =>
  invoke<ConectarResult>({ action: 'conectar', organizacao_id: orgId, atendente_id: atendenteId });
export const cobWaQr = (orgId: string, numeroId: string) =>
  invoke<{ qr_base64: string | null; expires_in: number }>({ action: 'qr', organizacao_id: orgId, numero_id: numeroId });
export const cobWaStatus = (orgId: string, numeroId: string) =>
  invoke<{ connected: boolean; state: string; telefone?: string | null }>({ action: 'status', organizacao_id: orgId, numero_id: numeroId });
export const cobWaDesconectar = (orgId: string, numeroId: string) =>
  invoke<{ ok: boolean }>({ action: 'desconectar', organizacao_id: orgId, numero_id: numeroId });
