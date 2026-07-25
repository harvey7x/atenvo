/* Dropdown (ATENVO-DESIGN.md §7): popover glass forte, itens de 13px com hover
 * surface-2. Fecha em Esc, clique-fora e ao selecionar. Item destrutivo usa a
 * mesma linguagem do botão destructive (texto --danger, hover --danger-tint). */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import './ui.css';

export interface DropdownItem {
  label: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function Dropdown({ trigger, items, align = 'left' }: {
  /** o gatilho recebe onClick/aria de fora — normalmente um <Button variant="secondary"> */
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode;
  items: (DropdownItem | 'sep')[];
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className="ui-dd" ref={rootRef}>
      {trigger({ onClick: () => setOpen((v) => !v), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && (
        <div className="ui-menu" role="menu" style={align === 'right' ? { left: 'auto', right: 0 } : undefined}>
          {items.map((it, i) =>
            it === 'sep' ? (
              <div key={i} className="ui-menu__sep" role="separator" />
            ) : (
              <button
                key={i}
                role="menuitem"
                className={['ui-menu-item', it.danger ? 'ui-menu-item--danger' : ''].filter(Boolean).join(' ')}
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onSelect(); }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
