/* ------------------------------------------------------------------
   A SESSÃO de voz (uma conversa ao vivo): token efêmero do servidor →
   WebSocket direto no Live API → microfone → fala dela na fila →
   ferramentas pelo `assistente {ferramenta}` → legendas, fases e fim.
   Tudo o que toca fora (áudio, rede, WebSocket, relógio) é injetado: os
   testes (assistenteVozSessao.test.ts) rodam o protocolo inteiro com
   falsos. Ordem (LIVE-API.md §4–5):
   1. microfone e token (em paralelo quando a permissão já foi dada;
      senão o microfone primeiro — não gasta conversa do dia nem deixa o
      token de 60 s vencer na janela de permissão);
   2. WebSocket → {setup:{model}} → ESPERA setupComplete (áudio antes é
      erro) → cumprimento ("[início da conversa]") → microfone no ar;
   3. cada mensagem: TODOS os campos (áudio, transcrições, interrupted,
      turnComplete…); toolCall → POST de cada chamada em paralelo → UMA
      toolResponse (as canceladas não são respondidas);
   4. fim: Encerrar/Esc, 1 minuto ouvindo sem fala, o teto de tempo do
      servidor (≤ 10 min), goAway; erros com frase amigável.
   O token vai na URL do WebSocket: ela NUNCA é registrada.
   ------------------------------------------------------------------ */

import {
  MODELO_PADRAO, cumprimentoReserva, criarDecodificadorPcm, criarLegenda, erroDoFechamento, erroDoMicrofone, faseAtiva,
  lerMensagemServidor, limiteDaSessao, montarToolResponse, msgAudio, msgCumprimento, msgFimDoAudio, msgSetup,
  pedacoParaEnvio, proximaFase, urlDoWebSocket, verificarFim,
  type ChamadaFerramenta, type CodigoErroVoz, type EventoFase, type EventoServidor, type FaseVoz, type MotivoFim,
  type PalavraLegenda, type RespostaFerramentaVoz,
} from './assistenteVoz';
import type { AudioVoz, BandasVoz, EventoTocador } from './assistenteVozAudio';
import { ErroAssistente, type LinkAssistente, type SessaoVozServidor } from '@/data/assistente';

export interface EstadoVoz {
  fase: FaseVoz;
  mudo: boolean;
  /** a legenda do que ela fala (as ditas acesas; as próximas, apagadas) */
  palavras: PalavraLegenda[];
  /** o que você disse (transcrição de entrada) */
  voce: string;
  links: LinkAssistente[];
  erro: CodigoErroVoz | null;
  /** fim sozinho (silêncio, tempo, servidor); null = a pessoa encerrou */
  fim: MotivoFim | null;
  limiteS: number;
  /** a última fala dela inteira, quando acaba de tocar (o leitor de tela ouve esta) */
  falaConcluida: string;
}

export interface SessaoVoz {
  iniciar(): void;
  alternarMudo(): void;
  /** a pessoa encerrou (botão, Esc, fechou o cartão) */
  encerrar(): void;
  /** níveis para a esfera (lidos a cada quadro) */
  bandas(dt: number): BandasVoz;
  estado(): EstadoVoz;
}

/** O pedaço do WebSocket que a sessão usa (o real é o do navegador). */
export interface WsLike {
  binaryType: string;
  readonly readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(dados: string): void;
  close(codigo?: number, motivo?: string): void;
}

export type PermissaoMicrofone = 'granted' | 'prompt' | 'denied' | 'desconhecida';

export interface DepsSessao {
  audio: AudioVoz;
  pedirSessao: (org: string) => Promise<SessaoVozServidor>;
  executarFerramenta: (p: { org: string; nome: string; args: Record<string, unknown>; signal: AbortSignal }) =>
    Promise<{ resultado: unknown; links: LinkAssistente[] }>;
  criarWs: (url: string) => WsLike;
  permissaoMicrofone?: () => Promise<PermissaoMicrofone>;
  agora?: () => number;
  /** registro sem dado sensível (nunca a URL do WebSocket) */
  aviso?: (msg: string) => void;
}

export interface OpcoesSessao {
  org: string;
  /** primeiro nome (o cumprimento de reserva, se a voz não vier) */
  nome: string;
  aoMudar: (e: EstadoVoz) => void;
}

