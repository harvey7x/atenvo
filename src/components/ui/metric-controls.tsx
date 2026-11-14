'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import type { ChartView } from './metric-chart';

/**
 * Os dois controles do cabeçalho do card: a troca entre a curva e as barras e o menu do período. As classes pmc-* moram
 * no CSS do card (progress-metric-card.tsx).
 */

export interface PeriodOption {
  label: string;
  /** Quantos pontos do fim entram; sem points, todos. */
  points?: number;
}

/** Um ícone de traço de 24 × 24 (o desenho dos ícones lucide), desenhado aqui para não precisar de pacote. */
export function Icon({
  size,
  strokeWidth = 2,
  className,
  style,
  children,
}: {
  size: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const VIEWS: { key: ChartView; label: string; icon: ReactNode }[] = [
  {
    key: 'curve',
    label: 'Curva',
    icon: (
      <>
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="m19 9-5 5-4-4-3 3" />
      </>
    ),
  },
  {
    key: 'bar',
    label: 'Barras',
    icon: (
      <>
        <path d="M3 3v16a2 2 0 0 0 2 2h16" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </>
    ),
  },
];

interface ViewToggleProps {
  value: ChartView;
  onChange: (view: ChartView) => void;
}

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="pmc-toggle" role="group" aria-label="Tipo de gráfico">
      {VIEWS.map(({ key, label, icon }) => (
        <button
          key={key}
          type="button"
          className="pmc-toggle__btn"
          aria-pressed={value === key}
          aria-label={label}
          title={label}
          onClick={() => onChange(key)}
        >
          <Icon size={15}>{icon}</Icon>
        </button>
      ))}
    </div>
  );
}

interface PeriodSelectProps {
  value: string;
  options: PeriodOption[];
  onChange: (option: PeriodOption) => void;
  accentText?: string;
}

export function PeriodSelect({ value, options, onChange, accentText }: PeriodSelectProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();

  // Aberto, o menu fecha no clique fora e no Esc. O Esc fica com o menu (não fecha também um modal em volta) e o foco
  // volta ao botão.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
      if (root.current?.contains(document.activeElement)) button.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Pelo teclado, as setas andam entre as opções (e abrem o menu a partir do botão).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role=option]') ?? [])];
    if (!open || !items.length) {
      setOpen(true);
      requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus());
      return;
    }
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = at < 0 ? 0 : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  };

  return (
    <div
      ref={root}
      className="pmc-period"
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (open && !root.current?.contains(e.relatedTarget as Node | null) && e.relatedTarget) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="pmc-period__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {value}
        <Icon size={16} className="pmc-period__chevron">
          <path d="m6 9 6 6 6-6" />
        </Icon>
      </button>
      {open && (
        <div id={listId} role="listbox" aria-label="Período" className="pmc-menu">
          {options.map((option) => {
            const selected = option.label === value;
            return (
              <button
                key={option.label}
                type="button"
                role="option"
                aria-selected={selected}
                className="pmc-menu__option"
                onClick={() => {
                  onChange(option);
                  setOpen(false);
                  button.current?.focus();
                }}
              >
                {option.label}
                {selected && (
                  <Icon size={14} style={{ color: accentText }}>
                    <path d="M20 6 9 17l-5-5" />
                  </Icon>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
