/* Skeleton (ATENVO-DESIGN.md §7): --surface-2 com o pulso sutil — a única animação
 * repetitiva permitida pelo documento (e desligada em prefers-reduced-motion). */
import './ui.css';

export function Skeleton({ width, height = 10, circle = false }: {
  width?: number | string; height?: number | string; circle?: boolean;
}) {
  return (
    <span
      className={['ui-skel', circle ? 'ui-skel--circle' : ''].filter(Boolean).join(' ')}
      style={{ width: width ?? (circle ? height : '100%'), height }}
      aria-hidden="true"
    />
  );
}
