/* ------------------------------------------------------------------
   MODO DE VOZ do assistente (dono 30/10: "eu quero por voz mesmo. Por
   texto não me agrada") — a lógica PURA, sem DOM nem rede (testada em
   assistenteVoz.test.ts). Conversa AO VIVO com o Live API do Gemini
   (gemini-3.8-live, voz Despina): o navegador fala DIRETO com o Google
   por WebSocket, com um token efêmero que o servidor (assistente-voz)
   cria com a configuração travada; nenhum áudio passa pelo Supabase.
   Aqui:
   - áudio: Float32 ↔ PCM16 LE ↔ base64; reamostragem (microfone fora de
     16 kHz, ex.: Firefox); decodificador da fala de 24 kHz com sobra de
     byte entre pedaços (nada de amostra desalinhada);
   - legenda sincronizada: cada pedaço da transcrição dela recebe a
     marca (amostras já na fila quando chegou) e a palavra acende quando
     a reprodução passa por ela; na interrupção, o que não foi dito sai;
   - leitura das mensagens do servidor (TODOS os campos de cada mensagem,
     nada de else-if: áudio + transcrição + turnComplete podem vir juntos);
   - fases (conectando → ouvindo ⇄ consultando → falando → ouvindo…),
     fim por silêncio (60 s) e por tempo (teto do servidor, ≤ 10 min);
   - resposta das ferramentas (toolResponse no formato exato da
     documentação) e o resultado ENXUTO que vai para o modelo (sem id de
     conversa nem horário ISO; listas de clientes cortadas em 5, com o
     total ao lado; equipe e campanhas inteiras — os links vão à parte,
     para a tela);
   - os erros (fechamento do WebSocket, microfone) e as frases da tela.
   Protocolo: scratchpad/assistente/LIVE-API.md (pesquisa de 30/10).
   ------------------------------------------------------------------ */

import type { CodigoErroAssistente } from '@/data/assistente';

export const TAXA_ENTRADA = 16000;
export const TAXA_SAIDA = 24000;
/** 512 amostras = 32 ms a 16 kHz (a doc pede pedaços de 20 a 40 ms) */
export const AMOSTRAS_POR_PEDACO = 512;
export const MIME_ENTRADA = `audio/pcm;rate=${TAXA_ENTRADA}`;
/** fecha sozinho depois de 1 minuto sem fala (o microfone aberto é cobrado o tempo todo) */
export const SILENCIO_MAX_MS = 60_000;
/** teto da conversa (o servidor manda limite_s; nunca acima de 10 min) */
export const LIMITE_MAX_S = 600;
export const LIMITE_MIN_S = 30;
/** no teto de tempo ela termina a frase (até 20 s) antes de encerrar */
export const GRACA_FIM_MS = 20_000;
export const MODELO_PADRAO = 'gemini-3.8-live';
export const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
/** a mensagem que pede o cumprimento (o system prompt do servidor manda dizer "Oi, {nome}. Pode perguntar.") */
export const INICIO_DA_CONVERSA = '[início da conversa]';
/** quanto da legenda aparece antes de ser dito (apagado), em amostras de 24 kHz */
export const LEGENDA_ADIANTE = Math.round(1.2 * TAXA_SAIDA);
/** itens de cada lista de CLIENTES que vão para o modelo (voz: os 3 primeiros + o total, que vem junto) */
export const MAX_ITENS_VOZ = 5;
/** teto das outras listas (equipe, vendedores, campanhas, opções de nome): vão INTEIRAS — sem `total` ao lado, um
    corte faria o modelo responder errado ("quem tem mais sem resposta?" sem a 6ª pessoa); o teto só segura o custo */
export const MAX_ITENS_LISTA = 40;

/* ================================================================== áudio */

/** Float32 [-1, 1] → Int16 (com teto; NaN vira silêncio). */
export function floatParaPcm16(x: Float32Array): Int16Array {
  const out = new Int16Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const s = Number.isNaN(v) ? 0 : v > 1 ? 1 : v < -1 ? -1 : v;
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** Int16 → bytes little-endian (independe da ordem de bytes da máquina). */
export function pcm16ParaBytes(x: Int16Array): Uint8Array {
  const out = new Uint8Array(x.length * 2);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < x.length; i++) dv.setInt16(i * 2, x[i], true);
  return out;
}

