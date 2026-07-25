/* Empty state (ATENVO-DESIGN.md §7): ícone 18px + UMA frase objetiva + botão de
 * ação. Sem ilustração, sem mascote, sem emoji — por documento. */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import './ui.css';

export function EmptyState({ icon: Icon, text, action }: {
  icon: LucideIcon;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-empty">
      <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
      <p className="ui-empty__text">{text}</p>
      {action}
    </div>
  );
}
