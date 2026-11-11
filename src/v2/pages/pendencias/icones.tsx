/* Pendências — ícones de traço (mesma família de shell/icones.tsx: viewBox 24,
   stroke 1.7, sem preenchimento, pontas redondas). Zero emoji no cromo. */
import type { ReactNode } from 'react';
import type { StatusPendencia, TipoBloco, TipoPendencia } from '@/data/pendencias';

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
export const IcVoltar = ({ t = 18 }: P) => <Svg t={t} sw={1.9}><path d="M15 18l-6-6 6-6" /></Svg>;
export const IcSeta = ({ t = 16 }: P) => <Svg t={t}><path d="M9 6l6 6-6 6" /></Svg>;
export const IcConversa = ({ t = 16 }: P) => (
  <Svg t={t}><path d="M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.8-.8L3 20l1-4.9a8.3 8.3 0 01-1-4A8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" /></Svg>
);
export const IcEnviar = ({ t = 16 }: P) => <Svg t={t}><path d="M4 12l16-8-6 16-2.5-6.5z" /><path d="M11.5 13.5L20 4" /></Svg>;
export const IcLembrete = ({ t = 16 }: P) => <Svg t={t}><path d="M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2 2 0 004 0" /></Svg>;
export const IcRetomar = ({ t = 16 }: P) => <Svg t={t}><path d="M4 4v6h6" /><path d="M5.6 15A7.5 7.5 0 107.4 7.2L4 10" /></Svg>;
export const IcPausa = ({ t = 16 }: P) => <Svg t={t}><path d="M9 6v12M15 6v12" /></Svg>;
export const IcPlay = ({ t = 16 }: P) => <Svg t={t}><path d="M8 5l11 7-11 7z" /></Svg>;
export const IcLixo = ({ t = 16 }: P) => <Svg t={t}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></Svg>;
export const IcAjustes = ({ t = 16 }: P) => (
  <Svg t={t}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>
);
export const IcTelefone = ({ t = 16 }: P) => (
  <Svg t={t}><path d="M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1z" /><path d="M11 18h2" /></Svg>
);
export const IcAlerta = ({ t = 16 }: P) => <Svg t={t}><path d="M12 4l9 16H3z" /><path d="M12 10v4" /><path d="M12 17h.01" /></Svg>;
export const IcInfo = ({ t = 16 }: P) => <Svg t={t}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 7.5h.01" /></Svg>;
export const IcCheck = ({ t = 16 }: P) => <Svg t={t} sw={1.9}><path d="M5 12.5l4.5 4.5L19 7" /></Svg>;
export const IcSubir = ({ t = 16 }: P) => <Svg t={t}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></Svg>;
/** relógio (o mesmo desenho da vista "Esperando resposta") */
export const IcRelogio = ({ t = 16 }: P) => <Svg t={t}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const IcLapis = ({ t = 14 }: P) => <Svg t={t}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Svg>;
/** pessoa sem foto (avatar padrão do WhatsApp na prévia) */
export const IcPessoa = ({ t = 18 }: P) => <Svg t={t}><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20a7 7 0 0114 0" /></Svg>;
export const IcBusca = ({ t = 18 }: P) => <Svg t={t}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Svg>;
/** "Mais ações": três pontos preenchidos (a única exceção ao traço, como no sistema) */
export const IcMaisAcoes = ({ t = 16 }: P) => (
  <svg width={t} height={t} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
    <circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" />
  </svg>
);

/** tipo de pedido do juiz */
export function IcPedido({ t: tipo, tam = 16 }: { t: TipoPendencia; tam?: number }) {
  if (tipo === 'reassinatura') return <Svg t={tam}><path d="M4 20h16" /><path d="M14 5l5 5-8 8H6v-5z" /></Svg>;
  if (tipo === 'documento') return <Svg t={tam}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" /><path d="M12 12v6M9 15h6" /></Svg>;
  if (tipo === 'informacao') return <IcInfo t={tam} />;
  return (
    <Svg t={tam}><circle cx="12" cy="12" r="8.5" />
      <circle cx="8" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** item de mensagem (bloco) */
export function IcTipo({ tipo, t = 14 }: { tipo: TipoBloco; t?: number }) {
  /* texto = a letra "T" (três riscos horizontais pareciam alça de arrastar no trilho) */
  if (tipo === 'texto') return <Svg t={t}><path d="M5 7V5h14v2" /><path d="M12 5v14" /><path d="M9 19h6" /></Svg>;
  if (tipo === 'audio') return <Svg t={t}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></Svg>;
  if (tipo === 'imagem') return <Svg t={t}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></Svg>;
  if (tipo === 'video') return <Svg t={t}><rect x="3" y="5" width="13" height="14" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></Svg>;
  return <Svg t={t}><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" /><path d="M14 3v6h6" /></Svg>;
}

export type Vista = StatusPendencia | 'modelos' | 'ajustes';
/** item da navegação */
export function IcVista({ v, t = 16 }: { v: Vista; t?: number }) {
  if (v === 'respondeu') return <IcConversa t={t} />;
  if (v === 'aguardando') return <IcRelogio t={t} />;
  if (v === 'sem_resposta') return <Svg t={t}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 15.5l7-7" /></Svg>;
  if (v === 'resolvida') return <Svg t={t}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.6-4.8" /></Svg>;
  if (v === 'ajustes') return <IcAjustes t={t} />;
  return <Svg t={t}><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 9h8M8 13h8M8 17h5" /></Svg>;
}
