/* Portabilidades — ícones de traço (mesma família de shell/icones.tsx: viewBox 24,
   stroke 1.7, sem preenchimento, pontas redondas). Zero emoji no cromo. */
import type { ReactNode } from 'react';
import type { Situacao } from '@/data/portabilidades';

function Svg({ t = 16, children, sw = 1.7 }: { t?: number; children: ReactNode; sw?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {children}
    </svg>
  );
}
type P = { t?: number };

export const IcMais = ({ t = 14 }: P) => <Svg t={t} sw={1.9}><path d="M12 5v14M5 12h14" /></Svg>;
export const IcX = ({ t = 14 }: P) => <Svg t={t} sw={1.9}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IcCheck = ({ t = 14 }: P) => <Svg t={t} sw={2}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IcBusca = ({ t = 15 }: P) => <Svg t={t}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Svg>;
export const IcConversa = ({ t = 16 }: P) => (
  <Svg t={t}><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.8L3 20l1-4.9a8.3 8.3 0 01-1-4A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" /></Svg>
);
export const IcLapis = ({ t = 14 }: P) => <Svg t={t}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Svg>;
export const IcLixo = ({ t = 16 }: P) => <Svg t={t}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Svg>;
export const IcMaisAcoes = ({ t = 16 }: P) => (
  <Svg t={t} sw={2.2}><path d="M5 12h.01M12 12h.01M19 12h.01" /></Svg>
);
export const IcAlerta = ({ t = 16 }: P) => <Svg t={t}><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></Svg>;
export const IcInfo = ({ t = 16 }: P) => <Svg t={t}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></Svg>;
export const IcPessoa = ({ t = 16 }: P) => <Svg t={t}><circle cx="12" cy="8" r="3.6" /><path d="M5 20c.7-4 3.4-6 7-6s6.3 2 7 6" /></Svg>;
export const IcNota = ({ t = 16 }: P) => <Svg t={t}><path d="M5 4h10l4 4v12H5z" /><path d="M14 4v5h5M8.5 13h7M8.5 16.5h4.5" /></Svg>;
export const IcDesfazer = ({ t = 13 }: P) => <Svg t={t}><path d="M4 9h11a5 5 0 010 10H9" /><path d="M8 5L4 9l4 4" /></Svg>;

/* etapas */
export const IcAceite = ({ t = 16 }: P) => <Svg t={t}><circle cx="9" cy="8" r="3.4" /><path d="M3.5 20c.6-3.4 2.8-5 5.5-5 1.6 0 3 .5 4 1.6" /><path d="M15 17.5l2 2 4-4.5" /></Svg>;
export const IcCadeado = ({ t = 16 }: P) => <Svg t={t}><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V7.5a3.5 3.5 0 016.8-1.2" /><path d="M12 14.5v2" /></Svg>;
export const IcLink = ({ t = 16 }: P) => (
  <Svg t={t}><path d="M10 14a4.5 4.5 0 006.4 0l3-3a4.5 4.5 0 00-6.4-6.4l-1.3 1.3" /><path d="M14 10a4.5 4.5 0 00-6.4 0l-3 3a4.5 4.5 0 006.4 6.4l1.3-1.3" /></Svg>
);
export const IcBandeira = ({ t = 16 }: P) => <Svg t={t}><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></Svg>;

/* vistas da navegação */
export function IcVista({ v, t = 16 }: { v: Situacao; t?: number }) {
  if (v === 'aguardando_aceite') return <Svg t={t}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
  if (v === 'em_andamento') return <Svg t={t}><path d="M4 12h11" /><path d="M11 7l5 5-5 5" /><path d="M20 5v14" /></Svg>;
  if (v === 'concluida') return <Svg t={t}><circle cx="12" cy="12" r="8.5" /><path d="M8 12.3l2.8 2.8L16.2 9.6" /></Svg>;
  return <Svg t={t}><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></Svg>;
}
