import type { ReactNode } from 'react';

/** Estado vazio padrão para módulos sem dados (ambiente novo / recém-assinante). */
export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '62vh', width: '100%', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 460 }}>
        {icon && (
          <div style={{ width: 56, height: 56, margin: '0 auto 14px', borderRadius: 999, background: 'rgba(25,195,125,.14)', color: '#19C37D', display: 'grid', placeItems: 'center' }}>
            {icon}
          </div>
        )}
        <h2 style={{ margin: '0 0 8px', color: 'var(--text, #e8eaed)', fontSize: 18 }}>{title}</h2>
        <p style={{ margin: 0, color: 'var(--muted, #8b94a3)', lineHeight: 1.5 }}>{text}</p>
        {action && <div style={{ marginTop: 16 }}>{action}</div>}
      </div>
    </div>
  );
}
