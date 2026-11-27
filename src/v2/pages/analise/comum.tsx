/* Peças visuais compartilhadas pelas telas da Análise INSS (padrão Reviza:
   tokens v2, zero emoji no cromo — nível = selo com ponto + texto). */
import { useState, type ReactNode } from 'react';
import { BadgeStatus, CardVidro, type TomStatus } from '../../components';
import type { Paragrafo, Tom } from './conteudo';

const TOM_STATUS: Record<Tom, TomStatus> = { alerta: 'erro', atencao: 'atencao', ok: 'ok', neutro: 'neutro' };

export function Selo({ tom, children }: { tom: Tom; children: ReactNode }) {
  return <BadgeStatus tom={TOM_STATUS[tom]}>{children}</BadgeStatus>;
}

/* ---------------------------------------------------------- ícones (traço fino) */
const svgBase = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
};
export function IconeEnviar({ tam = 26 }: { tam?: number }) {
  return <svg width={tam} height={tam} viewBox="0 0 24 24" {...svgBase}><path d="M12 16V4M8 8l4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>;
}
export function IconeDocumento({ tam = 14 }: { tam?: number }) {
  return <svg width={tam} height={tam} viewBox="0 0 24 24" {...svgBase}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></svg>;
}
export function IconeLupa({ tam = 14 }: { tam?: number }) {
  return <svg width={tam} height={tam} viewBox="0 0 24 24" {...svgBase}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>;
}
export function IconeSeta({ tam = 18 }: { tam?: number }) {
  return <svg width={tam} height={tam} viewBox="0 0 24 24" {...svgBase}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
export function IconeCadeado({ tam = 13 }: { tam?: number }) {
  return <svg width={tam} height={tam} viewBox="0 0 24 24" {...svgBase}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
}

/* ---------------------------------------------------------- cabeçalho de tela */
export interface ItemIdent { rotulo: string; valor: ReactNode }

export function CabecalhoTela({ titulo, sub, ident, tom, children }: {
  titulo: ReactNode;
  sub?: ReactNode;
  ident?: ItemIdent[];
  /** padrão = acento da marca; alerta/atencao para erro e "sem dados" */
  tom?: 'alerta' | 'atencao';
  children?: ReactNode;
}) {
  return (
    <CardVidro sobe className={'an-cab' + (tom ? ' an-cab-' + tom : '')}>
      <h3 className="an-cab-tit">{titulo}</h3>
      {sub && <p className="an-cab-sub">{sub}</p>}
      {ident && ident.length > 0 && (
        <dl className="an-ident">
          {ident.map((it) => (
            <div className="an-ident-item" key={it.rotulo}>
              <dt>{it.rotulo}</dt>
              <dd>{it.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </CardVidro>
  );
}

/* ---------------------------------------------------------- seção */
export function Secao({ id, titulo, conta, children, atraso, refSecao }: {
  id?: string;
  titulo: ReactNode;
  conta?: number;
  children: ReactNode;
  atraso?: number;
  /** registro da seção para a navegação fixa do relatório */
  refSecao?: (el: HTMLElement | null) => void;
}) {
  return (
    <section id={id} ref={refSecao} className="an-sec sobe" style={atraso ? { animationDelay: `${atraso}s` } : undefined}>
      <h4 className="an-sec-tit">
        <span>{titulo}</span>
        {conta !== undefined && <span className="an-sec-conta num">{conta}</span>}
      </h4>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------- aviso em bloco */
export function AvisoBloco({ tom = 'info', titulo, children }: {
  tom?: 'alerta' | 'atencao' | 'info';
  titulo: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={'an-aviso an-aviso-' + tom} role={tom === 'alerta' ? 'alert' : undefined}>
      <span className="an-aviso-ponto" aria-hidden />
      <div className="an-aviso-corpo">
        <div className="an-aviso-tit">{titulo}</div>
        {children && <div className="an-aviso-txt">{children}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- parágrafos ricos */
export function Paragrafos({ ps }: { ps: Paragrafo[] }) {
  return (
    <>
      {ps.map((p, i) => (
        <p className="an-par" key={i}>
          {p.map((tr, k) => (tr.forte
            ? <strong key={k} className={tr.alerta ? 'an-forte-alerta' : undefined}>{tr.t}</strong>
            : <span key={k}>{tr.t}</span>))}
        </p>
      ))}
    </>
  );
}

/* ---------------------------------------------------------- <details> leve:
   o conteúdo (texto bruto, às vezes enorme) só entra no DOM quando aberto */
export function Detalhe({ resumo, children }: { resumo: ReactNode; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <details className="an-det" onToggle={(e) => setAberto((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="an-det-sum">{resumo}</summary>
      {aberto && children}
    </details>
  );
}

export function Giro() {
  return <span className="an-giro" aria-hidden />;
}

export function Rodape({ children }: { children: ReactNode }) {
  return <footer className="an-rodape">{children}</footer>;
}
