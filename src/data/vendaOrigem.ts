import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { temRecurso } from '@/v2/data/config/recursos';

/* ------------------------------------------------------------------
   BOTÃO DE VENDA e ORIGEM DO LEAD (26/11, "igual" ao sistema que a Reviza usava antes).
   Botão de venda: o nome do botão que marca a venda (até 24 letras; vazio = "Contrato fechado"), usado no WhatsApp e no
   Kanban, e o histórico de quem marcou. O envio da venda para a Meta fica DESLIGADO até as Conversões da Meta estarem
   conectadas (o servidor recusa ligar antes).
   Origem do lead: as origens cadastradas (fontes_aquisicao), a origem de cada número de WhatsApp e o resumo de onde
   vieram as conversas novas (anúncio → origem do número → "Indefinida").
   Servidor: migration 111 (recurso 'venda-origem'). DEMO É O CONTRATO: sem backend, os mesmos hooks no navegador.
   ------------------------------------------------------------------ */

export const VENDA_REAL: boolean = isSupabaseConfigured && !!supabase;
export const BOTAO_PADRAO = 'Contrato fechado';
export const BOTAO_MAX = 24;
export const EVENTOS_META = [
  { valor: 'Purchase', rotulo: 'Compra (Purchase)' },
  { valor: 'Lead', rotulo: 'Lead' },
  { valor: 'CompleteRegistration', rotulo: 'Cadastro concluído' },
  { valor: 'Contact', rotulo: 'Contato' },
  { valor: 'Subscribe', rotulo: 'Assinatura' },
] as const;

export interface ConfigVenda { nomeBotao: string | null; metaEventoAtivo: boolean; metaEvento: string }
export interface Venda { id: string; contato: string; quando: string; quem: string | null; valor: number | null; conversaId: string | null }
export interface HistoricoVendas { dias: number; total: number; valor: number; porPessoa: { nome: string; qtd: number }[]; vendas: Venda[] }
export interface Origem { id: string; nome: string; slug: string | null; descricao: string | null; ativo: boolean }
export interface ResumoOrigens { dias: number; total: number; porOrigem: { origem: string; como: 'anuncio' | 'numero' | 'nenhuma'; qtd: number }[]; anuncios: { anuncio: string; qtd: number }[] }

export const rotuloBotao = (c: ConfigVenda | undefined | null) => (c?.nomeBotao?.trim() || BOTAO_PADRAO);
export function validarNomeBotao(n: string): string | null {
  const t = n.trim().replace(/\s+/g, ' ');
  if (t.length > BOTAO_MAX) return `O nome vai até ${BOTAO_MAX} letras.`;
  return null;
}
export function slugOrigem(nome: string): string {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
export function validarOrigem(o: Pick<Origem, 'nome' | 'slug'>, outras: Origem[], id?: string): string | null {
  const n = o.nome.trim();
  if (!n) return 'Dê um nome à origem.';
  if (n.length > 60) return 'O nome vai até 60 letras.';
  if (n.toLowerCase() === 'indefinida' || n.toLowerCase() === 'anúncio' || n.toLowerCase() === 'anuncio') return `"${n}" o sistema já usa sozinho.`;
  if (outras.some((x) => x.id !== id && x.nome.trim().toLowerCase() === n.toLowerCase())) return 'Já existe uma origem com esse nome.';
  if (o.slug && !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(o.slug.trim())) return 'O código usa só letras minúsculas, números, - e _.';
  return null;
}

/* ---------------- demonstração ---------------- */
const G_CFG = 'previa-config-venda', G_ORI = 'previa-origens', G_NUM = 'previa-origem-numeros';
const ler = <T,>(k: string, p: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v ?? p; } catch { return p; } };
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* aba privada */ } };
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const hAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const CFG_PADRAO: ConfigVenda = { nomeBotao: null, metaEventoAtivo: false, metaEvento: 'Purchase' };
const ORIGENS_DEMO: Origem[] = [
  { id: 'ori-ind', nome: 'Indicação de cliente', slug: 'indicacao', descricao: 'Quem chegou pela indicação de outro cliente', ativo: true },
  { id: 'ori-ura', nome: 'URA', slug: 'ura', descricao: 'Ligações que caíram no WhatsApp pela URA', ativo: true },
];
const VENDAS_DEMO: Venda[] = [
  { id: 'v1', contato: 'Maria Aparecida Souza', quando: hAtras(0.5), quem: 'Juliana', valor: 1300, conversaId: 'wa-maria' },
  { id: 'v2', contato: 'Antônio Pereira Lima', quando: hAtras(2.2), quem: 'Eduardo', valor: 1300, conversaId: 'wa-antonio' },
  { id: 'v3', contato: 'Terezinha M. Alves', quando: hAtras(5), quem: 'Juliana', valor: null, conversaId: 'wa-terezinha' },
  { id: 'v4', contato: 'José Carlos Ferreira', quando: hAtras(27), quem: 'Alexandra', valor: 2600, conversaId: 'wa-jose' },
  { id: 'v5', contato: 'Odete F. Carvalho', quando: hAtras(50), quem: 'Rafael', valor: 1300, conversaId: 'wa-odete' },
];

