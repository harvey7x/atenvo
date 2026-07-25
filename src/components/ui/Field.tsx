/* Campos de formulário (ATENVO-DESIGN.md §7: input/select/textarea).
 * Field é o invólucro com rótulo (12px, secundário, sentence case) + dica/erro.
 * O erro NUNCA usa --text-muted: informação essencial não vai em muted (regra §8). */
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import './ui.css';

export function Field({ label, hint, error, children }: {
  label?: string; hint?: string; error?: string; children: ReactNode;
}) {
  return (
    <label className="ui-field">
      {label && <span className="ui-field__label">{label}</span>}
      {children}
      {error
        ? <span className="ui-field__error" role="alert">{error}</span>
        : hint && <span className="ui-field__hint">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={['ui-input', className ?? ''].join(' ').trim()} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={['ui-textarea', className ?? ''].join(' ').trim()} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    const id = useId();
    return (
      <span className="ui-select-wrap">
        <select ref={ref} id={rest.id ?? id} className={['ui-select', className ?? ''].join(' ').trim()} {...rest}>
          {children}
        </select>
        <ChevronDown size={16} strokeWidth={1.5} aria-hidden="true" />
      </span>
    );
  },
);
