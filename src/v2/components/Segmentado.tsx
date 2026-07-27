import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import './componentes.css';

export type OpcaoSegmentado<V extends string> = { valor: V; rotulo: ReactNode };

type SegmentadoProps<V extends string> = {
  opcoes: OpcaoSegmentado<V>[];
  valor: V;
  aoMudar: (valor: V) => void;
  /** Nome acessível do grupo (ex.: "Filtro de conversas"). */
  rotulo?: string;
  style?: CSSProperties;
};

/**
 * Controle segmentado (.segm do mockup) — seleção única de filtro/visão.
 * Semântica de radiogroup com roving tabindex: Tab entra no grupo,
 * setas movem e selecionam (o mockup usa spans estáticos; aqui os
 * segmentos são <button> operáveis por teclado).
 */
export function Segmentado<V extends string>({ opcoes, valor, aoMudar, rotulo, style }: SegmentadoProps<V>) {
  const raiz = useRef<HTMLDivElement>(null);

  function aoTeclar(ev: KeyboardEvent) {
    const delta = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1
      : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    ev.preventDefault();
    const i = opcoes.findIndex((o) => o.valor === valor);
    const proxima = opcoes[(i + delta + opcoes.length) % opcoes.length];
    aoMudar(proxima.valor);
    const botoes = raiz.current?.querySelectorAll<HTMLButtonElement>('button');
    botoes?.[(i + delta + opcoes.length) % opcoes.length]?.focus();
  }

  return (
    <div className="segm" role="radiogroup" aria-label={rotulo} style={style} ref={raiz} onKeyDown={aoTeclar}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={o.valor === valor}
          tabIndex={o.valor === valor ? 0 : -1}
          className={o.valor === valor ? 'on' : undefined}
          onClick={() => aoMudar(o.valor)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
