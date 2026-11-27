// @vitest-environment node
// Agenda (26/11): as contas de calendário no horário de São Paulo
import { describe, expect, it } from 'vitest';
import { gradeDoMes, horaSP, instanteSP, janelaDaVisao, posicaoNaGrade, rotuloPeriodo, semanaDe, validarReuniao } from './agenda';

describe('agenda: calendário', () => {
  it('semana de segunda a domingo', () => {
    expect(semanaDe('2026-11-26')).toEqual(['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    expect(semanaDe('2026-11-29')[0]).toBe('2026-11-23'); // domingo fica na semana que começou na segunda
  });
  it('grade do mês fecha as semanas', () => {
    const g = gradeDoMes('2026-11-10');
    expect(g[0][0]).toBe('2026-10-26');
    expect(g[g.length - 1][6]).toBe('2026-12-06');
    expect(g.every((s) => s.length === 7)).toBe(true);
  });
  it('hora e posição na grade em São Paulo', () => {
    const i = instanteSP('2026-11-26', '14:30');
    expect(i).toBe('2026-11-26T17:30:00.000Z');
    expect(horaSP(i)).toBe('14:30');
    const p = posicaoNaGrade(instanteSP('2026-11-26', '08:00'), 60, 7, 21);
    expect(Math.round(p.topo * 100) / 100).toBe(7.14);
    expect(Math.round(p.altura * 100) / 100).toBe(7.14);
    expect(posicaoNaGrade(instanteSP('2026-11-26', '06:00'), 30).topo).toBe(0); // antes das 7 encosta no topo
  });
  it('janela e rótulo de cada visão', () => {
    expect(janelaDaVisao('semana', '2026-11-26')).toEqual({ ini: '2026-11-23T03:00:00.000Z', fim: '2026-11-30T03:00:00.000Z' });
    expect(rotuloPeriodo('semana', '2026-11-26')).toBe('23 a 29 de novembro');
    expect(rotuloPeriodo('semana', '2026-12-01')).toBe('30 de novembro a 6 de dezembro');
    expect(rotuloPeriodo('dia', '2026-11-26')).toBe('quinta, 26 de novembro');
  });
  it('confere antes de salvar', () => {
    const ok = { titulo: 'Ligar', tipo: 'ligacao' as const, inicio: instanteSP('2026-11-26', '10:00'), duracaoMin: 30, responsavelId: null, conversaId: null, local: null, observacao: null };
    expect(validarReuniao(ok)).toBeNull();
    expect(validarReuniao({ ...ok, titulo: '  ' })).toMatch(/assunto/);
    expect(validarReuniao({ ...ok, duracaoMin: 600 })).toMatch(/duração/);
  });
});
