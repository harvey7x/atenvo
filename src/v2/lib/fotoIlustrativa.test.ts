import { describe, expect, it } from 'vitest';
import { fotoIlustrativa, generoProvavel } from './fotoIlustrativa';

// Reviza: as fotos vêm de src/v2/assets/idosos (import.meta.glob), não de public/avatares — o teste aceita os dois caminhos
describe('foto ilustrativa do card', () => {
  it('palpite pelo primeiro nome', () => {
    expect(generoProvavel('Maria Lucia Collares')).toBe('f');
    expect(generoProvavel('Ivone')).toBe('f');
    expect(generoProvavel('Beatriz Souza')).toBe('f');
    expect(generoProvavel('José Antônio')).toBe('h');
    expect(generoProvavel('Carlos Alberto')).toBe('h');
    expect(generoProvavel('(51) 9796-8799')).toBeNull();
    expect(generoProvavel('SHIRLEY')).toBe('f');
    expect(generoProvavel('Kelly Cristina')).toBe('f');
    expect(generoProvavel('Wesley Souza')).toBe('h');
    // base do IBGE (30/10): exceções reais à regra do "a" no fim
    expect(generoProvavel('JUSCEMARA RODRIGUES')).toBe('f');
    expect(generoProvavel('Nadir')).toBe('f');
    expect(generoProvavel('Iraci Souza')).toBe('f');
    expect(generoProvavel('Geni')).toBe('f');
    expect(generoProvavel('Luca')).toBe('h');
    expect(generoProvavel('Akira')).toBe('h');
    expect(generoProvavel('Valdir')).toBe('h');
    expect(generoProvavel('Nilton')).toBe('h');
    expect(generoProvavel('Ângela')).toBe('f');
  });
  it('mesma pessoa → mesma foto; mulher → foto de mulher', () => {
    const a = fotoIlustrativa('Maria', 'id-1');
    expect(fotoIlustrativa('Maria', 'id-1')).toBe(a);
    expect(a).toMatch(/\/idosos\/f\d\.webp$/);
    expect(fotoIlustrativa('João', 'id-2')).toMatch(/\/idosos\/h\d\.webp$/);
    expect(fotoIlustrativa('5551999990000', 'id-3')).toMatch(/\/idosos\/[fh]\d\.webp$/);
  });
});
