import { useEffect, useRef, type ReactNode } from 'react';
import './Modal.css';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** quando false, clicar fora não fecha (ex.: durante loading) */
  closeOnBackdrop?: boolean;
}

/** Modal próprio do Atenvo (tema, foco, Esc, clique-fora). Substitui prompt/alert/confirm. */
export function Modal({ open, onClose, title, children, footer, width = 440, closeOnBackdrop = true }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  // Depende SOMENTE de `open` — o auto-foco roda uma vez na abertura, nunca a cada
  // render (senão re-focaria o primeiro campo a cada tecla digitada).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => {
      const el = cardRef.current?.querySelector<HTMLElement>('input,textarea,select,button');
      el?.focus();
    }, 30);
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="atv-modal-overlay" onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget) onClose(); }}>
      <div className="atv-modal" ref={cardRef} style={{ width }} role="dialog" aria-modal="true">
        {title != null && <div className="atv-modal-head">{title}</div>}
        <div className="atv-modal-body">{children}</div>
        {footer != null && <div className="atv-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
