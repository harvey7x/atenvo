// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* O global.css (e os CSS de página) do app v1 carregam em TODAS as rotas.
   O escopo `.v2` garante que o v2 não vaza para fora — mas o contrário só é
   garantido se NENHUM seletor v1 puder ser satisfeito pelo DOM v2. Um seletor
   v1 "pega" dentro do v2 quando TODAS as classes dele também existem no CSS
   v2 (bugs reais: `.addon .nm` azul do tema claro; `.rel` do Relacionamento
   pintando a célula Quando de branco). Quando este teste falhar: renomeie a
   classe v2 (prefixo `p-` ou nome mais específico).

   IMPORTANTE: a varredura lê o filesystem EM RUNTIME (não import.meta.glob):
   globs expandem no transform e o cache do vitest não invalida quando um
   merge traz CSS v1 novo — foi assim que o `.rel` passou despercebido. */

const RAIZ = join(__dirname, '..');

function csssEm(dir: string): string[] {
  let out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    const st = statSync(p);
    if (st.isDirectory()) out = out.concat(csssEm(p));
    else if (nome.endsWith('.css')) out.push(p);
  }
  return out;
}

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

/* Overrides INTENCIONAIS de componentes v1 reusados inteiros dentro do .v2
   (contrato: não editar arquivos v1). A FichaJudicialBox/Modal (classes `fjb-*`)
   é reusada em /v2/whatsapp e /v2/kanban; o CSS v1 pinta fundo claro/verde-cru,
   então componentes.css re-declara `.v2 .fjb-*` na pele Platina (specificity
   0,2,0 vence o 0,1,0 do v1). Isso torna os seletores v1 `.fjb-*` "satisfazíveis"
   — de propósito e sob controle. Excluí-los do conjunto v2 evita falso-positivo
   sem cegar o guard para colisões acidentais (fjb-* é exclusivo desse componente). */
const OVERRIDE_V1_REUSADO = (c: string) => c.startsWith('fjb-');

describe('colisões de CSS v1 × v2', () => {
  it('nenhum seletor do app antigo pode ser satisfeito pelo DOM v2', () => {
    const v2cls = new Set<string>();
    for (const f of csssEm(join(RAIZ, 'v2'))) {
      for (const lista of classesDeSeletores(readFileSync(f, 'utf8'))) lista.forEach((c) => v2cls.add(c));
    }
    v2cls.delete('v2');
    for (const c of [...v2cls]) if (OVERRIDE_V1_REUSADO(c)) v2cls.delete(c);

    const v1files = [
      ...csssEm(join(RAIZ, 'styles')),
      ...csssEm(join(RAIZ, 'pages')),
      ...csssEm(join(RAIZ, 'components')),
    ];
    const riscos: string[] = [];
    for (const f of v1files) {
      for (const lista of classesDeSeletores(readFileSync(f, 'utf8'))) {
        if (lista.every((c) => v2cls.has(c))) {
          riscos.push(`${f.replace(RAIZ, 'src')}: .${lista.join(' .')}`);
        }
      }
    }
    expect(riscos, `Seletores v1 que pegam dentro do .v2 — renomeie a classe v2:\n${riscos.join('\n')}`).toEqual([]);
  });
});
