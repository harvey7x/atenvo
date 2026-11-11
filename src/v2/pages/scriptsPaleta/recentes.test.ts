import { describe, expect, it } from 'vitest';
import { MAX_RECENTES, chaveRecentes, gravarRecentes, juntarRecente, lerRecentes } from './recentes';

function armazemMemoria() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}
const quebrado = {
  getItem: () => { throw new Error('SecurityError: acesso negado'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
};

describe('recentes da paleta (localStorage com fallback)', () => {
  it('chave separa por org E por usuário', () => {
    expect(chaveRecentes('org-1', 'u-1')).not.toBe(chaveRecentes('org-1', 'u-2'));
    expect(chaveRecentes('org-1', 'u-1')).not.toBe(chaveRecentes('org-2', 'u-1'));
    expect(chaveRecentes(null, undefined)).toContain('sem-org');
  });
  it('juntarRecente põe no topo, não repete e guarda no máximo 6', () => {
    let l: string[] = [];
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) l = juntarRecente(l, id);
    expect(l).toEqual(['g', 'f', 'e', 'd', 'c', 'b']);
    expect(juntarRecente(l, 'd')).toEqual(['d', 'g', 'f', 'e', 'c', 'b']);
    expect(l.length).toBe(MAX_RECENTES);
  });
  it('juntarRecente com validos descarta scripts apagados (não ocupam vaga)', () => {
    expect(juntarRecente(['x', 'apagado', 'y'], 'z', new Set(['x', 'y', 'z']))).toEqual(['z', 'x', 'y']);
  });
  it('grava e lê do storage', () => {
    const a = armazemMemoria();
    expect(gravarRecentes('k1', ['x', 'y'], a)).toBe(true);
    expect(lerRecentes('k1', a)).toEqual(['x', 'y']);
  });
  it('storage indisponível (lança): leitura vazia, sem quebrar, e a memória segura a sessão', () => {
    expect(lerRecentes('k-quebrado', quebrado)).toEqual([]);
    expect(gravarRecentes('k-quebrado', ['s1'], quebrado)).toBe(false);
    expect(lerRecentes('k-quebrado', quebrado)).toEqual(['s1']);
  });
  it('sem storage algum (null) também funciona', () => {
    expect(gravarRecentes('k-null', ['z'], null)).toBe(false);
    expect(lerRecentes('k-null', null)).toEqual(['z']);
    expect(lerRecentes('k-nunca', null)).toEqual([]);
  });
  it('conteúdo corrompido ou de outro formato é ignorado', () => {
    const a = armazemMemoria();
    a.m.set('k2', '{não é json');
    expect(lerRecentes('k2', a)).toEqual([]);
    a.m.set('k3', JSON.stringify({ a: 1 }));
    expect(lerRecentes('k3', a)).toEqual([]);
    a.m.set('k4', JSON.stringify(['a', 3, '', 'a', 'b', 'c', 'd', 'e', 'f', 'g']));
    expect(lerRecentes('k4', a)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});
