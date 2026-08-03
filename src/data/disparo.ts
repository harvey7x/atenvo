/* Camada de dados do DISPARO EM MASSA por template (Cloud API) — Fase 1: disparo único.
 *
 * Tudo sob demanda (só a página /disparo usa). O envio real é da edge function
 * `disparo-processar`, SEMPRE com dry_run explícito — o default do backend é simular.
 * Regras de negócio moram no banco (RPCs disparo_* / wa_optout_*): aqui é só transporte. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

const REAL = isSupabaseConfigured && !!supabase;

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/* ===================== tipos ===================== */

export interface Elegivel {
  contato_id: string; nome: string; telefone: string;
  /** Nome da coluna do Kanban onde o contato está (topo do funil: entrada + REMARKETING). */
  etapa: string; etapa_ordem: number;
  /** Contexto do lead para o card (vêm da oportunidade mais recente). */
  tipo_servico: string | null; canal_origem: string | null;
  ultima_msg_em: string | null; optout: boolean;
  /** Já recebeu um disparo antes (status='enviado' em qualquer campanha da org). */
  ja_recebeu: boolean; ultimo_disparo_em: string | null; ultima_campanha: string | null;
}

/** Pessoa que JÁ recebeu um disparo (visão por contato, aba "Já contatados"). */
export interface Contatado {
  contato_id: string; nome: string; telefone: string | null;
  total_disparos: number; ultimo_em: string | null;
  ultima_campanha: string | null; optout: boolean;
}

/* ---------- prévia da mensagem por pessoa (ESPELHO da lógica do motor) ----------
 * disparo-processar decide o valor das variáveis no envio; aqui replicamos a regra
 * para a prévia do card ser fiel ao que sai: variável de nome → primeiro nome
 * APRESENTÁVEL (nome numérico/curto vira 'cliente'); as demais → exemplo. */
/* ---------- gênero pelo primeiro nome (PORT da régua do bot — fluxo_botoes.ts) ----------
 * CONSERVADORA: na dúvida devolve 'ambiguo' (nunca chuta). Usada no filtro do disparo
 * para templates com tratamento marcado ("o senhor"). Manter em sincronia com o bot. */
const gNorm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const G_UNISSEX = new Set(['alex', 'ariel', 'cris', 'darci', 'dari', 'eli', 'remy', 'nikki', 'sasha', 'lea']);
const G_FEM = new Set(['raquel', 'isabel', 'ester', 'esther', 'ines', 'beatriz', 'mercedes', 'ruth', 'carmem', 'carmen', 'noemi', 'miriam', 'conceicao', 'assuncao', 'encarnacao',
  'simone', 'ivone', 'ivete', 'eliane', 'viviane', 'rosane', 'cristiane', 'adriane', 'luciane', 'josiane', 'daiane', 'isabelle', 'gabrielle', 'elizabeth', 'edith', 'agnes', 'doris', 'lais', 'pilar']);
const G_MASC = new Set(['jose', 'luiz', 'luis', 'andre', 'felipe', 'henrique', 'jorge', 'vicente', 'davi', 'moises', 'israel', 'gabriel', 'rafael', 'daniel', 'manuel', 'joel', 'ismael', 'nicola', 'luca',
  'matheus', 'mateus', 'lucas', 'marcos', 'carlos', 'miguel', 'samuel', 'gael', 'heitor', 'arthur', 'anderson', 'wilson', 'edson', 'nelson', 'robson', 'emerson', 'everton', 'kevin', 'alan', 'cristian', 'raul', 'joaquim', 'benjamin']);
const G_MASC_TERMINA_A = new Set(['nicola', 'luca', 'juca', 'sena']);
export type Genero = 'homem' | 'mulher' | 'ambiguo';
export function inferirGenero(nomeCompleto: string): Genero {
  const p = gNorm((nomeCompleto || '').trim().split(/\s+/)[0] ?? '');
  if (p.length < 2) return 'ambiguo';
  if (G_UNISSEX.has(p)) return 'ambiguo';
  if (G_FEM.has(p)) return 'mulher';
  if (G_MASC.has(p)) return 'homem';
  if (p.endsWith('a') && !G_MASC_TERMINA_A.has(p)) return 'mulher';
  if (p.endsWith('o')) return 'homem';
  return 'ambiguo';
}

