import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/* ------------------------------------------------------------------
   CAMPOS PERSONALIZADOS DO CLIENTE (26/11, "igual" ao sistema que a Reviza usava antes: lá Configurações › Campos
   personalizados, com o "Nome completo (RG)"). O administrador cria os campos (texto, número, data, lista, sim/não,
   telefone, e-mail), põe na ordem, desliga e escolhe quais aparecem no cartão do Kanban. A equipe preenche no
   painel do cliente, no WhatsApp.
   Servidor: migration 110 (atd_campos + atd_campo_valores; o servidor confere o tipo e a opção da lista).
   DEMO É O CONTRATO: sem backend os mesmos hooks guardam no navegador.
   ------------------------------------------------------------------ */

export const CAMPOS_REAL: boolean = isSupabaseConfigured && !!supabase;

export type TipoCampo = 'texto' | 'numero' | 'data' | 'lista' | 'sim_nao' | 'telefone' | 'email';
export const TIPOS_CAMPO: { valor: TipoCampo; rotulo: string; dica: string }[] = [
  { valor: 'texto', rotulo: 'Texto', dica: 'Qualquer texto curto' },
  { valor: 'numero', rotulo: 'Número', dica: 'Só números, como a quantidade de contratos' },
  { valor: 'data', rotulo: 'Data', dica: 'Dia, mês e ano' },
  { valor: 'lista', rotulo: 'Lista de opções', dica: 'A equipe escolhe uma das opções' },
  { valor: 'sim_nao', rotulo: 'Sim ou não', dica: 'Duas opções: sim ou não' },
  { valor: 'telefone', rotulo: 'Telefone', dica: 'Outro número de contato' },
  { valor: 'email', rotulo: 'E-mail', dica: 'Um endereço de e-mail' },
];
export const ROTULO_TIPO: Record<TipoCampo, string> = Object.fromEntries(TIPOS_CAMPO.map((t) => [t.valor, t.rotulo])) as Record<TipoCampo, string>;

export interface Campo {
  id: string;
  nome: string;
  tipo: TipoCampo;
  opcoes: string[];
  ordem: number;
  ativo: boolean;
  noCartao: boolean;
}
export interface ValorCampo { contatoId: string; campoId: string; valor: string; atualizadoEm: string | null }

/* os limites da migration 110 */
export const NOME_MAX = 60, VALOR_MAX = 500, OPCOES_MAX = 30;

export function limparOpcoes(l: string[]): string[] {
  const vistos = new Set<string>(); const out: string[] = [];
  for (const o of l) { const t = o.trim().replace(/\s+/g, ' '); if (t && !vistos.has(t.toLowerCase())) { vistos.add(t.toLowerCase()); out.push(t.slice(0, 60)); } }
  return out;
}

export function validarCampo(c: Pick<Campo, 'nome' | 'tipo' | 'opcoes'>, outros: Campo[] = [], id?: string): string | null {
  const n = c.nome.trim();
  if (!n) return 'Dê um nome ao campo.';
  if (n.length > NOME_MAX) return `O nome vai até ${NOME_MAX} letras.`;
  if (outros.some((o) => o.id !== id && o.nome.trim().toLowerCase() === n.toLowerCase())) return 'Já existe um campo com esse nome.';
  const ops = limparOpcoes(c.opcoes);
  if (c.tipo === 'lista' && ops.length === 0) return 'Escreva ao menos uma opção da lista.';
  if (ops.length > OPCOES_MAX) return `A lista vai até ${OPCOES_MAX} opções.`;
  return null;
}

