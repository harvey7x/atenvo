/* Registros (auditoria) — só admin. Tudo o que cada pessoa fez, alimentado pelos
   gatilhos do banco (public.registros, RLS select admin). Demo: seed de exemplo.
   A lista é PAGINADA (500 por vez, cursor) e os totais vêm de count no servidor —
   a tela nunca afirma um total contando o array carregado. */
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { isRevizaMode, supabase } from '@/lib/supabase';

export interface Mudanca { c: string; de: string | null; para: string | null }
export interface Registro {
  id: number; quando: string; ator_id: string | null; ator_nome: string; ator_papel: string | null;
  acao: string; entidade: string; entidade_id: string | null; rotulo: string | null; detalhe: string | null;
  mudancas: Mudanca[];
}

const hAtras = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const DEMO: Registro[] = [
  { id: 6, quando: hAtras(0.3), ator_id: null, ator_nome: 'Eduardo', ator_papel: 'comercial', acao: 'lançou', entidade: 'pagamento', entidade_id: null, rotulo: 'Maria Aparecida Souza', detalhe: 'informou pagamento de R$ 65,00 (ago/26)', mudancas: [] },
  { id: 5, quando: hAtras(1.2), ator_id: null, ator_nome: 'Admin', ator_papel: 'financeiro', acao: 'confirmou', entidade: 'pagamento', entidade_id: null, rotulo: 'José Carlos Pereira', detalhe: 'pagamento de R$ 110,00 (ago/26)', mudancas: [] },
  { id: 4, quando: hAtras(3), ator_id: null, ator_nome: 'Eduardo', ator_papel: 'comercial', acao: 'editou', entidade: 'cliente', entidade_id: null, rotulo: 'Antônia Ferreira Lima', detalhe: 'atualizou o cadastro (2 campos)', mudancas: [{ c: 'telefone', de: '5199990001', para: '5199990002' }, { c: 'valor', de: '300', para: '350' }] },
  { id: 3, quando: hAtras(5), ator_id: null, ator_nome: 'Matheus', ator_papel: 'admin', acao: 'alterou', entidade: 'comissão', entidade_id: null, rotulo: 'EDUARDO', detalhe: 'comissão de 50% da mensalidade (antes 40%)', mudancas: [] },
  { id: 2, quando: hAtras(26), ator_id: null, ator_nome: 'Admin', ator_papel: 'financeiro', acao: 'direcionou', entidade: 'cliente', entidade_id: null, rotulo: 'Sebastião R. Nunes', detalhe: 'para o ciclo dia 05', mudancas: [{ c: 'dia', de: null, para: '5' }] },
  { id: 1, quando: hAtras(30), ator_id: null, ator_nome: 'Matheus', ator_papel: 'admin', acao: 'configurou', entidade: 'régua', entidade_id: null, rotulo: null, detalhe: 'ligou a régua automática', mudancas: [] },
];

const PAGINA = 500; // linhas por página — o "Carregar mais" busca a anterior
const COLS = 'id, quando, ator_id, ator_nome, ator_papel, acao, entidade, entidade_id, rotulo, detalhe, mudancas';

export type PeriodoRegistros = 'hoje' | '7d' | '30d' | 'tudo';

/* Meia-noite de HOJE em America/Sao_Paulo como instante UTC — o "hoje" do escritório,
   independente do fuso do navegador (SP é UTC-3 fixo, mas lemos o offset real via Intl). */
function inicioHojeSpIso(): string {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(agora);
  const n = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? '0');
  // relógio de parede de SP lido como se fosse UTC → a diferença pro instante real é o offset do fuso
  const parede = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour') % 24, n('minute'), n('second'));
  const offset = parede - Math.floor(agora.getTime() / 1000) * 1000;
  return new Date(Date.UTC(n('year'), n('month') - 1, n('day')) - offset).toISOString();
}

/** Corte (ISO) do período — null = sem corte ("Tudo"). Vai na CONSULTA (gte), não fatiando o array. */
function corteIso(periodo: PeriodoRegistros): string | null {
  if (periodo === 'hoje') return inicioHojeSpIso();
  if (periodo === '7d') return new Date(Date.now() - 7 * 864e5).toISOString();
  if (periodo === '30d') return new Date(Date.now() - 30 * 864e5).toISOString();
  return null;
}

/** Cursor (quando,id): linhas novas no topo não deslocam as páginas já carregadas (range deslocaria). */
type Cursor = { em: string; id: number } | null;

export function useRegistros(periodo: PeriodoRegistros = 'tudo', habilitado = true) {
  const lista = useInfiniteQuery({
    queryKey: ['reviza', 'registros', 'lista', periodo],
    enabled: habilitado,
    refetchInterval: 20000,
    initialPageParam: null as Cursor,
    getNextPageParam: (ult: Registro[]): Cursor | undefined =>
      (ult.length < PAGINA ? undefined : { em: ult[ult.length - 1].quando, id: ult[ult.length - 1].id }),
    queryFn: async ({ pageParam }: { pageParam: Cursor }): Promise<Registro[]> => {
      const corte = corteIso(periodo);
      // demo: seed local em página única, com o mesmo corte de período
      if (!isRevizaMode || !supabase) return corte ? DEMO.filter((r) => r.quando >= corte) : DEMO;
      let q = supabase.from('registros').select(COLS);
      if (corte) q = q.gte('quando', corte);
      if (pageParam) q = q.or(`quando.lt."${pageParam.em}",and(quando.eq."${pageParam.em}",id.lt.${pageParam.id})`);
      const { data, error } = await q.order('quando', { ascending: false }).order('id', { ascending: false }).limit(PAGINA);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ ...r, mudancas: (r.mudancas ?? []) as Mudanca[] })) as Registro[];
    },
  });

  // KPIs verdadeiros: count no servidor (head), nunca o tamanho do array paginado
  const contagem = useQuery({
    queryKey: ['reviza', 'registros', 'contagem'],
    enabled: habilitado,
    refetchInterval: 20000,
    queryFn: async (): Promise<{ total: number; hoje: number }> => {
      if (!isRevizaMode || !supabase) {
        const corte = inicioHojeSpIso();
        return { total: DEMO.length, hoje: DEMO.filter((r) => r.quando >= corte).length };
      }
      const [t, h] = await Promise.all([
        supabase.from('registros').select('id', { count: 'exact', head: true }),
        supabase.from('registros').select('id', { count: 'exact', head: true }).gte('quando', inicioHojeSpIso()),
      ]);
      if (t.error) throw new Error(t.error.message);
      if (h.error) throw new Error(h.error.message);
      return { total: t.count ?? 0, hoje: h.count ?? 0 };
    },
  });

  const registros = useMemo(() => (lista.data?.pages ?? []).flat(), [lista.data]);
  return {
    /** páginas já carregadas (período aplicado na consulta), da mais recente pra trás */
    registros,
    /** count do servidor (null enquanto não chegou) — é o único total que a tela pode afirmar */
    total: contagem.data?.total ?? null,
    totalHoje: contagem.data?.hoje ?? null,
    haMais: lista.hasNextPage,
    carregandoMais: lista.isFetchingNextPage,
    carregarMais: () => { void lista.fetchNextPage(); },
    isLoading: lista.isLoading,
    isError: lista.isError,
    refetch: () => { void lista.refetch(); void contagem.refetch(); },
  };
}
