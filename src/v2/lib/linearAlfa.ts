/* Estilo Linear na Reviza (dono 13/11, guia DESIGN-estilo-linear.md): [data-linear] na
   RAIZ (<html>), só onde há [data-barra-alfa]. Padrão LIGADO; a prévia tem o
   "Antes / Depois" no selo do topo, que grava a escolha neste navegador.
   Atributo ausente = visual anterior idêntico (reviza-linear.css só age com ele). */
import { semTransicao } from './semTransicao';

export const CHAVE_LINEAR_ALFA = 'reviza.linear';

export function lerLinearAlfa(): boolean {
  try {
    return localStorage.getItem(CHAVE_LINEAR_ALFA) !== '0';
  } catch {
    return true;
  }
}

export function aplicarLinearAlfa(ligada: boolean): void {
  const raiz = document.documentElement;
  if (raiz.hasAttribute('data-linear') === ligada) return;
  semTransicao(() => {
    if (ligada) raiz.setAttribute('data-linear', '');
    else raiz.removeAttribute('data-linear');
  });
}

export function salvarLinearAlfa(ligada: boolean): void {
  try {
    localStorage.setItem(CHAVE_LINEAR_ALFA, ligada ? '1' : '0');
  } catch {
    /* sem persistir: vale até recarregar */
  }
  aplicarLinearAlfa(ligada);
}
