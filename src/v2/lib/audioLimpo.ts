/* Limpeza do áudio GRAVADO no painel, feita no navegador do atendente (nada vai pra servidor).
   Roda DEPOIS da gravação, sobre o arquivo pronto — a captura do MediaRecorder fica intocada
   (no iOS, mexer na captura ao vivo já silenciou gravações; ver AudioRecorderV2).

   Cadeia:
     1. decodifica → mono → 48 kHz, com passa-alta em 80 Hz (tira o "tum" de mesa/vento/ar-cond.)
     2. RNNoise (rede neural pequena, wasm, Apache-2.0) remove ruído de fundo frame a frame (10 ms)
        e devolve a probabilidade de VOZ de cada frame
     3. portão suave: trechos sem voz descem mais um pouco (−10 dB), com folga de 200 ms em volta
        da fala pra nunca comer começo/fim de palavra
     4. nivelamento: compressor leve + volume-alvo (fala ≈ −20 dBFS), com teto de pico
   Saída: WAV 48 kHz mono (o envio ainda passa pelo transcodificarParaOggOpus como sempre).
   Falha em qualquer etapa → lança; quem chama mantém o ORIGINAL. */

const SR = 48000;
const FRAME = 480;                 // RNNoise: 10 ms a 48 kHz
const ALVO_RMS = 0.1;              // ≈ −20 dBFS na fala
const TETO_PICO = 0.95;
const GANHO_MAX = 8;               // +18 dB no máximo (áudio sussurrado não vira chiado gritado)
const PISO_SEM_VOZ = 0.32;         // −10 dB nos trechos sem voz
const FOLGA_FRAMES = 20;           // 200 ms de folga antes/depois da fala
const ATRASO_RNN = 2 * FRAME;      // atraso interno do RNNoise (janela + frame), medido: compensado no fim
const ATRASO_COMP = 288;           // lookahead fixo de 6 ms do DynamicsCompressor (Web Audio)

export interface ResumoLimpeza {
  duracao: number;
  /** distância entre a fala e o ruído de fundo, em dB (maior = mais limpo), antes e depois. */
  falaRuidoAntesDb: number;
  falaRuidoDepoisDb: number;
  /** ganho aplicado na fala, em dB (positivo = estava baixo). */
  ganhoDb: number;
  ms: number;
}

// RNNoise roda num Worker de módulo (public/rnnoise/worker.js): ≈0,8 ms por frame de 10 ms →
// 1 min de áudio ≈ 5 s de CPU; na thread da tela isso travaria o painel.
const WORKER_URL = '/rnnoise/worker.js';
let workerPre: Worker | null = null;
function novoWorker(): Worker { return new Worker(WORKER_URL, { type: 'module' }); }
/** Pré-aquece (chamar ao começar a gravar): o worker já carrega o módulo (≈4,8 MB) enquanto a pessoa fala. */
export function preaquecerLimpeza() { try { workerPre ??= novoWorker(); } catch { /* sem worker de módulo: tenta na hora */ } }

function rodarRnnoise(pcm: Float32Array, frames: number, onProgresso?: (p: number) => void): Promise<{ limpo: Float32Array; vad: Float32Array }> {
  const w = workerPre ?? novoWorker(); workerPre = null;          // cada limpeza usa um worker e descarta
  return new Promise((res, rej) => {
    const fim = (fn: () => void) => { w.terminate(); fn(); };
    w.onerror = (e) => fim(() => rej(new Error('Falha no limpador de áudio: ' + (e.message || 'worker'))));
    w.onmessage = (ev: MessageEvent<{ tipo: string; p?: number; limpo?: Float32Array; vad?: Float32Array; msg?: string }>) => {
      const d = ev.data;
      if (d.tipo === 'progresso') onProgresso?.(d.p ?? 0);
      else if (d.tipo === 'pronto') fim(() => res({ limpo: d.limpo!, vad: d.vad! }));
      else fim(() => rej(new Error(d.msg || 'Falha no limpador de áudio.')));
    };
    w.postMessage({ pcm, frames });
  });
}