/** confere o valor como o servidor confere (migration 110). Devolve o valor pronto para gravar ou o erro. */
export function validarValor(c: Pick<Campo, 'tipo' | 'opcoes'>, bruto: string): { valor: string } | { erro: string } {
  const v = bruto.trim();
  if (v.length > VALOR_MAX) return { erro: `Vai até ${VALOR_MAX} letras.` };
  switch (c.tipo) {
    case 'numero': return /^-?\d+([.,]\d+)?$/.test(v) ? { valor: v } : { erro: 'Escreva só o número.' };
    case 'data': return /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T12:00:00').getTime()) ? { valor: v } : { erro: 'Escolha a data.' };
    case 'sim_nao': return v === 'sim' || v === 'nao' ? { valor: v } : { erro: 'Escolha sim ou não.' };
    case 'lista': return c.opcoes.includes(v) ? { valor: v } : { erro: 'Escolha uma das opções.' };
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? { valor: v } : { erro: 'E-mail incompleto.' };
    case 'telefone': return v.replace(/\D/g, '').length >= 8 ? { valor: v } : { erro: 'Telefone incompleto.' };
    default: return v ? { valor: v } : { erro: 'Escreva o valor.' };
  }
}

/** como o valor aparece na tela */
export function mostrarValor(c: Pick<Campo, 'tipo'>, v: string | null | undefined): string {
  if (v == null || v === '') return '';
  if (c.tipo === 'sim_nao') return v === 'sim' ? 'Sim' : 'Não';
  if (c.tipo === 'data') { const [a, m, d] = v.split('-'); return d && m && a ? `${d}/${m}/${a}` : v; }
  return v;
}

const deLinha = (r: Record<string, unknown>): Campo => ({
  id: String(r.id), nome: String(r.nome ?? ''), tipo: (r.tipo as TipoCampo) ?? 'texto',
  opcoes: Array.isArray(r.opcoes) ? (r.opcoes as string[]) : [], ordem: Number(r.ordem) || 0, ativo: r.ativo !== false, noCartao: r.no_cartao === true,
});

