/* Modal (ATENVO-DESIGN.md §7): glass forte sobre véu com blur 8px, raio xl,
 * 480px para confirmação e 640px (size="lg") para formulário.
 * Comportamento herdado do Modal antigo do app (Esc, clique-fora, autofoco),
 * reimplementado aqui para a biblioteca não depender do CSS legado. */
import { useEffect, useRef, type ReactNode } from 'react';
import './ui.css';

export interface UiModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
  /** false durante um salvamento: clique-fora não fecha no meio da operação */
  closeOnBackdrop?: boolean;
}

export function Modal({ open, onClose, title, children, footer, size = 'md', closeOnBackdrop = true }: UiModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // depende SÓ de `open`: o autofoco roda uma vez na abertura, nunca a cada tecla
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      cardRef.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    }, 30);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="ui-modal-overlay"
      onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}
    >
      <div ref={cardRef} className={['ui-modal', size === 'lg' ? 'ui-modal--lg' : ''].filter(Boolean).join(' ')} role="dialog" aria-modal="true">
        {title != null && <div className="ui-modal__head">{title}</div>}
        <div className="ui-modal__body">{children}</div>
        {footer != null && <div className="ui-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
