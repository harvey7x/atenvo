/* ==========================================================================
   Paginação por CURSOR (keyset) — contorna o db-max-rows=1000 do PostgREST.
   GOTCHA (18/09): queries .from(x).select() SEM range/limit são truncadas em
   1000 linhas SEM ERRO. Com >1000 linhas, listas perdem itens em silêncio
   (clientes "sumiam" do inbox/Kanban/Contatos). Ver memória inbox-teto-1000.

   Por que KEYSET e não OFFSET (.range()):
   - .range() sobre coluna MUTÁVEL (ultima_interacao_em / atualizado_em) é
     instável entre fetches sequenciais: uma linha que muda de posição durante
     a busca multi-página PULA ou DUPLICA na fronteira — reintroduz o bug.
   - OFFSET profundo reexecuta o sort do conjunto inteiro e descarta N linhas:
     custo cresce por página. Keyset (WHERE id < cursor) tem custo CONSTANTE
     com o índice do id.
   Regra de uso: pagine SEMPRE por uma coluna ÚNICA e IMUTÁVEL (o `id`/PK). Se a
   lista precisa de outra ORDEM de exibição, ordene o array em JS DEPOIS — a
   paginação por id só garante que nada seja pulado/duplicado.
   ========================================================================== */

type RespostaPagina<T> = { data: T[] | null; error: { message?: string } | null };

interface OpcoesKeyset {
  /** Linhas por página. Deve ser <= db-max-rows (1000). */
  tamanho?: number;
  /** Teto de páginas: trava de segurança contra fetch infinito à medida que a base cresce. */
  teto?: number;
  /** Best-effort: em erro numa página, devolve o que já acumulou em vez de lançar
   *  (para satélites onde a lista deve seguir viva mesmo sem o dado — ex.: selo de IA). */
  melhorEsforco?: boolean;
  /** Rótulo p/ o aviso de teto atingido (debug). */
  rotulo?: string;
}

/**
 * Busca TODAS as linhas de uma consulta paginando por cursor.
 * @param buscarPagina constrói e dispara UMA página: recebe o cursor (id da última
 *        linha da página anterior, ou null na 1ª) e o tamanho; deve aplicar
 *        `.order(<coluna cursor>, desc).limit(tamanho)` e, se cursor != null,
 *        `.lt(<coluna cursor>, cursor)`.
 * @param cursorDe extrai o valor do cursor de uma linha (o menor id da página, na ordem desc).
 */
export async function buscarKeyset<T>(
  buscarPagina: (cursor: string | null, tamanho: number) => PromiseLike<RespostaPagina<T>>,
  cursorDe: (linha: T) => string,
  opts: OpcoesKeyset = {},
): Promise<T[]> {
  const tamanho = opts.tamanho ?? 1000;
  const teto = opts.teto ?? 30;
  const acc: T[] = [];
  let cursor: string | null = null;
  for (let p = 0; p < teto; p++) {
    const { data, error } = await buscarPagina(cursor, tamanho);
    if (error) {
      if (opts.melhorEsforco) return acc;   // satélite: segue com o que tem
      throw new Error(error.message ?? 'Falha ao carregar a lista.');
    }
    const bloco = data ?? [];
    for (const linha of bloco) acc.push(linha);
    if (bloco.length < tamanho) return acc;   // última página
    cursor = cursorDe(bloco[bloco.length - 1]);
    if (!cursor) return acc;                   // sem cursor válido: não dá pra avançar com segurança
  }
  console.warn(`[paginacao] teto de ${teto} páginas atingido${opts.rotulo ? ' (' + opts.rotulo + ')' : ''} — lista possivelmente truncada`);
  return acc;
}
