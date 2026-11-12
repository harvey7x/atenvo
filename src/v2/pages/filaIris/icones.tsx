/* Fila da Iris — ícones de traço (mesma família de shell/icones.tsx e pendencias/icones.tsx:
   viewBox 24, stroke 1.7, sem preenchimento, pontas redondas). Zero emoji no cromo. */
import type { ReactNode } from 'react';
import type { Categoria } from './dados';

function Svg({ t = 16, children, sw = 1.7 }: { t?: number; children: ReactNode; sw?: number }) {
  return (
    <svg width={t} height={t} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {children}
    </svg>
  );
}
type P = { t?: number };

export const IcChama = ({ t = 16 }: P) => (
  <Svg t={t}>
    <path d="M12 21c-3.9 0-6.5-2.7-6.5-6.3 0-3.2 2.3-5.3 3.5-7.5.6 1.7 1.5 2.7 2.5 3.2.2-3.3 1.6-5.9 4.1-7.4-.4 2.9.7 4.7 1.9 6.4 1 1.4 1.5 2.8 1.5 4.6C19 18.3 16 21 12 21z" />
    <path d="M12 21c-1.5 0-2.7-1-2.7-2.6 0-1.5 1-2.4 1.8-3.6.9 1.8 3.6 2.3 3.6 4.1 0 1.2-1.1 2.1-2.7 2.1z" />
  </Svg>
);
export const IcDoc = ({ t = 16 }: P) => (
  <Svg t={t}><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Svg>
);
export const IcSemResposta = ({ t = 16 }: P) => (
  <Svg t={t}>
    <path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.8L3 20l1-4.9a8.3 8.3 0 01-1-4A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" />
    <path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" strokeWidth={2.4} />
  </Svg>
);
export const IcIris = ({ t = 16 }: P) => (
  <Svg t={t}>
    <path d="M11 3.5l1.7 4.4 4.4 1.7-4.4 1.7L11 15.7l-1.7-4.4-4.4-1.7 4.4-1.7z" />
    <path d="M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </Svg>
);
export const IcConversa = ({ t = 16 }: P) => (
  <Svg t={t}><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.8L3 20l1-4.9a8.3 8.3 0 01-1-4A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" /></Svg>
);
export const IcTelefone = ({ t = 16 }: P) => (
  <Svg t={t}><path d="M5 4h3l2 5-2.5 1.5a11 11 0 006 6L15 14l5 2v3a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" /></Svg>
);
export const IcCheck = ({ t = 14 }: P) => <Svg t={t} sw={2}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IcX = ({ t = 12 }: P) => <Svg t={t} sw={2.1}><path d="M7 7l10 10M17 7L7 17" /></Svg>;
export const IcRelogio = ({ t = 14 }: P) => <Svg t={t}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const IcInfo = ({ t = 14 }: P) => <Svg t={t}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></Svg>;
export const IcSeta = ({ t = 14 }: P) => <Svg t={t}><path d="M9 6l6 6-6 6" /></Svg>;
export const IcVoltar = ({ t = 14 }: P) => <Svg t={t}><path d="M15 18l-6-6 6-6" /></Svg>;
export const IcSair = ({ t = 16 }: P) => (
  <Svg t={t}><path d="M10 12h10M16.5 8.5L20 12l-3.5 3.5M14 4H6a2 2 0 00-2 2v12a2 2 0 002 2h8" /></Svg>
);
export const IcPlay = ({ t = 12 }: P) => <Svg t={t} sw={0}><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></Svg>;
export const IcChave = ({ t = 14 }: P) => (
  <Svg t={t}><circle cx="8" cy="15" r="4" /><path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2" /></Svg>
);
export const IcCopiar = ({ t = 12 }: P) => (
  <Svg t={t}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></Svg>
);
export const IcBusca = ({ t = 14 }: P) => <Svg t={t}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></Svg>;
export const IcMais = ({ t = 14 }: P) => <Svg t={t} sw={1.9}><path d="M12 5v14M5 12h14" /></Svg>;
export const IcMarca = ({ t = 14 }: P) => (
  <Svg t={t}><path d="M6 3.5h12a1 1 0 011 1V21l-7-4.5L5 21V4.5a1 1 0 011-1z" /></Svg>
);
export const IcBaixo = ({ t = 12 }: P) => <Svg t={t} sw={1.9}><path d="M6 9l6 6 6-6" /></Svg>;
export const IcAlvo = ({ t = 16 }: P) => (
  <Svg t={t}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12h.01" strokeWidth={2.6} /></Svg>
);

export const IcAssinado = ({ t = 16 }: P) => (
  <Svg t={t}><path d="M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3z" /><path d="M14 8l3 3M13 20h7" /></Svg>
);
export function IcCategoria({ cat, t = 16 }: { cat: Categoria; t?: number }) {
  if (cat === 'historico') return <IcAssinado t={t} />;
  if (cat === 'quente') return <IcChama t={t} />;
  if (cat === 'documentacao') return <IcDoc t={t} />;
  return <IcSemResposta t={t} />;
}
