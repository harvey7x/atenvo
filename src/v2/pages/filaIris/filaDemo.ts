/* ============================================================================
   Fila da Iris — a fila da DEMONSTRAÇÃO fora da página. O aviso da marcação vencida (no shell, em qualquer página)
   e a Fila leem e mexem nas MESMAS marcações, como no sistema (onde as duas pontas são o banco): atualizar no aviso
   tira o vermelho da fila, atualizar na ficha tira o aviso. Vale até recarregar a página (nada é gravado).
   ============================================================================ */
import { useSyncExternalStore } from 'react';
import { leadsFicticios, type Lead } from './lead';

let loja: Lead[] | null = null;
const ouvintes = new Set<() => void>();
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };
const NADA: Lead[] = [];

export function lerFilaDemo(): Lead[] {
  if (!loja) loja = leadsFicticios();
  return loja;
}
export function mexerFilaDemo(f: (t: Lead[]) => Lead[]): void {
  loja = f(lerFilaDemo());
  ouvintes.forEach((x) => x());
}
/** a fila da demonstração (`ativo` = falso: nada é montado e a lista é sempre a mesma vazia) */
export function useFilaDemo(ativo: boolean): Lead[] {
  return useSyncExternalStore(assinar, ativo ? lerFilaDemo : () => NADA, ativo ? lerFilaDemo : () => NADA);
}
