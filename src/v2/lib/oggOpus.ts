/* Transcodifica o áudio gravado no painel para ogg/opus DE VERDADE (codec, não só rótulo).
   Por quê: no canal oficial (Cloud API) a Meta só entrega áudio ogg/opus — o m4a/AAC do
   Safari (e o audio/mp4 do Chrome recente) é aceito no upload mas falha DEPOIS, de forma
   assíncrona, com "Media upload error". A Cloud API não transcodifica; trocar o MIME não
   troca o codec. A cura é re-encodar no navegador antes do envio.
   Encoder: opus-recorder (wasm embutido), servido de /opus/encoderWorker.min.js (public/). */

const WORKER_URL = '/opus/encoderWorker.min.js';
const TIMEOUT_MS = 45_000; // teto generoso: áudio de minutos encoda em poucos segundos

async function decodificar(blob: Blob): Promise<AudioBuffer> {
  const ab = await blob.arrayBuffer();
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
  const ac = new AC();
  try {
    // forma com callbacks: Safari antigo não devolve Promise do decodeAudioData
    return await new Promise<AudioBuffer>((res, rej) => { ac.decodeAudioData(ab, res, (e) => rej(e ?? new Error('decode falhou'))); });
  } finally { try { void ac.close(); } catch { /* ignore */ } }
}

/** Mistura todos os canais em um mono Float32Array (nota de voz é mono). */
function paraMono(audio: AudioBuffer): Float32Array {
  const n = audio.length, ch = audio.numberOfChannels;
  const out = audio.getChannelData(0).slice();
  for (let c = 1; c < ch; c++) { const d = audio.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i]; }
  if (ch > 1) for (let i = 0; i < n; i++) out[i] /= ch;
  return out;
}

/** Re-encoda qualquer áudio decodificável (m4a/mp4, webm, mp3…) como ogg/opus 48 kHz mono.
 *  Lança em falha — quem chama decide o fallback. */
export async function transcodificarParaOggOpus(blob: Blob): Promise<Blob> {
  const audio = await decodificar(blob);
  if (!audio.length) throw new Error('Áudio vazio após decodificar.');
  const pcm = paraMono(audio);

  const worker = new Worker(WORKER_URL);
  try {
    return await new Promise<Blob>((resolve, reject) => {
      const pages: BlobPart[] = [];
      const timer = setTimeout(() => reject(new Error('Tempo esgotado ao converter o áudio.')), TIMEOUT_MS);
      worker.onerror = (e) => { clearTimeout(timer); reject(new Error('Falha no conversor de áudio: ' + (e.message || 'worker'))); };
      worker.onmessage = (ev: MessageEvent<{ message: string; page?: Uint8Array }>) => {
        if (ev.data.message === 'page' && ev.data.page) pages.push(ev.data.page.slice());
        else if (ev.data.message === 'done') {
          clearTimeout(timer);
          const ogg = new Blob(pages, { type: 'audio/ogg' });
          if (ogg.size < 100) reject(new Error('Conversão gerou arquivo vazio.'));
          else resolve(ogg);
        }
      };
      worker.postMessage({
        command: 'init',
        originalSampleRate: audio.sampleRate,
        encoderSampleRate: 48000,
        numberOfChannels: 1,
        encoderApplication: 2048, // VOIP: otimizado para voz (é sempre gravação de microfone)
        resampleQuality: 6,
      });
      worker.postMessage({ command: 'getHeaderPages' });
      // encoda em fatias p/ não segurar um buffer gigante no postMessage
      const FATIA = 48000; // ~1s por mensagem
      for (let i = 0; i < pcm.length; i += FATIA) worker.postMessage({ command: 'encode', buffers: [pcm.subarray(i, Math.min(i + FATIA, pcm.length))] });
      worker.postMessage({ command: 'done' });
    });
  } finally { worker.terminate(); }
}
