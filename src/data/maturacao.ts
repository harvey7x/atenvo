import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/** true quando há backend real configurado (mesmo padrão de SLA_REAL/CFG_REAL/WA_REAL). */
export const MATURACAO_REAL = isSupabaseConfigured && !!supabase;

/* ===================== Tipos (espelham o Bloco A — 20260724130000) ===================== */
export type ModoMaturacao = 'dry_run' | 'ativo';
export type StatusIntegracao = 'desconectado' | 'sincronizando' | 'conectado' | 'erro';
export type StatusMaturacao = 'novo' | 'aquecendo' | 'pausado' | 'maduro' | 'banido' | 'erro';
export type TipoConteudo = 'texto' | 'figurinha' | 'audio' | 'imagem';
export type CategoriaConteudo = 'abertura' | 'resposta' | 'conversa';

export interface MaturacaoConfig {
  organizacao_id: string;
  /** 'dry_run' = planeja e registra, mas NADA sai de verdade. Nasce assim de propósito. */
  modo: ModoMaturacao;
  timezone: string;
  hora_inicio: number;
  hora_fim: number;
  /** 0=domingo … 6=sábado */
  dias_semana: number[];
  rampa: unknown;
  dia_sementes: number;
  min_sementes: number;
  pct_sementes: number;
  dias_para_maduro: number;
  atualizado_em: string;
  atualizado_por: string | null;
}

/** Só os campos que a tela edita — o `rampa` (jsonb) é curadoria de backend, não de UI. */
export type ConfigPatch = Partial<Pick<MaturacaoConfig,
  'modo' | 'hora_inicio' | 'hora_fim' | 'dias_semana' | 'dia_sementes' | 'min_sementes' | 'pct_sementes' | 'dias_para_maduro'>>;

/** Linha do painel (RPC maturacao_painel). Os contadores vêm como bigint → number no JSON. */
export interface ChipPainel {
  chip_id: string;
  apelido: string;
  numero_conectado: string | null;
  status_integracao: StatusIntegracao;
  status_maturacao: StatusMaturacao;
  dia_rampa: number;
  perfil_ok: boolean;
  enviadas_7d: number;
  entregues_7d: number;
  lidas_7d: number;
  erros_7d: number;
  pendentes_hoje: number;
  ultimo_erro_em: string | null;
}

export interface Semente {
  id: string;
  organizacao_id: string;
  apelido: string;
  numero: string;
  ativo: boolean;
  observacao: string | null;
  criado_em: string;
}

export interface Conteudo {
  id: string;
  organizacao_id: string;
  tipo: TipoConteudo;
  categoria: CategoriaConteudo;
  texto: string | null;
  storage_path: string | null;
  mime_type: string | null;
  usos: number;
  ativo: boolean;
  criado_em: string;
}

/* ===================== Erros ===================== */
/** Traduz os `raise exception` das RPCs (e falhas de RLS) para uma frase que o admin entende. */
export function traduzMaturacao(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('sem_acesso') || m.includes('row-level') || m.includes('permission')) return 'Somente administradores da organização podem gerenciar a maturação.';
  if (m.includes('perfil_incompleto')) return 'Preencha foto, nome e recado no celular e marque “Perfil pronto” antes de iniciar a rampa.';
  if (m.includes('chip_desconectado')) return 'O chip precisa estar conectado para iniciar. Leia o QR Code primeiro.';
  if (m.includes('chip_banido')) return 'Este chip foi banido pelo WhatsApp e não pode voltar a aquecer.';
  if (m.includes('chip_nao_encontrado')) return 'Chip não encontrado (pode já ter sido excluído).';
  if (m.includes('apelido_vazio')) return 'Informe um apelido para o chip.';
  if (m.includes('semente_e_chip_do_pool')) return 'Este número já é um chip do pool. Sementes precisam ser números externos.';
  if (m.includes('numero_invalido')) return 'Informe o número com DDI e DDD (ex.: 5551999998888).';
  if (m.includes('semente_nao_encontrada')) return 'Semente não encontrada (pode já ter sido excluída).';
  if (m.includes('duplicate key') || m.includes('msem_numero') || m.includes('unique')) return 'Este número já está cadastrado como semente.';
  if (m.includes('conteudo_vazio')) return 'Escreva o texto da mensagem.';
  if (m.includes('conteudo_nao_encontrado')) return 'Conteúdo não encontrado (pode já ter sido excluído).';
  if (m.includes('mcfg_janela')) return 'A hora final precisa ser maior que a hora inicial.';
  return msg || 'Falha na operação.';
}

function erro(msg: string): never { throw new Error(traduzMaturacao(msg)); }

