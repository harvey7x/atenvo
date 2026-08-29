/* Visual do sistema (pedido do dono 29/08): Platina (padrão, produção
   intocada) ou Corporativo — a versão sóbria pra empresa grande, sem
   efeitos (serio.css). Mesma mecânica do acento/perf: [data-visual] na
   RAIZ (<html>), preferência POR DISPOSITIVO em localStorage, aplicada
   em main.tsx antes do primeiro paint. AUSÊNCIA de atributo = Platina
   (byte-idêntico ao que está em produção). */

export type Visual = 'platina' | 'corp';

export const CHAVE_VISUAL = 'atenvo-visual';

export function lerVisual(): Visual {
  try {
    return localStorage.getItem(CHAVE_VISUAL) === 'corp' ? 'corp' : 'platina';
  } catch {
    return 'platina';
  }
}

/* platina = atributo AUSENTE de propósito: remover devolve produção exata */
export function aplicarVisual(visual: Visual): void {
  if (visual === 'platina') document.documentElement.removeAttribute('data-visual');
  else document.documentElement.setAttribute('data-visual', 'corp');
}

/** true quando o Corporativo está ativo — os contadores animados usam
    isto pra cravar o valor final direto (número é dado, não aplauso). */
export function visualCorp(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement.getAttribute('data-visual') === 'corp';
}

type OuvinteVisual = (visual: Visual) => void;
const ouvintes = new Set<OuvinteVisual>();
export function assinarVisual(cb: OuvinteVisual): () => void {
  ouvintes.add(cb);
  return () => { ouvintes.delete(cb); };
}

export function salvarVisual(visual: Visual): void {
  try {
    localStorage.setItem(CHAVE_VISUAL, visual);
  } catch {
    /* storage indisponível: aplica sem persistir */
  }
  aplicarVisual(visual);
  ouvintes.forEach((cb) => cb(visual));
}
