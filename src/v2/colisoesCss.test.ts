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
   (contrato: nao editar arquivos v1). Componentes v1 reusados em paginas v2
   (FichaJudicialBox/Modal, prefixos fjb e fj; o Modal.tsx v1 prefixo atv, base de
   MediaComposer + ScriptSequenceModal + FichaJudicialModal) trazem CSS de tema CLARO.
   componentes.css re-declara essas familias na pele Platina (specificity 0,2,0 vence o
   0,1,0 do v1), tornando os seletores v1 "satisfaziveis" de proposito. Excluimos essas
   familias (prefixos exclusivos desses componentes) para evitar falso-positivo sem cegar
   o guard para redeclaracoes acidentais de OUTRAS classes.
   LIMITE do guard: ele pega REDECLARACAO em CSS v2; NAO pega um componente v1 reusado
   cujo CSS v1 estilize o DOM v2 sem oposicao (foi o caso do modal branco) — a defesa
   contra isso e a varredura de TSX (2o teste) + o override. */
const OVERRIDE_V1_REUSADO = (c: string) => c.startsWith('fjb') || c.startsWith('fj-') || c.startsWith('atv-');

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

  /* REFORÇO (reforça o guard após o modal branco): o teste acima só pega REDECLARAÇÃO
     em CSS. Este pega o outro vetor — código TSX v2 que escreve uma classe definida SÓ
     no CSS v1 e SEM override no CSS v2: cairia no tema claro do v1 (o que aconteceu com
     o modal reusado). Se falhar: dê à classe um estilo `.v2 ...` (override) ou troque por
     classe v2. As famílias reusadas (fjb-/fj-/atv-) já têm override em componentes.css,
     então passam naturalmente por estarem no CSS v2. */
  it('nenhuma classe SÓ-do-v1 é usada no TSX v2 sem um estilo v2 correspondente', () => {
    const tsx: string[] = [];
    const varre = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) varre(p);
        else if (nome.endsWith('.tsx')) tsx.push(p);
      }
    };
    varre(join(RAIZ, 'v2'));

    const clsDeCss = (dirs: string[]) => {
      const set = new Set<string>();
      for (const dir of dirs) for (const f of csssEm(dir)) {
        for (const lista of classesDeSeletores(readFileSync(f, 'utf8'))) lista.forEach((c) => set.add(c));
      }
      return set;
    };
    const v2cssCls = clsDeCss([join(RAIZ, 'v2')]);
    // classes v1 que aplicam GLOBALMENTE (seletor de classe ÚNICA, sem ancestral/qualificador):
    // essas pegam o DOM v2 mesmo sem redeclaração. `.wa-app .wa-link` (2 classes) NÃO conta.
    const v1SoloCls = new Set<string>();
    for (const dir of [join(RAIZ, 'styles'), join(RAIZ, 'pages'), join(RAIZ, 'components')]) {
      for (const f of csssEm(dir)) {
        for (const lista of classesDeSeletores(readFileSync(f, 'utf8'))) if (lista.length === 1) v1SoloCls.add(lista[0]);
      }
    }

    const usadasNoTsx = new Set<string>();
    for (const f of tsx) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g)) {
        const bruto = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ');
        for (const tok of bruto.split(/\s+/)) if (/^[a-zA-Z][\w-]*$/.test(tok)) usadasNoTsx.add(tok);
      }
    }
    const vazando = [...usadasNoTsx].filter((c) => v1SoloCls.has(c) && !v2cssCls.has(c) && !OVERRIDE_V1_REUSADO(c));
    expect(vazando, `Classes só-do-v1 (seletor global) usadas no TSX v2 sem estilo .v2 (herdam o tema claro):\n${vazando.join(', ')}`).toEqual([]);
  });
});
