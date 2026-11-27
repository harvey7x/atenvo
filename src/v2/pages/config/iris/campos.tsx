/* Campos da tela da Iris: rótulo + dica + controle, sempre no mesmo alinhamento (dono: "tudo alinhado, retinho"). */
import { useId, useState, type ReactNode } from 'react';
import { Toggle } from '../../../components';

export function Campo({ rotulo, dica, children, largo }: { rotulo: ReactNode; dica?: ReactNode; children: (id: string) => ReactNode; largo?: boolean }) {
  const id = useId();
  return (
    <div className={'irs-campo' + (largo ? ' largo' : '')}>
      <label htmlFor={id} className="irs-rot">{rotulo}</label>
      {children(id)}
      {dica && <span className="irs-dica">{dica}</span>}
    </div>
  );
}

export function Texto({ rotulo, dica, valor, aoMudar, placeholder, falta, largo, max = 200 }: {
  rotulo: ReactNode; dica?: ReactNode; valor: string; aoMudar: (v: string) => void; placeholder?: string; falta?: boolean; largo?: boolean; max?: number;
}) {
  return (
    <Campo rotulo={<>{rotulo}{falta && !valor.trim() && <span className="irs-falta">falta preencher</span>}</>} dica={dica} largo={largo}>
      {(id) => <input id={id} className={'inp' + (falta && !valor.trim() ? ' irs-inp-falta' : '')} value={valor} maxLength={max} placeholder={placeholder} onChange={(e) => aoMudar(e.target.value)} />}
    </Campo>
  );
}

export function TextoLongo({ rotulo, dica, valor, aoMudar, placeholder, linhas = 3, max = 4000 }: {
  rotulo: ReactNode; dica?: ReactNode; valor: string; aoMudar: (v: string) => void; placeholder?: string; linhas?: number; max?: number;
}) {
  return (
    <Campo rotulo={rotulo} dica={dica} largo>
      {(id) => <textarea id={id} className="inp irs-area" rows={linhas} value={valor} maxLength={max} placeholder={placeholder} onChange={(e) => aoMudar(e.target.value)} />}
    </Campo>
  );
}

export function Numero({ rotulo, dica, valor, aoMudar, min = 0, max = 9999, sufixo }: {
  rotulo: ReactNode; dica?: ReactNode; valor: number; aoMudar: (v: number) => void; min?: number; max?: number; sufixo?: string;
}) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      {(id) => (
        <span className="irs-num">
          <input id={id} className="inp" type="number" inputMode="numeric" min={min} max={max} value={valor}
            onChange={(e) => { const n = Math.round(Number(e.target.value)); aoMudar(Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min); }} />
          {sufixo && <span>{sufixo}</span>}
        </span>
      )}
    </Campo>
  );
}

export function Hora({ valor, aoMudar, rotulo }: { valor: string; aoMudar: (v: string) => void; rotulo: string }) {
  return <input className="inp irs-hora" type="time" aria-label={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value || valor)} />;
}

export function Faixa({ rotulo, dica, valor, aoMudar }: { rotulo: ReactNode; dica?: ReactNode; valor: [string, string]; aoMudar: (v: [string, string]) => void }) {
  return (
    <Campo rotulo={rotulo} dica={dica}>
      {() => (
        <span className="irs-faixa">
          <Hora rotulo="Começa" valor={valor[0]} aoMudar={(v) => aoMudar([v, valor[1]])} />
          <span>até</span>
          <Hora rotulo="Termina" valor={valor[1]} aoMudar={(v) => aoMudar([valor[0], v])} />
        </span>
      )}
    </Campo>
  );
}

export function Escolha<V extends string>({ rotulo, dica, valor, aoMudar, opcoes }: {
  rotulo: ReactNode; dica?: ReactNode; valor: V; aoMudar: (v: V) => void; opcoes: { valor: V; rotulo: string; desc?: string }[];
}) {
  return (
    <Campo rotulo={rotulo} dica={dica} largo>
      {(id) => (
        <div className="irs-opcoes" role="radiogroup" aria-labelledby={id}>
          {opcoes.map((o) => (
            <button key={o.valor} type="button" role="radio" aria-checked={valor === o.valor} className={'irs-opcao' + (valor === o.valor ? ' on' : '')} onClick={() => aoMudar(o.valor)}>
              <b>{o.rotulo}</b>{o.desc && <span>{o.desc}</span>}
            </button>
          ))}
        </div>
      )}
    </Campo>
  );
}

export function Liga({ titulo, desc, ligado, aoMudar, travado }: { titulo: ReactNode; desc?: ReactNode; ligado: boolean; aoMudar: (v: boolean) => void; travado?: string }) {
  const id = useId();
  return (
    <div className="irs-liga">
      <div><b id={id}>{titulo}</b>{desc && <span>{desc}</span>}{travado && <span className="irs-trava">{travado}</span>}</div>
      <Toggle ligado={ligado} aoMudar={aoMudar} rotuladoPor={id} disabled={!!travado} />
    </div>
  );
}

/** Lista de palavras (financeiras, frases proibidas, estados…): Enter ou vírgula acrescenta; × tira. */
export function Etiquetas({ rotulo, dica, valores, aoMudar, placeholder, maiusculas }: {
  rotulo: ReactNode; dica?: ReactNode; valores: string[]; aoMudar: (v: string[]) => void; placeholder?: string; maiusculas?: boolean;
}) {
  const [txt, setTxt] = useState('');
  const somar = () => {
    const novos = txt.split(',').map((s) => (maiusculas ? s.trim().toUpperCase() : s.trim())).filter(Boolean);
    if (novos.length) aoMudar([...valores, ...novos.filter((n) => !valores.some((v) => v.toLowerCase() === n.toLowerCase()))]);
    setTxt('');
  };
  return (
    <Campo rotulo={rotulo} dica={dica} largo>
      {(id) => (
        <div className="irs-tags">
          {valores.map((v) => (
            <span key={v} className="irs-tag">{v}<button type="button" aria-label={`Tirar ${v}`} onClick={() => aoMudar(valores.filter((x) => x !== v))}>×</button></span>
          ))}
          <input id={id} className="irs-tag-inp" value={txt} placeholder={placeholder ?? 'Escreva e aperte Enter'}
            onChange={(e) => setTxt(e.target.value)} onBlur={somar}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); somar(); } else if (e.key === 'Backspace' && !txt && valores.length) aoMudar(valores.slice(0, -1)); }} />
        </div>
      )}
    </Campo>
  );
}

export function Bloco({ titulo, desc, acao, children }: { titulo: ReactNode; desc?: ReactNode; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="irs-bloco">
      <header><div><h3>{titulo}</h3>{desc && <p>{desc}</p>}</div>{acao}</header>
      <div className="irs-bloco-corpo">{children}</div>
    </section>
  );
}
