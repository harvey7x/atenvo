// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { problemasCacheAssets, temCacheLongoAssets } from './cacheAssets';

/* Guarda: a regra de cache imutável de /assets/* no public/_headers só vai junto com o
   public/assets/404.html (e nunca com public/404.html). Ver src/lib/cacheAssets.ts. */
const PUBLIC = join(process.cwd(), 'public');

describe('cache imutável de /assets/* (public/_headers)', () => {
  it('o repositório está coerente: regra de cache longo ⇒ public/assets/404.html existe; public/404.html NÃO existe', () => {
    const headers = readFileSync(join(PUBLIC, '_headers'), 'utf8');
    const problemas = problemasCacheAssets({
      headers,
      temAssets404: existsSync(join(PUBLIC, 'assets', '404.html')),
      temRaiz404: existsSync(join(PUBLIC, '404.html')),
    });
    expect(problemas).toEqual([]);
  });
  it('o 404.html de /assets/ é uma página 404 de verdade (não o index do SPA)', () => {
    if (!temCacheLongoAssets(readFileSync(join(PUBLIC, '_headers'), 'utf8'))) return;
    const html = readFileSync(join(PUBLIC, 'assets', '404.html'), 'utf8');
    expect(html).not.toMatch(/<div id="root"|src="\/src\/main/);
  });
  it('detecta a regra pelo bloco /assets/* (immutable ou max-age > 0), ignorando comentários e outros blocos', () => {
    expect(temCacheLongoAssets('/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n')).toBe(true);
    expect(temCacheLongoAssets('/assets/*\n  Cache-Control: public, max-age=600\n')).toBe(true);
    expect(temCacheLongoAssets('/assets/*\n  Cache-Control: no-cache\n')).toBe(false);
    expect(temCacheLongoAssets('/sw.js\n  Cache-Control: max-age=31536000, immutable\n')).toBe(false);
    expect(temCacheLongoAssets('# /assets/*\n#  Cache-Control: immutable\n')).toBe(false);
  });
  it('acusa _headers sem o 404.html e a existência de public/404.html', () => {
    const h = '/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n';
    expect(problemasCacheAssets({ headers: h, temAssets404: false, temRaiz404: false })).toHaveLength(1);
    expect(problemasCacheAssets({ headers: h, temAssets404: true, temRaiz404: true })).toHaveLength(1);
    expect(problemasCacheAssets({ headers: h, temAssets404: true, temRaiz404: false })).toEqual([]);
    expect(problemasCacheAssets({ headers: '/sw.js\n  Cache-Control: no-store\n', temAssets404: false, temRaiz404: false })).toEqual([]);
  });
});
