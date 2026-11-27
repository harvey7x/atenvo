import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   PRODUTOS E SERVIÇOS + FINANCEIRO DO CLIENTE (26/11, "igual" ao sistema que a Reviza usava antes: o catálogo com o valor
   de cada item, o "novo lançamento" no painel do cliente e o Dashboard › Financeiro).
   Lançamento = produto (opcional) × quantidade × valor unitário, do tipo "receita" ou "cobrança" (a cobrança fica fora
   da receita), numa data. O servidor liga sozinho ao card do cliente (para o "por responsável").
   Servidor: migration 112 (recurso 'financeiro'). DEMO É O CONTRATO: sem backend, os mesmos hooks no navegador.
   ------------------------------------------------------------------ */

export const FIN_REAL: boolean = isSupabaseConfigured && !!supabase;

export interface Produto { id: string; nome: string; descricao: string | null; valor: number; ativo: boolean }
export type TipoLanc = 'receita' | 'cobranca';
export interface Lancamento {
  id: string; contatoId: string; produtoId: string | null; descricao: string; quantidade: number; valorUnitario: number; valorTotal: number;
  tipo: TipoLanc; data: string; observacao: string | null; criadoPor: string | null; criadoEm: string;
}
export interface ResumoFinanceiro {
  dias: number; receita: number; clientesReceita: number; lancamentos: number; cobrancas: number; clientesCobranca: number; ticketMedio: number; catalogo: number;
  porResponsavel: { nome: string; valor: number; qtd: number }[];
  porProduto: { nome: string; valor: number; qtd: number }[];
  topClientes: { contatoId: string; contato: string; valor: number; responsavel: string; conversaId: string | null }[];
  porMes: { mes: string; valor: number }[];
}

export const brl = (v: number) => (Number.isFinite(v) ? v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
/** "1.300,50" ou "1300.5" → 1300.5 (aceita o jeito brasileiro) */
export function lerValor(t: string): number | null {
  const s = t.trim().replace(/[R$\s]/g, '');
  if (!s) return null;
  // "1.300,50" (vírgula nos centavos) · "1.300" (ponto de milhar) · "1300.5"
  const x = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s.replace(/,/g, '');
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 && n <= 9_999_999_999 ? Math.round(n * 100) / 100 : null;
}
export const hojeSP = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });

export function validarProduto(p: { nome: string; valor: string }, outros: Produto[], id?: string): string | null {
  const n = p.nome.trim();
  if (!n) return 'Dê um nome ao produto ou serviço.';
  if (n.length > 80) return 'O nome vai até 80 letras.';
  if (outros.some((o) => o.id !== id && o.nome.trim().toLowerCase() === n.toLowerCase())) return 'Já existe um produto com esse nome.';
  if (lerValor(p.valor) == null) return 'Escreva o valor, como 1.300,00.';
  return null;
}
export function validarLancamento(l: { descricao: string; produtoId: string | null; quantidade: string; valor: string; data: string }): string | null {
  if (!l.produtoId && !l.descricao.trim()) return 'Escolha o produto ou escreva o que foi.';
  const q = Number(l.quantidade);
  if (!Number.isInteger(q) || q < 1 || q > 9999) return 'A quantidade vai de 1 a 9999.';
  if (lerValor(l.valor) == null) return 'Escreva o valor, como 1.300,00.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.data)) return 'Escolha a data.';
  return null;
}

/* ---------------- demonstração ---------------- */
const G_P = 'previa-produtos', G_L = 'previa-lancamentos';
const ler = <T,>(k: string, p: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v ?? p; } catch { return p; } };
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* aba privada */ } };
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const diaAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const PRODUTOS_DEMO: Produto[] = [
  { id: 'pd-rev', nome: 'Revisão de juros do empréstimo', descricao: 'Ação revisional do empréstimo pessoal', valor: 1300, ativo: true },
  { id: 'pd-ress', nome: 'Ressarcimento de desconto indevido', descricao: 'Cancelamento do desconto e devolução em dobro', valor: 900, ativo: true },
  { id: 'pd-cons', nome: 'Consulta e análise do extrato', descricao: null, valor: 150, ativo: true },
];
const L = (id: string, contatoId: string, produtoId: string | null, descricao: string, valor: number, dias: number, tipo: TipoLanc = 'receita', q = 1): Lancamento =>
  ({ id, contatoId, produtoId, descricao, quantidade: q, valorUnitario: valor, valorTotal: q * valor, tipo, data: diaAtras(dias), observacao: null, criadoPor: null, criadoEm: new Date(Date.now() - dias * 86_400_000).toISOString() });
