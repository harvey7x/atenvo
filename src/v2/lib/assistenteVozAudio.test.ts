// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AVISO_POS, PRE_BUFFER, WORKLET_CAPTURA, WORKLET_SAIDA, nivelDoRms } from './assistenteVozAudio';

/* Os dois AudioWorklets do modo de voz rodam o MESMO texto que vai para o navegador (módulo por Blob URL),
   aqui numa caixa de areia com um AudioWorkletProcessor falso: a captura junta 512 amostras; a reprodução
   toca a fila sem buraco e sem perder amostra, espera o pré-buffer, avisa a posição e esvazia NA HORA na
   interrupção. */

type Porta = { posts: unknown[]; onmessage: ((e: { data: unknown }) => void) | null; postMessage: (m: unknown) => void };
type Proc = { port: Porta; process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean };

function carregar(src: string): Record<string, new (op?: unknown) => Proc> {
  const registrados: Record<string, new (op?: unknown) => Proc> = {};
  class AudioWorkletProcessor {
    port: Porta = { posts: [], onmessage: null, postMessage(m: unknown) { this.posts.push(m); } };
  }
  // eslint-disable-next-line no-new-func
  new Function('AudioWorkletProcessor', 'registerProcessor', src)(
    AudioWorkletProcessor,
    (nome: string, c: new (op?: unknown) => Proc) => { registrados[nome] = c; },
  );
  return registrados;
}

const ultimoDe = <T,>(xs: T[]): T => xs[xs.length - 1];
const quanta = (p: Proc, n: number) => {
  const saidas: number[] = [];
  for (let i = 0; i < n; i++) {
    const out = [new Float32Array(128)];
    expect(p.process([], [out])).toBe(true);
    saidas.push(...out[0]);
  }
  return saidas;
};
const rampa = (ini: number, n: number) => Float32Array.from({ length: n }, (_, i) => (ini + i) / 100000);

describe('worklet de captura (microfone → pedaços de 32 ms)', () => {
  const { 'ast-captura': Captura } = carregar(WORKLET_CAPTURA);

  it('junta 512 amostras (4 quanta de 128) e manda uma CÓPIA; sem entrada, nada', () => {
    const p = new Captura({ processorOptions: { tamanho: 512 } });
    const entrada = rampa(0, 128);
    for (let i = 0; i < 3; i++) p.process([[entrada]], [[new Float32Array(128)]]);
    expect(p.port.posts).toHaveLength(0);
    p.process([[entrada]], [[new Float32Array(128)]]);
    expect(p.port.posts).toHaveLength(1);
    const pedaco = p.port.posts[0] as Float32Array;
    expect(pedaco).toBeInstanceOf(Float32Array);
    expect(pedaco.length).toBe(512);
    expect(pedaco[130]).toBeCloseTo(entrada[2], 7);
    p.process([[entrada]], [[new Float32Array(128)]]);
    expect(pedaco[0]).toBeCloseTo(entrada[0], 7); // o próximo pedaço não sobrescreve o que já foi
    expect(p.process([], [[new Float32Array(128)]])).toBe(true);
    expect(p.process([[]], [[new Float32Array(128)]])).toBe(true);
    expect(p.port.posts).toHaveLength(1);
  });

  it('na taxa nativa (fallback), o pedaço maior que o reamostrador reduz a ~512', () => {
    const p = new Captura({ processorOptions: { tamanho: 1536 } });
    for (let i = 0; i < 12; i++) p.process([[rampa(i * 128, 128)]], [[new Float32Array(128)]]);
    expect(p.port.posts).toHaveLength(1);
    expect((p.port.posts[0] as Float32Array).length).toBe(1536);
  });
});

