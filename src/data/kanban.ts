import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

export const KANBAN_REAL = isSupabaseConfigured && !!supabase;

export interface KColuna { id: string; nome: string; cor: string; ordem: number; }
export interface KLead {
  id: string; colunaId: string | null; contatoId: string | null; nome: string; telefone: string;
  respId: string | null; respNome: string; valor: number | null; origem: string; etiquetas: string[];
  observacoes: string; ordem: number; criadoEm: string; atualizadoEm: string;
}

interface DbLead {
  id: string; coluna_id: string | null; contato_id: string | null; contato_nome: string | null; titulo: string | null;
  telefone: string | null; responsavel_id: string | null; valor_estimado: number | null; origem: string | null;
  etiquetas: string[] | null; observacoes: string | null; ordem: number; criado_em: string; atualizado_em: string;
  contatos: { nome: string; telefone: string | null } | { nome: string; telefone: string | null }[] | null;
  responsavel: { nome: string } | { nome: string }[] | null;
}
function one<T>(v: T | T[] | null): T | null { return Array.isArray(v) ? (v[0] ?? null) : v; }
function mapLead(l: DbLead): KLead {
  const ct = one(l.contatos);
  const rp = one(l.responsavel);
  return {
    id: l.id, colunaId: l.coluna_id, contatoId: l.contato_id,
    nome: l.contato_nome || l.titulo || ct?.nome || 'Lead',
    telefone: l.telefone || ct?.telefone || '',
    respId: l.responsavel_id, respNome: rp?.nome || '',
    valor: l.valor_estimado, origem: l.origem || '', etiquetas: l.etiquetas ?? [],
    observacoes: l.observacoes || '', ordem: l.ordem, criadoEm: l.criado_em, atualizadoEm: l.atualizado_em,
  };
}

export interface OppAberta { id: string; contatoId: string; colunaId: string | null; colunaNome: string; funilId: string | null; respNome: string; valor: number | null; atualizadoEm: string; }
/** Mapa contatoId -> oportunidade ABERTA (em_andamento) do contato. Uma query (sem N+1). */
export function useOportunidadesAbertasDeContatos(ids: string[]) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  const chave = [...new Set(ids)].sort().join(',');
  return useQuery({
    queryKey: ['opp-abertas', org, chave],
    enabled: KANBAN_REAL && ids.length > 0,
    queryFn: async (): Promise<Record<string, OppAberta>> => {
      const { data, error } = await supabase!.from('oportunidades')
        .select('id, contato_id, coluna_id, funil_id, valor_estimado, atualizado_em, funil_colunas(nome), responsavel:usuarios(nome)')
        .eq('organizacao_id', org).eq('status', 'em_andamento').in('contato_id', [...new Set(ids)]);
      if (error) throw new Error(error.message);
      const map: Record<string, OppAberta> = {};
      for (const r of ((data as unknown[]) ?? []) as Record<string, unknown>[]) {
        const cid = r.contato_id as string | null;
        if (!cid || map[cid]) continue;
        const col = r.funil_colunas as { nome: string } | { nome: string }[] | null;
        const rp = r.responsavel as { nome: string } | { nome: string }[] | null;
        map[cid] = { id: r.id as string, contatoId: cid, colunaId: (r.coluna_id as string) ?? null, colunaNome: (Array.isArray(col) ? col[0]?.nome : col?.nome) || '', funilId: (r.funil_id as string) ?? null, respNome: (Array.isArray(rp) ? rp[0]?.nome : rp?.nome) || '', valor: (r.valor_estimado as number) ?? null, atualizadoEm: (r.atualizado_em as string) || '' };
      }
      return map;
    },
  });
}

/** Funil padrão da org (cria um na primeira vez se o usuário tiver permissão). */
async function garantirFunil(org: string): Promise<{ id: string; nome: string } | null> {
  const { data } = await supabase!.from('funis').select('id, nome').eq('organizacao_id', org).eq('arquivado', false).order('padrao', { ascending: false }).order('ordem', { ascending: true }).limit(1).maybeSingle();
  if (data) return data as { id: string; nome: string };
  const { data: novo } = await supabase!.from('funis').insert({ organizacao_id: org, nome: 'Funil comercial', padrao: true }).select('id, nome').maybeSingle();
  return (novo as { id: string; nome: string } | null) ?? null;
}

