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

/* ---- Cancelamento (AbortSignal do react-query) ----
   O react-query cancela a carga em andamento a cada invalidate/refetch (cancelRefetch=true é o
   padrão do v5) e DESCARTA o resultado — mas sem o signal o laço abaixo seguia pedindo as páginas
   restantes ao banco (trabalho em dobro na consulta nº1 do sistema). Atenção: o postgrest-js NÃO
   lança no aborto, devolve `{ error: { message: 'AbortError: …' } }` — por isso o laço confere o
   signal DEPOIS de cada página também, e o aborto vence o `melhorEsforco` (um satélite abortado
   NUNCA pode virar "mapa vazio aplicado"). */
export function erroAbortado(): Error {
  const e = new Error('Carga cancelada.');
  e.name = 'AbortError';
  return e;
}
export function ehAbortado(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: string }).name === 'AbortError';
}
export function lancarSeAbortado(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw erroAbortado();
}

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
  /** Cancelamento: abortado => lança AbortError antes/depois de cada página (vence o melhorEsforco). */
  signal?: AbortSignal | null;
}

/**
 * Busca TODAS as linhas de uma consulta paginando por cursor.
 * @param buscarPagina constrói e dispara UMA página: recebe o cursor (id da última
 *        linha da página anterior, ou null na 1ª) e o tamanho; deve aplicar
 *        `.order(<coluna cursor>, desc).limit(tamanho)` e, se cursor != null,
 *        `.lt(<coluna cursor>, cursor)`.
 *        Recebe também o `signal` (opts.signal) para repassar a `.abortSignal(signal)`.
 * @param cursorDe extrai o valor do cursor de uma linha (o menor id da página, na ordem desc).
 */
export async function buscarKeyset<T>(
  buscarPagina: (cursor: string | null, tamanho: number, signal?: AbortSignal | null) => PromiseLike<RespostaPagina<T>>,
  cursorDe: (linha: T) => string,
  opts: OpcoesKeyset = {},
): Promise<T[]> {
  const tamanho = opts.tamanho ?? 1000;
  const teto = opts.teto ?? 100;   // 100k linhas: folga enorme; é só a trava anti-fetch-infinito
  const acc: T[] = [];
  let cursor: string | null = null;
  for (let p = 0; p < teto; p++) {
    lancarSeAbortado(opts.signal);
    const { data, error } = await buscarPagina(cursor, tamanho, opts.signal);
    lancarSeAbortado(opts.signal);            // aborto chega como `error` do postgrest: não é "falha de página"
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
  // Teto atingido: NÃO devolver parcial em silêncio — numa agregação financeira isso viraria
  // subcontagem sem aviso (revisão 18/09). Satélite (melhorEsforco) degrada; o resto FALHA ALTO
  // (o react-query mantém o último dado bom em vez de mostrar número menor que o real).
  const rotulo = opts.rotulo ? ' (' + opts.rotulo + ')' : '';
  console.warn(`[paginacao] teto de ${teto} páginas atingido${rotulo}`);
  if (opts.melhorEsforco) return acc;
  throw new Error(`Lista grande demais para carregar de uma vez${rotulo}. Avise o suporte.`);
}

/* ---- Faixas de id em PARALELO (Kanban, 30/10) ----
   buscarKeyset é SEQUENCIAL: o funil passou de 7,8 mil oportunidades = 8 páginas de 1000, ~1 s cada,
   uma depois da outra (~10 s de tela vazia ao abrir o Kanban). Com id uuid ALEATÓRIO
   (gen_random_uuid) as linhas se espalham por igual no espaço de ids; fatiando esse espaço pelo
   1º dígito hex, cada faixa pagina por keyset sozinha (mesma garantia: nada pula nem duplica, as
   faixas não se cruzam) e várias correm ao mesmo tempo. `simultaneas` limita quantas vão ao banco
   de uma vez. Só serve para id uuid v4 — id sequencial cairia todo numa faixa só. */
export interface FaixaId { /** id >= de (null = sem piso) */ de: string | null; /** id < ate (null = sem teto) */ ate: string | null }

/** O espaço de uuid em `qtd` faixas pelo 1º dígito hex (qtd ∈ 1, 2, 4, 8, 16). */
export function faixasUuid(qtd: 1 | 2 | 4 | 8 | 16 = 16): FaixaId[] {
  const passo = 16 / qtd;
  const limite = (d: number) => (d >= 16 ? null : d.toString(16) + '0000000-0000-0000-0000-000000000000');
  return Array.from({ length: qtd }, (_, i) => ({ de: i === 0 ? null : limite(i * passo), ate: limite((i + 1) * passo) }));
}

interface OpcoesFaixas extends OpcoesKeyset {
  faixas?: FaixaId[];
  /** Quantas faixas pedem ao banco ao mesmo tempo (padrão 6). */
  simultaneas?: number;
  /** A cada faixa concluída: quantas já vieram, de quantas, e quantas linhas no total até agora. */
  aoAvancar?: (feitas: number, total: number, linhas: number) => void;
}

/**
 * Como buscarKeyset, mas fatiando o id em faixas que correm em paralelo.
 * @param buscarPagina igual ao do buscarKeyset, mais a faixa: deve aplicar `.gte(id, faixa.de)` e
 *        `.lt(id, faixa.ate)` quando não forem null.
 * O resultado vem na ordem das faixas (id desc dentro de cada uma); reordene em JS se precisar.
 */
export async function buscarKeysetEmFaixas<T>(
  buscarPagina: (faixa: FaixaId, cursor: string | null, tamanho: number, signal?: AbortSignal | null) => PromiseLike<RespostaPagina<T>>,
  cursorDe: (linha: T) => string,
  opts: OpcoesFaixas = {},
): Promise<T[]> {
  const faixas = opts.faixas ?? faixasUuid(16);
  const partes: T[][] = new Array(faixas.length);
  let proxima = 0, feitas = 0, linhas = 0, parar = false;
  const trabalhador = async () => {
    while (!parar && proxima < faixas.length) {
      const i = proxima++;
      try {
        partes[i] = await buscarKeyset((c, t, s) => buscarPagina(faixas[i], c, t, s), cursorDe, opts);
      } catch (e) {
        parar = true;   // uma faixa falhou: as outras não começam faixas novas (a carga inteira já falhou)
        throw e;
      }
      feitas++; linhas += partes[i].length;
      opts.aoAvancar?.(feitas, faixas.length, linhas);
    }
  };
  const n = Math.max(1, Math.min(opts.simultaneas ?? 6, faixas.length));
  await Promise.all(Array.from({ length: n }, trabalhador));
  return partes.flat();
}
