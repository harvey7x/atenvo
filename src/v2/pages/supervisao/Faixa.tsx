import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState,
  type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react';

/* ------------------------------------------------------------------
   Faixa dos celulares (Painel da Equipe, dono 30/10): os celulares
   ficam LADO A LADO numa faixa de correr — "um negócio de correr",
   com setinha dos dois lados porque nem todo mundo consegue rolar de
   lado pelo touchpad. Três jeitos de andar:
   - setas: um celular por clique (encaixa no próximo);
   - arrastar com o mouse em qualquer ponto da faixa (mais de 6 px
     vira arraste e o clique de soltar é engolido — clicar numa
     conversa continua funcionando);
   - nomes da equipe (na barra de cima, desenhados pela página): mostram
     quem está na tela (`aoMudarNaTela`) e levam direto ao celular (`irPara`).
   Toque e touchpad usam a rolagem nativa (com encaixe).
   Cada filho marca o próprio celular com `data-faixa-id`.
   ------------------------------------------------------------------ */

export interface ControleFaixa { irPara: (id: string) => void }

const LIMIAR_ARRASTE = 6;
const suave = (): ScrollBehavior =>
  (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

const Seta = ({ dir }: { dir: 'esq' | 'dir' }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {dir === 'esq' ? <path d="M14.5 5.5 8 12l6.5 6.5" /> : <path d="M9.5 5.5 16 12l-6.5 6.5" />}
  </svg>
);

export const Faixa = forwardRef<ControleFaixa, {
  /** ids na ordem da faixa (mudou a ordem ou chegou alguém: mede de novo) */
  ids: readonly string[];
  larguraTel: number;
  aoMudarNaTela?: (ids: ReadonlySet<string>) => void;
  children: ReactNode;
}>(
  function Faixa({ ids, larguraTel, aoMudarNaTela, children }, ref) {
    const trilho = useRef<HTMLDivElement>(null);
    const [borda, setBorda] = useState({ ini: true, fim: true });
    const [arrastando, setArrastando] = useState(false);
    const [naTela, setNaTela] = useState<ReadonlySet<string>>(new Set());

    /* onde a faixa está: setas das pontas e nomes de quem aparece (meio do posto dentro da faixa) */
    const medir = useCallback(() => {
      const el = trilho.current;
      if (!el) return;
      // o último encaixe pode sobrar alguns px antes do fim: até 12 px conta como ponta
      const ini = el.scrollLeft <= 12;
      const fim = el.scrollLeft + el.clientWidth >= el.scrollWidth - 12;
      setBorda((b) => (b.ini === ini && b.fim === fim ? b : { ini, fim }));
      const r = el.getBoundingClientRect();
      const vis = new Set<string>();
      el.querySelectorAll<HTMLElement>('[data-faixa-id]').forEach((n) => {
        const q = n.getBoundingClientRect();
        const meio = q.left + q.width / 2;
        if (meio >= r.left && meio <= r.right && n.dataset.faixaId) vis.add(n.dataset.faixaId);
      });
      setNaTela((v) => (v.size === vis.size && [...vis].every((x) => v.has(x)) ? v : vis));
    }, []);

    useEffect(() => {
      const el = trilho.current;
      if (!el) return;
      el.addEventListener('scroll', medir, { passive: true });
      const ro = new ResizeObserver(medir);
      ro.observe(el);
      return () => { el.removeEventListener('scroll', medir); ro.disconnect(); };
    }, [medir]);
    // trocou a ordem, o tamanho ou chegou alguém: mede de novo
    const chaveIds = ids.join('|');
    useEffect(() => { medir(); }, [chaveIds, larguraTel, medir]);
    useEffect(() => { aoMudarNaTela?.(naTela); }, [naTela, aoMudarNaTela]);

    const irPara = useCallback((id: string) => {
      const n = trilho.current?.querySelector<HTMLElement>(`[data-faixa-id="${CSS.escape(id)}"]`);
      n?.scrollIntoView({ behavior: suave(), block: 'nearest', inline: 'center' });
    }, []);
    useImperativeHandle(ref, () => ({ irPara }), [irPara]);

    /** Um celular para o lado (a largura do posto + o vão): o encaixe deixa o próximo alinhado. */
    function passo(dir: 1 | -1) {
      const el = trilho.current;
      if (!el) return;
      const primeiro = el.querySelector<HTMLElement>('[data-faixa-id]');
      const vao = parseFloat(getComputedStyle(el).columnGap) || 0;
      el.scrollBy({ left: dir * (primeiro ? primeiro.offsetWidth + vao : el.clientWidth * 0.8), behavior: suave() });
    }

    /* ---- arrastar com o mouse ---- */
    const arraste = useRef<{ x: number; inicio: number; moveu: boolean; id: number } | null>(null);
    const engolirClique = useRef(false);

    function aoApertar(e: ReactPointerEvent<HTMLDivElement>) {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !trilho.current) return;   // toque/caneta: rolagem nativa
      // campos de texto e a onda do áudio (que busca o trecho) têm o próprio arraste
      if ((e.target as HTMLElement).closest('input, textarea, select, .zp-onda')) return;
      arraste.current = { x: e.clientX, inicio: trilho.current.scrollLeft, moveu: false, id: e.pointerId };
    }
    function aoMover(e: ReactPointerEvent<HTMLDivElement>) {
      const a = arraste.current, el = trilho.current;
      if (!a || !el) return;
      const dx = e.clientX - a.x;
      if (!a.moveu) {
        if (Math.abs(dx) < LIMIAR_ARRASTE) return;
        a.moveu = true;
        el.setPointerCapture(a.id);
        // direto no elemento (não espera o React): sem encaixe nem rolagem suave enquanto segue o ponteiro —
        // a faixa se redesenha durante o arraste (setas/nomes) e uma classe trocada pelo render voltaria o encaixe
        el.style.scrollSnapType = 'none';
        el.style.scrollBehavior = 'auto';
        setArrastando(true);
      }
      el.scrollLeft = a.inicio - dx;
    }
    function aoSoltar() {
      const a = arraste.current, el = trilho.current;
      arraste.current = null;
      if (!a?.moveu || !el) return;
      // o clique que vem logo depois de soltar não abre conversa nem ficha
      engolirClique.current = true;
      window.setTimeout(() => { engolirClique.current = false; }, 0);
      if (el.hasPointerCapture(a.id)) el.releasePointerCapture(a.id);
      el.style.scrollSnapType = '';
      el.style.scrollBehavior = '';
      setArrastando(false);
      // encaixa no celular mais perto da borda esquerda
      const pad = parseFloat(getComputedStyle(el).paddingLeft) || 0;
      let melhor: HTMLElement | null = null, dist = Infinity;
      for (const n of Array.from(el.querySelectorAll<HTMLElement>('[data-faixa-id]'))) {
        const d = Math.abs(n.offsetLeft - pad - el.scrollLeft);
        if (d < dist) { dist = d; melhor = n; }
      }
      if (melhor) el.scrollTo({ left: melhor.offsetLeft - pad, behavior: suave() });
    }
    function aoClicar(e: ReactMouseEvent<HTMLDivElement>) {
      if (!engolirClique.current) return;
      engolirClique.current = false;
      e.preventDefault();
      e.stopPropagation();
    }

    const cls = ['sv-trilho', borda.ini ? '' : 'sv-mais-esq', borda.fim ? '' : 'sv-mais-dir', arrastando ? 'sv-arrastando' : ''].filter(Boolean).join(' ');
    return (
        <div className="sv-carrossel">
          <button type="button" className="sv-seta sv-seta-esq vidro-pro" onClick={() => passo(-1)} disabled={borda.ini} aria-label="Celular anterior">
            <Seta dir="esq" />
          </button>
          <div ref={trilho} className={cls} style={{ '--sv-tel': `${larguraTel}px` } as CSSProperties}
            onPointerDown={aoApertar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar} onClickCapture={aoClicar}>
            {children}
          </div>
          <button type="button" className="sv-seta sv-seta-dir vidro-pro" onClick={() => passo(1)} disabled={borda.fim} aria-label="Próximo celular">
            <Seta dir="dir" />
          </button>
        </div>
    );
  },
);
