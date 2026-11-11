/* Rolagem sem hover animado (camada de movimento). Rolar uma lista com o mouse em
   cima passa o :hover por dezenas de linhas, e cada uma dispararia a transição de
   hover dela (recálculo de estilo + quadros extras na thread principal — no inbox,
   em CPU fraca, era o dobro do custo da rolagem). Um listener delegado marca o
   contêiner que está rolando com .mo-rolando e desmarca 140ms após o último evento;
   o movimento.css desliga as transições das linhas dentro dele (troca seca). */
export function instalarRolagemSemHover(): () => void {
  const timers = new WeakMap<HTMLElement, number>();
  function aoRolar(ev: Event) {
    const el = ev.target;
    if (!(el instanceof HTMLElement)) return; // rolagem do documento: o app não rola o <html>
    if (!el.classList.contains('mo-rolando')) el.classList.add('mo-rolando');
    const t = timers.get(el);
    if (t !== undefined) window.clearTimeout(t);
    timers.set(el, window.setTimeout(() => { el.classList.remove('mo-rolando'); timers.delete(el); }, 140));
  }
  document.addEventListener('scroll', aoRolar, { capture: true, passive: true });
  return () => document.removeEventListener('scroll', aoRolar, { capture: true });
}
