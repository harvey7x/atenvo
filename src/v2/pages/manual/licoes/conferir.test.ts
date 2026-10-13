/* Conferidor do banco da prova e dos dados das lições.
   LICAO=<id> confere só uma lição; sem LICAO confere todas.
   Regras: 5 perguntas, 3 opções, gabarito válido, opções de tamanho parecido
   e a certa NÃO pode ser sempre a mais longa (senão dá para passar chutando). */
import { describe, expect, it } from 'vitest';
import { LICOES } from '.';

const alvo = process.env.LICAO;
const licoes = alvo ? LICOES.filter((l) => l.id === alvo) : LICOES;

describe('banco da prova e dados das lições', () => {
  it('a lição pedida existe', () => { expect(licoes.length).toBeGreaterThan(0); });

  for (const l of licoes) {
    describe(`LICAO ${l.id}`, () => {
      it('5 perguntas com 3 opções e gabarito válido', () => {
        expect(l.questoes).toHaveLength(5);
        for (const q of l.questoes) {
          expect(q.o).toHaveLength(3);
          expect(q.c).toBeGreaterThanOrEqual(0);
          expect(q.c).toBeLessThan(3);
          expect(q.e.length).toBeGreaterThan(10);
          expect(new Set(q.o).size).toBe(3);
        }
      });
      it('opções com tamanho parecido (maior ≤ 1,30 × menor, folga de 12 caracteres)', () => {
        for (const q of l.questoes) {
          const t = q.o.map((x) => x.length);
          const ok = Math.max(...t) <= Math.min(...t) * 1.3 + 12;
          expect(ok, `"${q.p}" → tamanhos ${t.join('/')}`).toBe(true);
        }
      });
      it('a certa é a mais longa em no máximo 1 pergunta', () => {
        const n = l.questoes.filter((q) => q.o[q.c].length === Math.max(...q.o.map((x) => x.length))).length;
        expect(n, `certa = mais longa em ${n} de ${l.questoes.length}`).toBeLessThanOrEqual(1);
      });
      it('glossário com 4 a 10 termos e mensagens com texto', () => {
        expect(l.glossario.length).toBeGreaterThanOrEqual(4);
        expect(l.glossario.length).toBeLessThanOrEqual(10);
        for (const m of l.mensagens) expect(m.texto.trim().length).toBeGreaterThan(10);
      });
    });
  }

  it('sem termo de glossário repetido entre lições', () => {
    if (alvo) return; // só no conjunto
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
    const vistos = new Map<string, string>();
    const dup: string[] = [];
    for (const l of LICOES) for (const t of l.glossario) {
      const k = norm(t.termo);
      if (vistos.has(k)) dup.push(`${t.termo} (${vistos.get(k)} e ${l.id})`); else vistos.set(k, l.id);
    }
    expect(dup).toEqual([]);
  });

  it('sem mensagem pronta repetida (mesmo título) entre lições', () => {
    if (alvo) return;
    const vistos = new Map<string, string>();
    const dup: string[] = [];
    for (const l of LICOES) for (const m of l.mensagens) {
      const k = m.titulo.toLowerCase().trim();
      if (vistos.has(k)) dup.push(`${m.titulo} (${vistos.get(k)} e ${l.id})`); else vistos.set(k, l.id);
    }
    expect(dup).toEqual([]);
  });
});
