import { describe, it, expect } from 'vitest';
import { saidaSuja } from '../../supabase/functions/bot-runner/guardrail';
import { ANGULOS, anguloDoToque, preencherNome } from '../../supabase/functions/bot-runner/remarketing';

describe('remarketing — ângulos e fallbacks', () => {
  it('tem exatamente 5 toques na cadência D+1,3,6,10,15', () => {
    expect(ANGULOS.map((a) => a.dia)).toEqual([1, 3, 6, 10, 15]);
  });

  it('TODO fallback passa pelo guardrail (com e sem nome) — nunca valor/promessa/credencial', () => {
    for (const a of ANGULOS) {
      expect(saidaSuja(preencherNome(a.fallback, 'João'))).toBeNull();
      expect(saidaSuja(preencherNome(a.fallback, ''))).toBeNull();
    }
  });

  it('anguloDoToque faz clamp defensivo (0..4)', () => {
    expect(anguloDoToque(0).dia).toBe(1);
    expect(anguloDoToque(4).dia).toBe(15);
    expect(anguloDoToque(9).dia).toBe(15);   // acima do fim → último
    expect(anguloDoToque(-3).dia).toBe(1);   // abaixo → primeiro
  });

  it('preencherNome: com nome injeta; sem nome não deixa vocativo órfão', () => {
    expect(preencherNome('Oi, {nome}! tudo bem?', 'Maria')).toBe('Oi, Maria! tudo bem?');
    expect(preencherNome('Oi, {nome}! tudo bem?', '')).toBe('Oi! tudo bem?');
    expect(preencherNome('{nome}, vale olhar.', '')).toBe('vale olhar.');
    expect(preencherNome('{nome}, vale olhar.', 'Ana')).toBe('Ana, vale olhar.');
  });
});
