import { Children, type ButtonHTMLAttributes, type ReactNode } from 'react';
import './componentes.css';

type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Versão compacta (.btn-mini do mockup). */
  mini?: boolean;
};

function classes(base: string, mini?: boolean, extra?: string) {
  return ['p-btn', base, mini ? 'btn-mini' : '', extra ?? ''].filter(Boolean).join(' ');
}

/* Glifo de texto no começo do rótulo ("＋ Novo cliente", "⇩ Exportar", "◆ Foco", "★ Favoritos") →
   ícone de traço (16px, traço 1,5 — o mesmo da barra lateral). Régua da ALFA: nunca caractere de
   texto como ícone. O glifo continua no DOM (aria-hidden) só para fora da ALFA, onde o CSS esconde
   o svg e mostra o glifo como sempre foi. */
const TRACOS: Record<string, ReactNode> = {
  '＋': <path d="M12 5v14M5 12h14" />,
  '+': <path d="M12 5v14M5 12h14" />,
  '⇩': <path d="M12 4.5v10.5M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />,
  '◆': <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /></>,
  '★': <path d="M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.55L12 16.6l-5 2.6.95-5.55L3.9 9.7l5.6-.8z" />,
};
const RE_GLIFO = /^\s*([＋+⇩◆★])\s+(?=\S)/;

export function comIconeDeGlifo(children: ReactNode): ReactNode {
  const lista = Children.toArray(children);
  const primeiro = lista[0];
  if (typeof primeiro !== 'string') return children;
  const m = primeiro.match(RE_GLIFO);
  if (!m) return children;
  const resto = primeiro.slice(m[0].length);
  return (
    <>
      <svg className="btn-ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {TRACOS[m[1]]}
      </svg>
      <span className="btn-ic-glifo" aria-hidden>{m[1]}</span>
      {resto}
      {lista.slice(1)}
    </>
  );
}

/** Ação primária platina — no máximo uma por tela (contrato + manual de extensão). */
export function BotaoPrimario({ mini, className, type = 'button', children, ...resto }: BotaoProps) {
  return <button type={type} className={classes('btn-pri', mini, className)} {...resto}>{comIconeDeGlifo(children)}</button>;
}

/** Ação secundária em vidro. */
export function BotaoSec({ mini, className, type = 'button', children, ...resto }: BotaoProps) {
  return <button type={type} className={classes('btn-sec', mini, className)} {...resto}>{comIconeDeGlifo(children)}</button>;
}

/** Atalho para o par mais comum do mockup: secundário compacto. */
export function BotaoMini(props: Omit<BotaoProps, 'mini'>) {
  return <BotaoSec mini {...props} />;
}
