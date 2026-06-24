import type { ReactNode } from 'react';

export type IconName =
  | 'whatsapp' | 'facebook' | 'kanban' | 'contatos' | 'scripts' | 'cobrancas'
  | 'integracoes' | 'relatorios' | 'configuracoes' | 'plano'
  | 'sun' | 'moon' | 'bell' | 'logout' | 'chevron-right' | 'chevron-down'
  | 'check' | 'lock' | 'sync' | 'plus' | 'building' | 'users';

const P: Record<IconName, ReactNode> = {
  whatsapp: <path d="M12 2a9.9 9.9 0 0 0-8.5 15l-1.3 4.8 4.9-1.3A9.9 9.9 0 1 0 12 2zm0 18.1a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 1 1 12 20.1zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.1-.6 0a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.3-1.7c-.2-.3 0-.4.1-.5l.4-.5.3-.4v-.4l-.9-2c-.2-.5-.4-.4-.6-.5h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.6 11.6 0 0 0 4.5 3.9c.6.3 1.1.4 1.5.5a3.6 3.6 0 0 0 1.6.1 2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.5-.3z" />,
  facebook: <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H8v-2.9h2.4V9.8c0-2.4 1.4-3.7 3.6-3.7 1 0 2.1.2 2.1.2v2.3h-1.2c-1.2 0-1.5.7-1.5 1.4V12H16l-.4 2.9h-2.2v7A10 10 0 0 0 22 12z" />,
  kanban: <><rect x="3" y="4" width="5" height="16" rx="1.3" /><rect x="10" y="4" width="5" height="11" rx="1.3" /><rect x="17" y="4" width="4" height="14" rx="1.3" /></>,
  contatos: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.2a3.2 3.2 0 0 1 0 6.3M21.5 20a6.5 6.5 0 0 0-4-6" /></>,
  scripts: <><rect x="4" y="3" width="16" height="18" rx="2.2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  cobrancas: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M14.6 9.3c-.7-.9-3.7-1.4-3.7.6 0 1.9 3.7 1 3.7 2.9 0 2-3 1.5-3.7.6" /></>,
  integracoes: <><path d="M10.5 13.5a4.5 4.5 0 0 0 6.4 0l2.3-2.3a4.5 4.5 0 0 0-6.4-6.4L11.5 6" /><path d="M13.5 10.5a4.5 4.5 0 0 0-6.4 0l-2.3 2.3a4.5 4.5 0 0 0 6.4 6.4L12.5 18" /></>,
  relatorios: <><path d="M4 20V4M4 20h16" /><rect x="7" y="11" width="3" height="6" rx="1" /><rect x="12" y="7" width="3" height="10" rx="1" /><rect x="17" y="13" width="3" height="4" rx="1" /></>,
  configuracoes: <><circle cx="12" cy="12" r="3" /><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V20a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.6 18l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 12.6H4a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 6 6.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8z" /></>,
  plano: <><rect x="2.5" y="5.5" width="19" height="13" rx="2.4" /><path d="M2.5 9.5h19" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6 19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4 19 5" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  check: <path d="M5 13l4 4L19 7" />,
  lock: <><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  sync: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 21v-4h6v4M8 7h2M14 7h2M8 11h2M14 11h2" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.2a3.2 3.2 0 0 1 0 6.3M21.5 20a6.5 6.5 0 0 0-4-6" /></>,
};

/** ícones "filled" (usam fill em vez de stroke) */
const FILLED: Partial<Record<IconName, boolean>> = { whatsapp: true, facebook: true };

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const filled = FILLED[name];
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? undefined : 'currentColor'}
      strokeWidth={filled ? undefined : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}
