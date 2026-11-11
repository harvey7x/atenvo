// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* GUARDA da escala visual da Etapa Planilha (cpl-) e do painel de sincronização da Gestão (psy-).
   As mesmas 4 regras do guarda da configuração inicial (configuracao/escalaVisual.test.ts):
   (1) font-size só em 11 / 12.5 / 13.5 / 15 / 20 / 28; (2) raio só com os tokens; (3) âmbar só em
   risco real; (4) --txt-3 nunca em texto informativo. Mais (5): --X-bg só em tile/marcador.
   Lê o CSS em runtime (o cache do vitest não esconde CSS novo). */

const ARQUIVOS = [
  join(__dirname, 'sync-painel.css'),
  join(__dirname, '../configuracao/etapa-planilha.css'),
];

interface Regra { arquivo: string; seletor: string; decls: Array<[string, string]> }

function regras(): Regra[] {
  const out: Regra[] = [];
  for (const arquivo of ARQUIVOS) {
    const css = readFileSync(arquivo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    /* blocos mais internos: o seletor é o texto entre o último { ou } e o { do bloco */
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const seletor = m[1].trim().replace(/\s+/g, ' ');
      const decls = m[2].split(';').map((d) => d.trim()).filter(Boolean).map((d): [string, string] => {
        const i = d.indexOf(':');
        return [d.slice(0, i).trim().toLowerCase(), d.slice(i + 1).trim()];
      });
      out.push({ arquivo: arquivo.split('/').pop() ?? arquivo, seletor, decls });
    }
  }
  return out;
}

const FONTES = new Set(['11px', '12.5px', '13.5px', '15px', '20px', '28px', 'inherit']);
const RAIOS = new Set(['var(--r-card)', 'var(--r-ctl)', 'calc(var(--r-card) - 1px)', '50%', '999px', '0', 'inherit']);

/** separa "0 0 calc(var(--r-card) - 1px) calc(...)" respeitando parênteses */
function tokensRaio(v: string): string[] {
  const out: string[] = [];
  let atual = '';
  let prof = 0;
  for (const ch of v) {
    if (ch === '(') prof++;
    if (ch === ')') prof--;
    if (ch === ' ' && prof === 0) { if (atual) out.push(atual); atual = ''; continue; }
    atual += ch;
  }
  if (atual) out.push(atual);
  return out;
}

describe('escala visual — Etapa Planilha (cpl-) e Sincronização (psy-)', () => {
  const todas = regras();

  it('lê regras dos dois arquivos', () => {
    expect(todas.filter((r) => r.arquivo === 'sync-painel.css').length).toBeGreaterThan(20);
    expect(todas.filter((r) => r.arquivo === 'etapa-planilha.css').length).toBeGreaterThan(40);
  });

  it('1. só os 6 tamanhos de fonte da escala (11 · 12.5 · 13.5 · 15 · 20 · 28)', () => {
    const fora: string[] = [];
    for (const r of todas) {
      for (const [p, v] of r.decls) {
        if (p === 'font-size' && !FONTES.has(v.replace(/\s*!important$/, ''))) fora.push(`${r.arquivo}: ${r.seletor} → ${v}`);
        if (p === 'font' && v !== 'inherit') fora.push(`${r.arquivo}: ${r.seletor} → font: ${v} (use font: inherit + font-size da escala)`);
      }
    }
    expect(fora, `font-size fora da escala:\n${fora.join('\n')}`).toEqual([]);
  });

  it('2. só os raios da casa (--r-card, --r-ctl, 50%, 999px; calc(--r-card - 1px) no rodapé)', () => {
    const fora: string[] = [];
    for (const r of todas) {
      for (const [p, v] of r.decls) {
        if (!/^border(-(top|bottom)-(left|right))?-radius$/.test(p)) continue;
        for (const t of tokensRaio(v)) if (!RAIOS.has(t)) fora.push(`${r.arquivo}: ${r.seletor} → ${p}: ${v}`);
      }
    }
    expect(fora, `raio fora da escala:\n${fora.join('\n')}`).toEqual([]);
  });

  it('3. âmbar só em risco real (nunca no passo atual, confirmação, prévia, estado ok ou fatos)', () => {
    const PROIBIDOS = ['.cpl-marca', '.cpl-confirma', '.cpl-previa', '.psy-estado-ok', '.psy-res-ok', '.psy-fato'];
    const fora: string[] = [];
    for (const r of todas) {
      const sels = r.seletor.split(',').map((s) => s.trim());
      for (const sel of sels) {
        const alvo = PROIBIDOS.find((c) => new RegExp(`${c.replace('.', '\\.')}(?![\\w-])`).test(sel));
        if (!alvo) continue;
        for (const [p, v] of r.decls) if (/--ambar/.test(v)) fora.push(`${r.arquivo}: ${sel} → ${p}: ${v}`);
      }
    }
    expect(fora, `âmbar fora de risco real:\n${fora.join('\n')}`).toEqual([]);
  });

  it('4. --txt-3 só em placeholder, separador, chevron ou desabilitado (no claro dá ~3,1:1)', () => {
    const PERMITIDOS = ['placeholder', '-sep', '-seta', ':disabled', '-dec'];
    const fora: string[] = [];
    for (const r of todas) {
      if (!r.decls.some(([p, v]) => p === 'color' && /var\(--txt-3\)/.test(v))) continue;
      if (!r.seletor.split(',').every((s) => PERMITIDOS.some((x) => s.includes(x)))) fora.push(`${r.arquivo}: ${r.seletor}`);
    }
    expect(fora, `--txt-3 em texto informativo:\n${fora.join('\n')}`).toEqual([]);
  });

  it('5. --X-bg só em tile/marcador: bloco nunca se preenche com a cor (virava vinho/marrom no escuro)', () => {
    const fora: string[] = [];
    for (const r of todas) {
      for (const [p, v] of r.decls) {
        if (/^background(-color)?$/.test(p) && /var\(--(verde|ambar|rubro)-bg\)/.test(v) && !/tile|marca/.test(r.seletor)) {
          fora.push(`${r.arquivo}: ${r.seletor} → ${p}: ${v}`);
        }
      }
    }
    expect(fora, `bloco preenchido com --X-bg (use borda + tile):\n${fora.join('\n')}`).toEqual([]);
  });
});
