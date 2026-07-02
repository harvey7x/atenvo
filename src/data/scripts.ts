import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';
import { useAuth } from '@/context/AuthContext';

export const SCRIPTS_REAL = isSupabaseConfigured && !!supabase;

export type CanalScript = 'whatsapp' | 'facebook';

export interface ScriptCategoria { id: string; nome: string; ordem: number; }
export interface Script {
  id: string; titulo: string; descricao: string | null; conteudo: string;
  categoriaId: string | null; canais: string[]; favorito: boolean; ativo: boolean;
  tags: string[]; autorId: string | null; criadoEm: string; atualizadoEm: string;
}

interface DbScript {
  id: string; titulo: string; descricao: string | null; conteudo: string; categoria_id: string | null;
  canais_permitidos: string[] | null; favorito: boolean; ativo: boolean; tags: string[] | null;
  autor_id: string | null; criado_em: string; atualizado_em: string;
}
function mapScript(r: DbScript): Script {
  return {
    id: r.id, titulo: r.titulo, descricao: r.descricao, conteudo: r.conteudo, categoriaId: r.categoria_id,
    canais: r.canais_permitidos ?? [], favorito: r.favorito, ativo: r.ativo, tags: r.tags ?? [],
    autorId: r.autor_id, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em,
  };
}
const COLS = 'id,titulo,descricao,conteudo,categoria_id,canais_permitidos,favorito,ativo,tags,autor_id,criado_em,atualizado_em';

/* ===================== Categorias ===================== */
export function useScriptCategorias() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['script-categorias', currentOrg.id],
    enabled: SCRIPTS_REAL,
    queryFn: async (): Promise<ScriptCategoria[]> => {
      const { data, error } = await supabase!.from('script_categorias').select('id,nome,ordem')
        .eq('organizacao_id', currentOrg.id).order('ordem', { ascending: true }).order('nome', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ScriptCategoria[];
    },
  });
}

export function useScriptCategoriaMutations() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ['script-categorias', currentOrg.id] });
  return {
    criar: useMutation({
      mutationFn: async (nome: string) => {
        const { error } = await supabase!.from('script_categorias').insert({ nome: nome.trim(), organizacao_id: currentOrg.id });
        if (error) throw new Error(error.message);
      },
      onSuccess: inval,
    }),
  };
}

/* ===================== Scripts ===================== */
/** Lista os scripts da organização. Passe `canal` para filtrar os utilizáveis num canal
 *  (ativos e com o canal em canais_permitidos, ou sem restrição de canal). */
export function useScripts(canal?: CanalScript) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['scripts', currentOrg.id, canal ?? 'all'],
    enabled: SCRIPTS_REAL,
    queryFn: async (): Promise<Script[]> => {
      const { data, error } = await supabase!.from('scripts').select(COLS)
        .eq('organizacao_id', currentOrg.id)
        .order('favorito', { ascending: false }).order('atualizado_em', { ascending: false });
      if (error) throw new Error(error.message);
      let list = ((data as unknown as DbScript[]) ?? []).map(mapScript);
      if (canal) list = list.filter((s) => s.ativo && (s.canais.length === 0 || s.canais.includes(canal)));
      return list;
    },
  });
}

export function useScriptMutations() {
  const { currentOrg } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  const inval = () => qc.invalidateQueries({ queryKey: ['scripts', currentOrg.id] });
  return {
    criar: useMutation({
      mutationFn: async (s: { titulo: string; conteudo: string; canais: string[]; categoriaId?: string | null; descricao?: string | null; tags?: string[]; favorito?: boolean; ativo?: boolean }) => {
        const { data, error } = await supabase!.from('scripts').insert({
          titulo: s.titulo.trim() || 'Novo script', conteudo: s.conteudo, canais_permitidos: s.canais,
          categoria_id: s.categoriaId ?? null, descricao: s.descricao ?? null, tags: s.tags ?? [],
          favorito: s.favorito ?? false, ativo: s.ativo ?? true, autor_id: user?.id ?? null, organizacao_id: currentOrg.id,
        }).select('id').single();
        if (error) throw new Error(error.message);
        return data as { id: string };
      },
      onSuccess: inval,
    }),
    atualizar: useMutation({
      mutationFn: async (s: { id: string; patch: Record<string, unknown> }) => {
        const { error } = await supabase!.from('scripts').update({ ...s.patch, atualizado_em: new Date().toISOString() })
          .eq('id', s.id).eq('organizacao_id', currentOrg.id);
        if (error) throw new Error(error.message);
      },
      onSuccess: inval,
    }),
    excluir: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase!.from('scripts').delete().eq('id', id).eq('organizacao_id', currentOrg.id);
        if (error) throw new Error(error.message);
      },
      onSuccess: inval,
    }),
    favoritar: useMutation({
      mutationFn: async (s: { id: string; favorito: boolean }) => {
        const { error } = await supabase!.from('scripts').update({ favorito: s.favorito }).eq('id', s.id).eq('organizacao_id', currentOrg.id);
        if (error) throw new Error(error.message);
      },
      onSuccess: inval,
    }),
  };
}

