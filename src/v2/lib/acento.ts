/* Acento do sistema (teste do dono 28/08): azul (padrão), verde ou dourado.
   Mesma mecânica do Modo de Performance: [data-acento] na RAIZ (<html>),
   preferência POR DISPOSITIVO em localStorage, aplicada em main.tsx antes
   do primeiro paint. AUSÊNCIA de atributo = azul (byte-idêntico ao que
   está em produção — o verde é opt-in do alternador da topbar).
   Quem obedece o atributo: os blocos [data-acento="verde"] em
   skinAurora.css (tokens --azul/--azul-rgb + gradientes hardcoded),
   kanban/dashboard/shell/login e as vars --lg-* da LogoAtenvo. */

export type Acento = 'azul' | 'verde' | 'dourado';

export const CHAVE_ACENTO = 'atenvo-acento';

export function lerAcento(): Acento {
  try {
    const v = localStorage.getItem(CHAVE_ACENTO);
    return v === 'verde' || v === 'dourado' ? v : 'azul';
  } catch {
    return 'azul';
  }
}

/* azul = atributo AUSENTE de propósito: o CSS do azul é o caminho sem
   guarda nenhuma, então remover o atributo devolve produção exata */
export function aplicarAcento(acento: Acento): void {
  if (acento === 'azul') document.documentElement.removeAttribute('data-acento');
  else document.documentElement.setAttribute('data-acento', acento);
}

type OuvinteAcento = (acento: Acento) => void;
const ouvintes = new Set<OuvinteAcento>();
export function assinarAcento(cb: OuvinteAcento): () => void {
  ouvintes.add(cb);
  return () => { ouvintes.delete(cb); };
}

export function salvarAcento(acento: Acento): void {
  try {
    localStorage.setItem(CHAVE_ACENTO, acento);
  } catch {
    /* storage indisponível: aplica sem persistir */
  }
  aplicarAcento(acento);
  ouvintes.forEach((cb) => cb(acento));
}
