/* Foto ILUSTRATIVA do cliente no card do Kanban (dono 29/10: "fotos de idosos, homens,
   mulheres, nas pessoinhas… umas 10 fotos e pode repetir"). Não é o cliente: 10 retratos
   livres (Unsplash, ver public/avatares/idosos/CREDITOS.md), escolhidos pelo primeiro nome
   (palpite de mulher/homem) e fixos por cliente (mesmo id → mesma foto). */

const BASE = '/avatares/idosos/';
const MULHERES = ['f1', 'f2', 'f3', 'f4', 'f5'].map((f) => `${BASE}${f}.webp`);
const HOMENS = ['h1', 'h2', 'h3', 'h4', 'h5'].map((f) => `${BASE}${f}.webp`);
const TODAS = [...MULHERES, ...HOMENS];

/** Nomes femininos comuns que NÃO terminam em "a" (e masculinos que terminam). */
const FEM_SEM_A = new Set([
  'raquel', 'isabel', 'beatriz', 'ester', 'ruth', 'rute', 'carmen', 'ivone', 'neide', 'cleide', 'rose', 'alice',
  'denise', 'simone', 'ivete', 'lurdes', 'lourdes', 'ines', 'dulce', 'marli', 'marlene', 'irene', 'elaine', 'eliane',
  'rosane', 'luciane', 'gislaine', 'jaqueline', 'miriam', 'noemi', 'nair', 'sueli', 'neli', 'ivonete', 'elizete',
  'marinez', 'marines', 'iracy', 'juraci', 'nilce', 'cleonice', 'eunice', 'berenice', 'geni', 'zeni', 'eni',
  'aparecida', 'dona', 'vo', 'avo', 'mae', 'tania', 'lucimar', 'rosemar', 'deise', 'daiane', 'viviane', 'tatiane',
]);
const MASC_COM_A = new Set(['luca', 'nicola', 'joshua', 'andrea', 'garcia']);

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