export function primeiroNomeApresentavel(nome: string): string {
  const p = (nome ?? '').trim().split(/\s+/)[0] ?? '';
  return (/^[+\d()\-.]*$/.test(p) || p.length < 2) ? '' : p;
}
export function preencherTemplate(
  corpo: string,
  variaveis: Array<{ rotulo?: string; exemplo?: string }> | null | undefined,
  nomeContato: string,
): string {
  const primeiro = primeiroNomeApresentavel(nomeContato);
  const defs = Array.isArray(variaveis) ? variaveis : [];
  const vars = defs.map((d) => {
    const rotulo = String(d?.rotulo ?? '').toLowerCase();
    if (/nome|primeiro|cliente/.test(rotulo)) return primeiro || 'cliente';
    return String(d?.exemplo ?? '').trim() || 'cliente';
  });
  return (corpo ?? '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_m, n) => vars[Number(n) - 1] ?? '');
}
export interface Campanha {
  id: string; organizacao_id: string; canal_id: string; template_id: string;
  nome: string; status: 'ativa' | 'concluida' | 'cancelada'; teto_24h: number; criado_em: string;
}
export interface Alvo {
  id: string; campanha_id: string; contato_id: string; telefone: string | null;
  status: 'pendente' | 'enviado' | 'falhou' | 'optout' | 'pulado';
  erro: string | null; wamid: string | null; enviado_em: string | null;
  contatos?: { nome: string } | null;
}
export interface OptoutRow {
  contato_id: string; nome: string; telefone: string | null;
  motivo: string; detalhe: string | null; criado_em: string;
}
export interface ResultadoProcessar {
  ok: boolean; dry_run: boolean; processados: number;
  enviados?: number; falhas?: number; optouts?: number; restante_teto?: number;
  mensagem?: string; error?: string;
  resultados?: Array<{ contato?: string; telefone?: string; status: string; texto?: string; erro?: string | null }>;
}

/* ===================== público elegível ===================== */

export function useDisparoElegiveis() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['disparo-elegiveis', currentOrg.id],
    enabled: REAL,
    staleTime: 30_000,
    queryFn: () => rpc<Elegivel[]>('disparo_elegiveis', { p_org: currentOrg.id }),
  });
}

/** Quem já recebeu disparo (por pessoa) — alimenta a aba "Já contatados" e o re-disparo. */
export function useDisparoContatados() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['disparo-contatados', currentOrg.id],
    enabled: REAL,
    staleTime: 30_000,
    queryFn: () => rpc<Contatado[]>('disparo_contatados', { p_org: currentOrg.id }),
  });
}

/* ===================== campanhas ===================== */

export function useCampanhas() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['disparo-campanhas', currentOrg.id],
    enabled: REAL,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('disparo_campanhas')
        .select('id, organizacao_id, canal_id, template_id, nome, status, teto_24h, criado_em')
        .eq('organizacao_id', currentOrg.id)
        .order('criado_em', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as Campanha[];
    },
  });
}

export function useCriarCampanha() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { nome: string; template_id: string; canal_id: string; teto?: number }) =>
      rpc<string>('disparo_criar_campanha', {
        p_org: currentOrg.id, p_nome: p.nome, p_template: p.template_id, p_canal: p.canal_id, p_teto: p.teto ?? 200,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disparo-campanhas'] }),
  });
}

export function useCancelarCampanha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (campanhaId: string) => rpc<void>('disparo_cancelar_campanha', { p_campanha: campanhaId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disparo-campanhas'] }),
  });
}

export function useAddAlvos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { campanha_id: string; contatos: string[] }) =>
      rpc<{ pendentes: number; optout: number; sem_whatsapp: number; ja_existiam: number }>(
        'disparo_add_alvos', { p_campanha: p.campanha_id, p_contatos: p.contatos },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['disparo-alvos'] }),
  });
}

export function useAlvos(campanhaId: string | null) {
  return useQuery({
    queryKey: ['disparo-alvos', campanhaId],
    enabled: REAL && !!campanhaId,
    refetchInterval: 8000,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('disparo_alvos')
        .select('id, campanha_id, contato_id, telefone, status, erro, wamid, enviado_em, contatos(nome)')
        .eq('campanha_id', campanhaId!)
        .order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Alvo[];
    },
  });
}

/** Simular/processar um lote. dry_run OBRIGATÓRIO e explícito na chamada — sem default esperto aqui. */
export function useProcessarLote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { campanha_id: string; lote: number; dry_run: boolean }) => {
      const { data, error } = await supabase!.functions.invoke('disparo-processar', {
        body: { campanha_id: p.campanha_id, lote: p.lote, dry_run: p.dry_run },
      });
      if (error) {
        let msg = error.message;
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try { const b = await ctx.clone().json() as { error?: string }; if (b?.error) msg = b.error; } catch { /* mantém msg */ }
        }
        throw new Error(msg);
      }
      return data as ResultadoProcessar;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disparo-alvos'] });
      qc.invalidateQueries({ queryKey: ['disparo-campanhas'] });
      // envio real muda quem "já recebeu": recarrega elegíveis (badge/filtro) e contatados.
      qc.invalidateQueries({ queryKey: ['disparo-elegiveis'] });
      qc.invalidateQueries({ queryKey: ['disparo-contatados'] });
    },
  });
}

/* ===================== opt-out (aba Excluídos + marcação manual) ===================== */

export function useOptoutLista() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['wa-optout-lista', currentOrg.id],
    enabled: REAL,
    queryFn: () => rpc<OptoutRow[]>('wa_optout_lista', { p_org: currentOrg.id }),
  });
}

export function useOptoutManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { contato_id: string; detalhe?: string }) =>
      rpc<void>('wa_optout_manual', { p_contato: p.contato_id, p_detalhe: p.detalhe ?? null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-optout-lista'] });
      qc.invalidateQueries({ queryKey: ['disparo-elegiveis'] });
    },
  });
}

export function useOptoutRemover() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contatoId: string) => rpc<void>('wa_optout_manual_remover', { p_contato: contatoId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-optout-lista'] });
      qc.invalidateQueries({ queryKey: ['disparo-elegiveis'] });
    },
  });
}
