// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { baldesDe, somarEmBaldes } from '@/data/dashboardV5.series';
import { GrafLinhas, type SerieGraf } from './GrafLinhas';

const render = (el: Parameters<typeof renderToString>[0]) => renderToString(el).replace(/<!-- -->/g, '');
const baldes = baldesDe('2026-11-06', '2026-11-13', 'dia');
const serie = (id: string, cor: string, valores: [string, number][], notas?: SerieGraf['notas']): SerieGraf => ({
  id, rotulo: id === 'a' ? 'Diego' : 'Juros abusivo', cor,
  valores: somarEmBaldes(valores.map(([dia, valor]) => ({ dia, valor })), 'dia'), notas,
});

describe('GrafLinhas (versão enxuta)', () => {
  const dados = [
    serie('a', 'var(--dado-1)', [['2026-11-06', 80], ['2026-11-08', 132], ['2026-11-12', 30]],
      [{ texto: 'caiu', tom: 'er' }]),
    serie('b', 'var(--dado-4)', [['2026-11-06', 20], ['2026-11-10', 12]], [{ texto: 'parou e voltou', tom: 'am' }]),
  ];

  it('desenha em pixels reais: svg com largura e altura de verdade (sem esticar)', () => {
    const h = render(<GrafLinhas baldes={baldes} series={dados} titulo="Entradas" vazio="nada" />);
    expect(h).toContain('width="760"');
    expect(h).toContain('height="236"');
    expect(h).toContain('viewBox="0 0 760 236"');
  });

  it('eixo com escala redonda (132 → 0 · 50 · 100 · 150)', () => {
    const h = render(<GrafLinhas baldes={baldes} series={dados} titulo="Entradas" vazio="nada" />);
    for (const t of ['>0<', '>50<', '>100<', '>150<']) expect(h).toContain(t);
  });

  it('legenda clicável com a leitura ao lado do nome; uma área só (a da série que mais somou)', () => {
    const h = render(<GrafLinhas baldes={baldes} series={dados} titulo="Entradas" vazio="nada" />);
    expect((h.match(/aria-pressed="true"/g) ?? []).length).toBe(2);
    expect(h).toContain('Diego');
    expect(h).toContain('>caiu<');
    expect(h).toContain('>parou e voltou<');
    expect((h.match(/class="d5-graf-area"/g) ?? []).length).toBe(1);
    expect((h.match(/class="d5-graf-linha"/g) ?? []).length).toBe(2);
    // nada de contorno por coluna nem tracejado
    expect(h).not.toContain('d5-graf-hit');
    expect(h).not.toContain('stroke-dasharray');
  });

  it('série única: sem legenda; tabela invisível com o dia por extenso', () => {
    const h = render(<GrafLinhas baldes={baldes} series={[dados[0]]} titulo="Entradas" vazio="nada" />);
    expect(h).not.toContain('d5-graf-leg');
    expect(h).toContain('dom 08/11');
    expect(h).toContain('>132<');
  });

  it('tudo zerado: o vazio no lugar do gráfico', () => {
    const zero = [serie('a', 'var(--dado-1)', [['2026-11-06', 0]])];
    const h = render(<GrafLinhas baldes={baldes} series={zero} titulo="Entradas" vazio="Sem movimento para desenhar." />);
    expect(h).toContain('Sem movimento para desenhar.');
    expect(h).not.toContain('<svg');
  });
});
