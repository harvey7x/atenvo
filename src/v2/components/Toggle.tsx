import { useId, type ReactNode } from 'react';
import './componentes.css';

type ToggleProps = {
  ligado: boolean;
  aoMudar: (ligado: boolean) => void;
  /** Nome acessível (aria-label) quando o toggle está solto. */
  rotulo?: string;
  /** id do elemento que rotula o toggle (aria-labelledby). */
  rotuladoPor?: string;
  disabled?: boolean;
};

/** Toggle platina (.tgl do mockup): ligado = trilho claro, bolinha escura à direita. */
export function Toggle({ ligado, aoMudar, rotulo, rotuladoPor, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      aria-labelledby={rotuladoPor}
      disabled={disabled}
      className={ligado ? 'tgl' : 'tgl off'}
      onClick={() => aoMudar(!ligado)}
    />
  );
}

type LinhaToggleProps = Omit<ToggleProps, 'rotuladoPor'> & {
  titulo: ReactNode;
  descricao?: ReactNode;
};

/** Linha de configuração com toggle + título + descrição (.tgl-l do mockup). */
export function LinhaToggle({ titulo, descricao, ...toggle }: LinhaToggleProps) {
  const idTitulo = useId();
  return (
    <div className="tgl-l">
      <Toggle {...toggle} rotuladoPor={idTitulo} />
      <div>
        <span id={idTitulo}>{titulo}</span>
        {descricao && <div className="d">{descricao}</div>}
      </div>
    </div>
  );
}
