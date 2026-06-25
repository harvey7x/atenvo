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
      mutationFn: async (s: { titulo: string; conteudo: string; canais: string[]; categoriaId?: string | null; descricao?: string | null }) => {
        const { data, error } = await supabase!.from('scripts').insert({
          titulo: s.titulo.trim() || 'Novo script', conteudo: s.conteudo, canais_permitidos: s.canais,
          categoria_id: s.categoriaId ?? null, descricao: s.descricao ?? null, autor_id: user?.id ?? null, organizacao_id: currentOrg.id,
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