export function bytesParaBase64(b: Uint8Array): string {
  let s = '';
  const PASSO = 0x2000;
  for (let i = 0; i < b.length; i += PASSO) {
    s += String.fromCharCode(...b.subarray(i, Math.min(b.length, i + PASSO)));
  }
  return btoa(s);
}

export function base64ParaBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** O pedaço do microfone pronto para o realtimeInput: Float32 → PCM16 LE → base64. */
export const pedacoParaEnvio = (x: Float32Array): string => bytesParaBase64(pcm16ParaBytes(floatParaPcm16(x)));

/** A fala dela (PCM16 LE, 24 kHz, em base64) → Float32. Pedaço com número ímpar de bytes: o byte que sobra
    espera o próximo pedaço (amostra desalinhada vira chiado). */
export function criarDecodificadorPcm(): { (b64: string): Float32Array; limpar(): void } {
  let sobra: number | null = null;
  const dec = (b64: string): Float32Array => {
    let b: Uint8Array;
    try { b = base64ParaBytes(b64); } catch { return new Float32Array(0); }
    if (sobra !== null) {
      const junto = new Uint8Array(b.length + 1);
      junto[0] = sobra;
      junto.set(b, 1);
      b = junto;
      sobra = null;
    }
    const n = b.length >> 1;
    if (b.length % 2) sobra = b[b.length - 1];
    const dv = new DataView(b.buffer, b.byteOffset, n * 2);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, true) / 32768;
    return out;
  };
  dec.limpar = () => { sobra = null; };
  return dec;
}

/** Reamostrador por pedaços (o estado passa de um pedaço para o outro): para baixo (48 → 16 kHz), média de
    cada janela (filtra o que passaria de 8 kHz); para cima, interpolação linear. */
export function criarReamostrador(de: number, para: number): (x: Float32Array) => Float32Array {
  const r = de / para;
  if (!(r > 0) || !Number.isFinite(r)) throw new Error('taxa inválida');
  if (Math.abs(r - 1) < 1e-9) return (x) => x.slice();
  if (r > 1) {
    let soma = 0;
    let n = 0;
    let lim = r;   // fim da janela atual, em amostras de entrada desde o começo
    let idx = 0;   // amostras de entrada já vistas
    return (x) => {
      const out = new Float32Array(Math.floor((idx + x.length) / r) - Math.floor(idx / r) + 1);
      let k = 0;
      for (let i = 0; i < x.length; i++) {
        soma += x[i];
        n++;
        idx++;
        if (idx >= lim - 1e-9) {
          out[k++] = soma / n;
          soma = 0;
          n = 0;
          lim += r;
        }
      }
      return out.slice(0, k);
    };
  }
  // para cima: as saídas caem nas posições 0, r, 2r… da entrada; t = posição da próxima saída depois de `ant`
  let ant: number | null = null;
  let t = 0;
  return (x) => {
    const out: number[] = [];
    let i = 0;
    if (ant === null) {
      if (!x.length) return new Float32Array(0);
      ant = x[0];
      out.push(ant);
      t = r;
      i = 1;
    }
    for (; i < x.length; i++) {
      const atual = x[i];
      while (t < 1 - 1e-9) {
        out.push(ant + (atual - ant) * t);
        t += r;
      }
      t -= 1;
      ant = atual;
    }
    return Float32Array.from(out);
  };
}

/* ================================================================== legenda */

export interface PalavraLegenda { texto: string; dita: boolean }

export interface Legenda {
  /** um pedaço da transcrição dela; `marca` = amostras já na fila de reprodução quando ele chegou */
  adicionar(texto: string, marca: number): void;
  /** as palavras para a tela: ditas (a reprodução já passou) e as próximas, apagadas, até `adiante` amostras */
  palavras(pos: number, adiante?: number): PalavraLegenda[];
  /** interrompida: só fica o que ela chegou a dizer */
  cortar(pos: number): void;
  /** a fala acabou de tocar: tudo dito */
  concluir(): void;
  /** texto já pronto, todo dito (o cumprimento de reserva) */
  definir(texto: string): void;
  limpar(): void;
  texto(): string;
  vazia(): boolean;
}

