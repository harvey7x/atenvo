import { describe, it, expect } from 'vitest';
import { nomeArquivoMidia, rotuloBaixarMidia } from './midiaNome';

const ORG = 'de300000-0000-4000-8000-000000000001';

describe('nomeArquivoMidia — preserva o nome ORIGINAL sanitizado', () => {
  it('documento real do cliente mantém o nome', () => {
    // caso real: metadados {nome: 'fatura-18285527283.pdf', mime: 'application/pdf'}
    expect(nomeArquivoMidia({
      nome: 'fatura-18285527283.pdf', tipo: 'documento', mime: 'application/pdf',
      anexoPath: `${ORG}/wa-midia/AC711B3005C53D93B363872441C8790C.pdf`, dataISO: '2026-07-16',
    })).toBe('fatura-18285527283.pdf');
  });
  it('tira acento e espaço, mantendo a extensão', () => {
    expect(nomeArquivoMidia({ nome: 'Contrato Benefício Março.pdf', tipo: 'documento', anexoPath: 'o/wa-midia/x.pdf' }))
      .toBe('Contrato-Beneficio-Marco.pdf');
  });
  it('acrescenta extensão quando o original não tem', () => {
    expect(nomeArquivoMidia({ nome: 'comprovante', tipo: 'documento', anexoPath: 'o/wa-midia/x.pdf' }))
      .toBe('comprovante.pdf');
  });
});

describe('nomeArquivoMidia — SEGURANÇA do nome', () => {
  it('neutraliza path traversal', () => {
    const n = nomeArquivoMidia({ nome: '../../etc/passwd.pdf', tipo: 'documento', anexoPath: 'o/wa-midia/x.pdf' });
    expect(n).not.toContain('..');
    expect(n).not.toContain('/');
  });
  it('remove caractere perigoso e não deixa arquivo oculto', () => {
    const n = nomeArquivoMidia({ nome: '.oculto;rm -rf <>|.pdf', tipo: 'documento', anexoPath: 'o/wa-midia/x.pdf' });
    expect(n.startsWith('.')).toBe(false);
    expect(n).not.toMatch(/[;<>|/\\]/);
  });
  it('limita o tamanho do nome', () => {
    expect(nomeArquivoMidia({ nome: 'a'.repeat(400) + '.pdf', tipo: 'documento', anexoPath: 'o/wa-midia/x.pdf' }).length)
      .toBeLessThanOrEqual(125);
  });
});

describe('nomeArquivoMidia — cliente-DATA-tipo.ext quando o nome é genérico/ausente', () => {
  it('imagem genérica vira cliente-data-imagem.jpg', () => {
    // caso real: metadados {nome: 'imagem.jpg'}
    expect(nomeArquivoMidia({
      nome: 'imagem.jpg', tipo: 'imagem', mime: 'image/jpeg',
      anexoPath: `${ORG}/wa-midia/ACAB3F3B80C54E0486334C02214252E5.jpg`, dataISO: '2026-07-16',
    })).toBe('cliente-2026-07-16-imagem.jpg');
  });
  it('áudio genérico vira cliente-data-audio.ogg', () => {
    expect(nomeArquivoMidia({
      nome: 'audio.ogg', tipo: 'audio', mime: 'audio/ogg',
      anexoPath: `${ORG}/wa-midia/ACD10BF2F190101D836855D919236FE4.ogg`, dataISO: '2026-07-16',
    })).toBe('cliente-2026-07-16-audio.ogg');
  });
  it('sem nome: usa a extensão do path', () => {
    expect(nomeArquivoMidia({ tipo: 'video', anexoPath: 'o/wa-midia/x.mp4', dataISO: '2026-07-16' }))
      .toBe('cliente-2026-07-16-video.mp4');
  });
  it('sem nome e sem path: cai no mime', () => {
    expect(nomeArquivoMidia({ tipo: 'imagem', mime: 'image/png', dataISO: '2026-07-16' }))
      .toBe('cliente-2026-07-16-imagem.png');
  });
  it('tipo desconhecido e sem pistas: arquivo .bin', () => {
    expect(nomeArquivoMidia({ dataISO: '2026-07-16' })).toBe('cliente-2026-07-16-arquivo.bin');
  });
});

describe('rotuloBaixarMidia', () => {
  it('rótulo por tipo', () => {
    expect(rotuloBaixarMidia('imagem')).toBe('Baixar imagem');
    expect(rotuloBaixarMidia('audio')).toBe('Baixar áudio');
    expect(rotuloBaixarMidia('video')).toBe('Baixar vídeo');
    expect(rotuloBaixarMidia('documento')).toBe('Baixar documento');
    expect(rotuloBaixarMidia(undefined)).toBe('Baixar arquivo');
  });
});
