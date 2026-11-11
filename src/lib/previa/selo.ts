/* Selo discreto da prévia (só no build de prévia): deixa claro que os clientes são fictícios.
   Fica no centro da barra do topo; some (sem tirar do lugar) quando algo cobre a barra: a Gestão em
   tela cheia (a barra da planilha sobe pra y≈12 — o selo ficava em cima de "Ao vivo" e "Lançar
   pagamento"), um modal/gaveta (véu), a paleta ⌘K e a foto ampliada — senão ele ficava aceso por cima
   do véu, colado no topo do modal. */
const ESCONDE = '.gp-raiz.gp-cheia, .veu, .veu-drawer, .pal-veu, .fz-zoom';

export function montarSeloPrevia(): void {
  if (typeof document === 'undefined') return;
  const montar = () => {
    if (document.getElementById('selo-previa')) return;
    const estilo = document.createElement('style');
    estilo.id = 'selo-previa-estilo';
    estilo.textContent = `#selo-previa{transition:opacity .15s ease,visibility .15s}body:has(${ESCONDE}) #selo-previa{opacity:0;visibility:hidden}`;
    document.head.appendChild(estilo);
    const el = document.createElement('div');
    el.id = 'selo-previa';
    el.setAttribute('role', 'note');
    el.textContent = 'Prévia do novo visual · dados fictícios';
    Object.assign(el.style, {
      position: 'fixed', left: '50%', top: '17px', transform: 'translateX(-50%)', zIndex: '2147483000', pointerEvents: 'none', whiteSpace: 'nowrap',
      padding: '5px 11px', borderRadius: '999px', font: "500 11px/1.2 'Instrument Sans Variable','Instrument Sans',system-ui,sans-serif",
      letterSpacing: '.02em', color: 'rgba(240,188,78,.95)', background: 'rgba(10,11,13,.72)',
      border: '1px solid rgba(240,188,78,.35)', backdropFilter: 'blur(8px)', boxShadow: '0 4px 14px rgba(0,0,0,.25)',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(el);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar, { once: true });
  else montar();
}
