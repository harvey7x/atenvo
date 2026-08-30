/* ============================================================================
   IA configurável — Fase 1 (camada de dados)

   O cliente cria o próprio atendente de IA: provedor + chave PRÓPRIA (BYOK),
   modelo, prompt (persona) e comportamentos, e vincula aos canais de WhatsApp.
   A chave é write-only: gravada via RPC ia_agente_salvar_chave (Vault) e NUNCA
   volta pro front — aqui só chega o carimbo chave_definida_em.
   ============================================================================ */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

export const IA_REAL = isSupabaseConfigured && !!supabase;
type Row = Record<string, unknown>;

export type ProvedorIa = 'gemini' | 'openai' | 'anthropic';

export interface ComportamentosIa {
  /** horário comercial informado no fecho; `dias` é RESERVADO (Fase 2) — o motor aplica seg-sex */
  horario?: { ativo?: boolean; inicio?: string; fim?: string; dias?: number[] };
  /** janela anti-ban do contato proativo (nudge/retomada) */
  janela?: { inicio?: string; fim?: string };
  /** escada de follow-up (3 toques) ligada? */
  nudges_ativos?: boolean;
  /** teto de chamadas de IA por dia, por canal */
  max_chamadas_dia?: number;
  /** temas que a IA nunca pode citar (além do filtro de fábrica) */
  proibidos?: string[];
  /** deixa a IA usar emojis (fábrica remove todos) */
  permitir_emojis?: boolean;
  /** mostra "digitando…" antes de cada bolha (fábrica: ligado) */
  simular_digitacao?: boolean;
  /** avançado: modelo dedicado pra leitura de documentos (visão) */
  modelo_docs?: string;
  /** avançado: modelo forte pra casos complexos (objeção, dúvida, áudio) */
  modelo_pro?: string;
}

export interface AgenteIa {
  id: string;
  nome: string;
  provedor: ProvedorIa;
  modelo: string;
  personaPrompt: string;
  conhecimento: string;
  comportamentos: ComportamentosIa;
  ativo: boolean;
  chaveDefinidaEm: string | null;
  criadoEm: string;
}

export interface CanalIa {
  id: string;
  nome: string;
  numero: string | null;
  iaEnabled: boolean;
  iaModoTeste: boolean;
  numerosTeste: string[];
  agenteId: string | null;
}

/** Modelos sugeridos por provedor (o campo é livre — isto é só datalist). */
export const MODELOS_SUGERIDOS: Record<ProvedorIa, string[]> = {
  gemini: ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-pro-latest'],
  openai: ['gpt-5.2', 'gpt-5-mini'],
  anthropic: ['claude-sonnet-5', 'claude-haiku-4-5'],
};

function mapAgente(r: Row): AgenteIa {
  return {
    id: r.id as string,
    nome: (r.nome as string) || 'Atendente de IA',
    provedor: ((r.provedor as string) || 'gemini') as ProvedorIa,
    modelo: (r.modelo as string) || '',
    personaPrompt: (r.persona_prompt as string) || '',
    conhecimento: (r.conhecimento as string) || '',
    comportamentos: ((r.comportamentos as ComportamentosIa) || {}),
    ativo: !!r.ativo,
    chaveDefinidaEm: (r.chave_definida_em as string) || null,
    criadoEm: (r.criado_em as string) || '',
  };
}

export function useAgentesIa() {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  return useQuery({
    queryKey: ['ia-agentes', org], enabled: IA_REAL && !!org,
    queryFn: async (): Promise<AgenteIa[]> => {
      const { data, error } = await supabase!
        .from('ia_agentes')
        .select('id, nome, provedor, modelo, persona_prompt, conhecimento, comportamentos, ativo, chave_definida_em, criado_em')
        .eq('organizacao_id', org!)
        .order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as Row[]) || []).map(mapAgente);
    },
  });
}

export function useCanaisIa() {
  const { currentOrg } = useOrg();
  const org = currentOrg?.id;
  return useQuery({
    queryKey: ['ia-canais', org], enabled: IA_REAL && !!org,
    queryFn: async (): Promise<CanalIa[]> => {
      const { data, error } = await supabase!
        .from('canais')
        .select('id, nome_interno, numero_conectado, bot_canal_config(ia_enabled, ia_modo_teste, ia_agente_id, numeros_teste)')
        .eq('organizacao_id', org!)
        .eq('tipo', 'whatsapp')
        .neq('status_integracao', 'removido')
        .order('nome_interno');
      if (error) throw new Error(error.message);
      return ((data as Row[]) || []).map((r) => {
        // bot_canal_config é 1-por-canal, mas o embed do PostgREST vem como array
        const cfgRaw = r.bot_canal_config as Row | Row[] | null;
        const cfg = (Array.isArray(cfgRaw) ? cfgRaw[0] : cfgRaw) || {};
        return {
          id: r.id as string,
          nome: (r.nome_interno as string) || 'Canal',
          numero: (r.numero_conectado as string) || null,
          iaEnabled: !!cfg.ia_enabled,
          iaModoTeste: cfg.ia_modo_teste !== false, // default do banco é true
          numerosTeste: Array.isArray(cfg.numeros_teste) ? (cfg.numeros_teste as string[]) : [],
          agenteId: (cfg.ia_agente_id as string) || null,
        };
      });
    },
  });
}

