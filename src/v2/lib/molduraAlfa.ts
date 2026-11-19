/* "Moldura preta" da Reviza (dono 19/11: "nessa pegada, preto com branco, a barra lateral
   fixa, os dourados, o alaranjado" — referência Quantro/Sales Dashboard): a barra lateral e o
   topo viram uma moldura preta e o conteúdo, um painel claro de cantos arredondados por dentro
   dela; destaques em dourado/laranja. [data-moldura] na RAIZ (<html>), só com [data-barra-alfa].
   Padrão LIGADO; a prévia tem o "Antes / Depois" no selo do topo (grava neste navegador).
   Atributo ausente = o visual de antes, idêntico (reviza-moldura.css só age com ele). */
import { useSyncExternalStore } from 'react';
import { semTransicao } from './semTransicao';

export const CHAVE_MOLDURA = 'reviza.moldura';

export function lerMoldura(): boolean {
  try {
    return localStorage.getItem(CHAVE_MOLDURA) !== '0';
  } catch {
    return true;
  }
}

export function aplicarMoldura(ligada: boolean): void {
  const raiz = document.documentElement;
  if (raiz.hasAttribute('data-moldura') === ligada) return;
  semTransicao(() => {
    if (ligada) raiz.setAttribute('data-moldura', '');
    else raiz.removeAttribute('data-moldura');
  });
}

export function salvarMoldura(ligada: boolean): void {
  try {
    localStorage.setItem(CHAVE_MOLDURA, ligada ? '1' : '0');
  } catch {
    /* sem persistir: vale até recarregar */
  }
  aplicarMoldura(ligada);
}

const assinar = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-moldura'] });
  return () => obs.disconnect();
};
/** a moldura está na tela agora (para quem desenha em SVG e precisa da cor certa) */
export function useMoldura(): boolean {
  return useSyncExternalStore(assinar, () => document.documentElement.hasAttribute('data-moldura'), () => false);
}
