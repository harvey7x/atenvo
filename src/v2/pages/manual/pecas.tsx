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

/* ===================================================================== peças visuais */

export type Bolha = {
  /** cliente = à esquerda; eu = atendente (à direita, verde); robo = mensagem automática (à direita, com selo) */
  de: 'cliente' | 'eu' | 'robo';
  texto?: string;
  /** mídia ilustrada dentro da bolha */
  tipo?: 'texto' | 'imagem' | 'video' | 'audio' | 'documento';
  /** legenda da mídia ou nome do arquivo (documento) */
  legenda?: string;
  hora?: string;
};
/** Formatação do WhatsApp na bolha: *negrito* e _itálico_ (o texto continua literal na fonte). */
function textoWa(texto: string): ReactNode[] {
  return texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((parte, i) => {
    if (parte.length > 2 && parte.startsWith('*') && parte.endsWith('*')) return <strong key={i}>{parte.slice(1, -1)}</strong>;
    if (parte.length > 2 && parte.startsWith('_') && parte.endsWith('_')) return <em key={i}>{parte.slice(1, -1)}</em>;
    return parte;
  });
}

/** Celular com a conversa no estilo WhatsApp (é a tela do CLIENTE: paleta própria). */
export function Celular({ contato, sub, bolhas, legenda }: { contato: string; sub?: string; bolhas: Bolha[]; legenda?: string }) {
  return (
    <figure className="mv-cel">
      <div className="mv-cel-corpo">
        <div className="mv-cel-topo">
          <span className="mv-cel-av" aria-hidden>{contato.slice(0, 1)}</span>
          <span><b>{contato}</b><small>{sub ?? 'online'}</small></span>
        </div>
        <div className="mv-cel-msgs">
          {bolhas.map((b, i) => (
            <div key={i} className="mv-cel-b" data-de={b.de}>
              {b.de === 'robo' && <span className="mv-cel-robo">Mensagem automática</span>}
              {b.tipo === 'imagem' && <div className="mv-cel-midia" data-tipo="imagem" aria-hidden><span>Imagem</span></div>}
              {b.tipo === 'video' && <div className="mv-cel-midia" data-tipo="video" aria-hidden><i /><span>Vídeo</span></div>}
              {b.tipo === 'audio' && <div className="mv-cel-audio" aria-hidden><i /><span /><small>0:{String(20 + (i % 3) * 7).padStart(2, '0')}</small></div>}
              {b.tipo === 'documento' && <div className="mv-cel-doc" aria-hidden><i />{b.legenda ?? 'documento.pdf'}</div>}
              {b.tipo !== 'documento' && b.legenda && <p className="mv-cel-leg">{textoWa(b.legenda)}</p>}
              {b.texto && <p>{textoWa(b.texto)}</p>}
              <time>{b.hora ?? `10:${String(2 + i * 2).padStart(2, '0')}`}</time>
            </div>
          ))}
        </div>
      </div>
      {legenda && <figcaption><span className="mv-tag">Exemplo</span>{legenda}</figcaption>}
    </figure>
  );
}

/** Tabela simples e legível. */
export function Tabela({ colunas, linhas, destaque }: { colunas: string[]; linhas: ReactNode[][]; destaque?: number }) {
  return (
    <div className="vidro mv-tab-wrap">
      <table className="mv-tab">
        <thead><tr>{colunas.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i}>{l.map((c, j) => <td key={j} data-destaque={destaque === j ? '' : undefined}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Linha do tempo vertical. */
export function LinhaTempo({ itens }: { itens: { quando: string; titulo: string; texto?: ReactNode }[] }) {
  return (
    <ol className="mv-lt">
      {itens.map((it) => (
        <li key={it.quando + it.titulo}>
          <span className="mv-lt-q">{it.quando}</span>
          <div><b>{it.titulo}</b>{it.texto && <p>{it.texto}</p>}</div>
        </li>
      ))}
    </ol>
  );
}

/** Comparação lado a lado: como fazer × como não fazer. */
export function BomRuim({ bom, ruim }: { bom: { titulo?: string; corpo: ReactNode }; ruim: { titulo?: string; corpo: ReactNode } }) {
  return (
    <div className="mv-br">
      <div className="vidro mv-br-lado" data-tom="ruim">
        <span className="mv-br-tag"><IcX />{ruim.titulo ?? 'Evite'}</span>
        <div>{ruim.corpo}</div>
      </div>
      <div className="vidro mv-br-lado" data-tom="bom">
        <span className="mv-br-tag"><IcCheck />{bom.titulo ?? 'Faça assim'}</span>
        <div>{bom.corpo}</div>
      </div>
    </div>
  );
}

/** Moldura para uma ilustração própria (SVG ou HTML). */
export function Figura({ legenda, tag = 'Ilustração', children }: { legenda: string; tag?: string; children: ReactNode }) {
  return (
    <figure className="mv-fig">
      <div className="vidro mv-fig-corpo">{children}</div>
      <figcaption><span className="mv-tag">{tag}</span>{legenda}</figcaption>
    </figure>
  );
}

/** Frase de destaque (regra de ouro, ideia central). */
export function Frase({ children, autor }: { children: ReactNode; autor?: string }) {
  return (
    <blockquote className="mv-frase">
      <p>{children}</p>
      {autor && <cite>{autor}</cite>}
    </blockquote>
  );
}
