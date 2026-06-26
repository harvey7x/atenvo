import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

export const FB_REAL = isSupabaseConfigured && !!supabase;

/* ===================== Chamada às Edge Functions (erros legíveis) ===================== */
async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try {
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      if (ctx?.json) { const j = (await ctx.json()) as { error?: string; message?: string } | null; if (j?.error) msg = j.message || j.error; }
    } catch { /* mantém msg padrão */ }
    throw new Error(msg);
  }
  return data as T;
}

/* ===================== Conexão (OAuth da Página) ===================== */
export const fbAuthStart = () => invoke<{ url: string }>('meta-auth-start', {});
export const fbPages = (codigo: string) => invoke<{ paginas: { id: string; nome: string }[] }>('meta-pages', { codigo });
export const fbConnect = (codigo: string, paginaId: string) =>
  invoke<{ ok: boolean; pagina_nome: string; canal_id: string }>('meta-manage', { action: 'connect', codigo, pagina_id: paginaId });
export const fbDisconnect = (canalId: string) => invoke<{ ok: boolean }>('meta-manage', { action: 'disconnect', canal_id: canalId });

export interface FbPaginaStatus {
  id: string; pagina_id: string; pagina_nome: string | null; estado: string; canal_id: string;
  webhook_assinado: boolean; token_status: string | null; expires_at: string | null; conectado_em: string | null;
}
export function useFbStatus() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['fb-status', currentOrg.id],
    enabled: FB_REAL,
    queryFn: () => invoke<{ paginas: FbPaginaStatus[] }>('meta-manage', { action: 'status' }).then((r) => r.paginas),
  });
}

/* ===================== Inbox (conversas do Facebook) ===================== */
export interface FbMsg { dir: 'in' | 'out'; text: string; time: string; status?: string; origem?: string | null; id?: string; tipo?: string; anexoPath?: string | null; etapaId?: string | null; erro?: string | null; tamanho?: number | null; mime?: string | null; }
export interface FbConv {
  id: string; name: string; email: string; notes: string;
  status: string; statusId: string | null; statusCor: string | null;
  tags: string[]; respId: string | null; contatoId: string | null;
  canalId: string | null; paginaNome: string; time: string; unread: number; last: string; lastInter: string;
  origin: string; tabs: string[]; msgs: FbMsg[];
}

function hhmm(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}
const STATUS_LABEL: Record<string, string> = { aberta: 'Aberta', em_atendimento: 'Em atendimento', pendente: 'Pendente', resolvida: 'Resolvida', fechada: 'Fechada' };

interface DbMsg { id: string; direcao: string; conteudo: string | null; enviada_em: string | null; recebida_em: string | null; criado_em: string | null; origem: string | null; status: string | null; tipo: string | null; erro_envio: string | null; metadados: { anexo_path?: string | null; etapa_id?: string | null; tamanho?: number | null; mime?: string | null } | null; }
interface DbConv {
  id: string; status: string; status_id: string | null; nao_lidas: number | null; ultima_interacao_em: string | null; etiquetas: string[] | null;
  contatos: { id: string; nome: string; email: string | null; etiquetas: string[] | null; origem: string | null; observacoes: string | null; responsavel_id: string | null } | null;
  canais: { id: string; nome_interno: string | null } | null;
  mensagens: DbMsg[] | null;
}
function tsOf(m: DbMsg): number { return new Date(m.recebida_em || m.enviada_em || m.criado_em || 0).getTime(); }

function mapConversa(c: DbConv): FbConv {
  const msgs: FbMsg[] = (c.mensagens ?? [])
    .filter((m) => (m.conteudo ?? '').length > 0 || !!m.metadados?.anexo_path)
    .sort((a, b) => tsOf(a) - tsOf(b))
    .map((m) => ({
      dir: m.direcao === 'saida' ? 'out' : 'in', text: m.conteudo ?? '', time: hhmm(m.recebida_em || m.enviada_em || m.criado_em),
      status: m.status ?? undefined, origem: m.origem, id: m.id, tipo: m.tipo ?? 'texto',
      anexoPath: m.metadados?.anexo_path ?? null, etapaId: m.metadados?.etapa_id ?? null, erro: m.erro_envio ?? null,
      tamanho: m.metadados?.tamanho ?? null, mime: m.metadados?.mime ?? null,
    }));
  const last = msgs[msgs.length - 1];
  return {
    id: c.id,
    name: c.contatos?.nome ?? 'Cliente Facebook',
    email: c.contatos?.email ?? '',
    notes: c.contatos?.observacoes ?? '',
    status: STATUS_LABEL[c.status] ?? c.status,
    statusId: c.status_id ?? null,
    statusCor: null,
    tags: c.contatos?.etiquetas ?? [], // etiqueta e do CONTATO (persiste e aparece em todas as conversas dele)
    respId: c.contatos?.responsavel_id ?? null,
    contatoId: c.contatos?.id ?? null,
    canalId: c.canais?.id ?? null,
    paginaNome: c.canais?.nome_interno ?? 'Página',
    time: hhmm(c.ultima_interacao_em) || (last?.time ?? ''),
    unread: c.nao_lidas ?? 0,
    last: last?.text ?? '',
    lastInter: c.ultima_interacao_em ? new Date(c.ultima_interacao_em).toLocaleString('pt-BR') : '',
    origin: c.contatos?.origem ?? 'Facebook',
    tabs: ['todas'],
    msgs,
  };
}

