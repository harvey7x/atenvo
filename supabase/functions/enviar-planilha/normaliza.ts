// Normalização dos dados enviados à planilha CONTROLE CLIENTES AGENDADOS.
// CPF vai SEMPRE formatado (XXX.XXX.XXX-XX): como texto puro a planilha preservaria
// os zeros à esquerda, mas qualquer coerção a número os destruiria — há CPFs
// começando com 000 na base. Telefone vai no padrão humano da planilha, sem o 55.

/** Remove tudo que não é dígito; exige 11 dígitos; devolve XXX.XXX.XXX-XX (ou null). */
export function normalizaCpfPlanilha(bruto: string): string | null {
  const d = String(bruto ?? '').replace(/\D+/g, '');
  if (d.length !== 11) return null;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Tira o 55 do país (se presente) e formata (DD) 9XXXX-XXXX / (DD) XXXX-XXXX.
 *  Fora do padrão (sem DDD, dígitos demais/de menos) devolve só os dígitos, sem inventar. */
export function normalizaTelefonePlanilha(bruto: string): string {
  let d = String(bruto ?? '').replace(/\D+/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
