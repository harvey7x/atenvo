import type { CSSProperties, ReactNode } from 'react';
import './componentes.css';

export type CorSeg = 'verde' | 'ambar' | 'rubro' | 'neutro';

type StatusBarProps = {
  segmentos: {
    cor: CorSeg;
    texto: ReactNode;
    /** Glow estático no ponto (no mockup, só o canal operante tem). */
    brilho?: boolean;
  }[];
  /** Assinatura à direita (ex.: "ATENVO · CAF ASSESSORIA"). */
  fim?: ReactNode;
  /** Entrada em cascata (.sobe) com atraso em segundos. */
  sobe?: boolean;
  atraso?: number;
  className?: string;
  style?: CSSProperties;
};

/** Barra de status de rodapé em vidro (.status-bar do mockup). */
export function StatusBar({ segmentos, fim, sobe, atraso, className, style }: StatusBarProps) {
  const cls = ['status-bar', 'vidro', sobe ? 'sobe' : '', className ?? ''].filter(Boolean).join(' ');
  const estilo: CSSProperties | undefined =
    sobe && atraso ? { ...style, animationDelay: `${atraso}s` } : style;
  return (
    <div className={cls} style={estilo}>
      {segmentos.map((s, i) => (
        <span className="seg" key={i}>
          <i className={s.brilho ? `${s.cor} brilho` : s.cor} aria-hidden />
          {s.texto}
        </span>
      ))}
      {fim && <span className="fim">{fim}</span>}
    </div>
  );
}
