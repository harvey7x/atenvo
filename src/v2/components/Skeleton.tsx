import type { CSSProperties } from 'react';
import './componentes.css';

type SkeletonProps = {
  largura?: number | string;
  altura?: number | string;
  /** Raio de borda (px). 99 para pílulas/avatares redondos. */
  raio?: number;
  style?: CSSProperties;
};

/** Bloco de carregamento em vidro com shimmer sutil (contrato, item 7). */
export function Skeleton({ largura = '100%', altura = 12, raio, style }: SkeletonProps) {
  return (
    <div
      className="skel"
      aria-hidden
      style={{ width: largura, height: altura, borderRadius: raio, ...style }}
    />
  );
}

/** Parágrafo de skeleton: n linhas, a última mais curta. */
export function SkeletonTexto({ linhas = 3 }: { linhas?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }} aria-hidden>
      {Array.from({ length: linhas }, (_, i) => (
        <Skeleton key={i} largura={i === linhas - 1 ? '62%' : '100%'} />
      ))}
    </div>
  );
}