export function useFbConversations() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const orgId = currentOrg.id;

  const query = useQuery({
    queryKey: ['fb-conversas', orgId],
    enabled: FB_REAL,
    refetchInterval: 6000,
    queryFn: async (): Promise<FbConv[]> => {
      const { data, error } = await supabase!
        .from('conversas')
        .select('id, status, status_id, nao_lidas, ultima_interacao_em, etiquetas, contatos!inner(id, nome, email, etiquetas, origem, observacoes, responsavel_id), canais!conversas_canal_id_fkey!inner(id, nome_interno, tipo), mensagens(id, direcao, conteudo, enviada_em, recebida_em, criado_em, origem, status, tipo, erro_envio, metadados)')
        .eq('organizacao_id', orgId)
        .eq('canais.tipo', 'facebook')
        .order('ultima_interacao_em', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as unknown as DbConv[]) ?? []).map(mapConversa);
    },
  });

  useEffect(() => {
    if (!FB_REAL) return;
    const ch = supabase!
      .channel(`fb-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens', filter: `organizacao_id=eq.${orgId}` }, () => qc.invalidateQueries({ queryKey: ['fb-conversas', orgId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversas', filter: `organizacao_id=eq.${orgId}` }, () => qc.invalidateQueries({ queryKey: ['fb-conversas', orgId] }))
      .subscribe();
    return () => { supabase!.removeChannel(ch); };
  }, [orgId, qc]);

  return query;
}

export function useSendFbMessage() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { conversaId: string; texto: string }) => invoke<{ ok: boolean; message_id: string }>('meta-send-message', { conversa_id: input.conversaId, texto: input.texto }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['fb-conversas', currentOrg.id] }),
  });
}

const ERRO_MIDIA: Record<string, string> = {
  anexo_invalido: 'Anexo inválido ou de outra organização.', tipo_incompativel: 'Tipo de arquivo não suportado no Messenger.',
  arquivo_grande: 'Arquivo acima do limite (25 MB).', falha_url_assinada: 'Não foi possível gerar o link temporário do arquivo.',
  sem_message_id: 'A Meta não retornou um identificador de mensagem.', token_invalido: 'Token da Página inválido. Reconecte em Integrações.',
  canal_desconectado: 'Página desconectada.', pagina_desconectada: 'Página desconectada.', sem_psid: 'Contato sem PSID nesta Página.',
};
const traduzMidia = (e: string) => ERRO_MIDIA[e] ?? e;

/** Sobe um áudio gravado no microfone para o bucket privado (sob o prefixo da org). */
export async function subirAudioGravado(orgId: string, blob: Blob, ext: string, mime: string): Promise<{ path: string; nome: string; tamanho: number }> {
  const nome = `gravacao-${Date.now()}.${ext}`;
  const path = `${orgId}/inbox-audio/${crypto.randomUUID()}.${ext}`;
  const up = await supabase!.storage.from('script-midia').upload(path, blob, { contentType: mime, upsert: false });
  if (up.error) throw new Error(up.error.message);
  return { path, nome, tamanho: blob.size };
}

/** Sobe uma mídia manual (imagem/vídeo/documento) para o bucket privado (sob o prefixo da org). */
export async function subirMidiaInbox(orgId: string, file: File): Promise<{ path: string; nome: string; tamanho: number; mime: string }> {
  const safe = (file.name || 'arquivo').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80) || 'arquivo';
  const path = `${orgId}/inbox-midia/${crypto.randomUUID()}-${safe}`;
  const up = await supabase!.storage.from('script-midia').upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (up.error) throw new Error(up.error.message);
  return { path, nome: file.name || safe, tamanho: file.size, mime: file.type || 'application/octet-stream' };
}

/** Envia MÍDIA via meta-send-message: etapa de script, áudio gravado OU mídia manual (path direto). Lança em falha REAL. */
export function useSendFbMedia() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversaId: string; etapaId?: string; texto?: string; audioPath?: string; audioMime?: string; audioNome?: string; audioTamanho?: number; midiaPath?: string; midiaTipo?: string; midiaMime?: string; midiaNome?: string; midiaTamanho?: number }) => {
      type Res = { ok?: boolean; error?: string; message_id?: string };
      type Body = { ok?: boolean; error?: string; resultados?: { texto?: Res; anexo?: Res } };
      const body: Record<string, unknown> = { conversa_id: input.conversaId, ...(input.texto && input.texto.trim() ? { texto: input.texto } : {}) };
      if (input.etapaId) body.etapa_id = input.etapaId;
      if (input.audioPath) { body.audio_path = input.audioPath; body.audio_mime = input.audioMime; body.audio_nome = input.audioNome; body.audio_tamanho = input.audioTamanho; }
      if (input.midiaPath) { body.midia_path = input.midiaPath; body.midia_tipo = input.midiaTipo; body.midia_mime = input.midiaMime; body.midia_nome = input.midiaNome; body.midia_tamanho = input.midiaTamanho; }
      const { data, error } = await supabase!.functions.invoke('meta-send-message', { body });
      let payload = data as Body | null;
      // em não-2xx o corpo vem em error.context — lê para extrair o erro real do provedor
      if (error) { try { payload = await (error as unknown as { context: Response }).context.json(); } catch { payload = null; } }
      const anexo = payload?.resultados?.anexo;
      if (!anexo?.ok) throw new Error(traduzMidia(anexo?.error || payload?.error || 'Falha ao enviar a mídia.'));
      const cap = payload?.resultados?.texto;
      if (input.texto && input.texto.trim() && cap && !cap.ok) throw new Error('Mídia enviada, mas a legenda falhou: ' + traduzMidia(cap.error || ''));
      return { messageId: anexo.message_id };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['fb-conversas', currentOrg.id] }),
  });
}
