// @vitest-environment node
import { describe, expect, it } from 'vitest';
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
});