export function criarLegenda(): Legenda {
  let texto = '';
  let marcas: { ini: number; marca: number }[] = [];
  let tudo = false;

  const marcaDoCaractere = (i: number): number => {
    let m = 0;
    for (const s of marcas) { if (s.ini > i) break; m = s.marca; }
    return m;
  };
  const lista = () => {
    const out: { texto: string; marca: number }[] = [];
    for (const m of texto.matchAll(/\S+/g)) {
      const fim = (m.index ?? 0) + m[0].length - 1;
      out.push({ texto: m[0], marca: marcaDoCaractere(fim) });
    }
    return out;
  };

  return {
    adicionar(t, marca) {
      if (!t) return;
      marcas.push({ ini: texto.length, marca: Math.max(0, marca) });
      texto += t;
      tudo = false;
    },
    palavras(pos, adiante = LEGENDA_ADIANTE) {
      return lista()
        .filter((p) => tudo || p.marca <= pos + adiante)
        .map((p) => ({ texto: p.texto, dita: tudo || p.marca <= pos }));
    },
    cortar(pos) {
      if (tudo) return;
      const ditas = lista().filter((p) => p.marca <= pos).map((p) => p.texto);
      texto = ditas.join(' ');
      marcas = [{ ini: 0, marca: 0 }];
      tudo = true;
    },
    concluir() { tudo = true; },
    definir(t) { texto = t; marcas = [{ ini: 0, marca: 0 }]; tudo = true; },
    limpar() { texto = ''; marcas = []; tudo = false; },
    texto: () => texto.replace(/\s+/g, ' ').trim(),
    vazia: () => !texto.trim(),
  };
}

/* ================================================================== mensagens do servidor */

export interface ChamadaFerramenta { id?: string; nome: string; args: Record<string, unknown> }

export type EventoServidor =
  | { tipo: 'pronta' }
  | { tipo: 'audio'; dados: string }
  | { tipo: 'fala'; texto: string }
  | { tipo: 'ouvido'; texto: string }
  | { tipo: 'ouvido_parcial'; texto: string }
  | { tipo: 'interrompida' }
  | { tipo: 'geracao_fim' }
  | { tipo: 'turno_fim'; motivo?: string }
  | { tipo: 'ferramentas'; chamadas: ChamadaFerramenta[] }
  | { tipo: 'cancelar'; ids: string[] }
  | { tipo: 'saindo'; restanteMs: number | null };

const obj = (x: unknown): Record<string, unknown> | null =>
  (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : null);
const textoDe = (x: unknown): string | null => {
  const o = obj(x);
  return o && typeof o.text === 'string' ? o.text : null;
};

/** "10s", "9.5s", "1.000s" (Duration do protobuf em JSON) → ms */
export function duracaoMs(x: unknown): number | null {
  if (typeof x !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?)s\s*$/.exec(x);
  return m ? Math.round(parseFloat(m[1]) * 1000) : null;
}

/** Uma mensagem do servidor → eventos, na ordem em que a tela deve tratar. TODOS os campos de cada mensagem
    (um serverContent pode trazer áudio, transcrição e turnComplete juntos) e todas as parts. */
export function lerMensagemServidor(m: unknown): EventoServidor[] {
  const o = obj(m);
  if (!o) return [];
  const ev: EventoServidor[] = [];
  if (o.setupComplete !== undefined) ev.push({ tipo: 'pronta' });
  const sc = obj(o.serverContent);
  if (sc) {
    const turno = obj(sc.modelTurn);
    const parts = Array.isArray(turno?.parts) ? turno!.parts as unknown[] : [];
    for (const p of parts) {
      const dados = obj(obj(p)?.inlineData);
      if (dados && typeof dados.data === 'string' && dados.data
        && (typeof dados.mimeType !== 'string' || /^audio\/pcm/i.test(dados.mimeType))) {
        ev.push({ tipo: 'audio', dados: dados.data });
      }
    }
    const fala = textoDe(sc.outputTranscription);
    if (fala) ev.push({ tipo: 'fala', texto: fala });
    const ouvido = textoDe(sc.inputTranscription);
    if (ouvido) ev.push({ tipo: 'ouvido', texto: ouvido });
    const parcial = textoDe(sc.interimInputTranscription);
    if (parcial) ev.push({ tipo: 'ouvido_parcial', texto: parcial });
    if (sc.interrupted === true) ev.push({ tipo: 'interrompida' });
    if (sc.generationComplete === true) ev.push({ tipo: 'geracao_fim' });
    if (sc.turnComplete === true) {
      ev.push({ tipo: 'turno_fim', ...(typeof sc.turnCompleteReason === 'string' ? { motivo: sc.turnCompleteReason } : {}) });
    }
  }
  const tc = obj(o.toolCall);
  if (tc && Array.isArray(tc.functionCalls)) {
    const chamadas: ChamadaFerramenta[] = [];
    for (const c of tc.functionCalls as unknown[]) {
      const fc = obj(c);
      if (!fc || typeof fc.name !== 'string' || !fc.name) continue;
      chamadas.push({
        ...(typeof fc.id === 'string' && fc.id ? { id: fc.id } : {}),
        nome: fc.name,
        args: obj(fc.args) ?? {},
      });
    }
    if (chamadas.length) ev.push({ tipo: 'ferramentas', chamadas });
  }
  const cancel = obj(o.toolCallCancellation);
  if (cancel && Array.isArray(cancel.ids)) {
    const ids = (cancel.ids as unknown[]).filter((x): x is string => typeof x === 'string');
    if (ids.length) ev.push({ tipo: 'cancelar', ids });
  }
  const sai = obj(o.goAway);
  if (sai) ev.push({ tipo: 'saindo', restanteMs: duracaoMs(sai.timeLeft) });
  return ev;
}

