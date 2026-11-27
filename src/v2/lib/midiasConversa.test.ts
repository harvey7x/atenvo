// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { agruparPorMes, dominioDe, extensaoDe, extrairLinks, midiasDaConversa, tamanhoLegivel } from './midiasConversa';
import type { WaMessage } from '@/data/whatsappDemo';

const M = (x: Partial<WaMessage>): WaMessage => ({ dir: 'in', time: '10:00', ...x });

describe('mídia, documentos e links da conversa', () => {
  it('separa por tipo, mais recente primeiro, e ignora o que não tem arquivo', () => {
    const r = midiasDaConversa([
      M({ id: 'a', tipo: 'imagem', anexoPath: 'o/wa-midia/a.jpg', tsISO: '2026-11-20T12:00:00Z' }),
      M({ id: 'b', tipo: 'imagem', anexoPath: 'o/wa-midia/b.jpg', tsISO: '2026-11-24T12:00:00Z' }),
      M({ id: 'c', tipo: 'video', midiaUrl: 'https://x/v.mp4', tsISO: '2026-11-22T12:00:00Z' }),
      M({ id: 'd', tipo: 'imagem', midiaPendente: true, anexoPath: 'o/wa-midia/d.jpg' }), // nunca baixou
      M({ id: 'e', dir: 'out', tipo: 'imagem', status: 'falhou', localUrl: 'blob:x' }),     // não saiu
      M({ id: 'f', tipo: 'documento', anexoPath: 'o/wa-midia/f.pdf', nome: 'RG.pdf' }),
      M({ id: 'g', tipo: 'audio', anexoPath: 'o/wa-midia/g.ogg' }),
      M({ id: 'h', text: 'Entre em https://meu.inss.gov.br. Depois me avisa' }),
    ]);
    expect(r.fotos.map((x) => x.chave)).toEqual(['b', 'c', 'a']);
    expect(r.documentos.map((x) => x.chave)).toEqual(['f']);
    expect(r.audios).toHaveLength(1);
    expect(r.links.map((x) => x.url)).toEqual(['https://meu.inss.gov.br']);
    expect(r.links[0].dominio).toBe('meu.inss.gov.br');
    expect(r.total).toBe(6);
  });
  it('links: tira pontuação do fim, aceita www e não repete na mesma mensagem', () => {
    expect(extrairLinks('veja (www.gov.br/inss) e https://a.com/x?y=1, ok… https://a.com/x?y=1')).toEqual(['www.gov.br/inss', 'https://a.com/x?y=1', 'https://a.com/x?y=1']);
    expect(midiasDaConversa([M({ id: 'x', text: 'https://a.com https://a.com' })]).links).toHaveLength(1);
    expect(dominioDe('www.gov.br/inss')).toBe('gov.br');
    expect(extrairLinks('sem link nenhum')).toEqual([]);
  });
  it('agrupa por mês no fuso de São Paulo', () => {
    const agora = Date.parse('2026-11-25T13:00:00Z');
    const g = agruparPorMes([
      { ts: Date.parse('2026-11-01T02:00:00Z') }, // ainda 31/10 em SP
      { ts: Date.parse('2026-11-02T12:00:00Z') },
      { ts: Date.parse('2025-12-10T12:00:00Z') },
    ].sort((a, b) => b.ts - a.ts), agora);
    expect(g.map((x) => [x.rotulo, x.itens.length])).toEqual([['Este mês', 1], ['Outubro', 1], ['Dezembro de 2025', 1]]);
  });
  it('tamanho e extensão legíveis', () => {
    expect(tamanhoLegivel(1_258_291)).toBe('1,2 MB');
    expect(tamanhoLegivel(482_112)).toBe('471 KB');
    expect(tamanhoLegivel(null)).toBe('');
    expect(extensaoDe({ nome: 'Contrato.PDF' })).toBe('PDF');
    expect(extensaoDe({ mime: 'application/pdf' })).toBe('PDF');
  });
});
