/* Atendimento renovado (pedido do dono 29/10: "deixar essa tela mais bonita,
   mais profissional, completa"). Camada ADITIVA em src/v2/pages/whatsappPro.css,
   ligada por [data-inbox-pro] na RAIZ (<html>) — mesma mecânica da repaginada:
   aplicada em main.tsx antes do primeiro paint, preferência POR DISPOSITIVO.
   Padrão LIGADO; o comparador "Antes / Depois" (só no demo local) desliga
   para conferir lado a lado. Atributo AUSENTE = inbox atual byte-idêntico. */

import { semTransicao } from './semTransicao';

export const CHAVE_INBOX_PRO = 'atenvo-inbox-pro';

export function lerInboxPro(): boolean {
  try {
    return localStorage.getItem(CHAVE_INBOX_PRO) !== '0';
  } catch {
    return true;
  }
}

export function aplicarInboxPro(ligado: boolean): void {
  const raiz = document.documentElement;
  if (raiz.hasAttribute('data-inbox-pro') === ligado) return;
  semTransicao(() => {
    if (ligado) raiz.setAttribute('data-inbox-pro', '');
    else raiz.removeAttribute('data-inbox-pro');
  });
}

export function salvarInboxPro(ligado: boolean): void {
  try {
    localStorage.setItem(CHAVE_INBOX_PRO, ligado ? '1' : '0');
  } catch {
    /* sem persistir: vale até recarregar */
  }
  aplicarInboxPro(ligado);
}
