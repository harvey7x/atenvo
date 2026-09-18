// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SINAL_MIN, ehIOS, escolherMime, sinalInicial } from './AudioRecorderV2';

/* Guardas do fix de 18/09 ("gravei e não tinha nenhum áudio" no iPhone):
   no iOS o medidor NÃO monta (consumir a captura no Web Audio silencia a
   gravação do MediaRecorder no WebKit) e a checagem anti-mudo não pode
   bloquear por falta de medidor — só por SILÊNCIO medido no arquivo. */

afterEach(() => { vi.unstubAllGlobals(); });

describe('sinalInicial (veredito antes do medirBlob)', () => {
  it('com medidor: pico acima do mínimo → tem som', () => {
    expect(sinalInicial(true, SINAL_MIN)).toBe(true);
    expect(sinalInicial(true, 0.5)).toBe(true);
  });
  it('com medidor: pico zerado → sem som (trava anti-mudo do desktop preservada)', () => {
    expect(sinalInicial(true, 0)).toBe(false);
    expect(sinalInicial(true, SINAL_MIN - 0.001)).toBe(false);
  });
  it('SEM medidor (iOS): nunca bloquear por falta de evidência — era o bug do iPhone', () => {
    expect(sinalInicial(false, 0)).toBe(true);
  });
});

describe('ehIOS (detecção que decide desligar o medidor)', () => {
  const nav = (userAgent: string, platform = '', maxTouchPoints = 0) =>
    vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints });
  it('iPhone → true', () => {
    nav('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15');
    expect(ehIOS()).toBe(true);
  });
  it('iPad moderno disfarçado de MacIntel com toque → true', () => {
    nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 'MacIntel', 5);
    expect(ehIOS()).toBe(true);
  });
  it('Mac de verdade (sem toque) → false', () => {
    nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126', 'MacIntel', 0);
    expect(ehIOS()).toBe(false);
  });
  it('Windows/Android desktop-like → false', () => {
    nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126', 'Win32', 0);
    expect(ehIOS()).toBe(false);
  });
});

describe('escolherMime (formato de gravação por navegador)', () => {
  const comSuporte = (aceitos: (t: string) => boolean) =>
    vi.stubGlobal('window', { MediaRecorder: { isTypeSupported: aceitos } });
  it('Safari/iOS (só audio/mp4) → grava AAC/MP4, o 1º candidato', () => {
    comSuporte((t) => t.startsWith('audio/mp4'));
    expect(escolherMime()).toBe('audio/mp4;codecs=mp4a.40.2');
  });
  it('Chrome (webm/opus, sem mp4) → cai no webm/opus', () => {
    comSuporte((t) => t.startsWith('audio/webm'));
    expect(escolherMime()).toBe('audio/webm;codecs=opus');
  });
  it('navegador sem MediaRecorder → vazio (o componente mostra erro amigável)', () => {
    vi.stubGlobal('window', {});
    expect(escolherMime()).toBe('');
  });
  it('isTypeSupported que LANÇA não derruba a escolha (try por candidato)', () => {
    comSuporte((t) => { if (t.includes('mp4')) throw new Error('boom'); return t === 'audio/ogg;codecs=opus'; });
    expect(escolherMime()).toBe('audio/ogg;codecs=opus');
  });
});
