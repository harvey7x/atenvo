import type { ReactNode } from 'react';
import './componentes.css';

export type TomStatus = 'ok' | 'atencao' | 'erro' | 'neutro';

const TOM: Record<TomStatus, string> = {
  ok: 's-ok',
  atencao: 's-at',
  erro: 's-er',
  neutro: 's-ne',
};

/** Badge de status com ponto (.st do mockup). O erro pulsa em glow (× --fx). */
export function BadgeStatus({ tom, children }: { tom: TomStatus; children: ReactNode }) {
  return (
    <span className={`st ${TOM[tom]}`}>
      <i aria-hidden />
      {children}
    </span>
  );
}
