/* Peças de leitura do Manual de vendas (prefixo mv-): fatos, passos, conversa
   de WhatsApp com botão de copiar, "print" ilustrado, aviso, teste rápido e
   perguntas em sanfona. Só tokens do v2 — funcionam no claro e no escuro. */
import { useState, type ReactNode } from 'react';

export const IcCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
export const IcX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
);
const IcCopiar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.2" /><path d="M15.5 8.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7.5a2 2 0 002 2h2.5" /></svg>
);
const IcSeta = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
);
const IcInfo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.01" /></svg>
);
const IcAlerta = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3.5L2.8 19.5h18.4L12 3.5z" /><path d="M12 10v4.5M12 17.2v.01" /></svg>
);

/** Copia texto e devolve true quando deu certo (o navegador pode recusar). */
export async function copiar(texto: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(texto); return true; } catch { return false; }
}

export function Secao({ titulo, children, id }: { titulo: string; children: ReactNode; id?: string }) {
  return (
    <section className="mv-secao" id={id}>
      <h3>{titulo}</h3>
      {children}
    </section>
  );
}

export function Fatos({ itens }: { itens: { grande: string; texto: ReactNode }[] }) {
  return (
    <div className="mv-fatos">
      {itens.map((f) => (
        <div key={f.grande} className="vidro mv-fato">
          <b>{f.grande}</b>
          <span>{f.texto}</span>
        </div>
      ))}
    </div>
  );
}

type Tom = 'azul' | 'verde' | 'ambar' | 'rubro';
export function Aviso({ tom = 'azul', titulo, children }: { tom?: Tom; titulo?: string; children: ReactNode }) {
  return (
    <div className="mv-aviso" data-tom={tom} role="note">
      <span className="mv-aviso-ic">{tom === 'ambar' || tom === 'rubro' ? <IcAlerta /> : <IcInfo />}</span>
      <div>
        {titulo && <strong>{titulo}</strong>}
        <div className="mv-aviso-tx">{children}</div>
      </div>
    </div>
  );
}

export function Passos({ itens }: { itens: { titulo: string; texto?: ReactNode }[] }) {
  return (
    <ol className="mv-passos">
      {itens.map((p, i) => (
        <li key={p.titulo}>
          <span className="mv-passo-n num">{i + 1}</span>
          <div>
            <b>{p.titulo}</b>
            {p.texto && <p>{p.texto}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export type Fala = { quem: 'eu' | 'cliente'; texto: string };
/** Conversa no estilo WhatsApp. As falas do atendente têm botão de copiar. */
export function Conversa({ titulo, falas, nota }: { titulo: string; falas: Fala[]; nota?: string }) {
  const [copiado, setCopiado] = useState<number | null>(null);
  async function aoCopiar(i: number, texto: string) {
    if (await copiar(texto)) { setCopiado(i); window.setTimeout(() => setCopiado((c) => (c === i ? null : c)), 1600); }
  }
  return (
    <figure className="vidro mv-conversa">
      <figcaption>
        <span className="mv-conversa-av" aria-hidden>CA</span>
        <span><b>{titulo}</b>{nota && <small>{nota}</small>}</span>
      </figcaption>
      <div className="mv-conversa-corpo">
        {falas.map((f, i) => (
          <div key={i} className="mv-fala" data-quem={f.quem}>
            <p>{f.texto}</p>
            {f.quem === 'eu' && (
              <button type="button" className="mv-fala-copiar" onClick={() => aoCopiar(i, f.texto)}
                aria-label="Copiar esta mensagem" title="Copiar esta mensagem">
                {copiado === i ? <><IcCheck />Copiado</> : <><IcCopiar />Copiar</>}
              </button>
            )}
          </div>
        ))}
      </div>
    </figure>
  );
}

/** Moldura de "print" (navegador ou celular). Sempre marcada como ilustração. */
export function Print({ endereco, legenda, children }: { endereco: string; legenda: string; children: ReactNode }) {
  return (
    <figure className="mv-print">
      <div className="mv-print-janela">
        <div className="mv-print-barra" aria-hidden>
          <i /><i /><i />
          <span>{endereco}</span>
        </div>
        <div className="mv-print-tela">{children}</div>
      </div>
      <figcaption><span className="mv-tag">Ilustração</span>{legenda}</figcaption>
    </figure>
  );
}

/** Pergunta de fixação no meio da lição: mostra a explicação ao responder. */
export function TesteRapido({ pergunta, opcoes, certa, explica }: { pergunta: string; opcoes: string[]; certa: number; explica: ReactNode }) {
  const [escolha, setEscolha] = useState<number | null>(null);
  const acertou = escolha === certa;
  return (
    <div className="vidro mv-teste">
      <span className="mv-teste-tag">Teste rápido</span>
      <p className="mv-teste-p">{pergunta}</p>
      <div className="mv-opcoes" role="group" aria-label={pergunta}>
        {opcoes.map((o, i) => (
          <button key={o} type="button" className="mv-opcao" disabled={escolha !== null}
            data-estado={escolha === null ? undefined : i === certa ? 'certa' : i === escolha ? 'errada' : 'apagada'}
            onClick={() => setEscolha(i)}>
            <span className="mv-opcao-l">{String.fromCharCode(65 + i)}</span>{o}
          </button>
        ))}
      </div>
      {escolha !== null && (
        <div className="mv-teste-r" data-ok={acertou ? '' : undefined} role="status">
          <b>{acertou ? 'Isso mesmo.' : 'Quase.'}</b> {explica}
          {!acertou && <button type="button" className="mv-link" onClick={() => setEscolha(null)}>Tentar de novo</button>}
        </div>
      )}
    </div>
  );
}

export function Sanfona({ itens }: { itens: { titulo: string; corpo: ReactNode }[] }) {
  const [aberto, setAberto] = useState<number | null>(0);
  return (
    <div className="vidro mv-sanfona">
      {itens.map((it, i) => (
        <div key={it.titulo} className="mv-sanf-it" data-aberto={aberto === i ? '' : undefined}>
          <button type="button" aria-expanded={aberto === i} onClick={() => setAberto(aberto === i ? null : i)}>
            <span>{it.titulo}</span><IcSeta />
          </button>
          {aberto === i && <div className="mv-sanf-corpo">{it.corpo}</div>}
        </div>
      ))}
    </div>
  );
}

export function Lista({ itens, tom }: { itens: ReactNode[]; tom?: 'sim' | 'nao' }) {
  return (
    <ul className="mv-lista" data-tom={tom}>
      {itens.map((t, i) => (
        <li key={i}><span className="mv-lista-ic">{tom === 'nao' ? <IcX /> : <IcCheck />}</span><span>{t}</span></li>
      ))}
    </ul>
  );
}
