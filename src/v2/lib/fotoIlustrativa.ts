/* Foto ILUSTRATIVA do cliente no card do Kanban (dono 29/10: "fotos de idosos, homens,
   mulheres, nas pessoinhas… umas 10 fotos e pode repetir"). Não é o cliente: 10 retratos
   livres (Unsplash, ver public/avatares/idosos/CREDITOS.md), escolhidos pelo primeiro nome
   (palpite de mulher/homem) e fixos por cliente (mesmo id → mesma foto). */

import { FEMININOS_SEM_A, MASCULINOS_COM_A } from './nomesGenero';

const BASE = '/avatares/idosos/';
const MULHERES = ['f1', 'f2', 'f3', 'f4', 'f5'].map((f) => `${BASE}${f}.webp`);
const HOMENS = ['h1', 'h2', 'h3', 'h4', 'h5'].map((f) => `${BASE}${f}.webp`);
const TODAS = [...MULHERES, ...HOMENS];

/** Exceções à regra "termina em 'a' = mulher", tiradas do IBGE (Censo 2010) — ver nomesGenero.ts.
 *  Dono 30/10: "tem que acertar direitinho se é homem ou mulher". Mais os tratamentos que às vezes
 *  ficam no lugar do nome ("Dona Maria", "Mãe"). */
const FEM_SEM_A = new Set([...FEMININOS_SEM_A.split('|'), 'dona', 'vo', 'avo', 'mae']);
const MASC_COM_A = new Set(MASCULINOS_COM_A.split('|'));

function primeiroNome(nome: string): string {
  const limpo = (nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return limpo.match(/[a-z]+/)?.[0] ?? '';
}

/** "f" (mulher), "h" (homem) ou null (sem nome — só telefone). Palpite, não verdade. */
export function generoProvavel(nome: string): 'f' | 'h' | null {
  const p = primeiroNome(nome);
  if (p.length < 2) return null;
  if (FEM_SEM_A.has(p)) return 'f';
  if (p.endsWith('a') && !MASC_COM_A.has(p)) return 'f';
  return 'h';
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A foto ilustrativa do cliente: sempre a mesma para o mesmo id. */
export function fotoIlustrativa(nome: string, id: string): string {
  const g = generoProvavel(nome);
  const lista = g === 'f' ? MULHERES : g === 'h' ? HOMENS : TODAS;
  return lista[hash(id || nome) % lista.length];
}
