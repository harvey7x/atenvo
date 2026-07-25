import { describe, expect, it } from 'vitest';
import { hexParaRgb, tintDeHex } from './tint';

describe('hexParaRgb', () => {
  it('aceita #rrggbb, #rgb e sem #', () => {
    expect(hexParaRgb('#e11d48')).toEqual([225, 29, 72]);
    expect(hexParaRgb('e11d48')).toEqual([225, 29, 72]);
    expect(hexParaRgb('#f00')).toEqual([255, 0, 0]);
  });
  it('recusa lixo sem lançar (null — o chamador decide o fallback)', () => {
    expect(hexParaRgb('')).toBeNull();
    expect(hexParaRgb('vermelho')).toBeNull();
    expect(hexParaRgb('#12345')).toBeNull();
    expect(hexParaRgb('#e11d4820')).toBeNull(); // hex de 8 dígitos não é contrato das etiquetas
  });
});

describe('tintDeHex — a receita do design system sobre cores do banco', () => {
  // Cores REAIS salvas hoje (PALETA_CORES das etiquetas e paleta do Kanban).
  const doBanco = ['#e11d48', '#3b82f6', '#f59e0b', '#19c37d', '#7a5bb0', '#0e7490', '#be185d'];

  it('nunca devolve a cor viva chapada: fundo 10% e borda 25% de alpha', () => {
    for (const hex of doBanco) {
      const t = tintDeHex(hex);
      expect(t.bg).toMatch(/^rgba\(\d+, \d+, \d+, 0\.10\)$/);
      expect(t.border).toMatch(/^rgba\(\d+, \d+, \d+, 0\.25\)$/);
    }
  });

  it('texto é claro o bastante para fundo escuro (luminância mínima)', () => {
    for (const hex of doBanco) {
      const m = tintDeHex(hex).text.match(/^rgb\((\d+), (\d+), (\d+)\)$/)!;
      const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
      // luminância relativa aproximada; 0.35+ garante folga de 4.5:1 sobre #111214
      const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      expect(lum).toBeGreaterThan(0.35);
    }
  });

  it('preserva o matiz: rosa continua rosa, azul continua azul', () => {
    const rosa = tintDeHex('#e11d48').text.match(/\d+/g)!.map(Number);
    const azul = tintDeHex('#3b82f6').text.match(/\d+/g)!.map(Number);
    expect(rosa[0]).toBeGreaterThan(rosa[2]);   // componente R domina no rosa
    expect(azul[2]).toBeGreaterThan(azul[0]);   // componente B domina no azul
  });

  it('hex inválido cai no cinza neutro dos tokens, sem lançar', () => {
    const t = tintDeHex('não-é-cor');
    expect(t.text).toBe('var(--text-secondary)');
    expect(t.bg).toContain('255, 255, 255');
  });

  it('é determinística (mesma entrada, mesma saída)', () => {
    expect(tintDeHex('#3b82f6')).toEqual(tintDeHex('#3b82f6'));
  });
});
