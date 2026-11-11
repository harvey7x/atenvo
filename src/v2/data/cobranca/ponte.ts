/* Ponte Sistema → Planilha da Reviza (Google Sheets via Apps Script).
   Fire-and-forget: se a ponte não estiver configurada ou falhar, o cadastro
   segue normal — a planilha é espelho, nunca trava a operação.
   Mesmo padrão da ponte ficha→planilha do CAF. SEM senhas, por decisão. */
import { isRevizaMode, supabase } from '@/lib/supabase';
import type { GLinha } from './types';

export function enviarPraPlanilha(l: Partial<GLinha> & { nome: string }): void {
  if (!isRevizaMode || !supabase || !l.nome) return;
  void supabase.functions
    .invoke('reviza-planilha', {
      body: {
        fechamento: l.fechamento ?? '',
        comercial: l.comercial ?? '',
        nome: l.nome,
        nb: l.nb ?? '',
        banco: l.banco ?? '',
        cpf: l.cpf ?? '',
        valor: l.valor ?? '',
        dataParou: l.dataParou ?? '',
        recebe: l.recebe ?? '',
        telefone: l.telefone ?? '',
      },
    })
    .catch(() => { /* planilha é espelho: falha silenciosa */ });
}
