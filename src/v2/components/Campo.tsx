import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import './componentes.css';

/** Input padrão (.inp do mockup). Use dentro de <Campo> ou solto. */
export function Input({ className, ...resto }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={['inp', className ?? ''].filter(Boolean).join(' ')} {...resto} />;
}

type CampoProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> & {
  rotulo: ReactNode;
  /**
   * Substitui o input padrão (ex.: select/textarea com a classe .inp).
   * O id do rótulo é injetado no elemento (ou passado à render-prop),
   * mantendo a associação label↔controle. Nesse caminho, as demais
   * props de input são ignoradas.
   */
  children?: ReactElement<{ id?: string }> | ((id: string) => ReactNode);
};

/** Rótulo + controle (.campo do mockup), sempre associados por htmlFor/id. */
export function Campo({ rotulo, children, id, ...resto }: CampoProps) {
  const idGerado = useId();
  const idFinal = id ?? idGerado;

  let controle: ReactNode;
  if (typeof children === 'function') controle = children(idFinal);
  else if (isValidElement(children)) controle = cloneElement(children, { id: children.props.id ?? idFinal });
  else controle = <Input id={idFinal} {...resto} />;

  return (
    <div className="campo">
      <label htmlFor={idFinal}>{rotulo}</label>
      {controle}
    </div>
  );
}
