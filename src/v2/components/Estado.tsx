import type { ReactNode } from 'react';
import { BotaoSec } from './Botao';
import './componentes.css';

type EstadoProps = {
  /** Glifo discreto (ex.: "◌", "!"). Sem ícone estilizado fora do inventário. */
  icone?: ReactNode;
  titulo: ReactNode;
  descricao?: ReactNode;
  acao?: { rotulo: string; onClick: () => void };
};

/** Estado desenhado (contrato, item 7): vazio = mensagem + ação. */
export function EstadoVazio({ icone = '◌', titulo, descricao, acao }: EstadoProps) {
  return (
    <div className="estado">
      <div className="ic" aria-hidden>{icone}</div>
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
      <div className="ic" aria-hidden>!</div>
      <div className="t">{titulo}</div>
      {descricao && <div className="s">{descricao}</div>}
      <div className="acao">
        <BotaoSec mini onClick={aoTentarDeNovo}>Tentar de novo</BotaoSec>
      </div>
    </div>
  );
}
