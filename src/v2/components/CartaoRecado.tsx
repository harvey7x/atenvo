/* ============================================================================
   Os cartões do RECADO DO ADMINISTRADOR (só a aparência; o shell e a prévia usam os mesmos).
   - CartaoRecadoAtendente: "Recado do administrador" (dono 12/11: sem o nome de quem mandou), o
     cliente, a mensagem e as ações — Responder o cliente · Repassar (a um colega ou de volta para o
     administrador decidir, com o motivo) · responder por escrito · Lembrar em 10 min. Abre NO MEIO DA
     TELA (o contêiner põe o véu e cuida do foco). Vários: "1 de N" e a pilha atrás.
   - CartaoRespostaGestor: "Resposta da Juliana", o cliente, o que ela fez (respondeu o cliente às
     14:20 · escreveu · repassou · devolveu) e o recado original; Abrir conversa · Ok.
   A família do lembrete e do aviso da Iris: vidro escuro, filete âmbar (observação), zero emoji.
   ============================================================================ */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { estadoDoRecado, fraseDoEstado, quandoRespondeu, remetente, type Colega, type Recado } from '../pages/filaIris/recados';
import { haQuantoAviso } from './CartaoAvisoIris';
import './recado.css';

const IcRecado = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 5h16v11H8l-4 4V5z" /><path d="M8 9.5h8M8 12.5h5" />
  </svg>
);
const primeiroNome = (n: string) => n.split(/\s+/)[0] ?? n;
const artigoDe = (n: string) => (/a$/i.test(primeiroNome(n)) ? 'da' : 'do');

/** "Repassado pela Juliana: “ela já atendeu”" (o recado que chegou por um repasse) */
function LinhaRepasse({ r }: { r: Recado }) {
  if (!r.repassadoPorNome) return null;
  const nome = primeiroNome(r.repassadoPorNome);
  return (
    <p className="rcd-orig">Repassado {/a$/i.test(nome) ? 'pela' : 'pelo'} {nome}{r.repasseMotivo ? `: “${r.repasseMotivo}”` : ''}</p>
  );
}

/* ---------------------------------------------------------------- o do atendente */
export interface PropsCartaoRecadoAtendente {
  recados: Recado[];
  colegas: Colega[];
  agora?: number;
  aoResponderCliente: (r: Recado) => void;
  aoResponder: (r: Recado, texto: string) => Promise<void> | void;
  aoRepassar: (r: Recado, para: string | null, motivo: string) => Promise<void> | void;
  /** "Lembrar em 10 min": o recado sai da tela e volta depois */
  aoLembrarDepois?: (r: Recado) => void;
  /** o atendente começou a escrever (o contêiner segura a lista enquanto isso) */
  aoEscrever?: (escrevendo: boolean) => void;
}

