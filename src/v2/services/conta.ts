import { supabase } from '@/lib/supabase';

/* Serviços de conta — extração das duas chamadas supabase que viviam inline
   no corpo de src/pages/Configuracoes.tsx (registrada no INVENTARIO):
   - rpc demo_reset (card "Ambiente de demonstração")
   - auth.updateUser({ email }) (botão "Alterar" e-mail do ContaPanel)
   Comportamento idêntico ao v1: erro vira throw com a mensagem original;
   textos e confirmações ficam na página, como lá. */

/** Restaura a massa fictícia da demonstração (afeta apenas a demo, nunca a produção). */
export async function resetDemonstracao(): Promise<void> {
  const { error } = await supabase!.rpc('demo_reset');
  if (error) throw new Error(error.message);
}

/** Solicita a troca do e-mail de login; o Supabase envia um link de
    confirmação para o novo endereço (o e-mail só muda após confirmar). */
export async function solicitarTrocaEmail(novoEmail: string): Promise<void> {
  const { error } = await supabase!.auth.updateUser({ email: novoEmail });
  if (error) throw new Error(error.message);
}
