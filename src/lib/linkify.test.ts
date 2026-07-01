import { describe, it, expect } from 'vitest';
import { linkTokens, hrefSeguro } from './linkify';

const links = (t: string) => linkTokens(t).filter((x) => x.t === 'link') as Array<{ t: 'link'; s: string; href: string }>;

describe('linkTokens', () => {
  it('1) URL isolada', () => {
    const l = links('https://exemplo.com.br/teste');
    expect(l).toHaveLength(1);
    expect(l[0].href).toBe('https://exemplo.com.br/teste');
  });
  it('2) texto antes e depois', () => {
    const t = linkTokens('Acesse https://a.com agora');
    expect(t[0]).toEqual({ t: 'text', s: 'Acesse ' });
    expect(t.find((x) => x.t === 'link')!.s).toBe('https://a.com');
    expect(t[t.length - 1]).toEqual({ t: 'text', s: ' agora' });
  });
  it('3) duas URLs', () => {
    expect(links('veja https://a.com e http://b.org/x')).toHaveLength(2);
  });
  it('4) query string + hash + encoded preservados', () => {
    expect(links('https://x.com/p?a=1&b=2#sec%20ao')[0].s).toBe('https://x.com/p?a=1&b=2#sec%20ao');
  });
  it('5) ponto final da frase NÃO entra na URL', () => {
    const t = linkTokens('Acesse https://exemplo.com.br/teste.');
    const l = links('Acesse https://exemplo.com.br/teste.');
    expect(l[0].s).toBe('https://exemplo.com.br/teste');
    expect(t[t.length - 1]).toEqual({ t: 'text', s: '.' });
  });
  it('5b) vírgula/ponto-e-vírgula/aspas/parêntese final removidos', () => {
    expect(links('vai (https://a.com),')[0].s).toBe('https://a.com');
    expect(links('"https://a.com";')[0].s).toBe('https://a.com');
  });
  it('5c) parêntese balanceado dentro da URL é mantido', () => {
    expect(links('https://pt.wikipedia.org/wiki/Teste_(desambiguacao)')[0].s)
      .toBe('https://pt.wikipedia.org/wiki/Teste_(desambiguacao)');
  });
  it('6) www. sem protocolo → href https, texto original', () => {
    const l = links('www.exemplo.com');
    expect(l[0].s).toBe('www.exemplo.com');
    expect(l[0].href).toBe('https://www.exemplo.com');
  });
  it('13) javascript: NÃO vira link', () => {
    expect(links('javascript:alert(1)')).toHaveLength(0);
    expect(hrefSeguro('javascript:alert(1)')).toBeNull();
  });
  it('13b) data:/file: não viram link', () => {
    expect(links('data:text/html,<b>x</b>')).toHaveLength(0);
    expect(links('file:///etc/passwd')).toHaveLength(0);
  });
  it('14) texto comum não vira link', () => {
    expect(links('apenas um texto sem url')).toHaveLength(0);
  });
  it('15) CPF/números não viram link', () => {
    expect(links('CPF 123.456.789-00 e telefone 5551999998888')).toHaveLength(0);
    expect(links('exemplo.com sem www nem protocolo')).toHaveLength(0); // domínio nu não é link
  });
});
