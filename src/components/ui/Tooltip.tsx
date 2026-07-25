/* Tooltip (ATENVO-DESIGN.md §7): bolha 11px em surface-3, aparece em hover E em
 * foco de teclado (focus-within) — quem navega por Tab também precisa ler. */
import type { ReactNode } from 'react';
import './ui.css';

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="ui-tip">
      {children}
      <span className="ui-tip__bubble" role="tooltip">{text}</span>
    </span>
  );
}
