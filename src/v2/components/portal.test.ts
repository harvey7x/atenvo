// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CLASSE_RAIZ_PORTAL, criarRaizPortalV2 } from './portal';

/* Guarda da regra 10 do contrato: os tokens Platina vivem em `.v2`; um portal
   montado fora dessa raiz renderiza sem tokens (e herdando o tema claro v1). */
describe('portal v2 (regra 10)', () => {
  it('o nó raiz do portal SEMPRE carrega a classe v2', () => {
    expect(CLASSE_RAIZ_PORTAL.split(' ')).toContain('v2');
  });

  it('criarRaizPortalV2 cria, classifica e anexa ao body', () => {
    const anexados: unknown[] = [];
    const doc = {
      createElement: () => ({ className: '' }),
      body: { appendChild: (el: unknown) => { anexados.push(el); return el; } },
    };
    const el = criarRaizPortalV2(doc);
    expect(el.className.split(' ')).toContain('v2');
    expect(anexados).toEqual([el]);
  });

  it('todo createPortal do v2 (modal, drawer, futuros) usa a fábrica da raiz', () => {
    // varredura em runtime: um portal montado fora da raiz .v2 renderia sem tokens
    const raiz = join(__dirname, '..');
    const tsx: string[] = [];
    (function anda(dir: string) {
      for (const nome of readdirSync(dir)) {
        const p = join(dir, nome);
        if (statSync(p).isDirectory()) anda(p);
        else if (nome.endsWith('.tsx')) tsx.push(p);
      }
    })(raiz);
    const infratores = tsx.filter((f) => {
      const s = readFileSync(f, 'utf8');
      return s.includes('createPortal(') && !s.includes('criarRaizPortalV2');
    });
    expect(infratores, `Arquivos com createPortal sem criarRaizPortalV2 (regra 10):\n${infratores.join('\n')}`).toEqual([]);
  });
});
