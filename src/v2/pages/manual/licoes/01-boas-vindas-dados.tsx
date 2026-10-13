/* Lição 1 — dados que o texto da lição usa ao ser carregado: números da prova e ids
   das seções. Ficam fora de 01-boas-vindas-pecas.tsx porque aquele arquivo importa
   LICOES (import circular com index.ts): aqui não há ciclo, então no recarregamento
   a quente da prévia nada fica "usado antes de iniciar".
   Números da prova vêm de tipos.ts: nunca os escreva fixos no texto. */
import { NOTA_MINIMA_PCT, PERGUNTAS_POR_PROVA } from '../tipos';

/** Menor número de acertos que chega à nota mínima, com o mesmo arredondamento da prova. */
function minimoAcertos(total: number, pct: number) {
  for (let a = 0; a <= total; a++) if (Math.round((a / total) * 100) >= pct) return a;
  return total;
}
export const PROVA = {
  total: PERGUNTAS_POR_PROVA,
  pct: NOTA_MINIMA_PCT,
  minimo: minimoAcertos(PERGUNTAS_POR_PROVA, NOTA_MINIMA_PCT),
} as const;
/** Nota (em %) com `acertos` certas na prova. */
export const notaDe = (acertos: number) => Math.round((acertos / PROVA.total) * 100);

/** ids das seções da lição (o sumário rola até elas). */
export const SEC = {
  caf: 'bv-caf',
  papel: 'bv-papel',
  mapa: 'bv-mapa',
  estudar: 'bv-estudar',
  caminho: 'bv-caminho',
  dia: 'bv-dia',
  valores: 'bv-valores',
  regras: 'bv-regras',
  resumo: 'bv-resumo',
} as const;