/* ================================================================== mensagens do cliente */

export const msgSetup = (modelo: string) => ({ setup: { model: modelo.startsWith('models/') ? modelo : `models/${modelo}` } });
export const msgCumprimento = (gatilho: string = INICIO_DA_CONVERSA) => ({
  clientContent: { turns: [{ role: 'user', parts: [{ text: gatilho || INICIO_DA_CONVERSA }] }], turnComplete: true },
});
export const msgAudio = (base64: string, mime = MIME_ENTRADA) => ({ realtimeInput: { audio: { data: base64, mimeType: mime } } });
export const msgFimDoAudio = () => ({ realtimeInput: { audioStreamEnd: true } });

export type RespostaFerramentaVoz =
  | { id?: string; nome: string; ok: true; resultado: unknown }
  | { id?: string; nome: string; ok: false; erro: string };

/** UMA mensagem com todas as respostas daquele toolCall (id e name em cada uma). Sucesso em response.output
    (o resultado já enxuto); falha da consulta em response.error (a chave que a referência reserva para erro). */
export function montarToolResponse(rs: RespostaFerramentaVoz[]) {
  return {
    toolResponse: {
      functionResponses: rs.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        name: r.nome,
        response: r.ok ? { output: resultadoParaVoz(r.resultado) } : { error: r.erro },
      })),
    },
  };
}

const CHAVES_FORA = new Set(['conversa_id', 'id']);
const CHAVES_HORARIO = new Set(['esperando_desde', 'ultima_msg_em']);

/** "2026-08-07T16:54:47-03:00" → "07/08/2026 16:54" (o horário já vem no fuso de São Paulo). */
export function horarioFalado(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : iso;
}

/** O resultado da ferramenta como vai para o MODELO: sem ids (o modelo fala de pessoas pelo nome; os links das
    conversas vão à parte, para a tela), horários legíveis e cada lista de CLIENTES em até 5 itens (o total real
    continua no campo `total`). As listas de equipe/vendedores/campanhas/opções vão inteiras (não têm `total` ao
    lado). Cada token conta duas vezes na voz: o contexto inteiro é cobrado de novo a cada turno. */
export function resultadoParaVoz(v: unknown, chave?: string): unknown {
  if (typeof v === 'string') return chave && CHAVES_HORARIO.has(chave) ? horarioFalado(v) : v;
  if (Array.isArray(v)) {
    return v.slice(0, chave === 'clientes' ? MAX_ITENS_VOZ : MAX_ITENS_LISTA).map((x) => resultadoParaVoz(x));
  }
  const o = obj(v);
  if (o) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) {
      if (CHAVES_FORA.has(k)) continue;
      out[k] = resultadoParaVoz(x, k);
    }
    return out;
  }
  return v;
}

/** O token vai na URL como o exemplo oficial (com a "/" de auth_tokens/…); só o que quebraria a query é escapado.
    A ws_url do servidor vale só se for o endpoint Constrained do Google. NUNCA registrar esta URL (leva o token). */
