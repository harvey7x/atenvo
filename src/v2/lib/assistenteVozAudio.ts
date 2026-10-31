/* ------------------------------------------------------------------
   O ÁUDIO do modo de voz (navegador): dois AudioContexts criados NO
   CLIQUE (antes de qualquer await — política de autoplay do Chrome):
   - entrada 16 kHz: microfone (eco, ruído e ganho automáticos) →
     analisador (a esfera reage "de leve" à sua voz) → AudioWorklet de
     captura (pedaços de 512 amostras = 32 ms) → ganho zero → destino (só
     para o grafo puxar; nada do microfone sai na caixa de som). Se o
     navegador não aceitar o microfone num contexto de 16 kHz (Firefox),
     um contexto na taxa nativa + reamostrador para 16 kHz.
   - saída 24 kHz: AudioWorklet de reprodução com FILA (a fala chega mais
     rápido que o tempo real; nada é descartado) → analisador (a esfera)
     → destino. Um pré-buffer de 80 ms no começo de cada fala evita
     buraco; "fim" toca o resto; "interromper" esvazia NA HORA. O worklet
     avisa a posição (amostras consumidas) para a legenda andar junto.
   Os worklets são texto (módulo por Blob URL; o site não tem CSP) — e os
   testes rodam ESTE texto numa caixa de areia (assistenteVozAudio.test).
   ------------------------------------------------------------------ */

import { aplicarGanho, criarGanho, type GanhoBanda } from './bomDia';
import { AMOSTRAS_POR_PEDACO, ErroVoz, TAXA_ENTRADA, TAXA_SAIDA, criarReamostrador } from './assistenteVoz';

/** Captura: junta `tamanho` amostras (512 a 16 kHz) e manda uma cópia para a página. */
export const WORKLET_CAPTURA = `
class AstCaptura extends AudioWorkletProcessor {
  constructor(op) {
    super();
    const t = (op && op.processorOptions && op.processorOptions.tamanho) || 512;
    this.buf = new Float32Array(t);
    this.i = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let k = 0; k < ch.length; k++) {
        this.buf[this.i++] = ch[k];
        if (this.i === this.buf.length) {
          this.port.postMessage(this.buf.slice(0));
          this.i = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('ast-captura', AstCaptura);
`;

/** Reprodução com fila. pos = amostras CONSUMIDAS (tocadas + descartadas na interrupção), na mesma contagem
    das amostras enviadas pela página: a legenda acende a palavra quando pos passa pela marca dela.
    Mensagens: Float32Array (enfileira) · 'fim' (toca o resto que já está na fila, mesmo abaixo do pré-buffer;
    com a fila vazia não faz nada) · 'interromper'.
    Avisa: {t:'tocando'} ao começar · {t:'pos'} a cada ~100 ms · {t:'vazio'} quando a fila acaba. */
export const WORKLET_SAIDA = `
class AstSaida extends AudioWorkletProcessor {
  constructor(op) {
    super();
    const o = (op && op.processorOptions) || {};
    this.pre = o.preBuffer || 0;
    this.aviso = o.aviso || 2400;
    this.fila = [];
    this.off = 0;
    this.naFila = 0;
    this.pos = 0;
    this.tocando = false;
    this.liberado = false;
    this.desde = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d === 'interromper') {
        this.pos += this.naFila;
        this.fila = [];
        this.off = 0;
        this.naFila = 0;
        this.liberado = false;
        this.tocando = false;
        this.desde = 0;
        this.port.postMessage({ t: 'vazio', pos: this.pos });
      } else if (d === 'fim') {
        // vale só para o que JÁ está na fila: um "fim" com a fila vazia (o turnComplete que segue a interrupção
        // — "interrupted > turn_complete" — ou o de um turno sem voz) não pode tirar o pré-buffer da próxima fala
        if (this.naFila > 0) this.liberado = true;
      } else if (d instanceof Float32Array && d.length) {
        this.fila.push(d);
        this.naFila += d.length;
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    let k = 0;
    if (!this.tocando && this.naFila > 0 && (this.naFila >= this.pre || this.liberado)) {
      this.tocando = true;
      this.port.postMessage({ t: 'tocando', pos: this.pos });
    }
    if (this.tocando) {
      while (k < out.length && this.fila.length) {
        const b = this.fila[0];
        while (k < out.length && this.off < b.length) out[k++] = b[this.off++];
        if (this.off >= b.length) { this.fila.shift(); this.off = 0; }
      }
      this.naFila -= k;
      this.pos += k;
      this.desde += k;
      if (this.desde >= this.aviso) { this.desde = 0; this.port.postMessage({ t: 'pos', pos: this.pos }); }
      if (!this.fila.length) {
        this.tocando = false;
        this.liberado = false;
        this.desde = 0;
        this.port.postMessage({ t: 'vazio', pos: this.pos });
      }
    }
    for (; k < out.length; k++) out[k] = 0;
    return true;
  }
}
registerProcessor('ast-saida', AstSaida);
`;