export function CartaoRecadoAtendente({ recados, colegas, agora, aoResponderCliente, aoResponder, aoRepassar, aoLembrarDepois, aoEscrever }: PropsCartaoRecadoAtendente) {
  const id = useId();
  const r = recados[0];
  const [modo, setModo] = useState<'base' | 'repassar'>('base');
  const [texto, setTexto] = useState('');
  const [destino, setDestino] = useState<string | null | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const caixa = useRef<HTMLElement>(null);
  const btRepassar = useRef<HTMLButtonElement>(null);
  const voltouDoRepasse = useRef(false);
  /* trocou o recado da frente: tudo do começo */
  useEffect(() => { setModo('base'); setTexto(''); setDestino(undefined); setErro(null); }, [r?.id]);
  /* escrevendo ou escolhendo para quem repassar: o contêiner segura este recado na frente */
  useEffect(() => { aoEscrever?.(texto.trim().length > 0 || modo === 'repassar'); }, [texto, modo, aoEscrever]);
  /* o cartão saiu (ação, outra janela por cima): ninguém está mais escrevendo nele */
  useEffect(() => () => aoEscrever?.(false), [aoEscrever]);
  /* o foco acompanha o modo: entrou no repasse → a primeira pessoa; voltou → o botão Repassar */
  useEffect(() => {
    if (modo === 'repassar') caixa.current?.querySelector<HTMLElement>('.rcd-op')?.focus();
    else if (voltouDoRepasse.current) { voltouDoRepasse.current = false; btRepassar.current?.focus(); }
  }, [modo]);
  if (!r) return null;

  const voltar = () => { voltouDoRepasse.current = true; setModo('base'); setDestino(undefined); setTexto(''); setErro(null); };
  const tecla = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape') return;
    /* o Esc não some com o recado do administrador (sai só por uma ação); no repasse, volta */
    e.preventDefault(); e.stopPropagation();
    if (modo === 'repassar') voltar();
  };
  const fazer = async (f: () => Promise<void> | void) => {
    setEnviando(true); setErro(null);
    try { await f(); setTexto(''); } catch (e) { setErro(e instanceof Error ? e.message : 'Não deu para enviar agora.'); } finally { setEnviando(false); }
  };
  const responder = () => { if (texto.trim() && !enviando) void fazer(() => aoResponder(r, texto)); };
  const quem = remetente(r);
  const paraQuem = `${quem.artigo} ${quem.nome}`;
  const colega = destino ? colegas.find((c) => c.id === destino)?.nome : undefined;
  const dicaMotivo = destino === null ? `Por quê? (${paraQuem} vai ver)`
    : colega ? `Por quê? (${primeiroNome(colega)} e ${paraQuem} vão ver)` : 'Por quê? (opcional)';
  return (
    <>
      {recados.length > 1 && <span className="rcd-camada" aria-hidden />}
      <section ref={caixa} className="rcd-aviso" tabIndex={-1} aria-labelledby={`${id}-m ${id}-t`} onKeyDown={tecla}>
        <header className="rcd-topo">
          <span className="rcd-marca" id={`${id}-m`}><IcRecado />{quem.marca}</span>
          {recados.length > 1 && <span className="rcd-conta">1 de {recados.length}</span>}
          <span className="rcd-hora">{haQuantoAviso(r.criadoEm, agora)}</span>
        </header>
        <div className="rcd-miolo">
          <p className="rcd-cliente" id={`${id}-t`}>{r.cliente}</p>
          <blockquote className="rcd-msg">“{r.mensagem}”</blockquote>
          <LinhaRepasse r={r} />
          {modo === 'base' ? (
            <>
              <div className="rcd-acoes">
                <button type="button" className="rcd-bt rcd-forte" disabled={enviando} onClick={() => aoResponderCliente(r)}>Responder o cliente</button>
                <button ref={btRepassar} type="button" className="rcd-bt" disabled={enviando} onClick={() => { setModo('repassar'); setTexto(''); setErro(null); }}>Repassar</button>
                {aoLembrarDepois && <button type="button" className="rcd-bt rcd-fraco" disabled={enviando} onClick={() => aoLembrarDepois(r)}>Lembrar em 10 min</button>}
              </div>
              <div className="rcd-resp">
                <div className="rcd-campo-caixa">
                  <textarea className="rcd-campo" rows={2} maxLength={400} value={texto} readOnly={enviando}
                    placeholder={`Responder para ${paraQuem}…`}
                    aria-label={`Responder para ${paraQuem} sobre ${r.cliente}`} aria-describedby={`${id}-d`}
                    onChange={(e) => setTexto(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') return;
                      e.stopPropagation();
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); responder(); }
                    }} />
                  <span className="rcd-dica" id={`${id}-d`}>Enter envia · Shift+Enter quebra a linha</span>
                </div>
                <button type="button" className="rcd-bt rcd-enviar" disabled={!texto.trim() || enviando} onClick={responder}>
                  {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </>
          ) : (
            <div className="rcd-repassar">
              <p className="rcd-rot" id={`${id}-r`}>Repassar este cliente para</p>
              <div className="rcd-opcoes" role="radiogroup" aria-labelledby={`${id}-r`}>
                {colegas.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={destino === c.id} className="rcd-op"
                    data-on={destino === c.id ? '' : undefined} onClick={() => setDestino(c.id)}>{c.nome}</button>
                ))}
                <button type="button" role="radio" aria-checked={destino === null} className="rcd-op rcd-op-gestor"
                  data-on={destino === null ? '' : undefined} onClick={() => setDestino(null)}>Devolver para {paraQuem} decidir</button>
              </div>
              <textarea className="rcd-campo" rows={2} maxLength={400} value={texto} readOnly={enviando}
                placeholder={dicaMotivo} aria-label="Motivo do repasse"
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }} />
              <div className="rcd-acoes">
                <button type="button" className="rcd-bt rcd-forte" disabled={destino === undefined || enviando}
                  onClick={() => void fazer(() => aoRepassar(r, destino ?? null, texto))}>
                  {enviando ? 'Enviando…' : destino === null ? `Enviar ${quem.artigo === 'a' ? 'à' : 'ao'} ${quem.nome}` : 'Repassar'}
                </button>
                <button type="button" className="rcd-bt rcd-fraco" disabled={enviando} onClick={voltar}>Voltar</button>
              </div>
            </div>
          )}
          {erro && <p className="rcd-erro" role="alert">{erro}</p>}
        </div>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- o do administrador */
export interface PropsCartaoRespostaGestor {
  recados: Recado[];
  agora?: number;
  aoConversa: (r: Recado) => void;
  aoOk: (ids: string[]) => void;
}

export function CartaoRespostaGestor({ recados, agora, aoConversa, aoOk }: PropsCartaoRespostaGestor) {
  const id = useId();
  const r = recados[0];
  if (!r) return null;
  const est = estadoDoRecado(r);
  const tecla = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    e.preventDefault(); e.stopPropagation();
    aoOk([r.id]);
  };
  return (
    <>
      {recados.length > 1 && <span className="rcd-camada" aria-hidden />}
      <section className="rcd-aviso" role="region" aria-labelledby={`${id}-m ${id}-t`} onKeyDown={tecla}>
        <header className="rcd-topo">
          <span className="rcd-marca" id={`${id}-m`}><IcRecado />Resposta {artigoDe(r.paraNome)} {primeiroNome(r.paraNome)}</span>
          {recados.length > 1 && <span className="rcd-conta">1 de {recados.length}</span>}
          <span className="rcd-hora">{haQuantoAviso(quandoRespondeu(r), agora)}</span>
        </header>
        <div className="rcd-miolo">
          <p className="rcd-cliente" id={`${id}-t`}>{r.cliente}</p>
          <p className="rcd-feito">{fraseDoEstado(r)}{est === 'respondeu_cliente' ? '.' : r.resposta ? ':' : '.'}</p>
          {r.resposta && <blockquote className="rcd-msg">“{r.resposta}”</blockquote>}
          <p className="rcd-orig">Seu recado: “{r.mensagem}”</p>
          <LinhaRepasse r={r} />
        </div>
        <div className="rcd-acoes">
          <button type="button" className="rcd-bt rcd-forte" onClick={() => aoConversa(r)}>Abrir conversa</button>
          <button type="button" className="rcd-bt rcd-fraco" onClick={() => aoOk([r.id])}>Ok</button>
        </div>
      </section>
    </>
  );
}
