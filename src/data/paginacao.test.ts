import { describe, expect, it, vi } from 'vitest';
import { buscarKeyset, buscarKeysetEmFaixas, ehAbortado, faixasUuid, type FaixaId } from './paginacao';

/* Aborto real do keyset: carga cancelada pelo react-query (cancelRefetch) para de pedir
   páginas ao banco e REJEITA com AbortError — nunca devolve parcial como se fosse completa. */

const pagina = (n: number, inicio: number) => Array.from({ length: n }, (_, i) => ({ id: String(100000 - inicio - i) }));

describe('buscarKeyset + AbortSignal', () => {
  it('abortado depois da página 1: não pede a página 2 e rejeita com AbortError', async () => {
    const ctl = new AbortController();
    const buscar = vi.fn(async (cursor: string | null) => {
      if (cursor === null) { ctl.abort(); return { data: pagina(2, 0), error: null }; }
      return { data: pagina(1, 2), error: null };
    });
    const p = buscarKeyset(buscar, (r) => r.id, { tamanho: 2, signal: ctl.signal });
    await expect(p).rejects.toSatisfy(ehAbortado);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it('já abortado: nenhuma página é pedida', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const buscar = vi.fn(async () => ({ data: [], error: null }));
    await expect(buscarKeyset(buscar, (r: { id: string }) => r.id, { signal: ctl.signal })).rejects.toSatisfy(ehAbortado);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('aborto vence o melhorEsforco: o postgrest devolve `error: AbortError…` e mesmo assim REJEITA (satélite nunca vira parcial/vazio)', async () => {
    const ctl = new AbortController();
    const buscar = vi.fn(async () => { ctl.abort(); return { data: null, error: { message: 'AbortError: signal is aborted without reason' } }; });
    await expect(buscarKeyset(buscar, (r: { id: string }) => r.id, { melhorEsforco: true, signal: ctl.signal })).rejects.toSatisfy(ehAbortado);
  });

  it('repassa o signal à página (para o .abortSignal do postgrest) e segue normal sem aborto', async () => {
    const ctl = new AbortController();
    const vistos: (AbortSignal | null | undefined)[] = [];
    const buscar = vi.fn(async (cursor: string | null, _t: number, signal?: AbortSignal | null) => {
      vistos.push(signal);
      return { data: cursor === null ? pagina(2, 0) : pagina(1, 2), error: null };
    });
    const linhas = await buscarKeyset(buscar, (r) => r.id, { tamanho: 2, signal: ctl.signal });
    expect(linhas).toHaveLength(3);
    expect(vistos).toEqual([ctl.signal, ctl.signal]);
  });

  it('erro comum de página no satélite continua best-effort (devolve o que tem)', async () => {
    const buscar = vi.fn(async () => ({ data: null, error: { message: 'permission denied' } }));
    await expect(buscarKeyset(buscar, (r: { id: string }) => r.id, { melhorEsforco: true })).resolves.toEqual([]);
  });
});

/* Faixas em paralelo (Kanban 30/10): mesmo conjunto do keyset sequencial, sem pular nem duplicar. */
describe('buscarKeysetEmFaixas', () => {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${hex(4)}-${hex(12)}`;
  const banco = Array.from({ length: 2345 }, () => ({ id: uuid() }));
  // simula o PostgREST: filtra a faixa (gte/lt) e o cursor (lt), id desc, limit
  const pagina = (f: FaixaId, cursor: string | null, tam: number) => {
    const linhas = banco
      .filter((r) => (f.de === null || r.id >= f.de) && (f.ate === null || r.id < f.ate) && (cursor === null || r.id < cursor))
      .sort((a, b) => (a.id < b.id ? 1 : -1))
      .slice(0, tam);
    return Promise.resolve({ data: linhas, error: null });
  };

  it('faixasUuid cobre o espaço inteiro sem buracos', () => {
    const f = faixasUuid(16);
    expect(f).toHaveLength(16);
    expect(f[0].de).toBeNull();
    expect(f[15].ate).toBeNull();
    for (let i = 1; i < 16; i++) expect(f[i].de).toBe(f[i - 1].ate);
    expect(f[10].de).toBe('a0000000-0000-0000-0000-000000000000');
    expect(faixasUuid(4).map((x) => x.de)).toEqual([null, '40000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000']);
  });

  it('traz todas as linhas uma vez só, mesmo com várias páginas por faixa', async () => {
    const r = await buscarKeysetEmFaixas(pagina, (l) => l.id, { tamanho: 50 });
    expect(r).toHaveLength(banco.length);
    expect(new Set(r.map((l) => l.id)).size).toBe(banco.length);
  });

  it('respeita o limite de simultâneas e avisa o progresso', async () => {
    let agora = 0, pico = 0;
    const lenta = async (f: FaixaId, c: string | null, t: number) => {
      agora++; pico = Math.max(pico, agora);
      await new Promise((ok) => setTimeout(ok, 2));
      agora--;
      return pagina(f, c, t);
    };
    const passos: [number, number, number][] = [];
    const r = await buscarKeysetEmFaixas(lenta, (l) => l.id, { simultaneas: 3, aoAvancar: (a, b, c) => passos.push([a, b, c]) });
    expect(pico).toBeLessThanOrEqual(3);
    expect(passos).toHaveLength(16);
    expect(passos[15]).toEqual([16, 16, banco.length]);
    expect(r).toHaveLength(banco.length);
  });

  it('uma faixa com erro: rejeita e as outras não começam faixas novas', async () => {
    const buscar = vi.fn(async (f: FaixaId, c: string | null, t: number) => {
      if (f.de === '20000000-0000-0000-0000-000000000000') return { data: null, error: { message: 'boom' } };
      return pagina(f, c, t);
    });
    await expect(buscarKeysetEmFaixas(buscar, (l) => l.id, { simultaneas: 2 })).rejects.toThrow('boom');
    expect(buscar.mock.calls.length).toBeLessThan(16);
  });
});