const AC = () => (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
const OAC = () => (window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext);

async function decodificar(blob: Blob): Promise<AudioBuffer> {
  const ab = await blob.arrayBuffer();
  const ac = new (AC())();
  try { return await new Promise<AudioBuffer>((res, rej) => { ac.decodeAudioData(ab, res, (e) => rej(e ?? new Error('decode falhou'))); }); }
  finally { try { void ac.close(); } catch { /* ignore */ } }
}

/** mono + 48 kHz + passa-alta 80 Hz, numa passada só do OfflineAudioContext. */
async function prepararEntrada(audio: AudioBuffer): Promise<Float32Array> {
  const n = Math.ceil(audio.duration * SR);
  const ctx = new (OAC())(1, n, SR);
  const mono = ctx.createBuffer(1, audio.length, audio.sampleRate);
  const out = mono.getChannelData(0);
  for (let c = 0; c < audio.numberOfChannels; c++) { const d = audio.getChannelData(c); for (let i = 0; i < d.length; i++) out[i] += d[i] / audio.numberOfChannels; }
  const src = ctx.createBufferSource(); src.buffer = mono;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 80; hp.Q.value = 0.707;
  src.connect(hp); hp.connect(ctx.destination); src.start();
  return (await ctx.startRendering()).getChannelData(0).slice();
}

async function comprimir(pcm: Float32Array, ganho: number): Promise<Float32Array> {
  const ctx = new (OAC())(1, pcm.length, SR);
  const buf = ctx.createBuffer(1, pcm.length, SR); buf.getChannelData(0).set(pcm);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = ganho;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
  src.connect(g); g.connect(comp); comp.connect(ctx.destination); src.start();
  return (await ctx.startRendering()).getChannelData(0).slice();
}

const db = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -120);
function rmsFrames(pcm: Float32Array, quais: (i: number) => boolean): number {
  let s = 0, n = 0;
  for (let f = 0; f * FRAME < pcm.length; f++) {
    if (!quais(f)) continue;
    const ini = f * FRAME, fim = Math.min(ini + FRAME, pcm.length);
    for (let i = ini; i < fim; i++) { s += pcm[i] * pcm[i]; n++; }
  }
  return n ? Math.sqrt(s / n) : 0;
}

/** WAV PCM 16-bit mono. */
export function paraWav(pcm: Float32Array, sr = SR): Blob {
  const buf = new ArrayBuffer(44 + pcm.length * 2); const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

export async function limparAudio(blob: Blob, onProgresso?: (p: number) => void): Promise<{ blob: Blob; resumo: ResumoLimpeza }> {
  const t0 = performance.now();
  const audio = await decodificar(blob);
  if (!audio.length) throw new Error('Áudio vazio.');
  const entrada = await prepararEntrada(audio);

  // 2. RNNoise — espera amostras na escala de 16 bits; frames de zeros no fim empurram o atraso interno pra fora
  const nFrames = Math.ceil((entrada.length + ATRASO_RNN + ATRASO_COMP) / FRAME);
  const { limpo, vad } = await rodarRnnoise(entrada, nFrames, onProgresso);

  // 3. portão suave guiado pela voz (dilatado ± folga) com transição em rampa por amostra
  const fala = new Uint8Array(nFrames);
  for (let f = 0; f < nFrames; f++) if (vad[f] >= 0.5) for (let k = Math.max(0, f - FOLGA_FRAMES); k <= Math.min(nFrames - 1, f + FOLGA_FRAMES); k++) fala[k] = 1;
  let g = 1;
  for (let f = 0; f < nFrames; f++) {
    const alvo = fala[f] ? 1 : PISO_SEM_VOZ;
    for (let i = 0; i < FRAME; i++) { g += (alvo - g) * (alvo > g ? 0.01 : 0.0004); limpo[f * FRAME + i] *= g; }
  }

  // 4. nivelamento pela FALA (frames com voz), não pelo arquivo todo
  const ehVoz = (f: number) => vad[f] >= 0.5;
  const temVoz = Array.prototype.some.call(vad, (v: number) => v >= 0.5);
  const rmsVoz = rmsFrames(limpo, temVoz ? ehVoz : () => true);
  const ganho = rmsVoz > 1e-5 ? Math.min(GANHO_MAX, Math.max(0.5, ALVO_RMS / rmsVoz)) : 1;
  const comp = await comprimir(limpo, ganho);
  let pico = 0; for (let i = 0; i < comp.length; i++) { const a = Math.abs(comp[i]); if (a > pico) pico = a; }
  const rmsComp = rmsFrames(comp, temVoz ? ehVoz : () => true);
  const ajuste = Math.min(rmsComp > 1e-5 ? ALVO_RMS / rmsComp : 1, pico > 0 ? TETO_PICO / pico : 1);
  for (let i = 0; i < comp.length; i++) comp[i] *= ajuste;
  const atraso = ATRASO_RNN + ATRASO_COMP;               // realinha com o original (A/B sem "pulo")
  const saida = comp.subarray(atraso, atraso + entrada.length);

  const semVoz = (f: number) => vad[f] < 0.2;
  const temSemVoz = Array.prototype.some.call(vad, (v: number) => v < 0.2);
  // o VAD saiu do RNNoise (atrasado); a entrada e a saída estão no tempo original → desloca o índice
  const d = Math.round(ATRASO_RNN / FRAME);
  const relacao = (pcm: Float32Array) => (temVoz && temSemVoz
    ? Math.round(db(rmsFrames(pcm, (f) => ehVoz(f + d))) - db(rmsFrames(pcm, (f) => semVoz(f + d)))) : 0);
  return {
    blob: paraWav(saida),
    resumo: {
      duracao: entrada.length / SR,
      falaRuidoAntesDb: relacao(entrada),
      falaRuidoDepoisDb: relacao(saida),
      ganhoDb: Math.round(db(ganho * ajuste)),
      ms: Math.round(performance.now() - t0),
    },
  };
}
