import type { ReactNode } from 'react';
import { BotaoSec } from './Botao';
import './componentes.css';

type EstadoProps = {
  /** Glifo discreto (ex.: "◌", "!"). Na ALFA o glifo de texto dá lugar a um ícone de traço
      (caixa vazia; "!" vira alerta) — o glifo segue no DOM só para o Atenvo. */
  icone?: ReactNode;
  titulo: ReactNode;
  descricao?: ReactNode;
  acao?: { rotulo: string; onClick: () => void };
};

/** Ícone de traço do estado vazio (bandeja vazia, 20px, traço 1,5 — o mesmo da barra lateral). */
function IconeVazio() {
  return (
    <svg className="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 13.5l2.6-7.1A1.5 1.5 0 0 1 7.5 5.4h9a1.5 1.5 0 0 1 1.4 1l2.6 7.1" />
      <path d="M3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5h-5l-1.2 2h-4.6l-1.2-2z" />
    </svg>
  );
}

/** Ícone de traço do estado de erro (círculo com exclamação). */
function IconeErro() {
  return (
    <svg className="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.8v5" />
      <path d="M12 16.2h.01" />
    </svg>
  );
}

/** Estado desenhado (contrato, item 7): vazio = mensagem + ação. */
export function EstadoVazio({ icone = '◌', titulo, descricao, acao }: EstadoProps) {
  // ícone já desenhado (svg/elemento) passa direto; glifo de texto vira o ícone de traço na ALFA
  const glifo = typeof icone === 'string' || typeof icone === 'number';
  return (
    <div className="estado">
      <div className="ic" aria-hidden>
        {glifo ? <>{icone === '!' ? <IconeErro /> : <IconeVazio />}<span className="ic-glifo">{icone}</span></> : icone}
      </div>
      <div className="t">{titulo}</div>
      {descricao && <div className="s">{descricao}</div>}
      {acao && (
        <div className="acao">
          <BotaoSec mini onClick={acao.onClick}>{acao.rotulo}</BotaoSec>
        </div>
      )}
    </div>
  );
}

type EstadoErroProps = {
  titulo?: ReactNode;
  descricao?: ReactNode;
  aoTentarDeNovo: () => void;
};

/** Estado desenhado (contrato, item 7): erro = mensagem + tentar de novo. */
export function EstadoErro({ titulo = 'Algo deu errado', descricao, aoTentarDeNovo }: EstadoErroProps) {
  return (
    <div className="estado" role="alert">
      <div className="ic" aria-hidden><IconeErro /><span className="ic-glifo">!</span></div>
      <div className="t">{titulo}</div>
      {descricao && <div className="s">{descricao}</div>}
      <div className="acao">
        <BotaoSec mini onClick={aoTentarDeNovo}>Tentar de novo</BotaoSec>
      </div>
    </div>
  );
}