const C_CFG = 'atd-config-venda', C_HIST = 'atd-vendas-historico', C_ORI = 'atd-origens', C_RES = 'atd-origens-resumo';

/** o nome do botão e a Meta. Sem o recurso no servidor: o padrão ("Contrato fechado") */
export function useConfigVenda() {
  const { currentOrg } = useOrg();
  const ligado = temRecurso('venda-origem');
  return useQuery({
    queryKey: [C_CFG, currentOrg.id],
    enabled: !!currentOrg.id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ConfigVenda> => {
      if (!VENDA_REAL) return { ...CFG_PADRAO, ...ler(G_CFG, {}) };
      if (!ligado) return CFG_PADRAO;
      const { data, error } = await supabase!.from('atd_config_venda').select('nome_botao, meta_evento_ativo, meta_evento').eq('organizacao_id', currentOrg.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { nomeBotao: (data.nome_botao as string) ?? null, metaEventoAtivo: data.meta_evento_ativo === true, metaEvento: (data.meta_evento as string) || 'Purchase' } : CFG_PADRAO;
    },
  });
}

export function useSalvarConfigVenda() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: ConfigVenda) => {
      const nome = c.nomeBotao?.trim().replace(/\s+/g, ' ') || null;
      if (!VENDA_REAL) { await espera(150); if (c.metaEventoAtivo) throw new Error('Conecte as Conversões da Meta antes de ligar.'); gravar(G_CFG, { ...c, nomeBotao: nome }); return; }
      const { error } = await supabase!.from('atd_config_venda').upsert({ organizacao_id: currentOrg.id, nome_botao: nome, meta_evento_ativo: c.metaEventoAtivo, meta_evento: c.metaEvento }, { onConflict: 'organizacao_id' });
      if (error) throw new Error(/meta_conversoes/.test(error.message) ? 'Conecte as Conversões da Meta antes de ligar.' : /nome/.test(error.message) ? `O nome vai até ${BOTAO_MAX} letras.` : error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [C_CFG] }),
  });
}

export function useHistoricoVendas(dias: number) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_HIST, currentOrg.id, dias],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<HistoricoVendas> => {
      if (!VENDA_REAL) {
        await espera(150);
        const desde = Date.now() - dias * 86_400_000;
        const vendas = VENDAS_DEMO.filter((v) => new Date(v.quando).getTime() >= desde);
        const porPessoa = Object.entries(vendas.reduce<Record<string, number>>((m, v) => { const k = v.quem ?? 'Sem nome'; m[k] = (m[k] ?? 0) + 1; return m; }, {}))
          .map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd);
        return { dias, total: vendas.length, valor: vendas.reduce((s, v) => s + (v.valor ?? 0), 0), porPessoa, vendas };
      }
      const { data, error } = await supabase!.rpc('atd_vendas_historico', { p_dias: dias });
      if (error) throw new Error(/sem_permissao/.test(error.message) ? 'Só o administrador vê o histórico de vendas.' : error.message);
      const j = (data ?? {}) as Record<string, unknown>;
      const arr = (v: unknown) => (Array.isArray(v) ? v as Record<string, unknown>[] : []);
      return {
        dias: Number(j.dias) || dias, total: Number(j.total) || 0, valor: Number(j.valor) || 0,
        porPessoa: arr(j.por_pessoa).map((x) => ({ nome: String(x.nome), qtd: Number(x.qtd) || 0 })),
        vendas: arr(j.vendas).map((x) => ({ id: String(x.id), contato: String(x.contato ?? ''), quando: String(x.quando), quem: (x.quem as string) ?? null, valor: x.valor == null ? null : Number(x.valor), conversaId: (x.conversa_id as string) ?? null })),
      };
    },
  });
}

/* ---------------- origem do lead ---------------- */
export function useOrigens() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_ORI, currentOrg.id],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<Origem[]> => {
      if (!VENDA_REAL) { await espera(100); return ler(G_ORI, ORIGENS_DEMO); }
      const { data, error } = await supabase!.from('fontes_aquisicao').select('id, nome, slug, descricao, ativo').eq('organizacao_id', currentOrg.id).order('nome');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({ id: String(r.id), nome: String(r.nome), slug: (r.slug as string) ?? null, descricao: (r.descricao as string) ?? null, ativo: r.ativo !== false }));
    },
  });
}

