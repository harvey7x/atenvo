/* Camada "Linear" (prévia 13/11 — dono pediu "um pouco desse estilo",
   guia DESIGN-estilo-linear.md). Camada ADITIVA em src/v2/linear.css,
   ligada por [data-linear] na RAIZ (<html>) — mesma mecânica da
   repaginada: aplicada em main.tsx antes do primeiro paint, preferência
   POR DISPOSITIVO. Nesta prévia o padrão é LIGADO; o comparador
   "Antes / Depois" (só no modo demonstração) desliga para conferir.
   Atributo AUSENTE = visual atual idêntico; reverter = não aplicar. */

import { semTransicao } from './semTransicao';

export const CHAVE_LINEAR = 'atenvo-linear';

export function lerLinear(): boolean {
  try {
    return localStorage.getItem(CHAVE_LINEAR) !== '0';
  } catch {
    return true;
  }
}

export function aplicarLinear(ligada: boolean): void {
  const raiz = document.documentElement;
  if (raiz.hasAttribute('data-linear') === ligada) return;
  semTransicao(() => {
    if (ligada) raiz.setAttribute('data-linear', '');
    else raiz.removeAttribute('data-linear');
  });
}

export function salvarLinear(ligada: boolean): void {
  try {
    localStorage.setItem(CHAVE_LINEAR, ligada ? '1' : '0');
  } catch {
    /* sem persistir: vale até recarregar */
  }
  aplicarLinear(ligada);
}
