import { describe, expect, it } from 'vitest';
import { fotoIlustrativa, generoProvavel } from './fotoIlustrativa';

describe('foto ilustrativa do card', () => {
  it('palpite pelo primeiro nome', () => {
    expect(generoProvavel('Maria Lucia Collares')).toBe('f');
    expect(generoProvavel('Ivone')).toBe('f');
    expect(generoProvavel('Beatriz Souza')).toBe('f');
    expect(generoProvavel('José Antônio')).toBe('h');
    expect(generoProvavel('Carlos Alberto')).toBe('h');
    expect(generoProvavel('(51) 9796-8799')).toBeNull();
  });
  it('mesma pessoa → mesma foto; mulher → foto de mulher', () => {
    const a = fotoIlustrativa('Maria', 'id-1');
    expect(fotoIlustrativa('Maria', 'id-1')).toBe(a);
    expect(a).toMatch(/\/avatares\/idosos\/f\d\.webp$/);
    expect(fotoIlustrativa('João', 'id-2')).toMatch(/\/avatares\/idosos\/h\d\.webp$/);
    expect(fotoIlustrativa('5551999990000', 'id-3')).toMatch(/\/avatares\/idosos\/[fh]\d\.webp$/);
  });
});