const LANC_DEMO: Lancamento[] = [
  L('l1', 'wa-maria-ct', 'pd-rev', 'Revisão de juros do empréstimo', 1300, 2),
  L('l2', 'wa-maria-ct', null, 'Honorário da segunda parcela', 650, 0, 'cobranca'),
  L('l3', 'kct-5', 'pd-ress', 'Ressarcimento de desconto indevido', 900, 6),
  L('l4', 'wa-jose-ct', 'pd-rev', 'Revisão de juros do empréstimo', 1300, 11, 'receita', 2),
  L('l5', 'wa-ivone-ct', 'pd-cons', 'Consulta e análise do extrato', 150, 15),
];

const C_P = 'atd-produtos', C_L = 'atd-lancamentos', C_R = 'atd-financeiro';
const deProd = (r: Record<string, unknown>): Produto => ({ id: String(r.id), nome: String(r.nome), descricao: (r.descricao as string) ?? null, valor: Number(r.valor) || 0, ativo: r.ativo !== false });

export function useProdutos(ligado = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_P, currentOrg.id],
    enabled: ligado && !!currentOrg.id,
    staleTime: 60_000,
    queryFn: async (): Promise<Produto[]> => {
      if (!FIN_REAL) { await espera(100); return ler(G_P, PRODUTOS_DEMO); }
      const { data, error } = await supabase!.from('atd_produtos').select('id, nome, descricao, valor, ativo').eq('organizacao_id', currentOrg.id).order('nome');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => deProd(r as Record<string, unknown>));
    },
  });
}

export function useSalvarProduto() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Omit<Produto, 'id'> & { id?: string }) => {
      const linha = { nome: p.nome.trim().replace(/\s+/g, ' '), descricao: p.descricao?.trim() || null, valor: p.valor, ativo: p.ativo };
      if (!FIN_REAL) { await espera(120); const l = ler(G_P, PRODUTOS_DEMO); gravar(G_P, p.id ? l.map((x) => (x.id === p.id ? { ...x, ...linha } : x)) : [...l, { id: `pd-${Date.now()}`, ...linha }]); return; }
      const { error } = p.id ? await supabase!.from('atd_produtos').update(linha).eq('id', p.id) : await supabase!.from('atd_produtos').insert({ ...linha, organizacao_id: currentOrg.id });
      if (error) throw new Error(/atd_produtos_nome_uniq|duplicate/i.test(error.message) ? 'Já existe um produto com esse nome.' : error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C_P] }); qc.invalidateQueries({ queryKey: [C_R] }); },
  });
}

export function useApagarProduto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!FIN_REAL) { gravar(G_P, ler(G_P, PRODUTOS_DEMO).filter((x) => x.id !== id)); return; }
      const { error } = await supabase!.from('atd_produtos').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C_P] }); qc.invalidateQueries({ queryKey: [C_L] }); qc.invalidateQueries({ queryKey: [C_R] }); },
  });
}

/** quantas vezes cada produto foi lançado (a tela de Produtos avisa antes de apagar) */
export function useUsoDosProdutos(ids: string[]) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_L, currentOrg.id, 'uso', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, { qtd: number; valor: number }>> => {
      const out: Record<string, { qtd: number; valor: number }> = {};
      if (!FIN_REAL) { for (const l of ler(G_L, LANC_DEMO)) if (l.produtoId && l.tipo === 'receita') { const o = (out[l.produtoId] ??= { qtd: 0, valor: 0 }); o.qtd += l.quantidade; o.valor += l.valorTotal; } return out; }
      for (const id of ids) {
        const { data, error } = await supabase!.from('atd_lancamentos').select('quantidade, valor_total').eq('produto_id', id).eq('tipo', 'receita').limit(1000);
        if (error) throw new Error(error.message);
        out[id] = (data ?? []).reduce((a, r) => ({ qtd: a.qtd + (Number(r.quantidade) || 0), valor: a.valor + (Number(r.valor_total) || 0) }), { qtd: 0, valor: 0 });
      }
      return out;
    },
  });
}