/* ===================== Variáveis ===================== */
// Fonte única de interpolação (prévia, modal de envio, envio unitário, sequência, WhatsApp e Facebook).
// `atendente` deve vir SEMPRE de usuarios.nome (resolvido no AuthContext) — nunca o e-mail.
// O e-mail só aparece quando o template usa explicitamente {{email_atendente}}.
export interface VarCtx { cliente?: string; atendente?: string; emailAtendente?: string; empresa?: string; telefone?: string; }
/** Substitui {{nome_cliente}}, {{primeiro_nome_cliente}}, {{nome_atendente}}/{{seu_nome}},
 *  {{email_atendente}}, {{nome_empresa}}/{{empresa}}, {{telefone}}, {{data_atual}} (e aliases). */
export function substituirVariaveis(texto: string, ctx: VarCtx): string {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const cliente = ctx.cliente ?? '';
  const primeiroNomeCliente = cliente.trim().split(/\s+/)[0] ?? '';
  const atendente = ctx.atendente ?? '';
  const empresa = ctx.empresa ?? '';
  const tabela: Record<string, string> = {
    nome_cliente: cliente, cliente, primeiro_nome_cliente: primeiroNomeCliente,
    nome_atendente: atendente, seu_nome: atendente, atendente,
    email_atendente: ctx.emailAtendente ?? '',
    nome_empresa: empresa, empresa,
    telefone: ctx.telefone ?? '', data_atual: hoje,
  };
  return texto.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, k: string) => {
    const key = k.toLowerCase();
    return key in tabela ? tabela[key] : m;
  });
}

export const SCRIPT_VARIAVEIS = ['{{nome_cliente}}', '{{primeiro_nome_cliente}}', '{{nome_atendente}}', '{{email_atendente}}', '{{nome_empresa}}', '{{telefone}}', '{{data_atual}}'];

/* ===================== Mídia / Anexos (Supabase Storage privado) ===================== */
export const SCRIPT_BUCKET = 'script-midia';
export type AnexoTipo = 'imagem' | 'video' | 'audio' | 'documento';
export interface ScriptAnexo { id: string; scriptId: string; tipo: AnexoTipo; nome: string; mime: string; tamanho: number; path: string; }

interface DbAnexo { id: string; script_id: string; tipo: AnexoTipo; nome_arquivo: string | null; mime_type: string | null; tamanho_bytes: number | null; storage_path: string; }
function mapAnexo(r: DbAnexo): ScriptAnexo { return { id: r.id, scriptId: r.script_id, tipo: r.tipo, nome: r.nome_arquivo ?? 'arquivo', mime: r.mime_type ?? '', tamanho: r.tamanho_bytes ?? 0, path: r.storage_path }; }

export function tipoDoMime(mime: string): AnexoTipo {
  if (mime.startsWith('image/')) return 'imagem';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'documento';
}

