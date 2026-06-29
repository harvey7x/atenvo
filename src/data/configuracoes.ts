import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';

export const CFG_REAL = isSupabaseConfigured && !!supabase;
type Row = Record<string, unknown>;

/* ===================== Perfil ===================== */
export interface MeuPerfil { id: string; nome: string; email: string; telefone: string; cargo: string; avatarUrl: string | null; }
export function useMeuPerfil() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['cfg-perfil', user?.id], enabled: CFG_REAL && !!user,
    queryFn: async (): Promise<MeuPerfil> => {
      const { data, error } = await supabase!.from('usuarios').select('id, nome, email, telefone, cargo, avatar_url').eq('id', user!.id).maybeSingle();
      if (error) throw new Error(error.message);
      const r = (data as Row) || {};
      return { id: user!.id, nome: (r.nome as string) || '', email: user!.email || (r.email as string) || '', telefone: (r.telefone as string) || '', cargo: (r.cargo as string) || '', avatarUrl: (r.avatar_url as string) || null };
    },
  });
}
export function useSalvarPerfil() {
  const qc = useQueryClient(); const { user } = useAuth();
  return useMutation({
    mutationFn: async (p: { nome: string; telefone: string; cargo: string; avatarUrl?: string | null }) => {
      const { error } = await supabase!.rpc('atualizar_perfil', { p_nome: p.nome, p_telefone: p.telefone || null, p_cargo: p.cargo || null, p_avatar_url: p.avatarUrl === undefined ? undefined : (p.avatarUrl || null) });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cfg-perfil', user?.id] }),
  });
}
/** Atualiza só o avatar (alterar/remover foto), sem mexer no resto. */
export async function salvarAvatar(perfil: MeuPerfil, avatarUrl: string | null) {
  const { error } = await supabase!.rpc('atualizar_perfil', { p_nome: perfil.nome || 'Usuário', p_telefone: perfil.telefone || null, p_cargo: perfil.cargo || null, p_avatar_url: avatarUrl });
  if (error) throw new Error(error.message);
}
/** Upload de avatar no bucket privado; retorna o path salvo em avatar_url. */
export async function subirAvatar(orgId: string, uid: string, file: File): Promise<string> {
  const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5);
  const path = `${orgId}/avatars/${uid}-${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase!.storage.from('script-midia').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);
  return path;
}
export async function urlAvatar(path: string | null): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data } = await supabase!.storage.from('script-midia').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/* ===================== Organização ===================== */
export interface OrgFull { id: string; nome: string; nomeFantasia: string; documento: string; telefone: string; email: string; timezone: string; moeda: string; logoUrl: string | null; }
export function useOrgFull() {
  const { currentOrg } = useOrg(); const org = currentOrg.id;
  return useQuery({
    queryKey: ['cfg-org', org], enabled: CFG_REAL,
    queryFn: async (): Promise<OrgFull> => {
      const { data, error } = await supabase!.from('organizacoes').select('id, nome, nome_fantasia, documento, telefone, email, timezone, moeda, logo_url').eq('id', org).maybeSingle();
      if (error) throw new Error(error.message);
      const r = (data as Row) || {};
      return { id: org, nome: (r.nome as string) || '', nomeFantasia: (r.nome_fantasia as string) || '', documento: (r.documento as string) || '', telefone: (r.telefone as string) || '', email: (r.email as string) || '', timezone: (r.timezone as string) || 'America/Sao_Paulo', moeda: (r.moeda as string) || 'BRL', logoUrl: (r.logo_url as string) || null };
    },
  });
}
export function useSalvarOrg() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (o: { nome: string; nomeFantasia: string; documento: string; telefone: string; email: string; timezone: string; moeda: string }) => {
      const { error } = await supabase!.rpc('atualizar_organizacao', { p_org: currentOrg.id, p_nome: o.nome, p_nome_fantasia: o.nomeFantasia || null, p_documento: o.documento || null, p_telefone: o.telefone || null, p_email: o.email || null, p_timezone: o.timezone, p_moeda: o.moeda });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cfg-org', currentOrg.id] }),
  });
}

/* ===================== Equipe ===================== */
export interface Membro { id: string; nome: string; email: string; papel: string; status: string; }
export function useMembros() {
  const { currentOrg } = useOrg(); const org = currentOrg.id;
  return useQuery({
    queryKey: ['cfg-membros', org], enabled: CFG_REAL,
    queryFn: async (): Promise<Membro[]> => {
      const { data, error } = await supabase!.from('organizacao_usuarios').select('usuario_id, papel, status, usuarios(nome, email)').eq('organizacao_id', org);
      if (error) throw new Error(error.message);
      return ((data as Row[]) ?? []).map((r) => { const u = Array.isArray(r.usuarios) ? (r.usuarios[0] as Row) : (r.usuarios as Row); return { id: r.usuario_id as string, nome: (u?.nome as string) || '—', email: (u?.email as string) || '', papel: r.papel as string, status: r.status as string }; })
        .sort((a, b) => (a.papel === 'admin' ? -1 : 1) - (b.papel === 'admin' ? -1 : 1) || a.nome.localeCompare(b.nome));
    },
  });
}
export function useEquipeActions() {
  const qc = useQueryClient(); const { currentOrg } = useOrg(); const org = currentOrg.id;
  const inval = () => qc.invalidateQueries({ queryKey: ['cfg-membros', org] });
  const call = async (fn: string, args: Record<string, unknown>) => { const { error, data } = await supabase!.rpc(fn, args); if (error) throw new Error(error.message); return data; };
  return {
    alterarPapel: async (usuario: string, papel: string) => { await call('equipe_alterar_papel', { p_org: org, p_usuario: usuario, p_papel: papel }); inval(); },
    definirStatus: async (usuario: string, status: string) => { await call('equipe_definir_status', { p_org: org, p_usuario: usuario, p_status: status }); inval(); },
    remover: async (usuario: string) => { await call('equipe_remover_membro', { p_org: org, p_usuario: usuario }); inval(); },
    convidar: async (email: string, nome: string, papel: string) => { await call('convidar_membro', { p_org: org, p_email: email, p_nome: nome, p_papel: papel }); inval(); },
  };
}

/* ===================== Preferências (por usuário) ===================== */
export interface Prefs {
  notif_email: Record<string, boolean>; notif_app: Record<string, boolean>;
  tema?: 'light' | 'dark' | 'system'; idioma?: string; formato_data?: string; densidade?: 'confortavel' | 'compacta'; pagina_inicial?: string; mostrar_dicas?: boolean; sons?: boolean;
}
export const PREFS_PADRAO: Prefs = { notif_email: {}, notif_app: {}, idioma: 'pt-BR', formato_data: 'dd/MM/yyyy', densidade: 'confortavel', pagina_inicial: '/whatsapp', mostrar_dicas: true, sons: true };
export function usePreferencias() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['cfg-prefs', user?.id], enabled: CFG_REAL && !!user, staleTime: 60_000,
    queryFn: async (): Promise<Prefs> => {
      const { data, error } = await supabase!.from('usuario_preferencias').select('prefs').eq('usuario_id', user!.id).maybeSingle();
      if (error) throw new Error(error.message);
      const p = ((data as Row)?.prefs as Partial<Prefs>) || {};
      return { ...PREFS_PADRAO, ...p, notif_email: { ...(p.notif_email || {}) }, notif_app: { ...(p.notif_app || {}) } };
    },
  });
}
export function useSalvarPreferencias() {
  const qc = useQueryClient(); const { user } = useAuth();
  return useMutation({
    mutationFn: async (prefs: Prefs) => { const { error } = await supabase!.rpc('salvar_preferencias', { p_prefs: prefs }); if (error) throw new Error(error.message); },
    onSuccess: (_d, prefs) => qc.setQueryData(['cfg-prefs', user?.id], prefs),
  });
}

/* ===================== Atendimento (config por organização) ===================== */
export interface ConfigAtendimento { horario_inicio: string; horario_fim: string; dias: number[]; tempo_sem_resposta_min: number; mensagem_fora_horario: string; status_padrao: string; tempo_inatividade_min: number; }
export const ATEND_PADRAO: ConfigAtendimento = { horario_inicio: '08:00', horario_fim: '18:00', dias: [1, 2, 3, 4, 5], tempo_sem_resposta_min: 30, mensagem_fora_horario: '', status_padrao: '', tempo_inatividade_min: 60 };
export function useConfigAtendimento() {
  const { currentOrg } = useOrg(); const org = currentOrg.id;
  return useQuery({
    queryKey: ['cfg-atendimento', org], enabled: CFG_REAL,
    queryFn: async (): Promise<ConfigAtendimento> => {
      const { data, error } = await supabase!.from('configuracoes').select('valor').eq('organizacao_id', org).eq('chave', 'atendimento').maybeSingle();
      if (error) throw new Error(error.message);
      return { ...ATEND_PADRAO, ...(((data as Row)?.valor as Partial<ConfigAtendimento>) || {}) };
    },
  });
}
export function useSalvarConfigAtendimento() {
  const qc = useQueryClient(); const { currentOrg } = useOrg(); const org = currentOrg.id;
  return useMutation({
    mutationFn: async (cfg: ConfigAtendimento) => { const { error } = await supabase!.from('configuracoes').upsert({ organizacao_id: org, chave: 'atendimento', valor: cfg, atualizado_em: new Date().toISOString() }, { onConflict: 'organizacao_id,chave' }); if (error) throw new Error(error.message); },
    onSuccess: (_d, cfg) => qc.setQueryData(['cfg-atendimento', org], cfg),
  });
}

/** Tradução de erros das RPCs para PT-BR. */
export function traduzCfg(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('sem_permissao') || m.includes('row-level') || m.includes('permission')) return 'Você não tem permissão para esta ação.';
  if (m.includes('ultimo_admin')) return 'Não é possível: deixaria a organização sem administrador.';
  if (m.includes('proprio')) return 'Você não pode fazer isso com a própria conta.';
  if (m.includes('usuario_sem_conta_atenvo')) return 'Esse e-mail ainda não tem conta na Atenvo. O envio de convite por e-mail será habilitado quando a integração de envio estiver ativa.';
  if (m.includes('ja_membro')) return 'Esse usuário já faz parte da organização.';
  if (m.includes('papel_invalido')) return 'Papel inválido.';
  return msg || 'Falha na operação.';
}