export function useSalvarOrigem() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (o: Omit<Origem, 'id'> & { id?: string }) => {
      const linha = { nome: o.nome.trim().replace(/\s+/g, ' '), slug: o.slug?.trim() || slugOrigem(o.nome), descricao: o.descricao?.trim() || null, ativo: o.ativo };
      if (!VENDA_REAL) {
        await espera(120); const l = ler(G_ORI, ORIGENS_DEMO);
        gravar(G_ORI, o.id ? l.map((x) => (x.id === o.id ? { ...x, ...linha } : x)) : [...l, { id: `ori-${Date.now()}`, ...linha }]);
        return;
      }
      const { error } = o.id
        ? await supabase!.from('fontes_aquisicao').update({ ...linha, atualizado_em: new Date().toISOString() }).eq('id', o.id)
        : await supabase!.from('fontes_aquisicao').insert({ ...linha, organizacao_id: currentOrg.id });
      if (error) throw new Error(/fontes_aquisicao_nome_uniq|duplicate/i.test(error.message) ? 'Já existe uma origem com esse nome.' : error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C_ORI] }); qc.invalidateQueries({ queryKey: [C_RES] }); },
  });
}

export function useApagarOrigem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!VENDA_REAL) { gravar(G_ORI, ler(G_ORI, ORIGENS_DEMO).filter((x) => x.id !== id)); gravar(G_NUM, Object.fromEntries(Object.entries(ler<Record<string, string>>(G_NUM, {})).filter(([, v]) => v !== id))); return; }
      const { error } = await supabase!.from('fontes_aquisicao').delete().eq('id', id);
      if (error) throw new Error(/foreign key|violates/i.test(error.message) ? 'Essa origem está em uso. Desligue em vez de apagar.' : error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [C_ORI] }); qc.invalidateQueries({ queryKey: [C_RES] }); qc.invalidateQueries({ queryKey: ['cfg-origem-numeros'] }); },
  });
}

/** a origem de cada número de WhatsApp (o Atendimento): no demo guarda no navegador */
export function useOrigemDosNumeros(ids: string[]) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['cfg-origem-numeros', currentOrg.id, ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, string | null>> => {
      if (!VENDA_REAL) { const m = ler<Record<string, string>>(G_NUM, {}); return Object.fromEntries(ids.map((id) => [id, m[id] ?? null])); }
      const { data, error } = await supabase!.from('canais').select('id, fonte_aquisicao_id').in('id', ids);
      if (error) throw new Error(error.message);
      return Object.fromEntries((data ?? []).map((r) => [String(r.id), (r.fonte_aquisicao_id as string) ?? null]));
    },
  });
}

export function useDefinirOrigemDoNumero() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { canalId: string; origemId: string | null }) => {
      if (!VENDA_REAL) { const m = ler<Record<string, string | null>>(G_NUM, {}); m[v.canalId] = v.origemId; gravar(G_NUM, m); return; }
      const { error } = await supabase!.rpc('atd_canal_definir_origem', { p_canal: v.canalId, p_fonte: v.origemId });
      if (error) throw new Error(/sem_permissao/.test(error.message) ? 'Só o administrador muda a origem do número.' : error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cfg-origem-numeros'] }); qc.invalidateQueries({ queryKey: [C_RES] }); },
  });
}

export function useResumoOrigens(dias: number) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [C_RES, currentOrg.id, dias],
    enabled: !!currentOrg.id,
    queryFn: async (): Promise<ResumoOrigens> => {
      if (!VENDA_REAL) {
        await espera(150);
        const f = dias <= 7 ? 0.25 : dias >= 90 ? 2.8 : 1;
        const n = (x: number) => Math.max(1, Math.round(x * f));
        const porOrigem: ResumoOrigens['porOrigem'] = [{ origem: 'Anúncio', como: 'anuncio', qtd: n(212) }, { origem: 'Indefinida', como: 'nenhuma', qtd: n(64) }, { origem: 'URA', como: 'numero', qtd: n(31) }, { origem: 'Indicação de cliente', como: 'numero', qtd: n(9) }];
        return { dias, total: porOrigem.reduce((s, x) => s + x.qtd, 0), porOrigem, anuncios: [{ anuncio: 'Revisão de juros do empréstimo', qtd: n(141) }, { anuncio: 'Desconto indevido no benefício', qtd: n(58) }, { anuncio: 'Anúncio sem título', qtd: n(13) }] };
      }
      const { data, error } = await supabase!.rpc('atd_origens_resumo', { p_dias: dias });
      if (error) throw new Error(/sem_permissao/.test(error.message) ? 'Só o administrador vê de onde vieram os leads.' : error.message);
      const j = (data ?? {}) as Record<string, unknown>;
      const arr = (v: unknown) => (Array.isArray(v) ? v as Record<string, unknown>[] : []);
      return {
        dias: Number(j.dias) || dias, total: Number(j.total) || 0,
        porOrigem: arr(j.por_origem).map((x) => ({ origem: String(x.origem), como: (x.como as ResumoOrigens['porOrigem'][number]['como']) ?? 'nenhuma', qtd: Number(x.qtd) || 0 })),
        anuncios: arr(j.anuncios).map((x) => ({ anuncio: String(x.anuncio), qtd: Number(x.qtd) || 0 })),
      };
    },
  });
}
