/* Card (ATENVO-DESIGN.md §7). Opaco é o padrão para conteúdo denso e listas;
 * glass SÓ em superfície fixa e única (dashboard/destaque) — a regra da seção 4
 * proíbe vidro em item que se repete, e é responsabilidade de quem usa. */
import type { HTMLAttributes } from 'react';
import './ui.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glass?: boolean;
}

export function Card({ glass = false, className, children, ...rest }: CardProps) {
  return (
    <div className={['ui-card', glass ? 'ui-card--glass' : '', className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