/** 80 ms a 24 kHz: a fala começa depois de um respiro na fila (sem buraco no meio da 1ª frase). */
export const PRE_BUFFER = Math.round(0.08 * TAXA_SAIDA);
/** a posição sai a cada ~100 ms */
export const AVISO_POS = Math.round(0.1 * TAXA_SAIDA);

export type EventoTocador = { t: 'tocando' | 'pos' | 'vazio'; pos: number };
export interface BandasVoz { g: number; m: number; a: number; entrada: number }

/** O que a sessão usa do áudio (a sessão de teste injeta um falso). */
export interface AudioVoz {
  /** abre o microfone e liga os dois grafos; rejeita com o erro do getUserMedia (ou ErroVoz) */
  preparar(): Promise<void>;
  /** pedaços do microfone, Float32 a 16 kHz (null desliga) */
  aoCapturar(fn: ((x: Float32Array) => void) | null): void;
  tocar(x: Float32Array): void;
  /** o turno dela acabou: toca o resto da fila mesmo abaixo do pré-buffer */
  fimDaFala(): void;
  interromper(): void;
  aoTocar(fn: ((e: EventoTocador) => void) | null): void;
  mudo(m: boolean): void;
  /** níveis 0..1 para a esfera: grave/médio/agudo da voz dela (ganho automático) e o nível da sua */
  bandas(dt: number): BandasVoz;
  fechar(): void;
}

type Banda = 'g' | 'm' | 'a';
/* as bandas e a calibração da esfera do bom dia (BomDia.tsx: fftSize 2048, smoothing .5, −88/−20 dB, voz Despina) */
const BANDAS: Record<Banda, readonly [number, number]> = { g: [90, 320], m: [320, 1700], a: [1700, 6500] };
const CAL: Record<Banda, readonly [number, number, number]> = { g: [0.28, 0.66, 0.63], m: [0.14, 0.58, 0.545], a: [0.04, 0.32, 0.295] };

/** RMS do microfone → 0..1 (−52 dBFS = 0, −20 dBFS = 1). */
export function nivelDoRms(rms: number): number {
  if (!(rms > 0)) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db + 52) / 32));
}

async function addModulo(ctx: AudioContext, src: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
}

const analisador = (ctx: AudioContext, fft: number) => {
  const an = ctx.createAnalyser();
  an.fftSize = fft;
  an.smoothingTimeConstant = 0.5;
  an.minDecibels = -88;
  an.maxDecibels = -20;
  return an;
};

