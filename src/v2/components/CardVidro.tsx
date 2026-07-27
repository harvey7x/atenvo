import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import './componentes.css';

type CardVidroProps = HTMLAttributes<HTMLDivElement> & {
  /** Spotlight seguindo o cursor + elevação no hover (interação). */
  spot?: boolean;
  /** Entrada em cascata (carga). Passe o atraso em segundos via `atraso`. */
  sobe?: boolean;
  atraso?: number;
};

/** Painel de vidro do mockup (.vidro), opcionalmente .spot e .sobe. */
export function CardVidro({ spot, sobe, atraso, className, style, ...resto }: CardVidroProps) {
  const cls = ['vidro', spot ? 'spot' : '', sobe ? 'sobe' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  const estilo: CSSProperties | undefined =
    sobe && atraso ? { ...style, animationDelay: `${atraso}s` } : style;
  return <div className={cls} style={estilo} {...resto} />;
}

type CardCabProps = {
  titulo: ReactNode;
  /** Contador rubro ao lado do título (.cont). */
  contador?: number;
  /** Link/ação à direita do cabeçalho. */
  direita?: ReactNode;
};

/** Cabeçalho de card (.card-cab): título à esquerda, link/contagem à direita. */
export function CardCab({ titulo, contador, direita }: CardCabProps) {
  return (
    <div className="card-cab">
      <h3>
        {titulo}
        {contador !== undefined && <span className="cont num">{contador}</span>}
      </h3>
      {direita}
    </div>
  );
}
