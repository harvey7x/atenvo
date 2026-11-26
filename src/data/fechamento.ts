import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/* MOTIVO AO FECHAR A CONVERSA (25/11, como no sistema que a Reviza usava antes). Fechar continua sendo o status "Fechada";
   o motivo vai para a atividade do atendimento (conversa_atividades, tipo 'fechado') pela rotina
   atd_conversa_registrar_fechamento (migration 105) — o painel do cliente já mostra quem fechou, quando e por quê. */
export const FECHAMENTO_REAL: boolean = isSupabaseConfigured && !!supabase;

export const MOTIVOS_FECHAMENTO = [
  // o motivo que a Reviza já usava na Guimoo (26/11) vem primeiro
  'Cliente descartado',
  'Atendimento concluído',
  'Cliente desistiu',
  'Sem perfil (não elegível)',
  'Cliente parou de responder',
  'Já é cliente ou contato repetido',
  'Outro motivo',
] as const;
export type MotivoFechamento = typeof MOTIVOS_FECHAMENTO[number];

/** o texto gravado: o motivo escolhido e, se houver, o detalhe ("Outro motivo" exige o detalhe) */
export function textoDoMotivo(m: MotivoFechamento | null, detalhe: string): string | null {
  const d = detalhe.trim().replace(/\s+/g, ' ').slice(0, 240);
  if (!m) return null;
  if (m === 'Outro motivo') return d ? d : null;
  return d ? `${m} — ${d}` : m;
}

export function useRegistrarFechamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { conversaId: string; motivo: string }) => {
      if (!FECHAMENTO_REAL) return;
      const { error } = await supabase!.rpc('atd_conversa_registrar_fechamento', { p_conversa: v.conversaId, p_motivo: v.motivo });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wa-atividades'] }); },
  });
}
