/** Padroniza a EXIBIÇÃO do nome do cliente na aba de Conversas/WhatsApp: MAIÚSCULO (pt-BR).
 *  Apenas apresentação — não altera dados no banco.
 *  - string / null / undefined seguros;
 *  - nome vazio (ou só espaços) → '' (o chamador aplica seu fallback, ex.: "Cliente sem nome");
 *  - valor só com dígitos/símbolos de telefone (LID/número) → preserva como veio (não é nome). */
export function formatarNomeCliente(nome: string | null | undefined): string {
  const n = (nome ?? '').trim();
  if (!n) return '';
  if (/^[\d\s()+\-]+$/.test(n)) return n; // telefone/identificador numérico → não mexe
  return n.toLocaleUpperCase('pt-BR');
}
