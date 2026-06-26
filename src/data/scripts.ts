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
export interface VarCtx { cliente?: string; atendente?: string; empresa?: string; telefone?: string; }
/** Substitui {{nome_cliente}}, {{seu_nome}}, {{empresa}}, {{telefone}}, {{data_atual}} (e aliases). */
export function substituirVariaveis(texto: string, ctx: VarCtx): string {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const tabela: Record<string, string> = {
    nome_cliente: ctx.cliente ?? '', cliente: ctx.cliente ?? '',
    seu_nome: ctx.atendente ?? '', atendente: ctx.atendente ?? '',
    empresa: ctx.empresa ?? '', telefone: ctx.telefone ?? '', data_atual: hoje,
  };
  return texto.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, k: string) => {
    const key = k.toLowerCase();
    return key in tabela ? tabela[key] : m;
  });
}

export const SCRIPT_VARIAVEIS = ['{{nome_cliente}}', '{{seu_nome}}', '{{empresa}}', '{{telefone}}', '{{data_atual}}'];

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
