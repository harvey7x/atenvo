/* ============================================================================
   A MENSAGEM DO MURILLO (só a aparência; o shell e a prévia usam os mesmos).
   - CartaoMensagemEquipe: "Mensagem do Murillo", há quanto tempo, o texto e "Ok, entendi". Abre NO MEIO DA TELA
     (o contêiner põe o véu e cuida do foco). Várias: "1 de N" e a pilha atrás. O Esc não some com ela.
   - JanelaMensagemEquipe: o administrador escreve (Para: Todos ou quem escolher · a mensagem · Enviar como
     Murillo) e vê as dos últimos 7 dias, quem viu e quem deu ok; "Tirar das telas".
   A família do recado do administrador: vidro escuro, filete âmbar (observação), zero emoji.
   ============================================================================ */
import { useCallback, useEffect, useId, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from 'react';
import { haQuantoAviso } from './CartaoAvisoIris';
import { ModalV2 } from './ModalV2';
import {
  ASSINATURA, horaCurta, LIMITE_MENSAGEM, primeiroNome, rotuloSituacao, situacaoDe,
  type FonteMensagens, type MensagemEnviada, type MensagemEquipe,
} from './mensagensEquipe';
import './recado.css';
import './mensagemEquipe.css';

/** o relógio do "há X" (o cartão parado numa página também envelhece) */
function useRelogio(ativo: boolean): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (!ativo) return;
    setAgora(Date.now());
    const iv = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(iv);
  }, [ativo]);
  return agora;
}

export const IcMegafone = ({ tamanho = 13 }: { tamanho?: number }) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3.5 10.2v3.6c0 .7.6 1.2 1.2 1.2H7l9.5 4.5V4.5L7 9H4.7c-.6 0-1.2.5-1.2 1.2z" /><path d="M7.5 15.2l1.2 4.3h2.6l-1-3.3" /><path d="M19.5 9.3a3.6 3.6 0 010 5.4" />
  </svg>
);

