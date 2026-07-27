import type { ReactNode } from 'react';
import './componentes.css';

/** Linha de chips de filtro (.chips do mockup). */
export function Chips({ children }: { children: ReactNode }) {
  return <div className="chips">{children}</div>;
}

type ChipProps = {
  ativo?: boolean;
  /** Chip "Limpar" (borda tracejada, apagado). */
  limpar?: boolean;
  onClick?: () => void;
  /** Mostra o × de remoção quando ativo. */
  removivel?: boolean;
  children: ReactNode;
};

export function Chip({ ativo, limpar, onClick, removivel, children }: ChipProps) {
  const cls = ['chip', ativo ? 'on' : '', limpar ? 'limpar' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} aria-pressed={ativo}>
      {children}
      {removivel && ativo && <span className="x" aria-hidden>×</span>}
    </button>
  );
}
