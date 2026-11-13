/* Peças pequenas das telas de comunicação e equipe da Cobrança (crítica de design 12/11):
   - MenuMais: o "⋯" das ações secundárias de uma linha/cartão — a linha mostra UMA ação
     (ex.: Editar) e o resto (Senha, Pausar, Excluir…) fica no menu, com rótulo claro e a
     ação destrutiva em vermelho, separada.
   - AcoesNoTopo: as ações da tela no cabeçalho da página, à direita do título (régua da ALFA:
     título e ações na mesma linha, sem parágrafo explicativo embaixo). Sem cabeçalho com
     espaço para ações (ex.: dentro de Configurações), ficam numa linha própria, à direita. */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as KE, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { criarRaizPortalV2 } from '../../components/portal';
import './comunicacao.css';

export type ItemMenu = { rotulo: string; onClick: () => void; perigo?: boolean; desabilitado?: boolean; dica?: string } | 'sep';

export function MenuMais({ itens, rotulo = 'Mais ações', className }: { itens: ItemMenu[]; rotulo?: string; className?: string }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [raiz, setRaiz] = useState<HTMLElement | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return;
    const el = criarRaizPortalV2(document) as HTMLDivElement;
    setRaiz(el);
    return () => { el.remove(); setRaiz(null); setPos(null); };
  }, [aberto]);

  // posição: logo abaixo do botão, alinhado pela direita; sobe se não couber embaixo
  useLayoutEffect(() => {
    if (!aberto || !raiz || !btn.current || !menu.current) return;
    const r = btn.current.getBoundingClientRect();
    const m = menu.current.getBoundingClientRect();
    let top = r.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
    const left = Math.max(8, Math.min(r.right - m.width, window.innerWidth - m.width - 8));
    setPos({ top, left });
    menu.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [aberto, raiz]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!menu.current?.contains(alvo) && !btn.current?.contains(alvo)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); btn.current?.focus(); } };
    const fechar = () => setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla, true);
    window.addEventListener('resize', fechar);
    document.addEventListener('scroll', fechar, true);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla, true);
      window.removeEventListener('resize', fechar);
      document.removeEventListener('scroll', fechar, true);
    };
  }, [aberto]);

  const teclar = (e: KE<HTMLDivElement>) => {
    const d = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const bs = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = bs.indexOf(document.activeElement as HTMLButtonElement);
    bs[(i + d + bs.length) % bs.length]?.focus();
  };

  return (
    <>
      <button ref={btn} type="button" className={className ? `mm-btn ${className}` : 'mm-btn'} aria-label={rotulo} title={rotulo}
        aria-haspopup="menu" aria-expanded={aberto} aria-controls={aberto ? id : undefined}
        onClick={(e) => { e.stopPropagation(); setAberto((v) => !v); }}>
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5.5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18.5" cy="12" r="1.5" /></svg>
      </button>
      {aberto && raiz && createPortal(
        <div ref={menu} id={id} className="mm-menu" role="menu" aria-label={rotulo} onKeyDown={teclar}
          style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
          onClick={(e) => e.stopPropagation()}>
          {itens.map((it, i) => (it === 'sep'
            ? <div key={`sep-${i}`} className="mm-sep" role="separator" />
            : (
              <button key={it.rotulo} type="button" role="menuitem" className={it.perigo ? 'mm-item perigo' : 'mm-item'}
                disabled={it.desabilitado} title={it.dica} onClick={() => { setAberto(false); it.onClick(); }}>
                {it.rotulo}
              </button>
            )))}
        </div>,
        raiz,
      )}
    </>
  );
}

export function AcoesNoTopo({ children, ativo = true }: { children: ReactNode; ativo?: boolean }) {
  const marca = useRef<HTMLSpanElement>(null);
  const [alvo, setAlvo] = useState<Element | null>(null);
  useLayoutEffect(() => {
    if (!ativo) { setAlvo(null); return; }
    const pg = marca.current?.closest('.pagina') ?? document;
    setAlvo(pg.querySelector('.ph > .acoes'));
  }, [ativo]);
  return (
    <>
      <span ref={marca} hidden />
      {alvo ? createPortal(children, alvo) : <div className="cc-acoes-local">{children}</div>}
    </>
  );
}