export function useCriarAgente() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const { data, error } = await supabase!
        .from('ia_agentes')
        .insert({ organizacao_id: currentOrg!.id })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return (data as Row).id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ia-agentes', currentOrg?.id] }),
  });
}

export function useSalvarAgente() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (p: { id: string; nome: string; provedor: ProvedorIa; modelo: string; personaPrompt: string; conhecimento: string; comportamentos: ComportamentosIa; ativo: boolean }) => {
      const { error } = await supabase!
        .from('ia_agentes')
        .update({
          nome: p.nome.trim() || 'Atendente de IA',
          provedor: p.provedor,
          modelo: p.modelo.trim(),
          persona_prompt: p.personaPrompt,
          conhecimento: p.conhecimento,
          comportamentos: p.comportamentos,
          ativo: p.ativo,
        })
        .eq('id', p.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ia-agentes', currentOrg?.id] }),
  });
}

export function useExcluirAgente() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('ia_agentes').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ia-agentes', currentOrg?.id] });
      qc.invalidateQueries({ queryKey: ['ia-canais', currentOrg?.id] });
    },
  });
}

/** Chave write-only: vai pro Vault via RPC e nunca volta. */
export function useSalvarChave() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  return useMutation({
    mutationFn: async (p: { agenteId: string; chave: string }) => {
      const { error } = await supabase!.rpc('ia_agente_salvar_chave', { p_agente: p.agenteId, p_chave: p.chave });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ia-agentes', currentOrg?.id] }),
  });
}

/* Vincular/ligar são OTIMISTAS: a RPC de vínculo recebe a LISTA COMPLETA, então um segundo
   clique lendo cache defasado desfaria o primeiro (achado P1 da revisão). O onMutate aplica
   o resultado no cache na hora; erro → rollback; sempre revalida no fim. */
export function useVincularCanais() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  const chave = ['ia-canais', currentOrg?.id] as const;
  return useMutation({
    mutationFn: async (p: { agenteId: string; canalIds: string[] }) => {
      const { error } = await supabase!.rpc('ia_agente_vincular_canais', { p_agente: p.agenteId, p_canais: p.canalIds });
      if (error) throw new Error(error.message);
    },
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: chave });
      const prev = qc.getQueryData<CanalIa[]>(chave);
      qc.setQueryData<CanalIa[]>(chave, (xs) => (xs ?? []).map((c) => ({
        ...c,
        agenteId: p.canalIds.includes(c.id) ? p.agenteId : (c.agenteId === p.agenteId ? null : c.agenteId),
      })));
      return { prev };
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(chave, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: chave }),
  });
}

export function useAtivarCanal() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  const chave = ['ia-canais', currentOrg?.id] as const;
  return useMutation({
    mutationFn: async (p: { canalId: string; ativo: boolean }) => {
      const { error } = await supabase!.rpc('ia_canal_ativar', { p_canal: p.canalId, p_ativo: p.ativo });
      if (error) throw new Error(error.message);
    },
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: chave });
      const prev = qc.getQueryData<CanalIa[]>(chave);
      qc.setQueryData<CanalIa[]>(chave, (xs) => (xs ?? []).map((c) => c.id === p.canalId ? { ...c, iaEnabled: p.ativo } : c));
      return { prev };
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(chave, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: chave }),
  });
}