/** Núcleo do Kanban: funil + colunas + leads (oportunidades em andamento) + ações + realtime. */
export function useKanban() {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  const qc = useQueryClient();

  const funilQ = useQuery({ queryKey: ['kanban-funil', org], enabled: KANBAN_REAL, queryFn: () => garantirFunil(org) });
  const funilId = funilQ.data?.id ?? null;

  const colunasQ = useQuery({
    queryKey: ['kanban-colunas', org, funilId], enabled: KANBAN_REAL && !!funilId, refetchInterval: 8000,
    queryFn: async (): Promise<KColuna[]> => {
      const { data, error } = await supabase!.from('funil_colunas').select('id, nome, cor, ordem').eq('organizacao_id', org).eq('funil_id', funilId!).eq('arquivada', false).order('ordem', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as KColuna[]) ?? [];
    },
  });

  const leadsQ = useQuery({
    queryKey: ['kanban-leads', org, funilId], enabled: KANBAN_REAL && !!funilId, refetchInterval: 8000,
    queryFn: async (): Promise<KLead[]> => {
      const { data, error } = await supabase!.from('oportunidades')
        .select('id, coluna_id, contato_id, contato_nome, titulo, telefone, responsavel_id, valor_estimado, origem, etiquetas, observacoes, ordem, criado_em, atualizado_em, contatos(nome, telefone), responsavel:usuarios(nome)')
        .eq('organizacao_id', org).eq('funil_id', funilId!).eq('status', 'em_andamento')
        .order('ordem', { ascending: true }).order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as unknown as DbLead[]) ?? []).map(mapLead);
    },
  });

  useEffect(() => {
    if (!KANBAN_REAL) return;
    const ch = supabase!
      .channel(`kanban-${org}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades', filter: `organizacao_id=eq.${org}` }, () => qc.invalidateQueries({ queryKey: ['kanban-leads', org] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funil_colunas', filter: `organizacao_id=eq.${org}` }, () => qc.invalidateQueries({ queryKey: ['kanban-colunas', org] }))
      .subscribe();
    return () => { supabase!.removeChannel(ch); };
  }, [org, qc]);

  const colunas = colunasQ.data ?? [];
  const leads = leadsQ.data ?? [];
  const invalida = () => { qc.invalidateQueries({ queryKey: ['kanban-colunas', org] }); qc.invalidateQueries({ queryKey: ['kanban-leads', org] }); };

  async function criarColuna(input: { nome: string; cor: string }) {
    const ordem = (colunas.reduce((m, c) => Math.max(m, c.ordem), 0)) + 1;
    const { error } = await supabase!.from('funil_colunas').insert({ organizacao_id: org, funil_id: funilId, nome: input.nome, cor: input.cor, ordem });
    if (error) throw new Error(error.message);
    invalida();
  }
  async function editarColuna(input: { id: string; nome?: string; cor?: string; ordem?: number }) {
    const patch: Record<string, unknown> = {};
    if (input.nome !== undefined) patch.nome = input.nome;
    if (input.cor !== undefined) patch.cor = input.cor;
    if (input.ordem !== undefined) patch.ordem = input.ordem;
    const { error } = await supabase!.from('funil_colunas').update(patch).eq('id', input.id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalida();
  }
  /** Move leads para destino (se houver) e exclui a coluna. */
  async function excluirColuna(id: string, destinoId: string | null) {
    if (destinoId) {
      const { error: em } = await supabase!.from('oportunidades').update({ coluna_id: destinoId }).eq('coluna_id', id).eq('organizacao_id', org);
      if (em) throw new Error(em.message);
    }
    const { error } = await supabase!.from('funil_colunas').delete().eq('id', id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalida();
  }
  async function criarLead(input: { colunaId: string; contatoId?: string | null; nome: string; telefone?: string; responsavelId?: string | null; valor?: number | null; origem?: string; etiquetas?: string[]; observacoes?: string }) {
    const ordem = (leads.filter((l) => l.colunaId === input.colunaId).reduce((m, l) => Math.max(m, l.ordem), 0)) + 1;
    const { error } = await supabase!.from('oportunidades').insert({
      organizacao_id: org, funil_id: funilId, coluna_id: input.colunaId,
      contato_id: input.contatoId ?? null, contato_nome: input.contatoId ? null : input.nome, titulo: input.nome,
      telefone: input.telefone || null, responsavel_id: input.responsavelId ?? null,
      valor_estimado: input.valor ?? null, origem: input.origem || null,
      etiquetas: input.etiquetas ?? [], observacoes: input.observacoes || null, ordem,
    });
    if (error) throw new Error(error.message);
    invalida();
  }
  async function editarLead(input: { id: string; nome?: string; telefone?: string | null; responsavelId?: string | null; valor?: number | null; origem?: string | null; etiquetas?: string[]; observacoes?: string | null; colunaId?: string }) {
    const patch: Record<string, unknown> = {};
    if (input.nome !== undefined) { patch.titulo = input.nome; patch.contato_nome = input.nome; }
    if (input.telefone !== undefined) patch.telefone = input.telefone;
    if (input.responsavelId !== undefined) patch.responsavel_id = input.responsavelId;
    if (input.valor !== undefined) patch.valor_estimado = input.valor;
    if (input.origem !== undefined) patch.origem = input.origem;
    if (input.etiquetas !== undefined) patch.etiquetas = input.etiquetas;
    if (input.observacoes !== undefined) patch.observacoes = input.observacoes;
    if (input.colunaId !== undefined) patch.coluna_id = input.colunaId;
    const { error } = await supabase!.from('oportunidades').update(patch).eq('id', input.id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalida();
  }
  /** Arquiva o lead (status='cancelado') — sai do quadro sem exclusão física. */
  async function arquivarLead(id: string) {
    const { error } = await supabase!.from('oportunidades').update({ status: 'cancelado' }).eq('id', id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalida();
  }
  /** Move o lead para outra coluna (append no fim). Lança em erro (o caller faz rollback visual). */
  async function moverLead(id: string, colunaId: string) {
    const ordem = (leads.filter((l) => l.colunaId === colunaId).reduce((m, l) => Math.max(m, l.ordem), 0)) + 1;
    const { error } = await supabase!.from('oportunidades').update({ coluna_id: colunaId, ordem }).eq('id', id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalida();
  }

  return {
    funilId, colunas, leads,
    loading: funilQ.isLoading || colunasQ.isLoading || leadsQ.isLoading,
    isError: colunasQ.isError || leadsQ.isError,
    error: (colunasQ.error || leadsQ.error) as Error | null,
    semFunil: funilQ.isFetched && !funilId,
    refetch: () => { colunasQ.refetch(); leadsQ.refetch(); },
    criarColuna, editarColuna, excluirColuna, criarLead, editarLead, arquivarLead, moverLead,
  };
}