/** Edge Function `maturacao-manage`. Lê o erro real do corpo (supabase-js não parseia non-2xx). */
async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.functions.invoke('maturacao-manage', { body });
  if (error) {
    let msg = error.message;
    const ed = data as { error?: string } | null;
    if (ed?.error) msg = ed.error;
    else {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        try { const b = await ctx.clone().json() as { error?: string }; if (b?.error) msg = b.error; } catch { /* mantém msg */ }
      }
    }
    erro(msg);
  }
  return data as T;
}

/* ===================== Painel ===================== */
/** Resumo por chip. Refetch de 30s: o runner/planner rodam por cron, não há realtime aqui. */
export function usePainelMaturacao() {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['mat-painel', org],
    enabled: MATURACAO_REAL && !!org,
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ChipPainel[]> => {
      const { data, error } = await supabase!.rpc('maturacao_painel', { p_org: org });
      if (error) erro(error.message);
      return (data as ChipPainel[]) ?? [];
    },
  });
}

/* ===================== Configuração ===================== */
/** Lê a config da org (a RPC cria a linha padrão na primeira chamada). */
export function useConfigMaturacao() {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['mat-config', org],
    enabled: MATURACAO_REAL && !!org,
    staleTime: 60_000,
    queryFn: async (): Promise<MaturacaoConfig> => {
      const { data, error } = await supabase!.rpc('maturacao_config_obter', { p_org: org });
      if (error) erro(error.message);
      return data as MaturacaoConfig;
    },
  });
}

export function useSalvarConfig() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (patch: ConfigPatch): Promise<MaturacaoConfig> => {
      const { data, error } = await supabase!.rpc('maturacao_config_salvar', { p_org: org, p_patch: patch });
      if (error) erro(error.message);
      return data as MaturacaoConfig;
    },
    onSuccess: (row) => { qc.setQueryData(['mat-config', org], row); },
  });
}

/* ===================== Chips ===================== */
/** Cria o chip E a instância Evolution dedicada (`aquec_*`) — por isso vai pela Edge Function. */
export function useCriarChip() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (p: { apelido: string; operadora: string }) =>
      invoke<{ chip_id?: string }>({ action: 'criar', organizacao_id: org, apelido: p.apelido, operadora: p.operadora || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mat-painel', org] }); },
  });
}

export function useAtualizarChip() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (p: { chipId: string; apelido?: string; operadora?: string; observacao?: string; perfilOk?: boolean }) => {
      const { error } = await supabase!.rpc('maturacao_chip_atualizar', {
        p_chip: p.chipId,
        p_apelido: p.apelido ?? null,
        p_operadora: p.operadora ?? null,
        p_observacao: p.observacao ?? null,
        p_perfil_ok: p.perfilOk ?? null,
      });
      if (error) erro(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mat-painel', org] }); },
  });
}

/** Inicia a rampa. O backend recusa sem perfil pronto / sessão conectada / chip banido. */
export function useIniciarChip() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (chipId: string) => {
      const { error } = await supabase!.rpc('maturacao_chip_iniciar', { p_chip: chipId });
      if (error) erro(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mat-painel', org] }); },
  });
}

export function usePausarChip() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (p: { chipId: string; motivo?: string }) => {
      const { error } = await supabase!.rpc('maturacao_chip_pausar', { p_chip: p.chipId, p_motivo: p.motivo || null });
      if (error) erro(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mat-painel', org] }); },
  });
}

/** Exclusão DEFINITIVA: a Edge derruba a instância Evolution e depois chama a RPC de delete. */
export function useExcluirChip() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (chipId: string) => invoke<{ ok?: boolean }>({ action: 'remover', chip_id: chipId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mat-painel', org] }); },
  });
}

/* ===================== Conexão (QR) ===================== */
export interface QrResultado { qr?: string | null; conectado?: boolean }

/** Pede um QR novo para o chip. Se a sessão já subiu, volta `{ conectado: true }`. */
export function useQrChip() {
  return useMutation({
    mutationFn: async (chipId: string) => invoke<QrResultado>({ action: 'qr', chip_id: chipId }),
  });
}

export interface StatusChip { status_integracao: StatusIntegracao; numero_conectado: string | null }

/** Polling do status enquanto o modal de QR está aberto (3s). Desligado quando `chipId` é null. */
export function useStatusChip(chipId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['mat-status', currentOrg.id, chipId],
    enabled: MATURACAO_REAL && !!chipId,
    refetchInterval: 3_000,
    gcTime: 0,
    queryFn: async (): Promise<StatusChip> => invoke<StatusChip>({ action: 'status', chip_id: chipId }),
  });
}

/* ===================== Sementes ===================== */
export function useSementes() {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['mat-sementes', org],
    enabled: MATURACAO_REAL && !!org,
    staleTime: 60_000,
    queryFn: async (): Promise<Semente[]> => {
      const { data, error } = await supabase!.from('maturacao_sementes')
        .select('id, organizacao_id, apelido, numero, ativo, observacao, criado_em')
        .eq('organizacao_id', org).order('criado_em');
      if (error) erro(error.message);
      return (data as Semente[]) ?? [];
    },
  });
}

