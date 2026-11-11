import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarIntencaoMouse, rumoAPrevia, type Ponto } from './intencao';

/* Lista de mentira: itens de 50px de altura empilhados em x 0–320, com um cabeçalho
   de grupo (zona morta) entre y 100 e 130. A prévia começa em x 325. */
const ITENS = [
  { chave: 'a', y0: 0, y1: 50 },
  { chave: 'b', y0: 50, y1: 100 },
  // 100–130: cabeçalho "NECESSIDADES" (zona morta)
  { chave: 'c', y0: 130, y1: 180 },
];
const itemEm = (p: Ponto) => (p.x < 0 || p.x > 320 ? null : ITENS.find((i) => p.y >= i.y0 && p.y < i.y1)?.chave ?? null);

describe('intenção do mouse (diagonal rumo à prévia)', () => {
  let realcado: string;
  let ctl: ReturnType<typeof criarIntencaoMouse>;
  beforeEach(() => {
    vi.useFakeTimers();
    realcado = 'a';
    ctl = criarIntencaoMouse({
      aplicar: (k) => { realcado = k; },
      aindaSobre: (k, p) => itemEm(p) === k,
      agendar: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      cancelar: (h) => clearTimeout(h),
    });
  });
  afterEach(() => { vi.useRealTimers(); });

  const andar = (de: Ponto, ate: Ponto, passos: number, msPorPasso: number) => {
    for (let i = 1; i <= passos; i++) {
      const p = { x: de.x + ((ate.x - de.x) * i) / passos, y: de.y + ((ate.y - de.y) * i) / passos };
      const k = itemEm(p);
      if (k === null && p.x > 320) ctl.sair(); else ctl.mover(p, k, realcado, false);
      vi.advanceTimersByTime(msPorPasso);
    }
  };

  it('diagonal LENTA do 1º item até a prévia, passando pela zona morta: a prévia não troca', () => {
    // do meio do item "a" até a prévia, descendo por "b", pelo cabeçalho (~240ms nele) e por "c"
    andar({ x: 40, y: 25 }, { x: 330, y: 170 }, 40, 30);
    vi.advanceTimersByTime(500);
    expect(realcado).toBe('a');
  });
  it('parar sobre um item no meio da diagonal realça o item (depois do atraso)', () => {
    ctl.mover({ x: 40, y: 25 }, 'a', realcado, false);
    ctl.mover({ x: 60, y: 60 }, 'b', realcado, false);
    expect(realcado).toBe('a');
    vi.advanceTimersByTime(160);
    expect(realcado).toBe('b');
  });
  it('timer pendente morre na zona morta (o furo antigo)', () => {
    ctl.mover({ x: 40, y: 25 }, 'a', realcado, false);
    ctl.mover({ x: 60, y: 60 }, 'b', realcado, false);     // agenda "b"
    ctl.mover({ x: 80, y: 110 }, null, realcado, false);   // cabeçalho: limpa
    vi.advanceTimersByTime(500);
    expect(realcado).toBe('a');
  });
  it('movimento vertical troca na hora; janela estreita (sem prévia) também', () => {
    ctl.mover({ x: 40, y: 25 }, 'a', realcado, false);
    ctl.mover({ x: 41, y: 60 }, 'b', realcado, false);
    expect(realcado).toBe('b');
    ctl.mover({ x: 60, y: 140 }, 'c', realcado, true);
    expect(realcado).toBe('c');
  });
  it('rumoAPrevia: direita e mais horizontal que vertical', () => {
    expect(rumoAPrevia(null, { x: 1, y: 1 })).toBe(false);
    expect(rumoAPrevia({ x: 0, y: 0 }, { x: 10, y: 5 })).toBe(true);
    expect(rumoAPrevia({ x: 0, y: 0 }, { x: 2, y: 30 })).toBe(false);
    expect(rumoAPrevia({ x: 10, y: 0 }, { x: 0, y: 1 })).toBe(false);
  });
});
