/* Botão do design system (ATENVO-DESIGN.md §7).
 * 4 variantes; "primary" é NO MÁXIMO 1 por vista — regra de quem usa, não daqui.
 * loading usa o pulso sancionado do skeleton (única animação repetitiva permitida)
 * e trava o clique; disabled apaga o texto (--text-disabled), nunca opacity. */
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import './ui.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, disabled, children, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      className={[
        'ui-btn',
        `ui-btn--${variant}`,
        size !== 'md' ? `ui-btn--${size}` : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="ui-btn__dot" aria-hidden="true" />}
      {children}
    </button>
  );
});