export const PRAZO_SETUP_MS = 15_000;
export const PRAZO_FERRAMENTA_MS = 15_000;
export const ESPERA_CUMPRIMENTO_MS = 3_500;
/** respondeu a ferramenta e ela não falou nada: volta a ouvir (nunca fica preso em "Consultando") */
export const PRAZO_RESPOSTA_MS = 15_000;
export const TIQUE_MS = 1_000;
const ABERTO = 1;
const MAX_LINKS = 5;

const codigoDoServidor = (e: unknown): CodigoErroVoz => (e instanceof ErroAssistente ? e.codigo : 'rede');

export function juntarLinks(a: LinkAssistente[], b: LinkAssistente[]): LinkAssistente[] {
  const out: LinkAssistente[] = [];
  const vistos = new Set<string>();
  for (const l of [...a, ...b]) {
    if (vistos.has(l.rota)) continue;
    vistos.add(l.rota);
    out.push(l);
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

interface Pendente { c: ChamadaFerramenta; ctrl: AbortController; cancelada: boolean }

export function criarSessaoVoz(op: OpcoesSessao, d: DepsSessao): SessaoVoz {
  const agora = d.agora ?? (() => Date.now());
  const legenda = criarLegenda();
  const decodificar = criarDecodificadorPcm();
  const textoDec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

  let fase: FaseVoz = 'conectando';
  let mudo = false;
  let erro: CodigoErroVoz | null = null;
  let fim: MotivoFim | null = null;
  let limiteS = limiteDaSessao(undefined);
  let voce = '';
  let parcial = '';
  let links: LinkAssistente[] = [];
  let falaConcluida = '';

  let ws: WsLike | null = null;
  let servidor: SessaoVozServidor | null = null;
  let setupFeito = false;
  let iniciada = false;
  let inicio = 0;
  let ultimaAtividade = 0;
  let enfileiradas = 0;      // amostras de fala enviadas à fila
  let posTocada = 0;         // amostras consumidas pela fila (aviso do worklet)
  let filaVazia = true;
  /* a legenda começa do zero na próxima fala dela depois de uma pergunta nova, de uma ferramenta ou de uma
     interrupção. Um pedaço de transcrição ATRASADO (chega depois do turnComplete — a ordem não é garantida)
     se junta à fala que acabou, em vez de apagá-la. */
  let limparLegenda = false;
  /** os links são da pergunta da vez: a 1ª consulta depois de um fim de turno começa a lista do zero */
  let linksNovos = true;
  let vozFechada = true;     // a próxima transcrição de entrada começa uma pergunta nova
  let turnoAcabou = false;
  let saindo = false;
  let fimPendente: MotivoFim | null = null;
  let respondidoEm = 0;
  /** a toolResponse desta consulta já foi (zera a cada toolCall): o turnComplete que vem depois sem voz nenhuma
      (resposta recusada, chamada malformada…) volta a ouvir na hora, em vez de 15 s em "Consultando o sistema…" */
  let respostaEnviada = false;
  const pendentes = new Map<string, Pendente>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let tique: ReturnType<typeof setInterval> | null = null;

  const acabou = () => fase === 'encerrada' || fase === 'erro';

  const depois = (ms: number, fn: () => void) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
    return t;
  };
  const cancelarTimer = (t: ReturnType<typeof setTimeout> | null) => { if (t) { clearTimeout(t); timers.delete(t); } };

  const estado = (): EstadoVoz => ({
    fase, mudo, erro, fim, limiteS, links, falaConcluida,
    palavras: legenda.palavras(posTocada),
    voce: (voce || parcial).replace(/\s+/g, ' ').trim(),
  });
  const emitir = () => op.aoMudar(estado());
  const mudar = (e: EventoFase) => { fase = proximaFase(fase, e); };
  const atividade = () => { ultimaAtividade = agora(); };

  const enviar = (m: unknown) => {
    if (!ws || ws.readyState !== ABERTO) return;
    try { ws.send(JSON.stringify(m)); } catch { /* o close conta a história */ }
  };

  function liberar() {
    for (const t of timers) clearTimeout(t);
    timers.clear();
    if (tique) { clearInterval(tique); tique = null; }
    for (const p of pendentes.values()) { p.cancelada = true; p.ctrl.abort(); }
    pendentes.clear();
    d.audio.aoCapturar(null);
    d.audio.aoTocar(null);
    const w = ws;
    ws = null;
    if (w) {
      w.onopen = null; w.onmessage = null; w.onclose = null; w.onerror = null;
      try { w.close(1000); } catch { /* já fechado */ }
    }
    d.audio.fechar();
  }

  function falhar(c: CodigoErroVoz) {
    if (acabou()) return;
    liberar();
    erro = c;
    mudar({ tipo: 'erro' });
    emitir();
  }

  function encerrarCom(m: MotivoFim | null) {
    if (acabou()) return;
    liberar();
    fim = m;
    mudar({ tipo: 'encerrar' });
    emitir();
  }

  /* ---------------------------------------------------------------- a fala dela */

  function legendaNovaSePreciso() {
    if (!limparLegenda) return;
    limparLegenda = false;
    legenda.limpar();
  }

  /** a pessoa começou uma pergunta nova: a linha cinza recomeça; a legenda e os links da resposta anterior saem —
      menos quando ela já está consultando ou respondendo (a transcrição da pergunta pode chegar DEPOIS: a ordem
      entre transcrição e fala não é garantida; aí a fala que está na tela é a resposta desta pergunta) */
  function perguntaNova() {
    if (!vozFechada) return;
    vozFechada = false;
    voce = '';
    parcial = '';
    if (fase !== 'ouvindo') return;
    links = [];
    legenda.limpar();
    limparLegenda = false;
  }

  /** a fala acabou de tocar inteira: tudo dito, volta a ouvir (ou encerra, se o servidor/tempo pediu) */
  function falaTocada() {
    legenda.concluir();
    const t = legenda.texto();
    if (t) falaConcluida = t;
    mudar({ tipo: 'tocou_tudo' });
    atividade();
    if (fimPendente) { encerrarCom(fimPendente); return; }
    verificar();
  }

  function aoTocador(e: EventoTocador) {
    if (acabou()) return;
    posTocada = Math.max(posTocada, e.pos);
    if (e.t === 'vazio' && e.pos >= enfileiradas) {
      filaVazia = true;
      if (turnoAcabou && fase === 'falando') falaTocada();
    }
    if (e.t !== 'vazio') atividade();
    emitir();
  }

  /* ---------------------------------------------------------------- ferramentas */

  async function executar(chamadas: ChamadaFerramenta[]) {
    mudar({ tipo: 'ferramenta' });
    respostaEnviada = false;
    atividade();
    emitir();
    const lote: Pendente[] = chamadas.map((c) => ({ c, ctrl: new AbortController(), cancelada: false }));
    for (const p of lote) if (p.c.id) pendentes.set(p.c.id, p);
    const rs = await Promise.all(lote.map(async (p): Promise<{ resp: RespostaFerramentaVoz; links: LinkAssistente[] }> => {
      const prazo = setTimeout(() => p.ctrl.abort(), PRAZO_FERRAMENTA_MS);
      try {
        const r = await d.executarFerramenta({ org: op.org, nome: p.c.nome, args: p.c.args, signal: p.ctrl.signal });
        return { resp: { id: p.c.id, nome: p.c.nome, ok: true, resultado: r.resultado }, links: r.links };
      } catch (e) {
        if (!p.cancelada) d.aviso?.(`assistente voz: ferramenta ${p.c.nome} falhou (${e instanceof ErroAssistente ? e.codigo : 'rede'})`);
        return { resp: { id: p.c.id, nome: p.c.nome, ok: false, erro: 'falha_consulta' }, links: [] };
      } finally {
        clearTimeout(prazo);
        if (p.c.id && pendentes.get(p.c.id) === p) pendentes.delete(p.c.id);
      }
    }));
    if (acabou()) return;
    const validas = rs.filter((_, i) => !lote[i].cancelada);
    if (!validas.length) {
      // a pessoa falou por cima e o servidor cancelou tudo: nada a responder
      if (fase === 'consultando') mudar({ tipo: 'interrompida' });
      emitir();
      return;
    }
    enviar(montarToolResponse(validas.map((v) => v.resp)));
    respondidoEm = agora();
    respostaEnviada = true;
    atividade();
    links = juntarLinks(links, validas.flatMap((v) => v.links));
    emitir();
  }

  function cancelar(ids: string[]) {
    for (const id of ids) {
      const p = pendentes.get(id);
      if (!p) continue;
      p.cancelada = true;
      p.ctrl.abort();
      pendentes.delete(id);
    }
  }

  /* ---------------------------------------------------------------- mensagens */

  function aoPronta() {
    if (setupFeito) return;
    setupFeito = true;
    inicio = agora();
    atividade();
    enviar(msgCumprimento(servidor?.gatilho_inicio));
    d.audio.mudo(mudo);
    d.audio.aoCapturar((x) => {
      if (mudo || !setupFeito || acabou()) return;
      enviar(msgAudio(pedacoParaEnvio(x)));
    });
    mudar({ tipo: 'pronta' });
    // a voz do cumprimento não veio (o modelo calou): a frase aparece só na legenda — a tela nunca fica muda
    depois(ESPERA_CUMPRIMENTO_MS, () => {
      if (acabou() || !legenda.vazia() || voce || parcial || fase !== 'ouvindo') return;
      legenda.definir(servidor?.saudacao || cumprimentoReserva(op.nome));
      limparLegenda = true;   // se a voz do cumprimento chegar atrasada, ela substitui esta frase
      emitir();
    });
    tique = setInterval(verificar, TIQUE_MS);
  }

  function tratar(evs: EventoServidor[]) {
    const marca = enfileiradas; // a legenda deste pedaço acende quando a fila chegar aqui
    for (const e of evs) {
      if (acabou()) return;
      switch (e.tipo) {
        case 'pronta': aoPronta(); break;
        case 'audio': {
          if (turnoAcabou) turnoAcabou = false;   // fala nova depois do fim do turno anterior
          legendaNovaSePreciso();
          const x = decodificar(e.dados);
          if (!x.length) break;
          const n = x.length;
          d.audio.tocar(x);
          enfileiradas += n;
          filaVazia = false;
          mudar({ tipo: 'audio' });
          atividade();
          break;
        }
        case 'fala':
          legendaNovaSePreciso();
          legenda.adicionar(e.texto, marca);
          atividade();
          break;
        case 'ouvido':
          perguntaNova();
          voce += e.texto;
          parcial = '';
          atividade();
          break;
        case 'ouvido_parcial':
          perguntaNova();
          parcial = e.texto;
          atividade();
          break;
        case 'interrompida':
          d.audio.interromper();
          legenda.cortar(posTocada);
          decodificar.limpar();
          filaVazia = true;
          posTocada = enfileiradas;
          limparLegenda = true;
          linksNovos = true;
          vozFechada = true;
          turnoAcabou = false;
          mudar({ tipo: 'interrompida' });
          break;
        case 'geracao_fim':
          d.audio.fimDaFala();
          turnoAcabou = true;
          if (filaVazia && fase === 'falando') falaTocada();
          break;
        case 'turno_fim':
          if (e.motivo) d.aviso?.(`assistente voz: turno encerrado (${e.motivo})`);
          d.audio.fimDaFala();
          decodificar.limpar();
          turnoAcabou = true;
          linksNovos = true;
          vozFechada = true;
          if (filaVazia) {
            if (fase === 'falando') falaTocada();
            else {
              legenda.concluir();
              // já respondeu a consulta e o turno acabou sem voz: volta a ouvir (o áudio que ainda vier vira "Falando")
              if (fase === 'consultando' && respostaEnviada && pendentes.size === 0) mudar({ tipo: 'interrompida' });
              else mudar({ tipo: 'turno_fim', tocando: false });
              if (fimPendente && fase === 'ouvindo') encerrarCom(fimPendente);
            }
          }
          break;
        case 'ferramentas':
          limparLegenda = true;   // a resposta que vem depois da consulta é uma fala nova
          if (linksNovos) { linksNovos = false; links = []; }
          void executar(e.chamadas);
          break;
        case 'cancelar': cancelar(e.ids); break;
        case 'saindo': aoSaindo(e.restanteMs); break;
      }
    }
    if (!acabou()) emitir();
  }

  function aoSaindo(restanteMs: number | null) {
    saindo = true;
    d.aviso?.(`assistente voz: o servidor vai encerrar (${restanteMs ?? '?'} ms)`);
    if (fase === 'ouvindo') { encerrarCom('servidor'); return; }
    fimPendente = 'servidor';
    depois(Math.max(0, (restanteMs ?? 5000) - 500), () => encerrarCom('servidor'));
  }

  function verificar() {
    if (acabou() || !setupFeito) return;
    const m = verificarFim({ agora: agora(), inicio, ultimaAtividade, limiteS, fase });
    if (m) { encerrarCom(m); return; }
    if (fase === 'consultando' && pendentes.size === 0 && respondidoEm && agora() - respondidoEm >= PRAZO_RESPOSTA_MS) {
      mudar({ tipo: 'interrompida' });
      atividade();
      emitir();
    }
  }

  /* ---------------------------------------------------------------- conexão */

  const lerDados = (dados: unknown): unknown => {
    try {
      if (typeof dados === 'string') return JSON.parse(dados);
      if (textoDec && dados instanceof ArrayBuffer) return JSON.parse(textoDec.decode(dados));
      if (textoDec && ArrayBuffer.isView(dados)) return JSON.parse(textoDec.decode(dados));
    } catch { /* quadro que não é JSON */ }
    return null;
  };

  function conectar(s: SessaoVozServidor, tentativa: number) {
    if (acabou()) return;
    servidor = s;
    limiteS = limiteDaSessao(s.limite_s);
    const modelo = s.modelo || MODELO_PADRAO;
    let prazoSetup: ReturnType<typeof setTimeout> | null = null;
    let w: WsLike;
    try { w = d.criarWs(urlDoWebSocket(s.token, s.ws_url)); } catch { falhar('conexao'); return; }
    ws = w;
    try { w.binaryType = 'arraybuffer'; } catch { /* ambiente sem binaryType */ }
    w.onopen = () => { if (ws === w) enviar(msgSetup(modelo)); };
    w.onmessage = (ev) => {
      if (ws !== w) return;
      const m = lerDados(ev.data);
      if (m) tratar(lerMensagemServidor(m));
    };
    w.onerror = () => { /* o close vem em seguida, com o código */ };
    w.onclose = (ev) => {
      if (ws !== w) return;
      ws = null;
      if (acabou()) return;
      d.aviso?.(`assistente voz: conexão fechada (${ev.code}${ev.reason ? `: ${String(ev.reason).slice(0, 160)}` : ''})`);
      if (saindo) { encerrarCom('servidor'); return; }
      const c = erroDoFechamento(ev, setupFeito);
      if (c === null) { encerrarCom('servidor'); return; }
      if (c === 'conexao' && tentativa === 1) {
        // fechou antes do setupComplete: UM token novo (o 1º pode ter vencido)
        cancelarTimer(prazoSetup);
        d.pedirSessao(op.org).then((s2) => conectar(s2, 2), (e) => falhar(codigoDoServidor(e)));
        return;
      }
      falhar(c);
    };
    prazoSetup = depois(PRAZO_SETUP_MS, () => {
      if (setupFeito || acabou() || ws !== w) return;
      d.aviso?.('assistente voz: o setup não respondeu');
      falhar('conexao');
    });
  }

  async function comecar() {
    let s: SessaoVozServidor;
    d.audio.aoTocar(aoTocador);
    const perm = await (d.permissaoMicrofone?.().catch(() => 'desconhecida' as const) ?? Promise.resolve('desconhecida' as const));
    if (acabou()) return;
    if (perm === 'granted') {
      const [mic, srv] = await Promise.allSettled([d.audio.preparar(), d.pedirSessao(op.org)]);
      if (acabou()) return;
      if (mic.status === 'rejected') { falhar(erroDoMicrofone(mic.reason)); return; }
      if (srv.status === 'rejected') { falhar(codigoDoServidor(srv.reason)); return; }
      s = srv.value;
    } else {
      try { await d.audio.preparar(); } catch (e) { falhar(erroDoMicrofone(e)); return; }
      if (acabou()) return;
      try { s = await d.pedirSessao(op.org); } catch (e) { falhar(codigoDoServidor(e)); return; }
      if (acabou()) return;
    }
    conectar(s, 1);
  }

  return {
    iniciar() {
      if (iniciada) return;
      iniciada = true;
      emitir();
      void comecar();
    },
    alternarMudo() {
      if (acabou()) return;
      mudo = !mudo;
      d.audio.mudo(mudo);
      if (mudo && setupFeito) enviar(msgFimDoAudio());
      atividade();
      emitir();
    },
    encerrar() { encerrarCom(null); },
    bandas(dt) {
      if (acabou() || !faseAtiva(fase)) return { g: 0, m: 0, a: 0, entrada: 0 };
      return d.audio.bandas(dt);
    },
    estado,
  };
}

/** Uma sessão que já nasce com erro (ex.: o navegador não tem AudioWorklet). */
export function sessaoComErro(codigo: CodigoErroVoz, aoMudar: (e: EstadoVoz) => void): SessaoVoz {
  const e: EstadoVoz = {
    fase: 'erro', mudo: false, palavras: [], voce: '', links: [], erro: codigo, fim: null,
    limiteS: limiteDaSessao(undefined), falaConcluida: '',
  };
  return {
    iniciar() { aoMudar(e); },
    alternarMudo() { /* nada */ },
    encerrar() { /* nada */ },
    bandas: () => ({ g: 0, m: 0, a: 0, entrada: 0 }),
    estado: () => e,
  };
}
