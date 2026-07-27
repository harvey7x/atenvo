// Spotlight que segue o cursor (interação, instantâneo) — porta fiel do
// script do mockup: um único listener delegado no documento atualiza
// --mx/--my no card .spot sob o ponteiro; o CSS de .spot::after faz o resto.
export function instalarSpotlight(): () => void {
  function aoMover(ev: MouseEvent) {
    const alvo = ev.target as Element | null;
    const card = alvo?.closest?.('.spot') as HTMLElement | null;
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${((ev.clientX - r.left) / r.width) * 100}%`);
    card.style.setProperty('--my', `${((ev.clientY - r.top) / r.height) * 100}%`);
  }
  document.addEventListener('mousemove', aoMover);
  return () => document.removeEventListener('mousemove', aoMover);
}