export function useLancamentosDoContato(contatoId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_L, currentOrg.id, 'contato', contatoId],
    enabled: !!contatoId,
    queryFn: async (): Promise<Lancamento[]> => {
      if (!FIN_REAL) { await espera(100); return ler(G_L, LANC_DEMO).filter((l) => l.contatoId === contatoId).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm)); }
      const { data, error } = await supabase!.from('atd_lancamentos')
        .select('id, contato_id, produto_id, descricao, quantidade, valor_unitario, valor_total, tipo, data, observacao, criado_por, criado_em')
        .eq('contato_id', contatoId!).order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        id: String(r.id), contatoId: String(r.contato_id), produtoId: (r.produto_id as string) ?? null, descricao: String(r.descricao), quantidade: Number(r.quantidade) || 1,
        valorUnitario: Number(r.valor_unitario) || 0, valorTotal: Number(r.valor_total) || 0, tipo: r.tipo === 'cobranca' ? 'cobranca' : 'receita', data: String(r.data),
        observacao: (r.observacao as string) ?? null, criadoPor: (r.criado_por as string) ?? null, criadoEm: String(r.criado_em),
      }));
    },
  });
}

export function useNovoLancamento() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (l: { contatoId: string; produtoId: string | null; descricao: string; quantidade: number; valorUnitario: number; tipo: TipoLanc; data: string; observacao?: string }) => {
      if (!FIN_REAL) {
        await espera(120);
        const p = ler(G_P, PRODUTOS_DEMO).find((x) => x.id === l.produtoId);
        gravar(G_L, [{ id: `l-${Date.now()}`, contatoId: l.contatoId, produtoId: l.produtoId, descricao: l.descricao.trim() || p?.nome || 'Lançamento', quantidade: l.quantidade, valorUnitario: l.valorUnitario, valorTotal: l.quantidade * l.valorUnitario, tipo: l.tipo, data: l.data, observacao: l.observacao?.trim() || null, criadoPor: 'eu', criadoEm: new Date().toISOString() }, ...ler(G_L, LANC_DEMO)]);
        return;
      }
      const { error } = await supabase!.from('atd_lancamentos').insert({
        organizacao_id: currentOrg.id, contato_id: l.contatoId, produto_id: l.produtoId, descricao: l.descricao.trim(), quantidade: l.quantidade,
        valor_unitario: l.valorUnitario, tipo: l.tipo, data: l.data, observacao: l.observacao?.trim() || null,
      });
      if (error) throw new Error(/row-level|permission/i.test(error.message) ? 'Você não pode lançar para este cliente.' : error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C_L] }); qc.invalidateQueries({ queryKey: [C_R] }); },
  });
}

export function useApagarLancamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!FIN_REAL) { gravar(G_L, ler(G_L, LANC_DEMO).filter((x) => x.id !== id)); return; }
      const { error, count } = await supabase!.from('atd_lancamentos').delete({ count: 'exact' }).eq('id', id);
      if (error) throw new Error(error.message);
      if (count === 0) throw new Error('Só quem lançou, o administrador ou o supervisor apaga este lançamento.');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C_L] }); qc.invalidateQueries({ queryKey: [C_R] }); },
  });
}

