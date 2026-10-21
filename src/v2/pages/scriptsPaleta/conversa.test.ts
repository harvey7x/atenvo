import { describe, expect, it } from 'vitest';
import type { WaMessage } from '@/data/whatsappDemo';
import { haQuanto, resumirUltimaDoCliente } from './conversa';
import { partesNome, tamanhoPt } from './etapas';

const AGORA = Date.parse('2026-10-20T17:42:00Z');
const iso = (minAtras: number) => new Date(AGORA - minAtras * 60_000).toISOString();
const IN = (text: string, min: number, extra: Partial<WaMessage> = {}): WaMessage => ({ dir: 'in', text, time: '14:38', tsISO: iso(min), ...extra });
const OUT = (text: string, min: number): WaMessage => ({ dir: 'out', text, time: '14:32', tsISO: iso(min) });

describe('última do cliente (contexto da prévia)', () => {
  it('rodada depois da nossa: a mais recente com texto/transcrição + o que veio depois', () => {
    const r = resumirUltimaDoCliente([
      IN('Boa tarde!', 11), OUT('Boa tarde, dona Maria!', 10), IN('Pode sim, meu filho', 7),
      IN('', 4, { tipo: 'audio', transcricao: 'Meu nome é Maria Aparecida.' }),
      IN('', 4, { tipo: 'imagem' }), IN('', 4, { tipo: 'imagem' }),
    ], AGORA);
    expect(r).toEqual({ texto: 'Meu nome é Maria Aparecida.', audio: true, extra: '2 imagens', extraTipo: 'imagem', quando: 'há 4 min' });
  });
  it('a hora é a da mensagem mostrada (não a da última mídia que veio depois)', () => {
    const r = resumirUltimaDoCliente([
      OUT('Pode mandar', 30), IN('Segue o extrato', 20), IN('', 2, { tipo: 'imagem' }), IN('', 1, { tipo: 'audio' }),
    ], AGORA);
    expect(r).toMatchObject({ texto: 'Segue o extrato', quando: 'há 20 min', extra: '1 áudio e 1 imagem', extraTipo: null });
  });
  it('só mídia: rótulo do tipo; documento com nome', () => {
    expect(resumirUltimaDoCliente([IN('', 3, { pdf: { name: 'Contrato.pdf', meta: 'PDF' } })], AGORA))
      .toMatchObject({ texto: 'Documento: Contrato.pdf', extra: '', quando: 'há 3 min' });
  });
  it('sem rodada nova (última é nossa): mostra a última do cliente; sem cliente: nada', () => {
    expect(resumirUltimaDoCliente([IN('Oi', 90), OUT('Olá!', 80)], AGORA)).toMatchObject({ texto: 'Oi', quando: 'há 1 h' });
    expect(resumirUltimaDoCliente([OUT('Olá!', 80)], AGORA)).toBeNull();
    expect(resumirUltimaDoCliente([], AGORA)).toBeNull();
  });
  it('tempo relativo, com o horário da mensagem como reserva', () => {
    expect(haQuanto(iso(0), AGORA)).toBe('agora');
    expect(haQuanto(iso(59), AGORA)).toBe('há 59 min');
    expect(haQuanto(undefined, AGORA, '14:38')).toBe('14:38');
  });
});

describe('arquivos da prévia em português', () => {
  it('tamanho com vírgula decimal', () => {
    expect(tamanhoPt(7_200_000)).toBe('6,9 MB');
    expect(tamanhoPt(5 * 1024 * 1024)).toBe('5,0 MB');
    expect(tamanhoPt(61_440)).toBe('60 KB');
    expect(tamanhoPt(0)).toBe('');
  });
  it('nome separa base e extensão (a extensão nunca some na reticência)', () => {
    expect(partesNome('nivel-gov-prata-ouro.mp4')).toEqual({ base: 'nivel-gov-prata-ouro', ext: '.mp4' });
    expect(partesNome('sem extensao')).toEqual({ base: 'sem extensao', ext: '' });
  });
});