/** Matriz explícita de compatibilidade de mídia por canal (tipos + tamanho máximo). */
export interface CanalMidiaRegra { tipos: AnexoTipo[]; maxBytes: Record<AnexoTipo, number>; }
const MB = 1024 * 1024;
export const CANAL_MIDIA: Record<CanalScript, CanalMidiaRegra> = {
  whatsapp: { tipos: ['imagem', 'video', 'audio', 'documento'], maxBytes: { imagem: 5 * MB, video: 16 * MB, audio: 16 * MB, documento: 100 * MB } },
  facebook: { tipos: ['imagem', 'video', 'audio', 'documento'], maxBytes: { imagem: 25 * MB, video: 25 * MB, audio: 25 * MB, documento: 25 * MB } },
};
/** Valida um anexo para um canal; retorna null se ok ou a mensagem de incompatibilidade. */
export function checarCompatibilidade(canal: CanalScript, tipo: AnexoTipo, bytes: number): string | null {
  const r = CANAL_MIDIA[canal];
  if (!r.tipos.includes(tipo)) return `${tipo} não é suportado no ${canal === 'whatsapp' ? 'WhatsApp' : 'Facebook'}.`;
  if (bytes > r.maxBytes[tipo]) return `Arquivo acima do limite (${Math.round(r.maxBytes[tipo] / MB)} MB) para ${tipo} no ${canal === 'whatsapp' ? 'WhatsApp' : 'Facebook'}.`;
  return null;
}
const MAX_GERAL = 100 * MB;

export function useScriptAnexos(scriptId: string | null) {
  return useQuery({
    queryKey: ['script-anexos', scriptId],
    enabled: SCRIPTS_REAL && !!scriptId,
    queryFn: async (): Promise<ScriptAnexo[]> => {
      const { data, error } = await supabase!.from('script_anexos').select('id,script_id,tipo,nome_arquivo,mime_type,tamanho_bytes,storage_path').eq('script_id', scriptId!).order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as unknown as DbAnexo[]) ?? []).map(mapAnexo);
    },
  });
}

export function useScriptAnexoMutations() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return {
    upload: useMutation({
      mutationFn: async (a: { scriptId: string; file: File }) => {
        if (a.file.size > MAX_GERAL) throw new Error('Arquivo acima de 100 MB.');
        const tipo = tipoDoMime(a.file.type || '');
        const safe = a.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
        const path = `${currentOrg.id}/${a.scriptId}/${crypto.randomUUID()}-${safe}`;
        const up = await supabase!.storage.from(SCRIPT_BUCKET).upload(path, a.file, { contentType: a.file.type || undefined, upsert: false });
        if (up.error) throw new Error(up.error.message);
        const { error } = await supabase!.from('script_anexos').insert({ script_id: a.scriptId, tipo, nome_arquivo: a.file.name, mime_type: a.file.type || null, tamanho_bytes: a.file.size, storage_path: path, organizacao_id: currentOrg.id });
        if (error) { await supabase!.storage.from(SCRIPT_BUCKET).remove([path]); throw new Error(error.message); }
      },
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['script-anexos', v.scriptId] }),
    }),
    remover: useMutation({
      mutationFn: async (a: ScriptAnexo) => {
        await supabase!.storage.from(SCRIPT_BUCKET).remove([a.path]); // remove o objeto antes da linha
        const { error } = await supabase!.from('script_anexos').delete().eq('id', a.id);
        if (error) throw new Error(error.message);
      },
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['script-anexos', v.scriptId] }),
    }),
  };
}

