/* Radar de Atendimento — ícones de traço (sem emoji). Ícone diz a CATEGORIA; a cor diz a urgência. */
import type { SVGProps } from 'react';

type P = { tamanho?: number; className?: string };

function Svg({ tamanho = 14, className, children, ...resto }: P & SVGProps<SVGSVGElement>) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" className={className} {...resto}>
      {children}
    </svg>
  );
}

/** Em negociação: balão de conversa com relógio. */
export const IcNegociacao = (p: P) => (
  <Svg {...p}><path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.5z" /><path d="M12 7.5V12l2.8 1.6" /></Svg>
);

/** Cliente fechado: selo com visto. */
export const IcFechado = (p: P) => (
  <Svg {...p}>
    <path d="M12 2.8l2.1 1.5 2.6-.1.8 2.5 2.1 1.5-.8 2.5.8 2.5-2.1 1.5-.8 2.5-2.6-.1L12 21.2l-2.1-1.5-2.6.1-.8-2.5-2.1-1.5.8-2.5-.8-2.5 2.1-1.5.8-2.5 2.6.1z" />
    <path d="M8.9 12.1l2.1 2.1 4.1-4.3" />
  </Svg>
);

/** Ligar: telefone. */
export const IcLigar = (p: P) => (
  <Svg {...p}><path d="M5.2 3.8h3.1l1.6 4.1-2.1 1.3a11.5 11.5 0 0 0 5.4 5.4l1.3-2.1 4.1 1.6v3.1a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 3.2 6a2 2 0 0 1 2-2.2z" /></Svg>
);

/** Decisões de repasse: setas em sentidos opostos. */
export const IcDecisao = (p: P) => (
  <Svg {...p}><path d="M4 8h13.5M14 4.5L17.5 8 14 11.5" /><path d="M20 16H6.5M10 12.5L6.5 16l3.5 3.5" /></Svg>
);

/** Pedido do gestor: sino. */
export const IcGestor = (p: P) => (
  <Svg {...p}><path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.8 8.5 2.8 8.5H3.2S6 15 6 8.5" /><path d="M10.3 20.5a1.9 1.9 0 0 0 3.4 0" /></Svg>
);

/** Radar (marca da central). */
export const IcRadar = (p: P) => (
  <Svg {...p}><path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 7.5a4.5 4.5 0 1 0 4.5 4.5" /><path d="M12 12l6.5-6.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></Svg>
);

/** Prioridade — documentação enviada. */
export const IcDocumento = (p: P) => (
  <Svg {...p}><path d="M14 3H7.5A2 2 0 0 0 5.5 5v14a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7.5z" /><path d="M14 3v4.5h4.5M9 13h6M9 16.5h4" /></Svg>
);

/** Prioridade — interesse confirmado: alvo. */
export const IcInteresse = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></Svg>
);

/** Em dia / vazio: visto num círculo. */
export const IcEmDia = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8.3 12.2l2.5 2.5 4.9-5.1" /></Svg>
);

/** Repasse registrado ("Era de"): seta que dobra. */
export const IcEraDe = (p: P) => (
  <Svg {...p}><path d="M5 5v6.5a3 3 0 0 0 3 3h11" /><path d="M15.5 11l3.5 3.5-3.5 3.5" /></Svg>
);

/** Avançar (botão principal). */
export const IcSeta = (p: P) => (
  <Svg {...p}><path d="M5 12h13M13 7l5 5-5 5" /></Svg>
);

/** Destaque (líder de conversão no painel): estrela de traço. */
export const IcDestaque = (p: P) => (
  <Svg {...p}><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" /></Svg>
);
