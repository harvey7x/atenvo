/** Definição de status de conversa configurável por organização (tabela conversa_status_def). */
export interface StatusDef {
  id: string;
  slug: string;
  nome: string;
  cor: string;
  ordem: number;
  padrao: boolean;
  ativo: boolean;
  sistema: boolean;
}

/** Etiqueta colorida por organização (tabela etiquetas). O vínculo em contatos/conversas/
 *  oportunidades é feito pelo NOME dentro do array text[]; aqui guardamos a cor/metadados. */
export interface Etiqueta {
  id: string;
  nome: string;
  cor: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
}

/** Modo de assinatura de mensagens (preferência por usuário). */
export type AssinaturaModo = 'sem' | 'atendente' | 'empresa' | 'personalizado';

export interface AssinaturaPref {
  modo: AssinaturaModo;
  nome: string; // nome personalizado (usado quando modo === 'personalizado')
}

/** Papéis que podem administrar status/etiquetas (admin e gestor/supervisor). */
export function podeGerenciarAtendimento(role: string | undefined): boolean {
  return role === 'admin' || role === 'gestor';
}

/** Cor padrão neutra (igual ao default das migrations). */
export const COR_NEUTRA = '#64748b';

/** Paleta sugerida para o seletor de cor (status e etiquetas). */
export const PALETA_CORES = [
  '#3b82f6', '#19C37D', '#f59e0b', '#a855f7', '#0891b2',
  '#e11d48', '#7c3aed', '#0e9d63', '#d97706', '#64748b',
];

/** Resolve a cor de uma etiqueta pelo nome (case-insensitive), com fallback neutro. */
export function corDaEtiqueta(nome: string, etiquetas: Etiqueta[] | undefined): string {
  if (!etiquetas) return COR_NEUTRA;
  const alvo = nome.trim().toLowerCase();
  const hit = etiquetas.find((e) => e.nome.trim().toLowerCase() === alvo);
  return hit?.cor ?? COR_NEUTRA;
}