/** "Giovana, Isadora, Juliana e Luiz" */
export function listaDeNomes(nomes: string[]): string {
  const n = nomes.map(primeiroNome);
  if (n.length <= 1) return n[0] ?? '';
  return `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
}

/* ---------------------------------------------------------------- quem recebe (no meio da tela) */
export interface PropsCartaoMensagem {
  mensagens: MensagemEquipe[];
  agora?: number;
  aoOk: (m: MensagemEquipe) => Promise<void> | void;
}

/** depois que uma mensagem entra na frente, o "Ok" espera um instante: o 2º clique de um clique duplo (ou a tecla
    segura) não dá ok na PRÓXIMA sem ela ser lida (revisão 13/11) */
const OK_SEGURA_MS = 600;

/** o pai monta com key = id da mensagem: cada mensagem é um cartão novo (o estado e a trava começam do zero) */
export function CartaoMensagemEquipe({ mensagens, agora, aoOk }: PropsCartaoMensagem) {
  const id = useId();
  const m = mensagens[0];
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [entrouEm] = useState(() => Date.now());
  if (!m) return null;
  const confirmar = async () => {
    if (enviando || Date.now() - entrouEm < OK_SEGURA_MS) return;
    setEnviando(true); setErro(null);
    try { await aoOk(m); } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não deu para confirmar agora. Tente de novo.');
    } finally { setEnviando(false); }
  };
  /* o Esc não some com a mensagem do Murillo (sai só pelo "Ok, entendi"); nenhuma tecla daqui chega aos atalhos da
     página de trás (o "/" da Fila levava o foco para a busca atrás do véu) */
  const tecla = (e: KeyboardEvent<HTMLElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape') e.preventDefault();
  };
  return (
    <>
      {mensagens.length > 1 && <span className="rcd-camada" aria-hidden />}
      <section className="rcd-aviso meq-aviso" tabIndex={-1} aria-labelledby={`${id}-m`} aria-describedby={`${id}-t`} onKeyDown={tecla}>
        <header className="rcd-topo">
          <span className="rcd-marca" id={`${id}-m`}><IcMegafone />Mensagem do {m.assinatura}</span>
          {mensagens.length > 1 && <span className="rcd-conta">1 de {mensagens.length}</span>}
          <span className="rcd-hora">{haQuantoAviso(m.criadoEm, agora)}</span>
        </header>
        <p className="meq-texto" id={`${id}-t`}>{m.mensagem}</p>
        <div className="rcd-acoes meq-acoes">
          <button type="button" className="rcd-bt rcd-forte" disabled={enviando}
            onKeyDown={(e) => { if (e.repeat) e.preventDefault(); /* a tecla segurada não vira clique repetido */ }}
            onClick={(e) => { if (e.detail > 1) return; void confirmar(); }}>
            {enviando ? 'Confirmando…' : 'Ok, entendi'}
          </button>
        </div>
        {erro && <p className="rcd-erro" role="alert">{erro}</p>}
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- o administrador (a janela do botão do topo) */
export interface RascunhoMensagem {
  texto: string;
  /** null = todos */
  para: string[] | null;
}

export interface PropsJanelaMensagem {
  fonte: FonteMensagens;
  rascunho: RascunhoMensagem;
  /** o setState do rascunho (aceita função: limpar o texto depois do envio não desfaz a escolha de quem recebe) */
  aoMudar: Dispatch<SetStateAction<RascunhoMensagem>>;
  aoFechar: () => void;
  /** enviando: a janela não fecha no meio (o erro do envio não pode sumir com ela) */
  aoEnviando?: (sim: boolean) => void;
  agora?: number;
}

/** o cabeçalho da janela (vai no `titulo` do ModalV2) */
export function CabecalhoJanelaMensagem({ aoFechar, travado = false }: { aoFechar: () => void; travado?: boolean }) {
  return (
    <div className="meq-cab">
      <div className="meq-cab-txt">
        <span className="meq-cab-t"><IcMegafone tamanho={14} />Mensagem para a equipe</span>
        <span className="mod-sub">Aparece no meio da tela de quem você escolher, como {ASSINATURA}.</span>
      </div>
      <button type="button" className="meq-fechar" aria-label="Fechar" title="Fechar" disabled={travado} onClick={aoFechar}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}

export function JanelaMensagemEquipe({ fonte, rascunho, aoMudar, aoEnviando, agora }: PropsJanelaMensagem) {
  const id = useId();
  const campo = useRef<HTMLTextAreaElement>(null);
  const [enviando, setEnviandoLocal] = useState(false);
  const setEnviando = (v: boolean) => { setEnviandoLocal(v); aoEnviando?.(v); };
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const { texto, para } = rascunho;
  const equipe = fonte.equipe;
  /* quem está escolhido (o "Todos" é a equipe de agora; quem saiu da equipe sai da escolha) */
  const escolhidos = para === null ? null : para.filter((p) => equipe.some((x) => x.id === p));
  const todosMarcados = escolhidos === null;
  const quem = todosMarcados ? equipe : equipe.filter((x) => escolhidos.includes(x.id));
  const msg = texto.trim();
  const podeEnviar = !!msg && msg.length <= LIMITE_MENSAGEM && quem.length > 0 && !enviando;

  /* abre com o cursor na mensagem (o ModalV2 põe o foco no primeiro botão) */
  useEffect(() => {
    const t = window.setTimeout(() => campo.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, []);
  /* o "Enviada para…" some sozinho */
  useEffect(() => { if (!feito) return; const t = window.setTimeout(() => setFeito(null), 6000); return () => window.clearTimeout(t); }, [feito]);
  /* depois de um envio, a janela que fecha volta para "Todos" na próxima vez (a escolha de quem recebeu não fica presa
     até a próxima cobrança); escolha ainda NÃO enviada, ou texto escrito, sobrevivem a um clique fora (revisão 13/11) */
  const enviou = useRef(false);
  useEffect(() => () => {
    if (enviou.current) aoMudar((r) => (r.texto.trim() ? r : { ...r, para: null }));
  }, [aoMudar]);

  const alternar = (pid: string) => {
    if (enviando) return;
    setErro(null);
    if (todosMarcados) { aoMudar((r) => ({ ...r, para: [pid] })); return; }
    const novo = escolhidos.includes(pid) ? escolhidos.filter((x) => x !== pid) : [...escolhidos, pid];
    aoMudar((r) => ({ ...r, para: novo }));
  };
  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true); setErro(null); setFeito(null);
    /* "Todos" = quem estiver na equipe na hora (o banco calcula); escolhidos um a um vão EXATAMENTE eles (mesmo que
       sejam todos: quem entrar na equipe nesse meio-tempo não recebe o que não foi escolhido para ele) */
    const alvo = todosMarcados ? null : quem.map((x) => x.id);
    try {
      const r = await fonte.enviar(alvo, msg);
      /* limpa só o texto: a escolha de quem recebe fica como está agora (envios seguidos com a janela aberta) */
      aoMudar((x) => ({ ...x, texto: '' }));
      enviou.current = true;
      setFeito(alvo === null
        ? `Enviada para todos (${r.destinos === 1 ? '1 pessoa' : `${r.destinos} pessoas`}).`
        : `Enviada para ${listaDeNomes(quem.map((x) => x.nome))}.`);
      window.setTimeout(() => campo.current?.focus({ preventScroll: true }), 0);
    } catch (e) {
      setErro(e instanceof Error && e.message ? e.message : 'Não deu para enviar agora. Tente de novo.');
    } finally { setEnviando(false); }
  };

  return (
    <div className="meq-janela">
      <div className="meq-campo-bloco">
        <span className="meq-rot" id={`${id}-p`}>Para</span>
        <div className="meq-chips" role="group" aria-labelledby={`${id}-p`}>
          <button type="button" className="meq-chip" aria-pressed={todosMarcados} data-on={todosMarcados ? '' : undefined}
            disabled={enviando} onClick={() => { setErro(null); aoMudar((r) => ({ ...r, para: null })); }}>Todos</button>
          {equipe.map((p) => {
            const on = !todosMarcados && escolhidos.includes(p.id);
            return (
              <button key={p.id} type="button" className="meq-chip" aria-pressed={on} data-on={on ? '' : undefined}
                disabled={enviando} onClick={() => alternar(p.id)}>{primeiroNome(p.nome)}</button>
            );
          })}
        </div>
        <p className="meq-quem" aria-live="polite">
          {equipe.length === 0 ? (fonte.pronto ? 'Não há atendentes na equipe para receber.' : 'Carregando a equipe…')
            : quem.length === 0 ? 'Escolha quem recebe.'
              : todosMarcados ? `${quem.length === 1 ? '1 pessoa' : `${quem.length} pessoas`}: ${listaDeNomes(quem.map((x) => x.nome))}`
                : `Só ${listaDeNomes(quem.map((x) => x.nome))}`}
        </p>
      </div>
      <div className="meq-campo-bloco">
        <label className="meq-rot" htmlFor={`${id}-t`}>Mensagem</label>
        <textarea ref={campo} id={`${id}-t`} className="meq-campo" rows={4} maxLength={LIMITE_MENSAGEM} value={texto}
          readOnly={enviando} placeholder="Escreva a mensagem…" aria-describedby={`${id}-d`}
          onChange={(e) => { const t = e.target.value; setErro(null); aoMudar((r) => ({ ...r, texto: t })); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar(); }
          }} />
        <div className="meq-envio">
          <span className="meq-dica" id={`${id}-d`}>
            Enter envia · Shift+Enter quebra a linha{texto.length > LIMITE_MENSAGEM - 100 ? ` · ${texto.length}/${LIMITE_MENSAGEM}` : ''}
          </span>
          <button type="button" className="p-btn btn-pri meq-enviar" disabled={!podeEnviar} onClick={() => void enviar()}>
            {enviando ? 'Enviando…' : `Enviar como ${ASSINATURA}`}
          </button>
        </div>
        {erro && <p className="meq-erro" role="alert">{erro}</p>}
        {feito && <p className="meq-feito" role="status">{feito} Aparece na tela em até 20 segundos.</p>}
      </div>
      <ListaMensagensEnviadas fonte={fonte} agora={agora} />
    </div>
  );
}

/* ---------------------------------------------------------------- as dos últimos 7 dias */
function ListaMensagensEnviadas({ fonte, agora }: { fonte: FonteMensagens; agora?: number }) {
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [tirando, setTirando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ id: string; texto: string } | null>(null);
  /* a confirmação só vale depois de aparecer: o 2º clique de um clique duplo (ou o Enter seguro) não confirma sem o
     administrador ter lido "Confirmar: tirar da tela de N pessoas" — tirar não tem volta (revisão 13/11) */
  const armadoEm = useRef(0);
  useEffect(() => { if (!confirmar) return; const t = window.setTimeout(() => setConfirmar(null), 5000); return () => window.clearTimeout(t); }, [confirmar]);
  const tirar = async (m: MensagemEnviada) => {
    if (tirando) return;
    if (confirmar !== m.id) { setConfirmar(m.id); armadoEm.current = Date.now(); return; }
    if (Date.now() - armadoEm.current < OK_SEGURA_MS) return;
    setConfirmar(null); setTirando(m.id);
    try {
      const r = await fonte.tirar(m.id);
      setAviso({ id: m.id, texto: r.tiradaDe === 1 ? 'Tirada da tela de 1 pessoa.' : `Tirada da tela de ${r.tiradaDe} pessoas.` });
    } catch (e) {
      setAviso({ id: m.id, texto: e instanceof Error && e.message ? e.message : 'Não deu para tirar agora. Tente de novo.' });
    } finally { setTirando(null); }
  };
  const lista = fonte.enviadas;
  return (
    <section className="meq-lista" aria-label="Mensagens dos últimos 7 dias">
      <h3 className="meq-rot meq-lista-t">Últimos 7 dias</h3>
      {fonte.erro && !lista.length ? <p className="meq-vazio" role="alert">{fonte.erro}</p>
        : !lista.length ? <p className="meq-vazio">{fonte.pronto ? 'Nenhuma mensagem nos últimos 7 dias.' : 'Carregando…'}</p>
          : (
            <ul className="meq-itens">
              {lista.map((m) => {
                const faltam = m.destinos.filter((d) => !d.okEm).length;
                const oks = m.destinos.length - faltam;
                return (
                  <li key={m.id} className="meq-item" data-tirada={m.tiradaEm ? '' : undefined}>
                    <div className="meq-item-cab">
                      <span className="meq-item-quando">{horaCurta(m.criadoEm, agora)}</span>
                      <span className="meq-item-de">
                        por {primeiroNome(m.deNome)} · {m.paraTodos ? 'para todos' : `para ${listaDeNomes(m.destinos.map((d) => d.nome))}`}
                      </span>
                      <span className="meq-item-conta">{oks}/{m.destinos.length} ok</span>
                    </div>
                    <p className="meq-item-texto">{m.mensagem}</p>
                    <ul className="meq-dest" aria-label="Quem recebeu">
                      {m.destinos.map((d) => (
                        <li key={d.id} data-sit={situacaoDe(d)}>
                          <span className="meq-dest-nome">{primeiroNome(d.nome)}</span>
                          <span className="meq-dest-sit">{rotuloSituacao(d, agora)}</span>
                        </li>
                      ))}
                    </ul>
                    {(m.tiradaEm || faltam > 0 || aviso?.id === m.id) && (
                      <div className="meq-item-pe">
                        {m.tiradaEm ? <span className="meq-item-tirada">Tirada das telas {horaCurta(m.tiradaEm, agora)}</span>
                          : faltam > 0 && (
                            <button type="button" className="meq-tirar" data-confirmar={confirmar === m.id ? '' : undefined}
                              disabled={tirando === m.id}
                              onKeyDown={(e) => { if (e.repeat) e.preventDefault(); /* Enter segurado não confirma sozinho */ }}
                              onClick={(e) => { if (e.detail > 1) return; void tirar(m); }}>
                              {tirando === m.id ? 'Tirando…'
                                : confirmar === m.id ? `Confirmar: tirar da tela de ${faltam === 1 ? '1 pessoa' : `${faltam} pessoas`}` : 'Tirar das telas'}
                            </button>
                          )}
                        {aviso?.id === m.id && <span className="meq-item-aviso" role="status">{aviso.texto}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
    </section>
  );
}

/* ==================================================================
   NO MEIO DA TELA de quem recebeu, em qualquer página (o shell monta; a prévia também): véu, o foco no cartão
   e o Tab preso nele, até o "Ok, entendi" (o Esc não some com ela). `oculto`: a tela está ocupada (bom dia,
   janela aberta, o recado do administrador — o shell confere e avisa). O véu leva .rcd-veu: o aviso da Iris, o
   lembrete e a Central de Avisos já esperam por ele.
   ================================================================== */
const VISTO_DEPOIS_MS = 1500;

/** o elemento está dentro de OUTRA janela modal (não a da mensagem) */
const emOutraJanela = (el: Element | null) => !!el?.closest('[aria-modal="true"]:not(.meq-veu)');
/** o meio do cartão é mesmo o que está na tela (nenhuma janela por cima dele) */
function estaPorCima(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return false;
  const topo = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 40));
  return !!topo && el.contains(topo);
}

/** com o Atenvo em outra aba: a notificação do navegador para cada mensagem NOVA (a 1ª leitura não conta) */
function useNotificacao(lista: MensagemEquipe[], pronto: boolean): void {
  const conhecidas = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!pronto) return;
    if (conhecidas.current === null) { conhecidas.current = new Set(lista.map((m) => m.id)); return; }
    const novas = lista.filter((m) => !conhecidas.current!.has(m.id));
    for (const m of novas) conhecidas.current.add(m.id);
    if (!novas.length || typeof document === 'undefined' || !document.hidden) return;
    try {
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      const m = novas[0];
      const n = new Notification(`Mensagem do ${m.assinatura}`, { body: m.mensagem, tag: `atenvo-mensagem-${m.id}`, icon: '/icons/pwa-192.png' });
      n.onclick = () => { try { window.focus(); } catch { /* o navegador decide */ } n.close(); };
    } catch { /* sem notificação do navegador: o cartão aparece ao voltar */ }
  }, [lista, pronto]);
}

export function PainelMensagemEquipe({ fonte, oculto = false }: { fonte: FonteMensagens; oculto?: boolean }) {
  const pendentes = fonte.minhas;
  const centro = pendentes.length > 0 && !oculto;
  const agora = useRelogio(centro);
  const frente = centro ? pendentes[0] : undefined;
  useNotificacao(pendentes, fonte.pronto);

  /* o foco entra no cartão (não no botão: um Enter sem querer não dá "Ok"), o Tab não sai dele e, quando a
     última sai, volta para onde estava (se ainda existe; aberto outro cartão do meio, só se estava DENTRO dele —
     a resposta que a pessoa escrevia no recado). Nunca tira o foco de outra janela que estiver por cima. */
  const veu = useRef<HTMLDivElement>(null);
  const focoAntes = useRef<HTMLElement | null>(null);
  /* quantas ainda esperam o ok: o cartão que só ficou escondido (um recado ou uma janela por cima) guarda o "onde
     estava" para quando a última sair (revisão 13/11) */
  const restam = useRef(0);
  restam.current = pendentes.length;
  useEffect(() => {
    if (!centro) return;
    const a = document.activeElement;
    const atual = a instanceof HTMLElement && a !== document.body && !veu.current?.contains(a) ? a : null;
    if (atual || !focoAntes.current?.isConnected) focoAntes.current = atual;
    return () => {
      if (restam.current > 0) return;
      const el = focoAntes.current;
      focoAntes.current = null;
      const outro = document.querySelector('.rcd-veu:not(.meq-veu)');
      if (el && document.contains(el) && (!outro || outro.contains(el))) { try { el.focus({ preventScroll: true }); } catch { /* segue */ } }
    };
  }, [centro]);
  /* nada mais esperando (ok em outra aba, tirada das telas enquanto escondida): esquece o "onde estava" — a próxima
     mensagem, mais tarde, não devolve o foco a um campo de outro momento (os cleanups acima rodam antes deste) */
  useEffect(() => { if (!pendentes.length) focoAntes.current = null; }, [pendentes.length]);
  /* nenhuma tecla chega à página de trás enquanto a mensagem está na tela (o foco fora do cartão — clique no fundo,
     um atalho que puxou o foco — volta para ele; a paleta de scripts e o compositor do WhatsApp não recebem o que
     a pessoa digita sem ver). O Tab fica com a trava abaixo; janela aberta por cima é dela. */
  useEffect(() => {
    if (!centro) return;
    const h = (e: globalThis.KeyboardEvent) => {
      const raiz = veu.current;
      const alvo = e.target instanceof Element ? e.target : null;
      if (!raiz || e.key === 'Tab' || (alvo && (raiz.contains(alvo) || emOutraJanela(alvo)))) return;
      e.stopImmediatePropagation();
      /* os atalhos do NAVEGADOR (recarregar, copiar, F5…) continuam valendo; só a página de trás não recebe */
      if (!(e.metaKey || e.ctrlKey || e.altKey || /^F\d{1,2}$/.test(e.key))) e.preventDefault();
      raiz.querySelector<HTMLElement>('.meq-aviso')?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, [centro]);
  useEffect(() => {
    if (!centro) return;
    const t = window.setTimeout(() => {
      if (emOutraJanela(document.activeElement)) return;
      veu.current?.querySelector<HTMLElement>('.meq-aviso')?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [centro, frente?.id]);
  useEffect(() => {
    if (!centro) return;
    const h = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const raiz = veu.current;
      if (!raiz) return;
      const atual = document.activeElement as HTMLElement | null;
      /* o foco está numa janela que abriu por cima (não esperada): o Tab é dela */
      if (atual && !raiz.contains(atual) && emOutraJanela(atual)) return;
      const focos = [...raiz.querySelectorAll<HTMLElement>('button:not([disabled])')];
      if (!focos.length) { e.preventDefault(); return; }
      if (!atual || !raiz.contains(atual)) { e.preventDefault(); focos[0].focus(); return; }
      const i = focos.indexOf(atual);
      if (e.shiftKey && i <= 0) { e.preventDefault(); focos[focos.length - 1].focus(); }
      else if (!e.shiftKey && i === focos.length - 1) { e.preventDefault(); focos[0].focus(); }
    };
    document.addEventListener('keydown', h, true);
    return () => document.removeEventListener('keydown', h, true);
  }, [centro]);

  /* apareceu na tela, com a aba à vista e o cartão POR CIMA de tudo, por 1,5 s: o administrador vê "viu 14:02"
     (coberto por uma janela que a espera não conhece, não conta: tenta de novo) */
  const marcarVista = fonte.marcarVista;
  const frenteId = frente?.id;
  const frenteVista = !!frente?.vistoEm;
  useEffect(() => {
    if (!frenteId || frenteVista) return;
    let t: number | undefined;
    const armar = () => {
      window.clearTimeout(t);
      if (document.hidden) return;
      t = window.setTimeout(() => {
        const cartao = veu.current?.querySelector<HTMLElement>('.meq-aviso');
        if (cartao && estaPorCima(cartao)) marcarVista(frenteId); else armar();
      }, VISTO_DEPOIS_MS);
    };
    armar();
    document.addEventListener('visibilitychange', armar);
    return () => { window.clearTimeout(t); document.removeEventListener('visibilitychange', armar); };
  }, [frenteId, frenteVista, marcarVista]);

  /* o leitor de tela: a região viva fica sempre montada */
  const anuncio = frente ? `Mensagem do ${frente.assinatura}: ${frente.mensagem}` : '';
  const [falado, setFalado] = useState('');
  useEffect(() => { setFalado(anuncio); }, [anuncio]);

  return (
    <>
      <div className="ivs-sr" role="status" aria-live="polite">{falado}</div>
      {frente && (
        <div ref={veu} className="rcd-veu meq-veu" role="dialog" aria-modal="true" aria-label={`Mensagem do ${frente.assinatura}`}
          onMouseDown={(e) => { if (e.target === e.currentTarget) e.preventDefault(); /* clicar no fundo não tira o foco do cartão */ }}>
          <div className="rcd-caixa-centro">
            <CartaoMensagemEquipe key={frente.id} mensagens={pendentes} agora={agora} aoOk={(m) => fonte.ok(m.id)} />
          </div>
        </div>
      )}
    </>
  );
}

/* ==================================================================
   O BOTÃO "Mensagem" da barra do topo + a janela (só o administrador). O rascunho sobrevive a fechar a janela
   (clique fora sem querer não perde o texto).
   ================================================================== */
export function BotaoEJanelaMensagem({ fonte, aberta, aoAbrir }: { fonte: FonteMensagens; aberta: boolean; aoAbrir: (v: boolean) => void }) {
  const [rascunho, setRascunho] = useState<RascunhoMensagem>({ texto: '', para: null });
  const botao = useRef<HTMLButtonElement>(null);
  const agora = useRelogio(aberta);
  /* enviando: a janela não fecha (Esc, clique fora, X) — o erro do envio não pode sumir junto */
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const aoEnviando = useCallback((v: boolean) => { enviandoRef.current = v; setEnviando(v); }, []);
  const fechar = useCallback(() => {
    if (enviandoRef.current) return;
    aoAbrir(false);
    window.setTimeout(() => botao.current?.focus({ preventScroll: true }), 0);
  }, [aoAbrir]);
  /* abriu: a lista lê de novo na hora (quem viu / deu ok desde a última leitura) */
  const recarregar = fonte.recarregar;
  useEffect(() => { if (aberta) recarregar?.(); }, [aberta]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!fonte.admin) return null;
  return (
    <>
      <button ref={botao} type="button" className="meq-topo" aria-haspopup="dialog" aria-expanded={aberta}
        title={`Mandar uma mensagem para a equipe: aparece no meio da tela, como ${ASSINATURA}`}
        onClick={() => aoAbrir(true)}>
        <IcMegafone tamanho={15} /><span className="meq-topo-rot">Mensagem</span>
      </button>
      <ModalV2 aberto={aberta} aoFechar={fechar} largura={540} fecharNoVeu={!enviando}
        titulo={<CabecalhoJanelaMensagem aoFechar={fechar} travado={enviando} />}>
        <JanelaMensagemEquipe fonte={fonte} rascunho={rascunho} aoMudar={setRascunho} aoFechar={fechar} aoEnviando={aoEnviando} agora={agora} />
      </ModalV2>
    </>
  );
}
