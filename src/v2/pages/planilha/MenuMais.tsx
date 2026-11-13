/* =====================================================================
   Menu "Mais" — as ações raras da tela num só botão (crítica 12/11):
   a barra fica com a ação do dia em destaque e o resto aqui dentro.
   Fecha no clique fora, no Esc e ao escolher; setas andam entre os itens.
   ===================================================================== */
import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type ReactNode } from 'react';

export interface ItemMenuMais {
  rotulo: string;
  /** path de um ícone de traço 24×24 */
  icone?: string;
  aoClicar: () => void;
  perigo?: boolean;
  desabilitado?: boolean;
  dica?: string;
  /** linha divisória ANTES deste item */
  separar?: boolean;
}

const PONTOS = 'M5 12h.01M12 12h.01M19 12h.01';

function Ic({ d, s = 16 }: { d: string; s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function MenuMais({ itens, rotulo = 'Mais', mini, so, titulo, className, extra }: {
  itens: ItemMenuMais[];
  rotulo?: string;
  mini?: boolean;
  /** só o ícone (⋯), sem o texto — para a linha de uma tabela */
  so?: boolean;
  titulo?: string;
  className?: string;
  /** conteúdo ancorado no mesmo lugar (ex.: o popover que um item abre) */
  extra?: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const visiveis = itens.filter(Boolean);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setAberto(false);
      gatilho.current?.focus();
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    // o 1º item ganha o foco (teclado já entra no menu)
    requestAnimationFrame(() => raiz.current?.querySelector<HTMLButtonElement>('.mm-item:not(:disabled)')?.focus());
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const teclar = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const bts = Array.from(raiz.current?.querySelectorAll<HTMLButtonElement>('.mm-item:not(:disabled)') ?? []);
    if (!bts.length) return;
    const i = bts.indexOf(document.activeElement as HTMLButtonElement);
    const k = e.key === 'Home' ? 0 : e.key === 'End' ? bts.length - 1
      : (i + (e.key === 'ArrowDown' ? 1 : -1) + bts.length) % bts.length;
    bts[k].focus();
  };

  return (
    <div className={`mm${className ? ` ${className}` : ''}`} ref={raiz}>
      <button ref={gatilho} type="button"
        className={`p-btn btn-sec mm-gatilho${mini ? ' btn-mini' : ''}${so ? ' mm-so' : ''}${aberto ? ' on' : ''}`}
        aria-haspopup="menu" aria-expanded={aberto} title={titulo ?? rotulo} aria-label={so ? (titulo ?? rotulo) : undefined}
        onClick={() => setAberto((v) => !v)}>
        {so ? <Ic d={PONTOS} s={mini ? 16 : 18} /> : <>{rotulo}<Ic d={PONTOS} s={16} /></>}
      </button>
      {aberto && (
        <div className="mm-pop" role="menu" aria-label={titulo ?? rotulo} onKeyDown={teclar}>
          {visiveis.map((it, i) => (
            <div key={`${it.rotulo}-${i}`} role="none">
              {it.separar && i > 0 && <div className="mm-sep" role="separator" />}
              <button type="button" role="menuitem" className={`mm-item${it.perigo ? ' perigo' : ''}`}
                disabled={it.desabilitado} title={it.dica}
                onClick={() => { setAberto(false); it.aoClicar(); }}>
                {it.icone ? <Ic d={it.icone} /> : <span className="mm-ic-vazio" aria-hidden />}
                <span>{it.rotulo}</span>
              </button>
            </div>
          ))}
        </div>
      )}
      {extra}
    </div>
  );
}