/** URL assinada (temporária) para visualizar/baixar um anexo privado. */
export async function urlAssinadaAnexo(path: string): Promise<string | null> {
  const { data, error } = await supabase!.storage.from(SCRIPT_BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

/* ===================== Etapas (sequência de mensagens: texto + mídia) ===================== */
export type EtapaTipo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento';
export interface EtapaItem {
  id?: string; tipo: EtapaTipo; conteudo: string; // conteudo = texto OU legenda da mídia
  storagePath?: string | null; nome?: string | null; mime?: string | null; tamanho?: number | null;
  file?: File; // upload pendente (somente no cliente, antes de salvar)
}
interface DbEtapa { id: string; tipo: EtapaTipo; conteudo: string | null; storage_path: string | null; nome_arquivo: string | null; mime_type: string | null; tamanho_bytes: number | null; }

/** Carrega todas as etapas de um script, na ordem. */
export async function fetchEtapas(scriptId: string): Promise<EtapaItem[]> {
  const { data, error } = await supabase!.from('script_etapas')
    .select('id,tipo,conteudo,posicao,storage_path,nome_arquivo,mime_type,tamanho_bytes')
    .eq('script_id', scriptId).order('posicao', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as unknown as DbEtapa[]) ?? []).map((r) => ({
    id: r.id, tipo: r.tipo, conteudo: r.conteudo ?? '',
    storagePath: r.storage_path, nome: r.nome_arquivo, mime: r.mime_type, tamanho: r.tamanho_bytes,
  }));
}

export function useScriptEtapaMutations() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return {
    /** Reconcilia a sequência (texto + mídia): faz uploads + inserts/updates ANTES dos
     *  deletes para nunca deixar o script sem etapas; remove objetos órfãos do Storage. */
    salvarEtapas: useMutation({
      mutationFn: async (a: { scriptId: string; etapas: EtapaItem[] }) => {
        const { data: ex, error: e0 } = await supabase!.from('script_etapas').select('id,storage_path').eq('script_id', a.scriptId);
        if (e0) throw new Error(e0.message);
        const existing = new Map(((ex as { id: string; storage_path: string | null }[]) ?? []).map((r) => [r.id, r.storage_path]));
        const keep = new Set<string>();
        let pos = 1;
        for (const s of a.etapas) {
          let path = s.storagePath ?? null;
          if (s.file) {
            const safe = s.file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
            path = `${currentOrg.id}/${a.scriptId}/${crypto.randomUUID()}-${safe}`;
            const up = await supabase!.storage.from(SCRIPT_BUCKET).upload(path, s.file, { contentType: s.file.type || undefined, upsert: false });
            if (up.error) throw new Error(up.error.message);
          }
          const row = {
            posicao: pos, tipo: s.tipo, conteudo: s.conteudo || null, storage_path: path,
            nome_arquivo: s.nome ?? s.file?.name ?? null, mime_type: s.mime ?? s.file?.type ?? null, tamanho_bytes: s.tamanho ?? s.file?.size ?? null,
          };
          if (s.id && existing.has(s.id)) {
            const { error } = await supabase!.from('script_etapas').update(row).eq('id', s.id);
            if (error) throw new Error(error.message);
            keep.add(s.id);
          } else {
            const { data, error } = await supabase!.from('script_etapas').insert({ ...row, script_id: a.scriptId, organizacao_id: currentOrg.id }).select('id').single();
            if (error) throw new Error(error.message);
            if (data) keep.add((data as { id: string }).id);
          }
          pos++;
        }
        const del = [...existing.keys()].filter((id) => !keep.has(id));
        if (del.length) {
          const paths = del.map((id) => existing.get(id)).filter((p): p is string => !!p);
          if (paths.length) await supabase!.storage.from(SCRIPT_BUCKET).remove(paths);
          const { error } = await supabase!.from('script_etapas').delete().in('id', del);
          if (error) throw new Error(error.message);
        }
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: ['scripts', currentOrg.id] }),
    }),
  };
}

/** Resolve um script como sequência ordenada já com variáveis substituídas (execução futura na conversa). */
export async function resolverSequenciaScript(scriptId: string, ctx: VarCtx): Promise<{ tipo: EtapaTipo; texto: string; storagePath: string | null | undefined }[]> {
  const etapas = await fetchEtapas(scriptId);
  return etapas.map((e) => ({ tipo: e.tipo, texto: substituirVariaveis(e.conteudo, ctx), storagePath: e.storagePath }));
}

/* ===================== Envio de sequência de TEXTO na conversa ===================== */
const VAR_LABEL: Record<string, string> = { nome_cliente: 'Nome do cliente', telefone: 'Telefone', seu_nome: 'Seu nome', empresa: 'Empresa', data_atual: 'Data' };
const VAR_AUSENTE: Record<string, string> = { nome_cliente: '[Nome não informado]', telefone: '[Telefone não informado]', seu_nome: '[Seu nome não informado]', empresa: '[Empresa não informada]', data_atual: '[Data não informada]' };

/** Substitui variáveis e relata quais dados reais estão ausentes (sem deixar token cru). */
export function resolverComFaltas(texto: string, ctx: VarCtx): { texto: string; faltando: string[] } {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const tabela: Record<string, string> = {
    nome_cliente: ctx.cliente ?? '', cliente: ctx.cliente ?? '',
    seu_nome: ctx.atendente ?? '', atendente: ctx.atendente ?? '',
    empresa: ctx.empresa ?? '', telefone: ctx.telefone ?? '', data_atual: hoje,
  };
  const faltando = new Set<string>();
  const out = texto.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, k: string) => {
    const key = k.toLowerCase();
    if (!(key in tabela)) return m;
    const canon = key === 'cliente' ? 'nome_cliente' : key === 'atendente' ? 'seu_nome' : key;
    const val = tabela[key];
    if (!val) { faltando.add(VAR_LABEL[canon] ?? canon); return VAR_AUSENTE[canon] ?? m; }
    return val;
  });
  return { texto: out, faltando: [...faltando] };
}

