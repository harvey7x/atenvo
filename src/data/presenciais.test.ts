import { describe, expect, it } from 'vitest';
import { diaSP, horaTxt, instanteSP, naTxt, textoLembrete, textoPresencial } from './presenciais';

/* Os textos foram aprovados pelo dono em 29/10. A fonte é o banco (presencial_texto);
   as saídas esperadas abaixo são as do banco na simulação de 29/10 — a prévia da tela
   tem de ser idêntica. */

describe('presenciais: textos do grupo (iguais ao banco)', () => {
  it('marcado', () => {
    expect(textoPresencial('marcado', 'Joice Elena de Souza Silveira', '2026-10-30T17:00:00Z', 'Matheus')).toBe(
      '📅 *PRESENCIAL MARCADO*\nJoice Elena de Souza Silveira foi marcado para atendimento presencial na sexta, 30/10, às 14h.\n'
      + 'Marcado por Matheus. No dia, aviso aqui de novo.',
    );
  });
  it('sábado e domingo usam "no"; minutos aparecem', () => {
    expect(textoPresencial('marcado', 'Fulano', '2026-10-31T19:30:00Z', 'Isadora')).toBe(
      '📅 *PRESENCIAL MARCADO*\nFulano foi marcado para atendimento presencial no sábado, 31/10, às 16h30.\n'
      + 'Marcado por Isadora. No dia, aviso aqui de novo.',
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
      '📍 *HOJE TEM PRESENCIAL*\n14h · Hernani da Silva · marcado por Isadora\n16h30 · Maria Souza · marcado por Juliana\nNão se esqueçam!',
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