/** Cria os dois contextos JÁ (chame dentro do clique) e devolve o áudio da sessão. */
export function criarAudioVoz(): AudioVoz {
  const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctx = W.AudioContext ?? W.webkitAudioContext;
  if (!Ctx || typeof AudioWorkletNode === 'undefined' || typeof WebSocket === 'undefined') throw new ErroVoz('sem_suporte');
  let saida: AudioContext;
  try { saida = new Ctx({ sampleRate: TAXA_SAIDA }); } catch { throw new ErroVoz('sem_suporte'); }
  let entrada: AudioContext | null = null;
  try { entrada = new Ctx({ sampleRate: TAXA_ENTRADA }); } catch { entrada = null; }
  // no gesto do clique: a liberação de som do navegador
  saida.resume().catch(() => undefined);
  entrada?.resume().catch(() => undefined);

  let fechado = false;
  let mudoAgora = false;
  let stream: MediaStream | null = null;
  let noSaida: AudioWorkletNode | null = null;
  let anSaida: AnalyserNode | null = null;
  let anEntrada: AnalyserNode | null = null;
  const nos: AudioNode[] = [];
  let ouvinteCaptura: ((x: Float32Array) => void) | null = null;
  let ouvinteTocador: ((e: EventoTocador) => void) | null = null;
  const ganhos: Record<Banda, GanhoBanda> = { g: criarGanho(...CAL.g), m: criarGanho(...CAL.m), a: criarGanho(...CAL.a) };
  let freq: Uint8Array<ArrayBuffer> | null = null;
  let tempo: Float32Array<ArrayBuffer> | null = null;

  const pararStream = () => { stream?.getTracks().forEach((t) => { try { t.stop(); } catch { /* já parou */ } }); stream = null; };

  const ligarEntrada = async (ctx: AudioContext, taxa: number) => {
    await addModulo(ctx, WORKLET_CAPTURA);
    const fonte = ctx.createMediaStreamSource(stream!);   // o Firefox lança aqui quando a taxa difere
    const an = analisador(ctx, 1024);
    const tamanho = Math.max(128, Math.round((AMOSTRAS_POR_PEDACO * taxa) / TAXA_ENTRADA));
    const no = new AudioWorkletNode(ctx, 'ast-captura', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers',
      processorOptions: { tamanho },
    });
    const zero = ctx.createGain();
    zero.gain.value = 0;
    fonte.connect(an);
    an.connect(no);
    no.connect(zero);
    zero.connect(ctx.destination);
    const reamostrar = taxa === TAXA_ENTRADA ? null : criarReamostrador(taxa, TAXA_ENTRADA);
    no.port.onmessage = (e: MessageEvent) => {
      if (!(e.data instanceof Float32Array)) return;
      const x = reamostrar ? reamostrar(e.data) : e.data;
      if (!mudoAgora && x.length) ouvinteCaptura?.(x);
    };
    nos.push(fonte, an, no, zero);
    anEntrada = an;
  };

  return {
    async preparar() {
      if (fechado) return;
      const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
      if (!md?.getUserMedia) throw new ErroVoz('sem_suporte');
      stream = await md.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (fechado) { pararStream(); return; }
      stream.getAudioTracks().forEach((t) => { t.enabled = !mudoAgora; });
      // saída: fila → analisador (a esfera) → caixa de som
      await addModulo(saida, WORKLET_SAIDA);
      if (fechado) return;
      const no = new AudioWorkletNode(saida, 'ast-saida', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
        processorOptions: { preBuffer: PRE_BUFFER, aviso: AVISO_POS },
      });
      no.port.onmessage = (e: MessageEvent) => {
        const d = e.data as EventoTocador | null;
        if (d && typeof d.pos === 'number') ouvinteTocador?.(d);
      };
      const an = analisador(saida, 2048);
      no.connect(an);
      an.connect(saida.destination);
      noSaida = no;
      anSaida = an;
      nos.push(no, an);
      // entrada: 16 kHz; se o navegador recusar o microfone nessa taxa, a taxa nativa + reamostrador
      try {
        if (!entrada) throw new Error('sem contexto de 16 kHz');
        await ligarEntrada(entrada, TAXA_ENTRADA);
      } catch (e) {
        if (fechado) return;
        console.warn(`assistente voz: microfone na taxa nativa (${e instanceof Error ? e.message : 'erro'})`);
        entrada?.close().catch(() => undefined);
        entrada = new Ctx();
        await entrada.resume().catch(() => undefined);
        await ligarEntrada(entrada, entrada.sampleRate);
      }
      if (saida.state !== 'running') await saida.resume().catch(() => undefined);
    },
    aoCapturar(fn) { ouvinteCaptura = fn; },
    tocar(x) {
      if (!noSaida || !x.length) return;
      if (saida.state === 'suspended') saida.resume().catch(() => undefined);
      noSaida.port.postMessage(x, [x.buffer]);
    },
    fimDaFala() { noSaida?.port.postMessage('fim'); },
    interromper() { noSaida?.port.postMessage('interromper'); },
    aoTocar(fn) { ouvinteTocador = fn; },
    mudo(m) {
      mudoAgora = m;
      stream?.getAudioTracks().forEach((t) => { t.enabled = !m; });
    },
    bandas(dt) {
      const r: BandasVoz = { g: 0, m: 0, a: 0, entrada: 0 };
      if (anSaida) {
        if (!freq || freq.length !== anSaida.frequencyBinCount) freq = new Uint8Array(anSaida.frequencyBinCount);
        anSaida.getByteFrequencyData(freq);
        const hz = saida.sampleRate / anSaida.fftSize;
        const f = freq;
        const media = ([lo, hi]: readonly [number, number]) => {
          const i0 = Math.max(1, Math.round(lo / hz));
          const i1 = Math.min(f.length - 1, Math.round(hi / hz));
          let s = 0;
          for (let i = i0; i <= i1; i++) s += f[i];
          return s / ((i1 - i0 + 1) * 255);
        };
        r.g = aplicarGanho(ganhos.g, media(BANDAS.g), dt);
        r.m = aplicarGanho(ganhos.m, media(BANDAS.m), dt);
        r.a = aplicarGanho(ganhos.a, media(BANDAS.a), dt);
      }
      if (anEntrada && !mudoAgora) {
        if (!tempo || tempo.length !== anEntrada.fftSize) tempo = new Float32Array(anEntrada.fftSize);
        anEntrada.getFloatTimeDomainData(tempo);
        let s = 0;
        for (let i = 0; i < tempo.length; i++) s += tempo[i] * tempo[i];
        r.entrada = nivelDoRms(Math.sqrt(s / tempo.length));
      }
      return r;
    },
    fechar() {
      if (fechado) return;
      fechado = true;
      ouvinteCaptura = null;
      ouvinteTocador = null;
      for (const n of nos) { try { n.disconnect(); } catch { /* já solto */ } }
      if (noSaida) noSaida.port.onmessage = null;
      pararStream();
      saida.close().catch(() => undefined);
      entrada?.close().catch(() => undefined);
    },
  };
}
