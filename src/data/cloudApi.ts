/* Camada de dados da API OFICIAL do WhatsApp (Cloud API) e dos templates.
 *
 * Separada de data/whatsapp.ts de propósito: aquele arquivo é o caminho quente do inbox
 * (lista de conversas, mensagens, realtime) e não deve carregar nada que só a página de
 * Integrações usa. Aqui tudo é sob demanda.
 *
 * Segurança: o front NUNCA vê secret. O `diagnostico` devolve booleanos — "o token existe"
 * é informação útil; o token, não. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

const REAL = isSupabaseConfigured && !!supabase;

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    const ed = data as { error?: string } | null;
    if (ed?.error) msg = ed.error;
    else {
      // supabase-js não parseia o corpo em non-2xx: o erro real vem no Response do contexto.
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try { const b = await ctx.clone().json() as { error?: string }; if (b?.error) msg = b.error; } catch { /* mantém msg */ }
      }
    }
    throw new Error(msg);
  }
  return data as T;
}

/* ===================== Diagnóstico do canal oficial ===================== */

export interface CloudCanal {
  id: string; nome_interno: string | null; numero_conectado: string | null;
  cloud_phone_number_id: string | null; cloud_waba_id: string | null; status_integracao: string;
}
export interface CloudDiagnostico {
  ok: boolean;
  webhook_url: string;
  graph_version: string;
  secrets: { META_WHATSAPP_TOKEN: boolean; META_WA_APP_SECRET: boolean; META_WA_VERIFY_TOKEN: boolean };
  cloud_api_ativo: boolean;
  bot_dispatch: boolean;
  canais: CloudCanal[];
  templates_aprovados: number;
}

export function useCloudDiagnostico(habilitado = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['cloud-diagnostico', currentOrg.id],
    enabled: REAL && habilitado,
    staleTime: 30_000,
    queryFn: () => invoke<CloudDiagnostico>('cloud-manage', { action: 'diagnostico', organizacao_id: currentOrg.id }),
  });
}

export function useCloudAcoes() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['cloud-diagnostico'] });
    qc.invalidateQueries({ queryKey: ['wa-canais'] });      // o canal oficial entra no "Responder por"
    qc.invalidateQueries({ queryKey: ['wa-limite'] });      // e consome vaga de WhatsApp
  };
  const vincular = useMutation({
    mutationFn: (v: { alias: string; phoneNumberId: string; wabaId: string }) =>
      invoke<{ ok: boolean; canal: CloudCanal; verificado: boolean; aviso: string | null }>('cloud-manage', {
        action: 'vincular', organizacao_id: currentOrg.id,
        alias: v.alias, phone_number_id: v.phoneNumberId, waba_id: v.wabaId,
      }),
    onSuccess: recarregar,
  });
  const verificar = useMutation({
    mutationFn: (canalId: string) =>
      invoke<{ ok: boolean; numero: string | null; nome_verificado: string | null; qualidade: string | null }>(
        'cloud-manage', { action: 'verificar', organizacao_id: currentOrg.id, canal_id: canalId }),
    onSuccess: recarregar,
  });
  const remover = useMutation({
    mutationFn: (canalId: string) =>
      invoke<{ ok: boolean }>('cloud-manage', { action: 'remover', organizacao_id: currentOrg.id, canal_id: canalId }),
    onSuccess: recarregar,
  });
  return { vincular, verificar, remover };
}

/* ===================== Templates ===================== */

export interface WaTemplateVar { pos: number; rotulo: string; exemplo: string }
export interface WaTemplate {
  id: string; nome: string; idioma: string; categoria: string; corpo: string;
  variaveis: WaTemplateVar[]; status: string; statusMotivo: string | null;
  usarEmRemarketing: boolean; wabaId: string | null; metaTemplateId: string | null;
  sincronizadoEm: string | null; atualizadoEm: string;
}

