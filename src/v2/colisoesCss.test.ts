// @vitest-environment node
import { describe, expect, it } from 'vitest';

/* O global.css (e os CSS de página) do app v1 carregam em TODAS as rotas.
   O escopo `.v2` garante que o v2 não vaza para fora — mas o contrário só é
   garantido se NENHUM seletor v1 puder ser satisfeito pelo DOM v2. Um seletor
   v1 "pega" dentro do v2 quando TODAS as classes dele também existem no CSS
   v2 (ex.: `.addon .nm` quando o v2 usa .addon e .nm — foi um bug real, com
   texto azul do tema claro vazando para os cards). Quando este teste falhar:
   renomeie a classe v2 com o prefixo `p-` (padrão das 8 originais: p-btn,
   p-app, p-sidebar, p-topbar, p-logo, p-av, p-addon, p-stepper). */

const CSS_V2 = import.meta.glob('./**/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const CSS_V1 = import.meta.glob(
  ['../styles/*.css', '../pages/*.css', '../components/**/*.css'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function classesDeSeletores(css: string): string[][] {
  const semComentario = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]+\{/g, '');
  const grupos = [...semComentario.matchAll(/([^{}]+)\{/g)].map((m) => m[1]);
  const listas: string[][] = [];
  for (const grupo of grupos) {
    for (const sel of grupo.split(',')) {
      const cls = [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
      if (cls.length) listas.push(cls);
    }
  }
  return listas;
}

describe('colisões de CSS v1 × v2', () => {
  it('nenhum seletor do app antigo pode ser satisfeito pelo DOM v2', () => {
    const v2cls = new Set<string>();
    for (const css of Object.values(CSS_V2)) {
      for (const lista of classesDeSeletores(css)) lista.forEach((c) => v2cls.add(c));
    }
    v2cls.delete('v2');

    const riscos: string[] = [];
    for (const [arquivo, css] of Object.entries(CSS_V1)) {
      for (const lista of classesDeSeletores(css)) {
        if (lista.every((c) => v2cls.has(c))) {
          riscos.push(`${arquivo}: .${lista.join(' .')}`);
        }
      }
    }
    expect(riscos, `Seletores v1 que pegam dentro do .v2 — renomeie a classe v2 com prefixo p-:\n${riscos.join('\n')}`).toEqual([]);
  });
});