export function useResumoFinanceiro(dias: number, responsavelId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_R, currentOrg.id, dias, responsavelId],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<ResumoFinanceiro> => {
      if (!FIN_REAL) {
        await espera(150);
        const desde = diaAtras(dias - 1);
        const l = ler(G_L, LANC_DEMO).filter((x) => x.data >= desde);
        const r = l.filter((x) => x.tipo === 'receita');
        const prods = ler(G_P, PRODUTOS_DEMO);
        const soma = (xs: Lancamento[]) => xs.reduce((s, x) => s + x.valorTotal, 0);
        const resp: Record<string, string> = { 'wa-maria-ct': 'Juliana', 'kct-5': 'Juliana', 'wa-jose-ct': 'Matheo', 'wa-ivone-ct': 'Eduardo' };
        const nomeCli: Record<string, string> = { 'wa-maria-ct': 'Maria Aparecida Souza', 'kct-5': 'Antônio Pereira Lima', 'wa-jose-ct': 'José Carlos Ferreira', 'wa-ivone-ct': 'Ivone Castro dos Santos' };
        const agrupa = <K extends string>(xs: Lancamento[], k: (x: Lancamento) => K) => Object.entries(xs.reduce<Record<string, Lancamento[]>>((m, x) => { (m[k(x)] ??= []).push(x); return m; }, {}));
        const rr = responsavelId ? r.filter((x) => resp[x.contatoId] === responsavelId) : r;
        const clientes = new Set(rr.map((x) => x.contatoId)).size;
        return {
          dias, receita: soma(rr), clientesReceita: clientes, lancamentos: rr.length, cobrancas: soma(l.filter((x) => x.tipo === 'cobranca')), clientesCobranca: new Set(l.filter((x) => x.tipo === 'cobranca').map((x) => x.contatoId)).size,
          ticketMedio: clientes ? Math.round((soma(rr) / clientes) * 100) / 100 : 0, catalogo: prods.filter((p) => p.ativo).length,
          porResponsavel: agrupa(rr, (x) => resp[x.contatoId] ?? 'Sem responsável').map(([nome, xs]) => ({ nome, valor: soma(xs), qtd: new Set(xs.map((x) => x.contatoId)).size })).sort((a, b) => b.valor - a.valor),
          porProduto: agrupa(rr, (x) => prods.find((p) => p.id === x.produtoId)?.nome ?? x.descricao).map(([nome, xs]) => ({ nome, valor: soma(xs), qtd: xs.reduce((s, x) => s + x.quantidade, 0) })).sort((a, b) => b.valor - a.valor),
          topClientes: agrupa(rr, (x) => x.contatoId).map(([id, xs]) => ({ contatoId: id, contato: nomeCli[id] ?? 'Cliente', valor: soma(xs), responsavel: resp[id] ?? 'Sem responsável', conversaId: id.replace(/-ct$/, '').replace(/^kct-5$/, 'wa-antonio') })).sort((a, b) => b.valor - a.valor),
          porMes: agrupa(rr, (x) => x.data.slice(0, 7)).map(([mes, xs]) => ({ mes, valor: soma(xs) })).sort((a, b) => a.mes.localeCompare(b.mes)),
        };
      }
      const { data, error } = await supabase!.rpc('atd_financeiro_resumo', { p_dias: dias, p_responsavel: responsavelId });
      if (error) throw new Error(/sem_permissao/.test(error.message) ? 'Só o administrador vê o financeiro.' : error.message);
      const j = (data ?? {}) as Record<string, unknown>;
      const arr = (v: unknown) => (Array.isArray(v) ? v as Record<string, unknown>[] : []);
      return {
        dias: Number(j.dias) || dias, receita: Number(j.receita) || 0, clientesReceita: Number(j.clientes_receita) || 0, lancamentos: Number(j.lancamentos) || 0,
        cobrancas: Number(j.cobrancas) || 0, clientesCobranca: Number(j.clientes_cobranca) || 0, ticketMedio: Number(j.ticket_medio) || 0, catalogo: Number(j.catalogo) || 0,
        porResponsavel: arr(j.por_responsavel).map((x) => ({ nome: String(x.nome), valor: Number(x.valor) || 0, qtd: Number(x.qtd) || 0 })),
        porProduto: arr(j.por_produto).map((x) => ({ nome: String(x.nome), valor: Number(x.valor) || 0, qtd: Number(x.qtd) || 0 })),
        topClientes: arr(j.top_clientes).map((x) => ({ contatoId: String(x.contato_id), contato: String(x.contato), valor: Number(x.valor) || 0, responsavel: String(x.responsavel ?? ''), conversaId: (x.conversa_id as string) ?? null })),
        porMes: arr(j.por_mes).map((x) => ({ mes: String(x.mes), valor: Number(x.valor) || 0 })),
      };
    },
  });
}