export interface EtapaResolvida { posicao: number; original: string; texto: string; faltando: string[]; }
/** Etapas de TEXTO (na ordem) já resolvidas para a conversa. Faz fallback para `scripts.conteudo`. */
export async function fetchEtapasTextoResolvidas(scriptId: string, ctx: VarCtx, fallbackConteudo = ''): Promise<EtapaResolvida[]> {
  const etapas = await fetchEtapas(scriptId);
  const textos = etapas.filter((e) => e.tipo === 'texto' && (e.conteudo ?? '').trim().length > 0).map((e) => e.conteudo);
  const base = textos.length ? textos : (fallbackConteudo.trim() ? [fallbackConteudo] : []);
  return base.map((conteudo, i) => { const r = resolverComFaltas(conteudo, ctx); return { posicao: i + 1, original: conteudo, texto: r.texto, faltando: r.faltando }; });
}

export interface EtapaEnvio { posicao: number; tipo: EtapaTipo; texto: string; faltando: string[]; etapaId?: string; nome?: string | null; mime?: string | null; tamanho?: number | null; storagePath?: string | null; }
const MIDIA_ENVIAVEL: EtapaTipo[] = ['imagem', 'audio']; // tipos de mídia suportados no envio (Facebook)
/** Etapas para envio na conversa: texto sempre; mídia suportada quando `incluirMidia` (canal que suporta). */
export async function fetchEtapasParaEnvio(scriptId: string, ctx: VarCtx, opts: { incluirMidia?: boolean; fallbackConteudo?: string } = {}): Promise<EtapaEnvio[]> {
  const etapas = await fetchEtapas(scriptId);
  const incluir = (e: EtapaItem) => e.tipo === 'texto' ? (e.conteudo ?? '').trim().length > 0 : (!!opts.incluirMidia && MIDIA_ENVIAVEL.includes(e.tipo) && !!e.storagePath);
  let lista = etapas.filter(incluir);
  if (lista.length === 0 && (opts.fallbackConteudo ?? '').trim()) lista = [{ tipo: 'texto', conteudo: opts.fallbackConteudo! }];
  return lista.map((e, i) => { const r = resolverComFaltas(e.conteudo ?? '', ctx); return { posicao: i + 1, tipo: e.tipo, texto: r.texto, faltando: r.faltando, etapaId: e.id, nome: e.nome, mime: e.mime, tamanho: e.tamanho, storagePath: e.storagePath }; });
}

/** Contagem de etapas de TEXTO por script (para exibir "N mensagens" no seletor). */
export function useScriptEtapaCounts() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['script-etapa-counts', currentOrg.id],
    enabled: SCRIPTS_REAL,
    queryFn: async () => {
      const { data, error } = await supabase!.from('script_etapas').select('script_id,tipo').eq('organizacao_id', currentOrg.id);
      if (error) throw new Error(error.message);
      const map: Record<string, number> = {};
      for (const r of (data as { script_id: string; tipo: string }[]) ?? []) { if (r.tipo === 'texto') map[r.script_id] = (map[r.script_id] ?? 0) + 1; }
      return map;
    },
  });
}

/** Traduz o erro técnico do provedor (mantido cru no log/console) em mensagem simples ao usuário.
 *  Fonte única usada na bolha de falha e na confirmação da sequência. */
