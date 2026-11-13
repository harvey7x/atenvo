/* Telefone no FORMATO ÚNICO da Reviza (crítica de design 12/11: aparecia em 5 formatos):
   "(51) 99999-0101" — aceita com ou sem +55, com ou sem o 9, com espaços/traços.
   mascarar: esconde o meio, "(51) •••••-0101". Um número já mascarado ("+5551•••••4407")
   vira "(51) •••••-4407". Fora do padrão brasileiro, devolve o texto como veio. */
export function formatarTelefone(bruto: string | number | null | undefined, opts: { mascarar?: boolean } = {}): string {
  if (bruto == null) return '';
  const s = String(bruto).trim();
  if (!s) return '';
  if (/[•*]/.test(s)) {
    const sem55 = s.replace(/^\+?\s*55\s*/, '');
    const ddd = sem55.match(/\d{2}/)?.[0];
    const fim = s.match(/(\d{4})\D*$/)?.[1];
    return ddd && fim ? `(${ddd}) •••••-${fim}` : s;
  }
  let d = s.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return s;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const meio = resto.slice(0, resto.length - 4);
  const fim = resto.slice(-4);
  return `(${ddd}) ${opts.mascarar ? '•'.repeat(meio.length) : meio}-${fim}`;
}
