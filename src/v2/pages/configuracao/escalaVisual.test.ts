// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* GUARDA da escala visual da configuração inicial (configuracao.css).
   O dono pediu "uma tela mais profissional": a escala fechada é o que
   segura isso no tempo. Falha se aparecer
   (1) font-size fora de 11 / 12.5 / 13.5 / 15 / 20 / 28 (ou inherit);
   (2) border-radius fora dos tokens (r-card, r-ctl, r-card - 1 no rodapé
       fixo, 50%, 999px, 0, inherit) — a única exceção é a caixa de
       confirmação de 18px, que pede raio 5 (r-ctl - 4);
   (3) âmbar em espera, trilha, tags ou faixa (âmbar = risco real só);
   (4) --txt-3 como cor de texto fora de placeholder/separador/
       desabilitado/decorativo (no claro dá ~3,1:1). */

const CSS = readFileSync(join(__dirname, 'configuracao.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** blocos { seletor, corpo } — @media/@keyframes entram pelo bloco interno */
function blocos(css: string): Array<{ seletor: string; corpo: string }> {
  const out: Array<{ seletor: string; corpo: string }> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const seletor = m[1].replace(/@media[^{]*$/, '').trim();
    out.push({ seletor, corpo: m[2] });
  }
  return out;
}

/** valores de uma propriedade num corpo de regra */
function valores(corpo: string, prop: string): string[] {
  const re = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`, 'g');
  return [...corpo.matchAll(re)].map((m) => m[1].replace(/!important/, '').trim());
}

const FONTES = new Set(['11px', '12.5px', '13.5px', '15px', '20px', '28px', 'inherit']);
const RAIOS = new Set([
  'var(--r-card)', 'var(--r-ctl)', 'calc(var(--r-card) - 1px)', '50%', '999px', '0', 'inherit',
  'calc(var(--r-ctl) - 4px)', // caixa de confirmação (18px, raio 5)
]);
/** calc(...) com UM nível de parênteses dentro (calc(var(--r-card) - 1px) é um token só) */
const TOKEN = /calc\((?:[^()]|\([^()]*\))*\)|var\([^)]*\)|[^\s]+/g;

describe('configuracao.css — escala visual', () => {
  const todos = blocos(CSS);

  it('lê o arquivo (sanidade)', () => {
    expect(todos.length).toBeGreaterThan(50);
  });

  it('(1) font-size só na escala de 6 tamanhos', () => {
    const fora: string[] = [];
    for (const b of todos) for (const v of valores(b.corpo, 'font-size')) if (!FONTES.has(v)) fora.push(`${b.seletor} → ${v}`);
    expect(fora, `font-size fora da escala:\n${fora.join('\n')}`).toEqual([]);
  });

  it('(2) border-radius só com os tokens', () => {
    const fora: string[] = [];
    for (const b of todos) {
      for (const v of valores(b.corpo, 'border-radius')) {
        for (const t of v.match(TOKEN) ?? []) if (!RAIOS.has(t)) fora.push(`${b.seletor} → ${t}`);
      }
    }
    expect(fora, `border-radius fora dos tokens:\n${fora.join('\n')}`).toEqual([]);
  });

  it('(3) sem âmbar na espera, na trilha, nas tags e na faixa', () => {
    const proibidos = ['.cini-espera', '.cini-trilha', '.cini-tr-', '.cini-tag', '.cini-faixa'];
    const fora = todos
      .filter((b) => b.corpo.includes('var(--ambar') && proibidos.some((p) => b.seletor.includes(p)))
      .map((b) => b.seletor);
    expect(fora, `âmbar onde não há risco:\n${fora.join('\n')}`).toEqual([]);
  });

  it('(4) --txt-3 só em placeholder, separador, desabilitado ou decorativo', () => {
    const permitidos = ['placeholder', '-sep', ':disabled', '-dec'];
    const fora = todos
      .filter((b) => /(?:^|[;\s])color\s*:\s*var\(--txt-3\)/.test(b.corpo))
      .filter((b) => !b.seletor.split(',').every((s) => permitidos.some((p) => s.includes(p))))
      .map((b) => b.seletor);
    expect(fora, `--txt-3 em texto informativo:\n${fora.join('\n')}`).toEqual([]);
  });
});
