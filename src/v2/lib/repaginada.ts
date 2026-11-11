/* Repaginada visual (pedido do dono 27/10: "deixar mais profissional, parece
   muito simples"). Camada ADITIVA em src/v2/repaginada.css, ligada por
   [data-repaginada] na RAIZ (<html>) — mesma mecânica do acento/perf:
   aplicada em main.tsx antes do primeiro paint, preferência POR DISPOSITIVO.
   Nesta prévia o padrão é LIGADO; o comparador "Antes / Depois" (só no
   modo demonstração) desliga para conferir lado a lado. Atributo AUSENTE =
   visual atual byte-idêntico; reverter = não aplicar o atributo. */

import { semTransicao } from './semTransicao';

export const CHAVE_REPAGINADA = 'atenvo-repaginada';

export function lerRepaginada(): boolean {
  try {
    return localStorage.getItem(CHAVE_REPAGINADA) !== '0';
  } catch {
    return true;
  }
}

export function aplicarRepaginada(ligada: boolean): void {
  const raiz = document.documentElement;
  if (raiz.hasAttribute('data-repaginada') === ligada) return;
  semTransicao(() => {
    if (ligada) raiz.setAttribute('data-repaginada', '');
    else raiz.removeAttribute('data-repaginada');
  });
}

export function salvarRepaginada(ligada: boolean): void {
  try {
    localStorage.setItem(CHAVE_REPAGINADA, ligada ? '1' : '0');
  } catch {
    /* sem persistir: vale até recarregar */
  }
  aplicarRepaginada(ligada);
}