const RE_WS = /^wss:\/\/generativelanguage\.googleapis\.com\/ws\/google\.ai\.generativelanguage\.v1(?:alpha|beta)\.GenerativeService\.BidiGenerateContentConstrained\?access_token=[^\s]+$/;
export function urlDoWebSocket(token: string, wsUrl?: unknown): string {
  if (typeof wsUrl === 'string' && RE_WS.test(wsUrl)) return wsUrl;
  return `${WS_BASE}?access_token=${token.replace(/[^\w\-./~]/g, (c) => encodeURIComponent(c))}`;
}

/* ================================================================== fases */

export type FaseVoz = 'conectando' | 'ouvindo' | 'consultando' | 'falando' | 'encerrada' | 'erro';
export type MotivoFim = 'silencio' | 'tempo' | 'servidor';

export type EventoFase =
  | { tipo: 'pronta' }                       // setupComplete
  | { tipo: 'ferramenta' }                   // toolCall
  | { tipo: 'audio' }                        // chegou fala dela
  | { tipo: 'tocou_tudo' }                   // a fila esvaziou com o turno dela encerrado
  | { tipo: 'turno_fim'; tocando: boolean }  // turnComplete
  | { tipo: 'interrompida' }                 // a pessoa falou por cima (ou todas as ferramentas foram canceladas)
  | { tipo: 'encerrar' }
  | { tipo: 'erro' };

const TERMINAL: ReadonlySet<FaseVoz> = new Set(['encerrada', 'erro']);
export const faseAtiva = (f: FaseVoz) => f === 'ouvindo' || f === 'consultando' || f === 'falando';

/** A máquina de estados da tela (uma linha de estado: "Conectando…", "Ouvindo", "Consultando o sistema…",
    "Falando"). Encerrada e erro são finais; conectando só sai com setupComplete. */
export function proximaFase(f: FaseVoz, e: EventoFase): FaseVoz {
  if (TERMINAL.has(f)) return f;
  if (e.tipo === 'encerrar') return 'encerrada';
  if (e.tipo === 'erro') return 'erro';
  if (f === 'conectando') return e.tipo === 'pronta' ? 'ouvindo' : f;
  switch (e.tipo) {
    case 'pronta': return f;
    case 'ferramenta': return 'consultando';
    case 'audio': return 'falando';
    case 'tocou_tudo': return f === 'falando' ? 'ouvindo' : f;
    case 'turno_fim': return e.tocando ? f : (f === 'consultando' ? f : 'ouvindo');
    case 'interrompida': return 'ouvindo';
    default: return f;
  }
}

/** O relógio da conversa: 1 minuto ouvindo sem fala nenhuma → silêncio; no teto de tempo → tempo (falando ou
    consultando, ela termina a frase: até 20 s a mais). */
export function verificarFim(p: {
  agora: number; inicio: number; ultimaAtividade: number; limiteS: number; fase: FaseVoz;
}): MotivoFim | null {
  if (!faseAtiva(p.fase)) return null;
  const limiteMs = limiteDaSessao(p.limiteS) * 1000;
  const decorrido = p.agora - p.inicio;
  if (decorrido >= limiteMs + (p.fase === 'ouvindo' ? 0 : GRACA_FIM_MS)) return 'tempo';
  if (p.fase === 'ouvindo' && p.agora - p.ultimaAtividade >= SILENCIO_MAX_MS) return 'silencio';
  return null;
}

export const limiteDaSessao = (s: unknown): number => {
  const n = typeof s === 'number' && Number.isFinite(s) ? Math.round(s) : LIMITE_MAX_S;
  return Math.max(LIMITE_MIN_S, Math.min(LIMITE_MAX_S, n));
};

/* ================================================================== erros */

export type CodigoErroVoz =
  | CodigoErroAssistente
  | 'microfone_negado' | 'microfone_ausente' | 'microfone_falhou' | 'sem_suporte' | 'conexao' | 'queda';

const RE_CREDITO = /quota|resource[_ ]?exhausted|billing|credit|prepayment|depleted/i;

/** O fechamento do WebSocket que a tela não pediu. Os códigos não são documentados (comunidade: 1007 campo
    inválido, 1008 política/token vencido, 1011 erro interno); a falta de crédito aparece no motivo.
    null = fim normal (o servidor encerrou com 1000 depois do setup). */
export function erroDoFechamento(ev: { code: number; reason?: string }, setupFeito: boolean): CodigoErroVoz | null {
  if (RE_CREDITO.test(ev.reason ?? '')) return 'sem_credito';
  if (!setupFeito) return 'conexao';
  if (ev.code === 1000) return null;
  return 'queda';
}

