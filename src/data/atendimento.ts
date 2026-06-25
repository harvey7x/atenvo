import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';
import { WA_REAL } from '@/data/whatsapp';
import { slugify, randomSuffix } from '@/lib/slug';
import type { StatusDef, Etiqueta, AssinaturaModo, AssinaturaPref } from '@/types/atendimento';

const uid = () => globalThis.crypto?.randomUUID?.() ?? 'x' + Math.random().toString(36).slice(2);

/* ===================== Modo MOCK (dev sem backend) ===================== */
let mockStatus: StatusDef[] = [
  { id: 'st-aberta', slug: 'aberta', nome: 'Aberta', cor: '#3b82f6', ordem: 0, padrao: true, ativo: true, sistema: true },
  { id: 'st-atend', slug: 'em_atendimento', nome: 'Em atendimento', cor: '#f59e0b', ordem: 1, padrao: false, ativo: true, sistema: true },
  { id: 'st-pend', slug: 'pendente', nome: 'Pendente', cor: '#a855f7', ordem: 2, padrao: false, ativo: true, sistema: true },
  { id: 'st-resol', slug: 'resolvida', nome: 'Resolvida', cor: '#22c55e', ordem: 3, padrao: false, ativo: true, sistema: true },
  { id: 'st-fech', slug: 'fechada', nome: 'Fechada', cor: '#64748b', ordem: 4, padrao: false, ativo: true, sistema: true },
];
let mockEtq: Etiqueta[] = [
  { id: 'e1', nome: 'Revisão de contrato', cor: '#3b82f6', descricao: null, ordem: 0, ativo: true },
  { id: 'e2', nome: 'Juros abusivos', cor: '#e11d48', descricao: null, ordem: 1, ativo: true },
  { id: 'e3', nome: 'Documentação', cor: '#19C37D', descricao: null, ordem: 2, ativo: true },
];
let mockPref: AssinaturaPref = { modo: 'sem', nome: '' };

/* ===================== Queries ===================== */
export function useStatusDefs() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['status-defs', currentOrg.id],
    queryFn: async (): Promise<StatusDef[]> => {
      if (!WA_REAL || !supabase) return [...mockStatus].sort((a, b) => a.ordem - b.ordem);
      const { data, error } = await supabase
        .from('conversa_status_def')
        .select('id, slug, nome, cor, ordem, padrao, ativo, sistema')
        .eq('organizacao_id', currentOrg.id)
        .order('ordem', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as StatusDef[]) ?? [];
    },
  });
}

export function useEtiquetas() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['etiquetas', currentOrg.id],
    queryFn: async (): Promise<Etiqueta[]> => {
      if (!WA_REAL || !supabase) return [...mockEtq].sort((a, b) => a.ordem - b.ordem);
      const { data, error } = await supabase
        .from('etiquetas')
        .select('id, nome, cor, descricao, ordem, ativo')
        .eq('organizacao_id', currentOrg.id)
        .order('ordem', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as Etiqueta[]) ?? [];
    },
  });
}

export interface OrgUsuario { id: string; nome: string; papel: string }
/** Usuários ativos da organização (para o seletor de Responsável). */
export function useOrgUsuarios() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['org-usuarios', currentOrg.id],
    queryFn: async (): Promise<OrgUsuario[]> => {
      if (!WA_REAL || !supabase) return [{ id: 'u-mock', nome: 'Atendente', papel: 'admin' }];
      const { data, error } = await supabase
        .from('organizacao_usuarios')
        .select('papel, usuarios(id, nome)')
        .eq('organizacao_id', currentOrg.id).eq('status', 'ativo');
      if (error) throw new Error(error.message);
      type Row = { papel: string; usuarios: { id: string; nome: string } | { id: string; nome: string }[] | null };
      return ((data as unknown as Row[]) ?? []).map((r) => {
        const u = Array.isArray(r.usuarios) ? r.usuarios[0] : r.usuarios;
        return u ? { id: u.id, nome: u.nome, papel: r.papel } : null;
      }).filter((x): x is OrgUsuario => x !== null).sort((a, b) => a.nome.localeCompare(b.nome));
    },
  });
}

export function useAssinaturaPref() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['assinatura-pref', currentOrg.id, user?.id],
    queryFn: async (): Promise<AssinaturaPref> => {
      if (!WA_REAL || !supabase || !user) return { ...mockPref };
      const { data, error } = await supabase
        .from('organizacao_usuarios')
        .select('assinatura_modo, assinatura_nome')
        .eq('organizacao_id', currentOrg.id)
        .eq('usuario_id', user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { modo: (data?.assinatura_modo as AssinaturaModo) || 'sem', nome: data?.assinatura_nome ?? '' };
    },
  });
}