export function useWaTemplates(habilitado = true) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['wa-templates', currentOrg.id],
    enabled: REAL && habilitado,
    queryFn: async (): Promise<WaTemplate[]> => {
      const { data, error } = await supabase!
        .from('wa_templates')
        .select('id, nome, idioma, categoria, corpo, variaveis, status, status_motivo, usar_em_remarketing, waba_id, meta_template_id, sincronizado_em, atualizado_em')
        .eq('organizacao_id', currentOrg.id).eq('ativo', true)
        .order('usar_em_remarketing', { ascending: false })
        .order('nome', { ascending: true });
      if (error) throw new Error(error.message);
      type Row = {
        id: string; nome: string; idioma: string; categoria: string; corpo: string; variaveis: unknown;
        status: string; status_motivo: string | null; usar_em_remarketing: boolean; waba_id: string | null;
        meta_template_id: string | null; sincronizado_em: string | null; atualizado_em: string;
      };
      return ((data as unknown as Row[]) ?? []).map((r) => ({
        id: r.id, nome: r.nome, idioma: r.idioma, categoria: r.categoria, corpo: r.corpo,
        variaveis: Array.isArray(r.variaveis) ? r.variaveis as WaTemplateVar[] : [],
        status: r.status, statusMotivo: r.status_motivo, usarEmRemarketing: r.usar_em_remarketing,
        wabaId: r.waba_id, metaTemplateId: r.meta_template_id,
        sincronizadoEm: r.sincronizado_em, atualizadoEm: r.atualizado_em,
      }));
    },
  });
}

/** Extrai as {{n}} do corpo, preservando o que já foi rotulado. É o que garante que o número de
 *  parâmetros enviados à Meta bate com o texto aprovado (erro 132000 quando não bate). */
export function variaveisDoCorpo(corpo: string, atuais: WaTemplateVar[] = []): WaTemplateVar[] {
  const nums = [...(corpo ?? '').matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  const max = nums.length ? Math.max(...nums) : 0;
  return Array.from({ length: max }, (_, i) => {
    const ja = atuais.find((v) => v.pos === i + 1);
    return { pos: i + 1, rotulo: ja?.rotulo ?? (i === 0 ? 'nome' : `var${i + 1}`), exemplo: ja?.exemplo ?? '' };
  });
}

export function useTemplateAcoes() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['wa-templates'] });
    qc.invalidateQueries({ queryKey: ['cloud-diagnostico'] });
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { error } = await supabase!.rpc(fn, args);
    if (error) throw new Error(traduzErroTemplate(error.message));
  };
  const salvar = useMutation({
    mutationFn: (v: { id?: string; nome: string; idioma: string; categoria: string; corpo: string; variaveis: WaTemplateVar[]; canalId?: string | null; wabaId?: string | null }) =>
      rpc('wa_template_salvar', {
        p_org: currentOrg.id, p_nome: v.nome, p_idioma: v.idioma, p_categoria: v.categoria,
        p_corpo: v.corpo, p_variaveis: v.variaveis, p_canal: v.canalId ?? null,
        p_waba: v.wabaId ?? null, p_id: v.id ?? null,
      }),
    onSuccess: recarregar,
  });
  const marcarStatus = useMutation({
    mutationFn: (v: { id: string; status: string; motivo?: string | null }) =>
      rpc('wa_template_status', { p_id: v.id, p_status: v.status, p_motivo: v.motivo ?? null, p_meta_id: null }),
    onSuccess: recarregar,
  });
  const usarNoRemarketing = useMutation({
    mutationFn: (id: string) => rpc('wa_template_remarketing', { p_id: id }),
    onSuccess: recarregar,
  });
  const remover = useMutation({
    mutationFn: (id: string) => rpc('wa_template_remover', { p_id: id }),
    onSuccess: recarregar,
  });
  const sincronizar = useMutation({
    mutationFn: () => invoke<{ ok: boolean; importados: number; atualizados: number; erros: string[] }>(
      'cloud-manage', { action: 'templates_sync', organizacao_id: currentOrg.id }),
    onSuccess: recarregar,
  });
  return { salvar, marcarStatus, usarNoRemarketing, remover, sincronizar };
}

/** Os erros das RPCs são códigos snake_case (padrão da casa). Aqui viram português. */
export function traduzErroTemplate(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('sem_permissao')) return 'Você não tem permissão para gerenciar templates.';
  if (m.includes('nome_invalido')) return 'O nome do template só aceita letras minúsculas, números e underline (ex.: retomada_contato).';
  if (m.includes('corpo_vazio')) return 'Escreva o texto do template.';
  if (m.includes('template_nao_aprovado')) return 'Só um template APROVADO pela Meta pode ser usado no remarketing.';
  if (m.includes('template_invalido')) return 'Template não encontrado.';
  if (m.includes('canal_invalido')) return 'Canal inválido para esta organização.';
  if (m.includes('status_invalido')) return 'Status inválido.';
  if (m.includes('uq_wa_templates_nome_idioma')) return 'Já existe um template com esse nome e idioma.';
  return msg;
}
