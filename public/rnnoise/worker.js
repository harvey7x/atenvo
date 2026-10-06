// Worker de limpeza de áudio (módulo): roda o RNNoise fora da thread da tela.
// Entrada: { pcm: Float32Array (48 kHz mono, escala −1..1), frames: número de frames de 480 }
// Saída:   { tipo: 'progresso', p } … { tipo: 'pronto', limpo: Float32Array, vad: Float32Array } | { tipo: 'erro', msg }
import { Rnnoise } from './rnnoise.js';

const rnnP = Rnnoise.load();

self.onmessage = async (ev) => {
  try {
    const { pcm, frames } = ev.data;
    const rnn = await rnnP;
    const FRAME = rnn.frameSize; // 480
    const limpo = new Float32Array(frames * FRAME);
    const vad = new Float32Array(frames);
    const st = rnn.createDenoiseState();
    const fr = new Float32Array(FRAME);
    try {
      for (let f = 0; f < frames; f++) {
        fr.fill(0);
        const ini = f * FRAME;
        for (let i = 0; i < FRAME && ini + i < pcm.length; i++) fr[i] = pcm[ini + i] * 32768;
        vad[f] = st.processFrame(fr);
        for (let i = 0; i < FRAME; i++) limpo[ini + i] = fr[i] / 32768;
        if (f % 250 === 249) self.postMessage({ tipo: 'progresso', p: f / frames });
      }
    } finally { st.destroy(); }
    self.postMessage({ tipo: 'pronto', limpo, vad }, [limpo.buffer, vad.buffer]);
  } catch (e) {
    self.postMessage({ tipo: 'erro', msg: String((e && e.message) || e) });
  }
};