/* ===================== Ações (mutações) ===================== */
export function useAtendimentoActions() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const org = currentOrg.id;

  const invalStatus = () => qc.invalidateQueries({ queryKey: ['status-defs', org] });
  const invalEtq = () => qc.invalidateQueries({ queryKey: ['etiquetas', org] });
  const invalConv = () => qc.invalidateQueries({ queryKey: ['wa-conversas', org] });
  const invalContatos = () => qc.invalidateQueries({ queryKey: ['contatos', org] });
  const invalPref = () => qc.invalidateQueries({ queryKey: ['assinatura-pref', org, user?.id] });

  /* ---------- STATUS ---------- */
  async function criarStatus(nome: string, cor: string) {
    const ordem = (mockStatus.reduce((m, s) => Math.max(m, s.ordem), -1)) + 1;
    if (!WA_REAL || !supabase) {
      mockStatus = [...mockStatus, { id: uid(), slug: slugify(nome) + '-' + randomSuffix(), nome, cor, ordem, padrao: false, ativo: true, sistema: false }];
      invalStatus(); return;
    }
    const { data: maxRow } = await supabase.from('conversa_status_def').select('ordem').eq('organizacao_id', org).order('ordem', { ascending: false }).limit(1).maybeSingle();
    const nextOrdem = ((maxRow?.ordem as number) ?? -1) + 1;
    const { error } = await supabase.from('conversa_status_def').insert({
      organizacao_id: org, slug: slugify(nome) + '-' + randomSuffix(), nome, cor, ordem: nextOrdem, padrao: false, ativo: true, sistema: false,
    });
    if (error) throw new Error(error.message);
    invalStatus();
  }

  async function atualizarStatus(id: string, patch: Partial<Pick<StatusDef, 'nome' | 'cor' | 'ativo'>>) {
    if (!WA_REAL || !supabase) { mockStatus = mockStatus.map((s) => s.id === id ? { ...s, ...patch } : s); invalStatus(); return; }
    const { error } = await supabase.from('conversa_status_def').update({ ...patch, atualizado_em: new Date().toISOString() }).eq('id', id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalStatus();
  }

  async function definirStatusPadrao(id: string) {
    if (!WA_REAL || !supabase) { mockStatus = mockStatus.map((s) => ({ ...s, padrao: s.id === id })); invalStatus(); return; }
    const e1 = await supabase.from('conversa_status_def').update({ padrao: false }).eq('organizacao_id', org).neq('id', id);
    if (e1.error) throw new Error(e1.error.message);
    const e2 = await supabase.from('conversa_status_def').update({ padrao: true, ativo: true }).eq('id', id).eq('organizacao_id', org);
    if (e2.error) throw new Error(e2.error.message);
    invalStatus();
  }

  async function reordenarStatus(idsEmOrdem: string[]) {
    if (!WA_REAL || !supabase) {
      const pos = new Map(idsEmOrdem.map((id, i) => [id, i] as const));
      mockStatus = mockStatus.map((s) => pos.has(s.id) ? { ...s, ordem: pos.get(s.id)! } : s);
      invalStatus(); return;
    }
    await Promise.all(idsEmOrdem.map((id, i) => supabase!.from('conversa_status_def').update({ ordem: i }).eq('id', id).eq('organizacao_id', org)));
    invalStatus();
  }

  /** Exclui um status; se estiver em uso, reatribui as conversas ao substituto antes. */
  async function excluirStatus(id: string, substitutoId: string | null) {
    if (!WA_REAL || !supabase) { mockStatus = mockStatus.filter((s) => s.id !== id); invalStatus(); return; }
    if (substitutoId) {
      const reassign = await supabase.from('conversas').update({ status_id: substitutoId }).eq('organizacao_id', org).eq('status_id', id);
      if (reassign.error) throw new Error(reassign.error.message);
    }
    const { error } = await supabase.from('conversa_status_def').delete().eq('id', id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalStatus(); invalConv();
  }

  /** Conta quantas conversas usam um status (para exigir substituto na exclusão). */
  async function contarConversasComStatus(id: string): Promise<number> {
    if (!WA_REAL || !supabase) return 0;
    const { count, error } = await supabase.from('conversas').select('id', { count: 'exact', head: true }).eq('organizacao_id', org).eq('status_id', id);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async function definirStatusConversa(conversaId: string, statusId: string) {
    if (!WA_REAL || !supabase) { invalConv(); return; }
    const { error } = await supabase.from('conversas').update({ status_id: statusId }).eq('id', conversaId).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalConv();
  }

  /* ---------- ETIQUETAS ---------- */
  async function criarEtiqueta(nome: string, cor: string, descricao: string | null) {
    const nm = nome.trim();
    if (!nm) throw new Error('Informe o nome da etiqueta.');
    const ordem = (mockEtq.reduce((m, e) => Math.max(m, e.ordem), -1)) + 1;
    if (!WA_REAL || !supabase) {
      if (mockEtq.some((e) => e.nome.trim().toLowerCase() === nm.toLowerCase())) throw new Error('Já existe uma etiqueta com esse nome.');
      mockEtq = [...mockEtq, { id: uid(), nome: nm, cor, descricao, ordem, ativo: true }]; invalEtq(); return;
    }
    const { data: maxRow } = await supabase.from('etiquetas').select('ordem').eq('organizacao_id', org).order('ordem', { ascending: false }).limit(1).maybeSingle();
    const nextOrdem = ((maxRow?.ordem as number) ?? -1) + 1;
    const { error } = await supabase.from('etiquetas').insert({ organizacao_id: org, nome: nm, cor, descricao, ordem: nextOrdem, ativo: true });
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'Já existe uma etiqueta com esse nome.' : error.message);
    invalEtq();
  }

  async function atualizarEtiqueta(id: string, patch: Partial<Pick<Etiqueta, 'nome' | 'cor' | 'descricao' | 'ativo'>>) {
    if (!WA_REAL || !supabase) { mockEtq = mockEtq.map((e) => e.id === id ? { ...e, ...patch } : e); invalEtq(); return; }
    const { error } = await supabase.from('etiquetas').update({ ...patch, atualizado_em: new Date().toISOString() }).eq('id', id).eq('organizacao_id', org);
    if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'Já existe uma etiqueta com esse nome.' : error.message);
    invalEtq();
  }

  async function excluirEtiqueta(id: string) {
    if (!WA_REAL || !supabase) { mockEtq = mockEtq.filter((e) => e.id !== id); invalEtq(); return; }
    const { error } = await supabase.from('etiquetas').delete().eq('id', id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalEtq();
  }

  async function definirEtiquetasConversa(conversaId: string, nomes: string[]) {
    if (!WA_REAL || !supabase) { invalConv(); return; }
    const { error } = await supabase.from('conversas').update({ etiquetas: nomes }).eq('id', conversaId).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalConv();
  }

  async function definirEtiquetasContato(contatoId: string, nomes: string[]) {
    if (!WA_REAL || !supabase) { invalContatos(); return; }
    const { error } = await supabase.from('contatos').update({ etiquetas: nomes }).eq('id', contatoId).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalContatos();
  }

  /* ---------- CONTATO (edição pelo painel Dados do cliente) ---------- */
  async function atualizarContato(contatoId: string, patch: { nome?: string; email?: string | null; observacoes?: string | null; responsavel_id?: string | null }) {
    if (!WA_REAL || !supabase) { invalConv(); invalContatos(); return; }
    const { error } = await supabase.from('contatos').update(patch).eq('id', contatoId).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalConv(); invalContatos();
  }

  /* ---------- ASSINATURA (preferência por usuário) ---------- */
  async function salvarAssinatura(pref: AssinaturaPref) {
    if (!WA_REAL || !supabase || !user) { mockPref = { ...pref }; invalPref(); return; }
    const { error } = await supabase.from('organizacao_usuarios')
      .update({ assinatura_modo: pref.modo, assinatura_nome: pref.nome || null })
      .eq('organizacao_id', org).eq('usuario_id', user.id);
    if (error) throw new Error(error.message);
    invalPref();
  }

  return {
    criarStatus, atualizarStatus, definirStatusPadrao, reordenarStatus, excluirStatus, contarConversasComStatus, definirStatusConversa,
    criarEtiqueta, atualizarEtiqueta, excluirEtiqueta, definirEtiquetasConversa, definirEtiquetasContato,
    atualizarContato,
    salvarAssinatura,
  };
}

/** Resolve o nome de assinatura a partir da preferência + contexto. */
export function resolverNomeAssinatura(pref: AssinaturaPref, atendente: string, empresa: string): string {
  switch (pref.modo) {
    case 'atendente': return atendente.trim();
    case 'empresa': return empresa.trim();
    case 'personalizado': return pref.nome.trim();
    default: return '';
  }
}
