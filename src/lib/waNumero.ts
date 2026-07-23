// Chave canônica de telefone — ESPELHO EXATO da SQL public.chave_canonica_telefone().
//
// Por que existe: Evolution/Baileys entrega o MESMO cliente ora como 55+DDD+8 (sem o nono
// dígito) ora como 55+DDD+9. Casar por igualdade exata cria um contato novo a cada troca de
// forma — é a causa dos 14 grupos duplicados hoje. A chave canônica (DDD + últimos 8) colapsa
// as duas formas, e a Cloud API da Meta cai na MESMA chave.
//
// CONTRATO: esta função tem que devolver EXATAMENTE o mesmo que a SQL para qualquer entrada.
// waNumero.test.ts trava isso com a tabela de paridade (valores colhidos do banco de produção).
// Se você mudar uma das duas, o teste quebra — de propósito. Front e webhook não podem agrupar
// de jeitos diferentes: a divergência seria invisível até virar contato duplicado.
export function chaveCanonicaTelefone(raw: string | null | undefined): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (!d) return null;
  const core = d.startsWith('55') && (d.length - 2 === 10 || d.length - 2 === 11) ? d.slice(2) : d;
  if (core.length === 10 || core.length === 11) return core.slice(0, 2) + core.slice(-8);
  return d;
}

// ⚠️ ARMADILHA (vale para a SQL também): as duas implementações só removem não-dígitos, então um
// JID com sufixo de DISPOSITIVO ('5551981602825:12@s.whatsapp.net') vira '555198160282512' —
// número errado, sem erro visível. Limpe o JID ANTES de chamar chaveCanonicaTelefone.
// (evolution-webhook já faz isso no seu digits(); Cloud API deve usar o wa_id, que vem limpo.)
export function apenasDigitosJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  return jid.replace(/[:@].*/, '').replace(/[^0-9]/g, '') || null;
}

/** Mesma pessoa? Compara pela chave canônica (imune ao nono dígito). */
export function mesmoNumero(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = chaveCanonicaTelefone(a);
  return !!ka && ka === chaveCanonicaTelefone(b);
}