export function traduzErroEnvio(cod?: string | null): string {
  const raw = (cod ?? '').toString().trim();
  if (!raw) return 'A mensagem não pôde ser enviada. Tente novamente.';
  const c = raw.toLowerCase();
  // TIMEOUT / sem confirmação a tempo: o envio pode ter saído; conferir antes de repetir (não afirmar falha).
  if (c.includes('a tempo') || c.includes('timeout') || c.includes('demorou'))
    return 'O envio demorou mais que o esperado. Verifique a conversa antes de tentar novamente.';
  // CONEXÃO não aceitou o envio (sem key.id): a mensagem NÃO saiu.
  if (raw === 'sem_id_externo' || c.includes('sem identificador') || c.includes('não confirmou o envio'))
    return 'A conexão não confirmou o envio (a mensagem não saiu). Tente novamente em alguns minutos.';
  if (c.includes('desconect') || c.includes('reconect') || c.includes('not connect') || /\bclose\b/.test(c))
    return 'WhatsApp desconectado. Reconecte a conexão em Integrações.';
  if (c.includes('(#10)') || c.includes('fora do espaço de tempo') || c.includes('24h') || c.includes('messenger'))
    return 'A janela de 24h do Messenger expirou. O cliente precisa enviar uma nova mensagem antes de você responder.';
  if (c.includes('limit') || c.includes('rate') || c.includes('429'))
    return 'Limite temporário de envio atingido. Tente novamente em alguns minutos.';
  if (c.includes('número') || c.includes('numero') || c.includes('invalid') || c.includes('inválid') || c.includes('nono dígito') || c.includes('ddd'))
    return 'Número de destino inválido. Confira o DDD e o nono dígito.';
  if (c.includes('instância') || c.includes('instancia') || c.includes('não está disponível'))
    return 'O canal precisa ser reconectado à instância correta.';
  // ERROR do WhatsApp: a Evolution ACEITOU (havia key.id) mas o WhatsApp devolveu ERROR na entrega —
  // destino pode não ter WhatsApp, ou remetente recém-conectado limitado no 1º contato. Retry costuma resolver.
  if (c === 'error' || c.startsWith('error') || c.includes('recusou'))
    return 'O WhatsApp recusou a entrega desta mensagem. Confirme se o número tem WhatsApp ativo e tente novamente.';
  return 'O WhatsApp não confirmou a entrega desta mensagem. Verifique a conexão e o número do destinatário.';
}

/**
 * Aguarda a CONFIRMAÇÃO REAL do provedor para uma mensagem já despachada.
 * Resolve só quando o status sai de "pendente" para enviada/entregue/lida; rejeita em "falhou"
 * (entrega recusada) ou se estourar o tempo sem confirmação. É isto que define sucesso de etapa
 * — NUNCA o HTTP 200 da Edge Function (que só significa "requisição aceita").
 */
export async function aguardarConfirmacaoEnvio(mensagemId: string, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<'enviada' | 'entregue' | 'lida'> {
  const timeoutMs = opts.timeoutMs ?? 35000;
  const intervalMs = opts.intervalMs ?? 1500;
  const okSet = ['enviada', 'entregue', 'lida'];
  const inicio = Date.now();
  for (;;) {
    const { data, error } = await supabase!.from('mensagens').select('status, erro_envio').eq('id', mensagemId).maybeSingle();
    if (error) throw new Error(error.message);
    const st = (data?.status ?? 'pendente') as string;
    if (st === 'falhou') {
      const raw = (data?.erro_envio ?? '').toString();
      if (raw) console.error('[envio] falha do provedor (mensagem ' + mensagemId + '):', raw); // técnico completo no log
      throw new Error(traduzErroEnvio(raw));
    }
    if (okSet.includes(st)) return st as 'enviada' | 'entregue' | 'lida';
    if (Date.now() - inicio > timeoutMs) throw new Error('Sem confirmação de envio do provedor a tempo.');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/** Registra a auditoria de um disparo de sequência (uma linha por execução), com o RESULTADO REAL. */
export function useRegistrarExecucaoScript() {
  const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (a: { scriptId: string; conversaId: string; canal: CanalScript; total: number; enviadas: number; entregues: number; falhas: number; ultimaEtapaOk: number; erro?: string | null }) => {
      const pendentes = Math.max(0, a.total - a.enviadas - a.falhas);
      const status = (a.falhas === 0 && a.enviadas === a.total) ? 'concluida' : a.enviadas > 0 ? 'parcial' : 'falhou';
      const { error } = await supabase!.from('script_execucoes').insert({
        organizacao_id: currentOrg.id, script_id: a.scriptId, conversa_id: a.conversaId,
        canal: a.canal, total_etapas: a.total, enviadas: a.enviadas, entregues: a.entregues,
        falhas: a.falhas, pendentes, ultima_etapa_ok: a.ultimaEtapaOk, erro: a.erro ?? null, status,
      });
      if (error) throw new Error(error.message);
    },
  });
}
