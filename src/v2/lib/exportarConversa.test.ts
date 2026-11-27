// @vitest-environment node
// Exportar, buscar e linkar a conversa (26/11)
import { describe, expect, it } from 'vitest';
import type { WaMessage } from '@/data/whatsappDemo';
import { acharNaConversa, linkDaConversa, nomeArquivoConversa, textoDaConversa } from './exportarConversa';

const m = (x: Partial<WaMessage>): WaMessage => ({ dir: 'in', text: '', time: '10:00', ...x } as WaMessage);
const msgs: WaMessage[] = [
  m({ id: 'a', text: 'Oi, quero ver os juros do meu empréstimo', tsISO: '2026-11-26T13:00:00Z' }),
  m({ id: 'b', dir: 'out', origemBot: true, text: 'Olá! Me manda o RG?', tsISO: '2026-11-26T13:01:00Z' }),
  m({ id: 'c', tipo: 'imagem', nome: 'rg.jpg', tsISO: '2026-11-26T13:05:00Z' }),
  m({ id: 'd', dir: 'out', text: 'segredo da equipe', nota: { mencoesNomes: [], automatica: false } }),
  m({ id: 'e', tipo: 'audio', transcricao: 'Pode me ligar depois das seis', tsISO: '2026-11-26T13:10:00Z' }),
  m({ id: 'f', dir: 'out', text: 'Combinado, ligo às 18h.', tsISO: '2026-11-26T13:11:00Z' }),
];

describe('exportar conversa', () => {
  it('uma linha por mensagem, sem a nota interna', () => {
    const t = textoDaConversa({ nome: 'Maria Souza', telefone: '(51) 98888-0000', agora: new Date('2026-11-26T15:00:00Z') }, msgs);
    expect(t).toContain('Conversa com Maria Souza ((51) 98888-0000)');
    expect(t).toContain('[26/11/2026 10:00] Cliente: Oi, quero ver os juros do meu empréstimo');
    expect(t).toContain('IA: Olá! Me manda o RG?');
    expect(t).toContain('Cliente: [foto: rg.jpg]');
    expect(t).toContain('[áudio] (transcrição: Pode me ligar depois das seis)');
    expect(t).toContain('Equipe: Combinado, ligo às 18h.');
    expect(t).not.toContain('segredo da equipe');
  });
  it('nome do arquivo sem acento e com o dia', () => {
    expect(nomeArquivoConversa('Maria Aparecida Souza', new Date('2026-11-26T15:00:00Z'))).toBe('conversa-maria-aparecida-souza-2026-11-26.txt');
    expect(nomeArquivoConversa('', new Date('2026-11-26T15:00:00Z'))).toBe('conversa-cliente-2026-11-26.txt');
  });
});

describe('buscar e linkar', () => {
  it('acha sem acento e ignora a nota interna', () => {
    expect(acharNaConversa(msgs, 'emprestimo')).toEqual(['a']);
    expect(acharNaConversa(msgs, 'LIGAR')).toEqual(['e']);
    expect(acharNaConversa(msgs, 'segredo')).toEqual([]);
    expect(acharNaConversa(msgs, 'a')).toEqual([]); // 1 letra só não busca
  });
  it('o link abre a conversa no sistema e na prévia', () => {
    expect(linkDaConversa('abc', { origin: 'https://reviza.squareweb.app', pathname: '/whatsapp', hash: '' })).toBe('https://reviza.squareweb.app/whatsapp?conversa=abc');
    expect(linkDaConversa('abc', { origin: 'file://', pathname: '/x/index.html', hash: '#/whatsapp' })).toBe('file:///x/index.html#/whatsapp?conversa=abc');
  });
});
