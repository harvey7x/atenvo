import type { HTMLAttributes, ReactNode } from 'react';
import './componentes.css';

export type TomTrilho = 'crit' | 'aten' | 'info';

type TrilhoItemProps = HTMLAttributes<HTMLDivElement> & {
  /** crit = rubro, aten = âmbar, info = branco — trilho com glow (× --fx). */
  tom: TomTrilho;
  titulo: ReactNode;
  sub?: ReactNode;
  /** Conteúdo à direita (hora .h, botão etc.). */
  direita?: ReactNode;
};

/** Item de lista com trilho colorido à esquerda (.li do mockup). */
export function TrilhoItem({ tom, titulo, sub, direita, ...resto }: TrilhoItemProps) {
  return (
    <div className={`li ${tom}`} {...resto}>
      <div>
        <div className="t">{titulo}</div>
        {sub && <div className="s">{sub}</div>}
      </div>
      {direita}
    </div>
  );
}

/** Hora/etiqueta à direita do TrilhoItem (.h do mockup). */
export function TrilhoHora({ children }: { children: ReactNode }) {
  return <div className="h num">{children}</div>;
}
