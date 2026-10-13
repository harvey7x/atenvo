import { describe, expect, it } from 'vitest';
import { mmaaaa, periodosDoExtrato } from './periodos';

describe('periodosDoExtrato', () => {
  it('outubro: começa no mês seguinte do ano passado e termina no mês atual', () => {
    const [p] = periodosDoExtrato({ mes: 10, ano: 2026 });
    expect(mmaaaa(p.inicio)).toBe('11/2025');
    expect(mmaaaa(p.fim)).toBe('10/2026');
  });

  it('dezembro: janeiro a dezembro do mesmo ano', () => {
    const [p] = periodosDoExtrato({ mes: 12, ano: 2026 });
    expect(mmaaaa(p.inicio)).toBe('01/2026');
    expect(mmaaaa(p.fim)).toBe('12/2026');
  });

  it('janeiro: fevereiro do ano passado a janeiro', () => {
    const [p] = periodosDoExtrato({ mes: 1, ano: 2027 });
    expect(mmaaaa(p.inicio)).toBe('02/2026');
    expect(mmaaaa(p.fim)).toBe('01/2027');
  });

  it('10 períodos, descendo um ano por vez sem buraco nem sobreposição', () => {
    const ps = periodosDoExtrato({ mes: 10, ano: 2026 });
    expect(ps).toHaveLength(10);
    expect(mmaaaa(ps[1].inicio)).toBe('11/2024');
    expect(mmaaaa(ps[1].fim)).toBe('10/2025');
    expect(mmaaaa(ps[9].inicio)).toBe('11/2016');
    expect(mmaaaa(ps[9].fim)).toBe('10/2017');
    for (let i = 1; i < ps.length; i++) {
      const fimDoMaisAntigo = ps[i].fim.ano * 12 + ps[i].fim.mes;
      const inicioDoMaisNovo = ps[i - 1].inicio.ano * 12 + ps[i - 1].inicio.mes;
      expect(inicioDoMaisNovo - fimDoMaisAntigo).toBe(1);
    }
  });
});