/* ---------------- demonstração ---------------- */
const GUARDA_C = 'previa-campos', GUARDA_V = 'previa-campos-valores';
const CAMPOS_DEMO: Campo[] = [
  { id: 'cmp-rg', nome: 'Nome completo (RG)', tipo: 'texto', opcoes: [], ordem: 0, ativo: true, noCartao: true },
  { id: 'cmp-banco', nome: 'Banco do empréstimo', tipo: 'lista', opcoes: ['Agibank', 'BMG', 'Crefisa', 'Mercantil', 'Pan'], ordem: 1, ativo: true, noCartao: true },
  { id: 'cmp-contratos', nome: 'Contratos ativos', tipo: 'numero', opcoes: [], ordem: 2, ativo: true, noCartao: false },
  { id: 'cmp-senha', nome: 'Já tem a senha do INSS', tipo: 'sim_nao', opcoes: [], ordem: 3, ativo: true, noCartao: false },
  { id: 'cmp-nasc', nome: 'Data de nascimento', tipo: 'data', opcoes: [], ordem: 4, ativo: false, noCartao: false },
];
// valores de exemplo para as conversas de demonstração (o painel usa o id do contato, ou o da conversa)
const VALORES_DEMO: ValorCampo[] = [
  { contatoId: 'wa-maria-ct', campoId: 'cmp-rg', valor: 'MARIA APARECIDA SOUZA', atualizadoEm: null },
  { contatoId: 'wa-maria-ct', campoId: 'cmp-banco', valor: 'Agibank', atualizadoEm: null },
  { contatoId: 'wa-maria-ct', campoId: 'cmp-contratos', valor: '3', atualizadoEm: null },
  { contatoId: 'kct-3', campoId: 'cmp-rg', valor: 'MARIA APARECIDA SOUZA', atualizadoEm: null },
  { contatoId: 'kct-3', campoId: 'cmp-banco', valor: 'BMG', atualizadoEm: null },
  { contatoId: 'kct-5', campoId: 'cmp-rg', valor: 'ANTONIO PEREIRA LIMA', atualizadoEm: null },
  { contatoId: 'kct-5', campoId: 'cmp-senha', valor: 'sim', atualizadoEm: null },
  { contatoId: 'wa-jose-ct', campoId: 'cmp-banco', valor: 'Mercantil', atualizadoEm: null },
];
const ler = <T,>(k: string, padrao: T): T => { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v ?? padrao; } catch { return padrao; } };
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* aba privada */ } };
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const novoId = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.round(Math.random() * 1e6)}`);

const CHAVE = 'atd-campos', CHAVE_V = 'atd-campo-valores';

/** todos os campos da empresa, na ordem (os desligados também: a tela de Configurações mostra) */
export function useCampos(ligado = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE, currentOrg.id],
    enabled: ligado && !!currentOrg.id,
    staleTime: 60_000,
    queryFn: async (): Promise<Campo[]> => {
      if (!CAMPOS_REAL) { await espera(120); return [...ler(GUARDA_C, CAMPOS_DEMO)].sort((a, b) => a.ordem - b.ordem); }
      const { data, error } = await supabase!.from('atd_campos').select('id, nome, tipo, opcoes, ordem, ativo, no_cartao').eq('organizacao_id', currentOrg.id).order('ordem').order('nome');
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => deLinha(r as Record<string, unknown>));
    },
  });
}

export function useSalvarCampo() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: Omit<Campo, 'id'> & { id?: string }) => {
      const limpo = { ...c, nome: c.nome.trim().replace(/\s+/g, ' '), opcoes: c.tipo === 'lista' ? limparOpcoes(c.opcoes) : [] };
      if (!CAMPOS_REAL) {
        await espera(150);
        const l = ler(GUARDA_C, CAMPOS_DEMO);
        gravar(GUARDA_C, limpo.id ? l.map((x) => (x.id === limpo.id ? { ...x, ...limpo } as Campo : x)) : [...l, { ...limpo, id: novoId() } as Campo]);
        return;
      }
      const linha = { organizacao_id: currentOrg.id, nome: limpo.nome, tipo: limpo.tipo, opcoes: limpo.opcoes, ordem: limpo.ordem, ativo: limpo.ativo, no_cartao: limpo.noCartao };
      const { error } = limpo.id
        ? await supabase!.from('atd_campos').update(linha).eq('id', limpo.id)
        : await supabase!.from('atd_campos').insert(linha);
      if (error) throw new Error(/atd_campos_nome_uniq|duplicate/i.test(error.message) ? 'Já existe um campo com esse nome.' : error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}

/** muda a ordem: grava a posição de cada campo (poucos campos; um pedido por campo que mudou) */
export function useOrdenarCampos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!CAMPOS_REAL) { const l = ler(GUARDA_C, CAMPOS_DEMO); gravar(GUARDA_C, l.map((x) => ({ ...x, ordem: Math.max(0, ids.indexOf(x.id)) }))); return; }
      for (let i = 0; i < ids.length; i++) {
        const { error } = await supabase!.from('atd_campos').update({ ordem: i }).eq('id', ids[i]);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE] }),
  });
}

/** apaga o campo e o que já foi preenchido nele */
export function useApagarCampo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!CAMPOS_REAL) { gravar(GUARDA_C, ler(GUARDA_C, CAMPOS_DEMO).filter((x) => x.id !== id)); gravar(GUARDA_V, ler(GUARDA_V, VALORES_DEMO).filter((v) => v.campoId !== id)); return; }
      const { error } = await supabase!.from('atd_campos').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [CHAVE] }); qc.invalidateQueries({ queryKey: [CHAVE_V] }); },
  });
}

/** quantos clientes já têm cada campo preenchido (a tela de Configurações avisa antes de apagar) */
export function useUsoDosCampos(ids: string[]) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE_V, currentOrg.id, 'uso', ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const out: Record<string, number> = {};
      if (!CAMPOS_REAL) { for (const v of ler(GUARDA_V, VALORES_DEMO)) out[v.campoId] = (out[v.campoId] ?? 0) + 1; return out; }
      for (const id of ids) {
        const { count, error } = await supabase!.from('atd_campo_valores').select('campo_id', { count: 'exact', head: true }).eq('campo_id', id);
        if (error) throw new Error(error.message);
        out[id] = count ?? 0;
      }
      return out;
    },
  });
}

/** os valores de um cliente */
export function useValoresDoContato(contatoId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: [CHAVE_V, currentOrg.id, 'contato', contatoId],
    enabled: !!contatoId,
    queryFn: async (): Promise<Record<string, ValorCampo>> => {
      const lista: ValorCampo[] = !CAMPOS_REAL
        ? ler(GUARDA_V, VALORES_DEMO).filter((v) => v.contatoId === contatoId)
        : await (async () => {
          const { data, error } = await supabase!.from('atd_campo_valores').select('contato_id, campo_id, valor, atualizado_em').eq('contato_id', contatoId!);
          if (error) throw new Error(error.message);
          return (data ?? []).map((r) => ({ contatoId: r.contato_id as string, campoId: r.campo_id as string, valor: r.valor as string, atualizadoEm: (r.atualizado_em as string) ?? null }));
        })();
      return Object.fromEntries(lista.map((v) => [v.campoId, v]));
    },
  });
}

/** os valores que aparecem no cartão do Kanban, de muitos clientes de uma vez (em lotes, por causa do teto de 1000) */
export function useValoresNoCartao(contatoIds: string[], campos: Campo[]) {
  const { currentOrg } = useOrg();
  const doCartao = campos.filter((c) => c.ativo && c.noCartao).map((c) => c.id);
  const ids = [...new Set(contatoIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: [CHAVE_V, currentOrg.id, 'cartao', doCartao.join(','), ids.length, ids[0] ?? '', ids[ids.length - 1] ?? ''],
    enabled: doCartao.length > 0 && ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, Record<string, string>>> => {
      const out: Record<string, Record<string, string>> = {};
      const por = (v: { contatoId: string; campoId: string; valor: string }) => { (out[v.contatoId] ??= {})[v.campoId] = v.valor; };
      if (!CAMPOS_REAL) { ler(GUARDA_V, VALORES_DEMO).filter((v) => doCartao.includes(v.campoId) && ids.includes(v.contatoId)).forEach(por); return out; }
      for (let i = 0; i < ids.length; i += 150) {
        const lote = ids.slice(i, i + 150);
        const { data, error } = await supabase!.from('atd_campo_valores').select('contato_id, campo_id, valor').in('campo_id', doCartao).in('contato_id', lote).limit(1000);
        if (error) throw new Error(error.message);
        (data ?? []).forEach((r) => por({ contatoId: r.contato_id as string, campoId: r.campo_id as string, valor: r.valor as string }));
      }
      return out;
    },
  });
}

/** grava (ou apaga, com valor vazio) o valor de um campo de um cliente */
export function useSalvarValor() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { contatoId: string; campoId: string; valor: string }) => {
      const valor = v.valor.trim();
      if (!CAMPOS_REAL) {
        await espera(120);
        const l = ler(GUARDA_V, VALORES_DEMO).filter((x) => !(x.contatoId === v.contatoId && x.campoId === v.campoId));
        gravar(GUARDA_V, valor ? [...l, { contatoId: v.contatoId, campoId: v.campoId, valor, atualizadoEm: new Date().toISOString() }] : l);
        return;
      }
      const { error } = valor
        ? await supabase!.from('atd_campo_valores').upsert({ contato_id: v.contatoId, campo_id: v.campoId, organizacao_id: currentOrg.id, valor }, { onConflict: 'contato_id,campo_id' })
        : await supabase!.from('atd_campo_valores').delete().eq('contato_id', v.contatoId).eq('campo_id', v.campoId);
      if (error) {
        const m = error.message;
        throw new Error(/numero_invalido/.test(m) ? 'Escreva só o número.' : /data_invalida/.test(m) ? 'Escolha a data.' : /opcao_invalida/.test(m) ? 'Essa opção não está mais na lista.' : /row-level|permission/i.test(m) ? 'Você não pode mudar este cliente.' : m);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE_V] }),
  });
}
