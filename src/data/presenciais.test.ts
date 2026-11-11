import { describe, expect, it } from 'vitest';
import { diaSP, horaTxt, instanteSP, naTxt, textoLembrete, textoPresencial } from './presenciais';

/* Os textos foram aprovados pelo dono em 29/10. A fonte é o banco (presencial_texto);
   as saídas esperadas abaixo são as do banco na simulação de 29/10 — a prévia da tela
   tem de ser idêntica. */

describe('presenciais: textos do grupo (iguais ao banco)', () => {
  it('marcado (texto curto, aprovado 09/11)', () => {
    expect(textoPresencial('marcado', 'Amanda Cristina Silveira da silva', '2026-11-09T17:00:00Z', 'Matheus')).toBe(
      '*📅  Presencial agendado*\nAmanda Cristina Silveira da Silva\nSeg, 09/11 às 14h · Matheus',
    );
  });
  it('minutos aparecem; fim de semana abreviado', () => {
    expect(textoPresencial('marcado', 'FULANO DE TAL', '2026-10-31T19:30:00Z', 'Isadora')).toBe(
      '*📅  Presencial agendado*\nFulano de Tal\nSáb, 31/10 às 16h30 · Isadora',
    );
    expect(naTxt('2026-11-01T13:00:00Z')).toBe('no domingo, 01/11');
  });
  it('remarcado', () => {
    expect(textoPresencial('remarcado', 'Joice Elena de Souza Silveira', '2026-11-02T13:00:00Z', 'Matheus')).toBe(
      '🔁 *PRESENCIAL REMARCADO*\nJoice Elena de Souza Silveira passou para segunda, 02/11, às 10h.\nRemarcado por Matheus.',
    );
  });
  it('desmarcado', () => {
    expect(textoPresencial('desmarcado', 'Andreia', '2026-11-04T12:00:00Z', 'Matheus')).toBe(
      '❌ *PRESENCIAL DESMARCADO*\nO atendimento de Andreia na quarta, 04/11, às 9h foi desmarcado por Matheus.',
    );
  });
  it('lembrete do dia, por horário', () => {
    expect(textoLembrete([
      { quando: '2026-10-30T19:30:00Z', nome: 'Maria Souza', quem: 'Juliana' },
      { quando: '2026-10-30T17:00:00Z', nome: 'Hernani da Silva', quem: 'Isadora' },
    ])).toBe(
      '*📍  Presenciais hoje*\n\nHoje temos 2 clientes marcados:\n\n*14h* · Hernani da Silva\n_Marcado por Isadora_\n\n*16h30* · Maria Souza\n_Marcado por Juliana_',
    );
    expect(textoLembrete([{ quando: '2026-11-16T19:30:00Z', nome: 'Tereza dos Santos leiria', quem: 'Giovana' }])).toBe(
      '*📍  Presencial hoje*\n\nHoje tem cliente marcado:\n\n*16h30* · Tereza dos Santos Leiria\n_Marcado por Giovana_',
    );
    expect(textoLembrete([])).toBeNull();
  });
});

describe('presenciais: datas em São Paulo', () => {
  it('data + hora digitadas viram o instante certo', () => {
    expect(instanteSP('2026-10-30', '14:00')).toBe('2026-10-30T17:00:00.000Z');
    expect(diaSP('2026-10-31T02:30:00Z')).toBe('2026-10-30'); // 23h30 do dia 30 em SP
    expect(horaTxt('2026-10-31T02:30:00Z')).toBe('23h30');
  });
});
