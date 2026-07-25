/* Tabela densa (ATENVO-DESIGN.md §7): linhas 36–40px, sem zebra, divisor hairline,
 * hover surface-2, header 11px muted em sentence case, números à direita com
 * tabular-nums (use <Td num>). Wrapper com scroll horizontal próprio. */
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import './ui.css';

export function Table({ children, className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="ui-table-wrap">
      <table className={['ui-table', className ?? ''].join(' ').trim()} {...rest}>{children}</table>
    </div>
  );
}

export function Th({ num, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { num?: boolean }) {
  return <th className={num ? 'ui-td-num' : undefined} {...rest}>{children}</th>;
}

export function Td({ num, meta, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement> & { num?: boolean; meta?: boolean }) {
  return (
    <td className={[num ? 'ui-td-num' : '', meta ? 'ui-td-meta' : ''].filter(Boolean).join(' ') || undefined} {...rest}>
      {children}
    </td>
  );
}
