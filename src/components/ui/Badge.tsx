/* Badge/etiqueta (ATENVO-DESIGN.md §7): 11px, raio sm, receita tint.
 * Para cor DINÂMICA vinda do banco (etiquetas, colunas do funil), use `hex`:
 * a tintDeHex dessatura em runtime — nunca a cor viva chapada. */
import type { HTMLAttributes } from 'react';
import { tintDeHex } from '@/lib/tint';
import './ui.css';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Cor livre (dado do banco). Quando presente, vence a variant. */
  hex?: string;
}

export function Badge({ variant = 'neutral', hex, className, style, children, ...rest }: BadgeProps) {
  const tint = hex ? tintDeHex(hex) : null;
  return (
    <span
      className={['ui-badge', tint ? '' : `ui-badge--${variant}`, className ?? ''].filter(Boolean).join(' ')}
      style={tint ? { background: tint.bg, borderColor: tint.border, color: tint.text, ...style } : style}
      {...rest}
    >
      {children}
    </span>
  );
}