export function useAdicionarSemente() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (p: { apelido: string; numero: string }) => {
      const { error } = await supabase!.rpc('maturacao_semente_adicionar', { p_org: org, p_apelido: p.apelido, p_numero: p.numero });
      if (error) erro(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mat-sementes', org] }); },
  });
}

export function useExcluirSemente() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (sementeId: string) => {
      const { error } = await supabase!.rpc('maturacao_semente_excluir', { p_semente: sementeId });
      if (error) erro(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mat-sementes', org] }); },
  });
}

/* ===================== Biblioteca de conteúdo ===================== */
export function useConteudo() {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['mat-conteudo', org],
    enabled: MATURACAO_REAL && !!org,
    staleTime: 60_000,
    queryFn: async (): Promise<Conteudo[]> => {
      const { data, error } = await supabase!.from('maturacao_conteudo')
        .select('id, organizacao_id, tipo, categoria, texto, storage_path, mime_type, usos, ativo, criado_em')
        .eq('organizacao_id', org).order('criado_em', { ascending: false });
      if (error) erro(error.message);
      return (data as Conteudo[]) ?? [];
    },
  });
}

export function useAdicionarConteudo() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (p: { tipo: TipoConteudo; categoria: CategoriaConteudo; texto: string }) => {
      const { error } = await supabase!.rpc('maturacao_conteudo_adicionar', {
        p_org: org, p_tipo: p.tipo, p_categoria: p.categoria, p_texto: p.texto, p_storage: null, p_mime: null,
      });
      if (error) erro(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mat-conteudo', org] }); },
  });
}

export function useExcluirConteudo() {
  const qc = useQueryClient();
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useMutation({
    mutationFn: async (conteudoId: string) => {
      const { error } = await supabase!.rpc('maturacao_conteudo_excluir', { p_conteudo: conteudoId });
      if (error) erro(error.message);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mat-conteudo', org] }); },
  });
}

/* ===================== Derivações de apresentação ===================== */
export type Saude = 'verde' | 'amarelo' | 'vermelho' | 'sem_dados';

/** Semáforo do card: erro de envio é o sinal precoce de restrição (foi o que antecipou a LUIZA),
 *  por isso pesa mais que a taxa de entrega. Sem volume suficiente, não inventa diagnóstico. */
export function saudeChip(c: Pick<ChipPainel, 'enviadas_7d' | 'entregues_7d' | 'erros_7d'>): Saude {
  if (c.erros_7d >= 3) return 'vermelho';
  if (c.enviadas_7d === 0) return c.erros_7d > 0 ? 'amarelo' : 'sem_dados';
  const taxa = c.entregues_7d / c.enviadas_7d;
  if (c.enviadas_7d >= 10 && taxa < 0.5) return 'vermelho';
  if (c.erros_7d > 0) return 'amarelo';
  if (c.enviadas_7d >= 10 && taxa < 0.8) return 'amarelo';
  return 'verde';
}

export const SAUDE_LABEL: Record<Saude, string> = {
  verde: 'Saudável', amarelo: 'Atenção', vermelho: 'Risco', sem_dados: 'Sem dados',
};

export const STATUS_MATURACAO_LABEL: Record<StatusMaturacao, string> = {
  novo: 'Novo', aquecendo: 'Aquecendo', pausado: 'Pausado', maduro: 'Maduro', banido: 'Banido', erro: 'Erro',
};

export const STATUS_INTEGRACAO_LABEL: Record<StatusIntegracao, string> = {
  desconectado: 'Desconectado', sincronizando: 'Sincronizando', conectado: 'Conectado', erro: 'Erro',
};

export const TIPO_LABEL: Record<TipoConteudo, string> = {
  texto: 'Texto', figurinha: 'Figurinha', audio: 'Áudio', imagem: 'Imagem',
};

export const CATEGORIA_LABEL: Record<CategoriaConteudo, string> = {
  abertura: 'Abertura', resposta: 'Resposta', conversa: 'Conversa',
};

export const DIAS_SEMANA = [
  { v: 0, r: 'Dom' }, { v: 1, r: 'Seg' }, { v: 2, r: 'Ter' }, { v: 3, r: 'Qua' },
  { v: 4, r: 'Qui' }, { v: 5, r: 'Sex' }, { v: 6, r: 'Sáb' },
];

/** 5551999998888 → +55 51 99999-8888 (best effort; devolve o cru se não bater o formato). */
export function formatarNumero(numero: string | null): string {
  if (!numero) return '—';
  const d = numero.replace(/\D/g, '');
  const m = /^(\d{2})(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+${m[1]} ${m[2]} ${m[3]}-${m[4]}` : numero;
}
