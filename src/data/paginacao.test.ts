import { describe, expect, it, vi } from 'vitest';
import { buscarKeyset, ehAbortado } from './paginacao';

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
