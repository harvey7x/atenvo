// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { INTRO_COOLDOWN_HORAS, passouCooldown } from './intro';

describe('cooldown da intro (Ajuste da Ordem nº 1)', () => {
  const H = 3_600_000;

  it('a constante única documenta a janela (default 4h)', () => {
    expect(INTRO_COOLDOWN_HORAS).toBe(4);
  });

  it('dentro da janela não repete (F5 / segunda aba)', () => {
    const agora = 1_000_000_000_000;
    expect(passouCooldown(agora - 1_000, agora)).toBe(false); // F5 imediato
    expect(passouCooldown(agora - 30 * 60_000, agora)).toBe(false); // 2ª aba, 30min
    expect(passouCooldown(agora - INTRO_COOLDOWN_HORAS * H, agora)).toBe(false); // exatamente na borda
  });

  it('fora da janela roda de novo (chegada real)', () => {
    const agora = 1_000_000_000_000;
    expect(passouCooldown(agora - INTRO_COOLDOWN_HORAS * H - 1, agora)).toBe(true);
    expect(passouCooldown(0, agora)).toBe(true); // nunca exibida
  });
});
