/* Raiz de portal do v2 — regra 10 do contrato: TODO portal (modal, drawer,
   toast) monta com a classe `v2` no nó raiz, porque os tokens Platina vivem
   em `.v2`, não em `:root`. Injetável para teste sem DOM. */

export interface DocumentoMinimo {
  createElement: (tag: string) => { className: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: { appendChild: (el: any) => unknown };
}

export const CLASSE_RAIZ_PORTAL = 'v2 portal-v2';

/** Cria (e anexa ao body) o nó raiz de um portal v2. */
export function criarRaizPortalV2(doc: DocumentoMinimo): { className: string } {
  const el = doc.createElement('div');
  el.className = CLASSE_RAIZ_PORTAL;
  doc.body.appendChild(el);
  return el;
}
