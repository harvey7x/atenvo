// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { validar, type MediaTipo } from './MediaComposer';

/* A régua do CLIENT tem de espelhar a do SERVIDOR, senão a falha acontece DEPOIS
   da bolha otimista: evolution-send (WhatsApp) corta imagem/vídeo/áudio em 16MB e
   documento em 25MB; meta-send-message (Facebook) aceita 25MB para tudo. */
const MB = 1024 * 1024;
const arq = (size: number, type: string, name = 'arquivo') => ({ size, type, name }) as unknown as File;

describe('validar (limites por perfil = limites do servidor)', () => {
  it.each<[MediaTipo, number, string | null]>([
    ['imagem', 15, null], ['imagem', 17, 'acima de 16 MB'],
    ['video', 15, null], ['video', 17, 'acima de 16 MB'],
    ['documento', 24, null], ['documento', 26, 'acima de 25 MB'],
  ])('whatsapp: %s de %dMB → %s', (tipo, mb, esperado) => {
    const mime = tipo === 'imagem' ? 'image/jpeg' : tipo === 'video' ? 'video/mp4' : 'application/pdf';
    expect(validar(tipo, arq(mb * MB, mime), 'whatsapp')).toBe(esperado);
  });

  it('facebook: 25MB para TUDO (o Messenger aceita — não regride o /v1/facebook)', () => {
    expect(validar('imagem', arq(20 * MB, 'image/jpeg'), 'facebook')).toBeNull();
    expect(validar('video', arq(24 * MB, 'video/mp4'), 'facebook')).toBeNull();
    expect(validar('imagem', arq(26 * MB, 'image/jpeg'), 'facebook')).toBe('acima de 25 MB');
  });

  it('HEIC do iPhone: barrado no WhatsApp (chegava quebrado no cliente), livre no Facebook', () => {
    expect(validar('imagem', arq(1 * MB, 'image/heic'), 'whatsapp')).toMatch(/HEIC/);
    expect(validar('imagem', arq(1 * MB, 'image/heif'), 'whatsapp')).toMatch(/HEIC/);
    expect(validar('imagem', arq(1 * MB, 'image/heic'), 'facebook')).toBeNull();
  });

  it('tipo trocado é recusado (não é imagem / não é vídeo)', () => {
    expect(validar('imagem', arq(1 * MB, 'application/pdf'), 'whatsapp')).toBe('não é uma imagem');
    expect(validar('video', arq(1 * MB, 'image/png'), 'whatsapp')).toBe('não é um vídeo');
  });

  it('arquivos válidos comuns passam (jpeg, mp4, pdf)', () => {
    expect(validar('imagem', arq(2 * MB, 'image/jpeg'), 'whatsapp')).toBeNull();
    expect(validar('video', arq(8 * MB, 'video/mp4'), 'whatsapp')).toBeNull();
    expect(validar('documento', arq(3 * MB, 'application/pdf'), 'whatsapp')).toBeNull();
  });
});
