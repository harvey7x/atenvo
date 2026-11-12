/* O cartão do AVISO DA IRIS — só a aparência (o shell, via AvisoIris, e a prévia usam o mesmo).
   - Um aviso: "A Iris passou para você", o nome, o que fazer (palavras do dono) e Abrir conversa · Ver na fila · Ok.
     Dois: "1 de 2" e a pilha atrás. Três ou mais: UM cartão de resumo com os nomes e "Abrir a Fila da Iris".
   - O Ok mora no mesmo lugar e com o mesmo jeito nos dois modos (à direita). Esc com o foco no cartão = Ok.
   - Sem ×: "fechar" sugeriria só esconder, e o Ok marca como visto (não volta). */
import { useId, type KeyboardEvent } from 'react';
import { TEXTO_AVISO, type AvisoIris as Aviso } from '../pages/filaIris/avisosTexto';
import './avisoIris.css';

export const RESUMO_A_PARTIR = 3;

const iniciais = (n: string) => {
  const p = n.split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')).filter(Boolean);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};
const doisNomes = (n: string) => {
  const p = n.split(/\s+/).filter(Boolean);
  return p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : n;
};
export function haQuantoAviso(ms: number, agora = Date.now()): string {
  const m = Math.max(0, Math.round((agora - ms) / 60_000));
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.floor(m / 60)}h`;
  const d = Math.floor(m / 1440);
  return d === 1 ? 'há 1 dia' : `há ${d} dias`;
}

const IcEstrela = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M11 3.5l1.7 4.4 4.4 1.7-4.4 1.7L11 15.7l-1.7-4.4-4.4-1.7 4.4-1.7z" /><path d="M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </svg>
);
const IcTelefone = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M5 4h3l2 5-2.5 1.5a11 11 0 006 6L15 14l5 2v3a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" />
  </svg>
);

/** o texto que o leitor de tela anuncia quando o cartão aparece ou troca (a região viva fica no contêiner) */
export function anuncioDoAviso(avisos: Aviso[]): string {
  if (!avisos.length) return '';
  if (avisos.length >= RESUMO_A_PARTIR) return `A Iris passou ${avisos.length} clientes para você.`;
  const a = avisos[0];
  return `A Iris passou ${a.nome} para você. ${TEXTO_AVISO[a.categoria].faca}`;
}

export interface PropsCartaoAvisoIris {
  avisos: Aviso[];
  agora?: number;
  aoConversa: (a: Aviso) => void;
  aoVerFila: (a: Aviso | null) => void;
  aoOk: (ids: string[]) => void;
}

export function CartaoAvisoIris({ avisos, agora, aoConversa, aoVerFila, aoOk }: PropsCartaoAvisoIris) {
  const id = useId();
  if (!avisos.length) return null;
  const resumo = avisos.length >= RESUMO_A_PARTIR;
  const frente = avisos[0];
  const ids = resumo ? avisos.map((a) => a.id) : [frente.id];
  const tecla = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault(); e.stopPropagation();
    aoOk(ids);
  };
  const ini = iniciais(frente.nome);
  return (
    <>
      {!resumo && avisos.length > 1 && <span className="ivs-camada" aria-hidden />}
      <section className="ivs-aviso" role="region" aria-labelledby={`${id}-t`} onKeyDown={tecla}>
        <header className="ivs-topo">
          <span className="ivs-marca"><IcEstrela />A Iris passou para você</span>
          {!resumo && avisos.length > 1 && <span className="ivs-conta">1 de {avisos.length}</span>}
        </header>
        <div className="ivs-miolo">
          {resumo ? (
            <>
              <p className="ivs-titulo" id={`${id}-t`}>A Iris passou {avisos.length} clientes para você</p>
              <ul className="ivs-lista">
                {avisos.slice(0, 3).map((a) => (
                  <li key={a.id}><b>{doisNomes(a.nome)}</b><span> · {TEXTO_AVISO[a.categoria].curto}</span></li>
                ))}
              </ul>
              {avisos.length > 3 && <p className="ivs-mais">e mais {avisos.length - 3} na Fila da Iris</p>}
            </>
          ) : (
            <>
              <div className="ivs-quem">
                <span className="ivs-av" aria-hidden>{ini || <IcTelefone />}</span>
                <span className="ivs-quem-tx">
                  <b id={`${id}-t`}>{frente.nome}</b>
                  <small>{TEXTO_AVISO[frente.categoria].prioridade} · {haQuantoAviso(frente.passouEm, agora)}</small>
                </span>
              </div>
              <p className="ivs-faca">{TEXTO_AVISO[frente.categoria].faca}</p>
            </>
          )}
        </div>
        <div className="ivs-acoes">
          {resumo ? (
            <button type="button" className="ivs-bt ivs-forte" onClick={() => aoVerFila(null)}>Abrir a Fila da Iris</button>
          ) : (
            <>
              <button type="button" className="ivs-bt ivs-forte" onClick={() => aoConversa(frente)}>Abrir conversa</button>
              <button type="button" className="ivs-bt" onClick={() => aoVerFila(frente)}>Ver na fila</button>
            </>
          )}
          <button type="button" className="ivs-bt ivs-fraco" onClick={() => aoOk(ids)}
            title={resumo ? 'Ok, já vi todos' : 'Ok, já vi'}>Ok</button>
        </div>
      </section>
    </>
  );
}