/** Modo teste autogerido: sair/entrar e (opcional) gravar os números de teste. */
export function useModoTeste() {
  const qc = useQueryClient(); const { currentOrg } = useOrg();
  const chave = ['ia-canais', currentOrg?.id] as const;
  return useMutation({
    mutationFn: async (p: { canalId: string; teste: boolean; numeros?: string[] }) => {
      const { error } = await supabase!.rpc('ia_canal_modo_teste', {
        p_canal: p.canalId, p_teste: p.teste, p_numeros: p.numeros ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onMutate: async (p) => {
      await qc.cancelQueries({ queryKey: chave });
      const prev = qc.getQueryData<CanalIa[]>(chave);
      qc.setQueryData<CanalIa[]>(chave, (xs) => (xs ?? []).map((c) => c.id === p.canalId
        ? { ...c, iaModoTeste: p.teste, numerosTeste: p.numeros ?? c.numerosTeste } : c));
      return { prev };
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(chave, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: chave }),
  });
}

/** Atividade real do agente (RPC soma os canais vinculados). */
export interface MetricasIa { sessoesAtivas: number; chamadasHoje: number; nudgesHoje: number; handoffs7d: number; canais: number }
export function useMetricasIa(agenteId: string | null, habilitado: boolean) {
  return useQuery({
    queryKey: ['ia-metricas', agenteId], enabled: IA_REAL && habilitado && !!agenteId,
    refetchInterval: 60_000,
    queryFn: async (): Promise<MetricasIa> => {
      const { data, error } = await supabase!.rpc('ia_agente_metricas', { p_agente: agenteId! });
      if (error) throw new Error(error.message);
      const r = (data as Row) || {};
      return {
        sessoesAtivas: Number(r.sessoes_ativas) || 0,
        chamadasHoje: Number(r.chamadas_hoje) || 0,
        nudgesHoje: Number(r.nudges_hoje) || 0,
        handoffs7d: Number(r.handoffs_7d) || 0,
        canais: Number(r.canais) || 0,
      };
    },
  });
}

/** Playground "Experimentar": conversa de teste com o atendente (edge, chave do cofre). */
export interface BolhaPlayground { texto: string; bloqueada: boolean }
export function useConversarPlayground() {
  return useMutation({
    mutationFn: async (p: { agenteId: string; mensagem: string; historico: { de: 'cliente' | 'ia'; texto: string }[] }): Promise<BolhaPlayground[]> => {
      const { data, error } = await supabase!.functions.invoke('ia-agente-conversar', {
        body: { agente_id: p.agenteId, mensagem: p.mensagem, historico: p.historico },
      });
      if (error) throw new Error(error.message);
      const r = (data as Row) || {};
      if (!r.ok) throw new Error((r.detalhe as string) || 'Falha no teste');
      return (Array.isArray(r.mensagens) ? r.mensagens : []).map((m) => {
        const b = m as Row;
        return { texto: String(b.texto ?? ''), bloqueada: !!b.bloqueada };
      });
    },
  });
}

/** Testa a chave/modelo salvos chamando o provedor de verdade (edge function). */
export function useTestarConexao() {
  return useMutation({
    mutationFn: async (agenteId: string): Promise<{ ok: boolean; detalhe: string }> => {
      const { data, error } = await supabase!.functions.invoke('ia-agente-testar', { body: { agente_id: agenteId } });
      if (error) throw new Error(error.message);
      const r = (data as Row) || {};
      return { ok: !!r.ok, detalhe: (r.detalhe as string) || (r.ok ? 'Conexão OK' : 'Falha na conexão') };
    },
  });
}

/* ===================== Mock (modo demo / sem Supabase) ===================== */
export const MOCK_AGENTES: AgenteIa[] = [
  {
    id: 'demo-1',
    nome: 'Sofia',
    provedor: 'gemini',
    modelo: 'gemini-3.6-flash',
    personaPrompt:
      'Você é a Sofia, atendente da empresa. Atende aposentados e pensionistas do INSS com cordialidade e frases curtas. ' +
      'Nunca fala de valores, taxas ou juros — isso é com o consultor humano. Seu objetivo é acolher, entender o caso e coletar os documentos.',
    conhecimento: 'Atendemos de segunda a sexta. Trabalhamos com revisão de descontos de aposentados e pensionistas. O escritório fica em São Paulo.',
    comportamentos: { horario: { ativo: true, inicio: '09:00', fim: '19:00' }, nudges_ativos: true, max_chamadas_dia: 500, proibidos: ['concorrente X'], simular_digitacao: true },
    ativo: true,
    chaveDefinidaEm: '2026-08-29T14:00:00Z',
    criadoEm: '2026-08-20T12:00:00Z',
  },
];
export const MOCK_CANAIS: CanalIa[] = [
  { id: 'demo-c1', nome: 'Atendimento Principal', numero: '5511987650001', iaEnabled: true, iaModoTeste: false, numerosTeste: [], agenteId: 'demo-1' },
  { id: 'demo-c2', nome: 'Campanha Tráfego', numero: '5511987650002', iaEnabled: false, iaModoTeste: true, numerosTeste: ['5511999990000'], agenteId: null },
];
