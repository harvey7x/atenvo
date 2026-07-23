// Confere a ficha CONTRA o bloco colado. Existe para impedir que dado de ficha antiga
// (benefício, espécie, valor, banco, telefone, REV) sobreviva numa ficha nova.
// Puro: sem rede, sem DOM. Só compara o que o parser realmente encontrou no bloco.
import { normalizaComparacao, somenteDigitos } from './fichaJudicialNormalizers';
import type { FichaJudicialParseResult } from './fichaJudicialParser';

export interface FichaConferivel {
  nome?: string;
  cpf?: string;
  beneficioNumero?: string;
  especieCodigo?: string;
  especieDescricao?: string;
  valorBeneficio?: number | null;
  bancoCodigo?: string;
  bancoNome?: string;
  nascimento?: string;
  revisoes?: { tipo: string; bancoNome?: string }[];
}

export interface Divergencia { campo: string; ficha: string; bloco: string }

const eq = (a: string, b: string) => normalizaComparacao(a) === normalizaComparacao(b);
const dig = (s?: string | null) => somenteDigitos(s ?? '');

/**
 * Divergências entre a ficha e o bloco colado. Campo que o parser não encontrou é ignorado
 * (não há com o que comparar). Campos manuais (RG, estado civil, e-mail, INSS) não entram.
 */
export function conferirFichaComBloco(p: FichaJudicialParseResult, f: FichaConferivel): Divergencia[] {
  const d: Divergencia[] = [];
  const add = (campo: string, ficha: string, bloco: string) => d.push({ campo, ficha, bloco });

  if (p.nome && !eq(p.nome, f.nome ?? '')) add('Nome', f.nome ?? '(vazio)', p.nome);
  if (p.cpf && dig(p.cpf) !== dig(f.cpf)) add('CPF', f.cpf || '(vazio)', p.cpf);
  if (p.beneficioNumero && dig(p.beneficioNumero) !== dig(f.beneficioNumero)) add('Benefício', f.beneficioNumero || '(vazio)', p.beneficioNumero);
  if (p.especieCodigo && dig(p.especieCodigo) !== dig(f.especieCodigo)) add('Cód. espécie', f.especieCodigo || '(vazio)', p.especieCodigo);
  if (p.especieDescricao && !eq(p.especieDescricao, f.especieDescricao ?? '')) add('Espécie', f.especieDescricao || '(vazio)', p.especieDescricao);
  if (p.valorBeneficio != null && Number(f.valorBeneficio ?? 0).toFixed(2) !== p.valorBeneficio.toFixed(2)) {
    add('Valor do benefício', f.valorBeneficio != null ? String(f.valorBeneficio) : '(vazio)', String(p.valorBeneficio));
  }
  if (p.bancoNome && !eq(p.bancoNome, f.bancoNome ?? '')) add('Banco pagador', f.bancoNome || '(vazio)', p.bancoNome);
  if (p.bancoCodigo && dig(p.bancoCodigo) !== dig(f.bancoCodigo)) add('Cód. do banco', f.bancoCodigo || '(vazio)', p.bancoCodigo);
  // Telefone é OMITIDO de propósito: por regra a ficha usa o número do contato do Atenvo, não o do
  // Promosys — logo divergir do bloco é o comportamento correto, não um erro a sinalizar aqui.
  if (p.nascimento && p.nascimento !== (f.nascimento || '')) add('Nascimento', f.nascimento || '(vazio)', p.nascimento);

  // REVs: qualquer REV da ficha que não exista no bloco é contaminação de ficha anterior.
  const chave = (r: { tipo: string; bancoNome?: string }) => `${r.tipo}|${normalizaComparacao(r.bancoNome ?? '')}`;
  const noBloco = new Set(p.revisoes.map(chave));
  for (const r of f.revisoes ?? []) {
    if (!noBloco.has(chave(r))) add('REV', `${r.tipo.toUpperCase()} ${r.bancoNome ?? ''}`.trim(), 'não está no bloco colado');
  }
  return d;
}
