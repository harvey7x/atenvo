// @vitest-environment node
// Resumo do dia: a leitura do que o servidor devolve e a frase do aviso no sino (a mesma do agendador da migration 108)
import { describe, expect, it } from 'vitest';
import { fraseDoResumo, normalizarResumo, resumoDemo } from './resumoDia';

describe('resumo do dia', () => {
  it('a frase do sino, com singular e plural', () => {
    expect(fraseDoResumo({ clientesEscreveram: 2, atendidasEquipe: 1, fechadas: 1, leadsNovos: 0, esperaramMeta: 1 }))
      .toBe('2 clientes escreveram · 1 atendido pela equipe · 1 conversa fechada · 0 leads novos · 1 esperou além da meta.');
    expect(fraseDoResumo({ clientesEscreveram: 1, atendidasEquipe: 0, fechadas: 3, leadsNovos: 1, esperaramMeta: 0 }))
      .toBe('1 cliente escreveu · 0 atendidos pela equipe · 3 conversas fechadas · 1 lead novo.');
  });
  it('lê o servidor sem quebrar com campo faltando', () => {
    const r = normalizarResumo({ dia: '2026-11-25', clientes_escreveram: 4, motivos: [{ motivo: 'Atendimento concluído', n: 2 }], atendentes: [{ id: 'a', nome: 'Ana', conversas: 3 }] });
    expect(r.clientesEscreveram).toBe(4);
    expect(r.fechadas).toBe(0);
    expect(r.motivos).toEqual([{ motivo: 'Atendimento concluído', n: 2 }]);
    expect(r.atendentes[0]).toEqual({ id: 'a', nome: 'Ana', conversas: 3, mensagens: 0, fechadas: 0 });
    expect(r.esperaram).toEqual([]);
  });
  it('a demonstração dá sempre os mesmos números para o mesmo dia', () => {
    expect(resumoDemo('2026-11-24').clientesEscreveram).toBe(resumoDemo('2026-11-24').clientesEscreveram);
  });
});
