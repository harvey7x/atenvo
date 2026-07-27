import type { ButtonHTMLAttributes } from 'react';
import './componentes.css';

type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Versão compacta (.btn-mini do mockup). */
  mini?: boolean;
};

function classes(base: string, mini?: boolean, extra?: string) {
  return ['p-btn', base, mini ? 'btn-mini' : '', extra ?? ''].filter(Boolean).join(' ');
}

/** Ação primária platina — no máximo uma por tela (contrato + manual de extensão). */
export function BotaoPrimario({ mini, className, type = 'button', ...resto }: BotaoProps) {
  return <button type={type} className={classes('btn-pri', mini, className)} {...resto} />;
}

/** Ação secundária em vidro. */
export function BotaoSec({ mini, className, type = 'button', ...resto }: BotaoProps) {
  return <button type={type} className={classes('btn-sec', mini, className)} {...resto} />;
}

/** Atalho para o par mais comum do mockup: secundário compacto. */
export function BotaoMini(props: Omit<BotaoProps, 'mini'>) {
  return <BotaoSec mini {...props} />;
}