describe('worklet de reprodução (a fala dela em fila)', () => {
  const { 'ast-saida': Saida } = carregar(WORKLET_SAIDA);
  const nova = (pre = PRE_BUFFER, aviso = AVISO_POS) => new Saida({ processorOptions: { preBuffer: pre, aviso } });
  const enviar = (p: Proc, d: unknown) => p.port.onmessage!({ data: d });
  const eventos = (p: Proc) => p.port.posts as { t: string; pos: number }[];

  it('espera o pré-buffer de 80 ms (silêncio, sem buraco depois) e toca tudo na ordem, sem perder amostra', () => {
    expect(PRE_BUFFER).toBe(1920);
    const p = nova();
    enviar(p, rampa(0, 1000));
    expect(quanta(p, 2).every((v) => v === 0)).toBe(true);   // abaixo do pré-buffer: espera
    expect(eventos(p)).toEqual([]);
    enviar(p, rampa(1000, 1000));
    enviar(p, rampa(2000, 1300));
    const tocado = quanta(p, 26); // 3328 amostras de saída para 3300 na fila
    expect(eventos(p)[0]).toEqual({ t: 'tocando', pos: 0 });
    expect(tocado.slice(0, 3300)).toEqual(Array.from(rampa(0, 3300)));
    expect(tocado.slice(3300).every((v) => v === 0)).toBe(true);
    const ult = ultimoDe(eventos(p));
    expect(ult).toEqual({ t: 'vazio', pos: 3300 });
  });

  it('avisa a posição a cada ~100 ms enquanto toca', () => {
    const p = nova(0, 2400);
    enviar(p, new Float32Array(9600).fill(0.1));
    quanta(p, 60); // 7680 amostras
    const pos = eventos(p).filter((e) => e.t === 'pos').map((e) => e.pos);
    expect(pos).toEqual([2432, 4864, 7296]);
  });

  it('"fim" toca o resto mesmo abaixo do pré-buffer', () => {
    const p = nova();
    enviar(p, rampa(0, 300));
    expect(quanta(p, 1).every((v) => v === 0)).toBe(true);
    enviar(p, 'fim');
    const t = quanta(p, 3);
    expect(t.slice(0, 300)).toEqual(Array.from(rampa(0, 300)));
    expect(eventos(p).map((e) => e.t)).toEqual(['tocando', 'vazio']);
    expect(ultimoDe(eventos(p)).pos).toBe(300);
  });

  it('"fim" com a fila VAZIA (o turnComplete que segue a interrupção) não tira o pré-buffer da próxima fala', () => {
    const p = nova();
    enviar(p, rampa(0, 3000));
    quanta(p, 4);                 // tocando
    enviar(p, 'interromper');     // interrupted
    enviar(p, 'fim');             // "interrupted > turn_complete": a fila já está vazia
    quanta(p, 2);
    const antes = eventos(p).length;
    enviar(p, rampa(0, 300));     // 1º pedaço da resposta seguinte, abaixo dos 80 ms
    expect(quanta(p, 2).every((v) => v === 0)).toBe(true);   // espera o pré-buffer (não toca 300 amostras e fura)
    expect(eventos(p).slice(antes).map((e) => e.t)).not.toContain('tocando');
    enviar(p, rampa(300, 1700));  // completou o pré-buffer
    const t = quanta(p, 16);
    expect(t.slice(0, 2000)).toEqual(Array.from(rampa(0, 2000)));
    expect(ultimoDe(eventos(p))).toEqual({ t: 'vazio', pos: 5000 });
  });

  it('"interromper" esvazia NA HORA: a posição pula para o fim do que chegou e o próximo quadro já é silêncio', () => {
    const p = nova(0);
    enviar(p, rampa(0, 5000));
    quanta(p, 4); // 512 tocadas
    enviar(p, 'interromper');
    expect(ultimoDe(eventos(p))).toEqual({ t: 'vazio', pos: 5000 });
    expect(quanta(p, 2).every((v) => v === 0)).toBe(true);
    // a fala seguinte continua a contagem (a legenda usa a mesma régua)
    enviar(p, rampa(0, 256));
    quanta(p, 3);
    expect(ultimoDe(eventos(p))).toEqual({ t: 'vazio', pos: 5256 });
  });
});

describe('nível do microfone para a esfera', () => {
  it('−52 dBFS = 0, −20 dBFS = 1, silêncio = 0', () => {
    expect(nivelDoRms(0)).toBe(0);
    expect(nivelDoRms(10 ** (-52 / 20))).toBeCloseTo(0, 6);
    expect(nivelDoRms(10 ** (-20 / 20))).toBeCloseTo(1, 6);
    expect(nivelDoRms(10 ** (-36 / 20))).toBeCloseTo(0.5, 6);
    expect(nivelDoRms(1)).toBe(1);
  });
});