/** Erro já com o código da tela (navegador sem suporte, microfone…). */
export class ErroVoz extends Error {
  codigo: CodigoErroVoz;
  constructor(codigo: CodigoErroVoz, mensagem?: string) {
    super(mensagem || codigo);
    this.name = 'ErroVoz';
    this.codigo = codigo;
  }
}

export function erroDoMicrofone(e: unknown): CodigoErroVoz {
  if (e instanceof ErroVoz) return e.codigo;
  const nome = (e as { name?: string } | null)?.name ?? '';
  if (/NotAllowed|Security|PermissionDenied/i.test(nome)) return 'microfone_negado';
  if (/NotFound|DevicesNotFound|Overconstrained/i.test(nome)) return 'microfone_ausente';
  if (e instanceof TypeError) return 'sem_suporte';
  return 'microfone_falhou';
}

export interface MensagemErroVoz { titulo: string; texto: string; tentar: boolean }

export const MENSAGENS_ERRO_VOZ: Record<CodigoErroVoz, MensagemErroVoz> = {
  microfone_negado: {
    titulo: 'Microfone bloqueado',
    texto: 'Clique no cadeado ao lado do endereço do site, em Microfone escolha Permitir e tente de novo.',
    tentar: true,
  },
  microfone_ausente: { titulo: 'Nenhum microfone encontrado', texto: 'Conecte um microfone ou um fone com microfone e tente de novo.', tentar: true },
  microfone_falhou: { titulo: 'Microfone indisponível', texto: 'Outro programa pode estar usando o microfone. Feche-o e tente de novo.', tentar: true },
  sem_suporte: { titulo: 'Navegador sem suporte', texto: 'Use o Google Chrome atualizado para conversar com a assistente.', tentar: false },
  pergunta_invalida: { titulo: 'Não consegui começar', texto: 'Tente de novo em instantes.', tentar: true },
  nao_autenticado: { titulo: 'Sessão expirada', texto: 'Entre de novo no Atenvo para continuar.', tentar: false },
  sem_acesso: { titulo: 'Sem acesso', texto: 'O seu acesso a esta empresa não permite usar a assistente.', tentar: false },
  limite_dia: { titulo: 'Limite de hoje atingido', texto: 'Você já usou as conversas de voz de hoje. Amanhã libera de novo.', tentar: false },
  sem_credito: { titulo: 'IA sem crédito', texto: 'A IA está sem crédito agora. Avise o administrador.', tentar: false },
  ia_indisponivel: { titulo: 'A IA não respondeu', texto: 'Tente de novo em instantes.', tentar: true },
  rede: { titulo: 'Sem conexão', texto: 'Confira a internet e tente de novo.', tentar: true },
  conexao: { titulo: 'Não consegui conectar', texto: 'A conexão com a IA não abriu. Tente de novo em instantes.', tentar: true },
  queda: { titulo: 'A conexão caiu', texto: 'A conversa foi interrompida. Tente de novo.', tentar: true },
};

export function textoDoFim(motivo: MotivoFim, limiteS: number): string {
  if (motivo === 'silencio') return 'Encerrada depois de 1 minuto sem fala.';
  if (motivo === 'tempo') {
    const min = Math.max(1, Math.round(limiteDaSessao(limiteS) / 60));
    return `Encerrada no limite de ${min} ${min === 1 ? 'minuto' : 'minutos'} por conversa.`;
  }
  return 'A IA encerrou a sessão.';
}

/** A linha de estado embaixo da esfera. */
export function textoDaFase(f: FaseVoz, mudo: boolean): string {
  switch (f) {
    case 'conectando': return 'Conectando…';
    case 'ouvindo': return mudo ? 'Microfone desligado' : 'Ouvindo';
    case 'consultando': return 'Consultando o sistema…';
    case 'falando': return 'Falando';
    case 'encerrada': return 'Conversa encerrada';
    default: return 'Não deu certo';
  }
}

export const primeiroNomeDe = (nome: string | null | undefined): string => (nome ?? '').trim().split(/\s+/)[0] || '';
export const cumprimentoReserva = (nome: string) => (nome ? `Oi, ${nome}. Pode perguntar.` : 'Oi. Pode perguntar.');
