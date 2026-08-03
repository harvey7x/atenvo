/* Central de Remarketing — camada de dados (F2).
   Padrão da casa (sla.ts): react-query + RPCs/selects com RLS; REMARKETING_REAL
   segue o mesmo gate do resto (Supabase configurado). Sem backend, a página
   roda em modo demonstração com seeds locais (nada é gravado). */
import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

export const REMARKETING_REAL = isSupabaseConfigured && !!supabase;

/* ---------- tipos ---------- */
export type RmktEtapa = 'remarketing_1' | 'pendencia' | 'recuperacao_1' | 'recuperacao_2' | 'recuperacao_3';
export const ETAPA_LABEL: Record<string, string> = {
  remarketing_1: 'Remarketing 1', pendencia: 'Pendência',
  recuperacao_1: 'Recuperação 1', recuperacao_2: 'Recuperação 2', recuperacao_3: 'Recuperação 3',
};
export const STATUS_LABEL: Record<string, string> = { ativo: 'Ativo', recuperado: 'Recuperado', perdido: 'Perdido', cancelado: 'Cancelado' };

export interface RmktLead {
  id: string; etapa: RmktEtapa; origemFluxo: string; status: string; tentativas: number;
  responsavelId: string | null; responsavelNome: string | null;
  proximaAcao: string | null; proximaAcaoEm: string | null;
  entrouEtapaEm: string; criadoEm: string; encerradoEm: string | null;
  conversaId: string | null; oportunidadeId: string;
  contatoId: string; contatoNome: string; contatoTelefone: string | null;
  ultimaEntradaEm: string | null;                  // p/ "dias sem resposta"
  instituicao: string | null; origem: string | null;
}
export interface RmktTarefa {
  id: string; remarketingId: string; conversaId: string | null;
  tipo: 'acao' | 'acompanhamento';
  contatoNome: string; etapa: RmktEtapa | null;
  responsavelId: string | null; responsavelNome: string | null;
  titulo: string; instrucoes: string | null; sugestaoMensagem: string | null;
  venceEm: string | null; criadoEm: string;
}
export interface RmktEvento { id: string; tipo: string; detalhe: Record<string, unknown>; usuarioId: string | null; criadoEm: string }
export interface RmktConfig {
  ativo: boolean; ativoDesde: string | null; fluxo1Min: number; pendenciaDias: number;
  recuperacaoDias: number; filaRecuperacao: string[];
}
export interface RmktDashboard {
  por_etapa: Record<string, number>;
  por_atendente: { id: string; nome: string; n: number }[];
  sem_responsavel: number; ativos: number;
  recuperados_hoje: number;
  recuperados_30d: number; perdidos_30d: number;
  taxa_recuperacao: number | null;
  tempo_medio_recuperacao_h: number | null; tempo_medio_sem_resposta_h: number | null;
  tarefas_pendentes: number; tarefas_vencidas: number;
}
export interface Notificacao { id: string; tipo: string; titulo: string; corpo: string | null; rota: string | null; lidaEm: string | null; criadoEm: string }

/* ---------- demo (modo demonstração — nada é gravado) ---------- */
const hAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
export const DEMO_DASH: RmktDashboard = {
  por_etapa: { remarketing_1: 2, pendencia: 3, recuperacao_1: 1, recuperacao_2: 1, recuperacao_3: 0 },
  por_atendente: [{ id: 'u-mock', nome: 'Atendente', n: 4 }, { id: 'u-2', nome: 'Juliana', n: 3 }],
  sem_responsavel: 2, ativos: 7, recuperados_hoje: 2, recuperados_30d: 9, perdidos_30d: 3, taxa_recuperacao: 75,
  tempo_medio_recuperacao_h: 26.4, tempo_medio_sem_resposta_h: 41.2, tarefas_pendentes: 5, tarefas_vencidas: 2,
};
const demoLead = (n: Partial<RmktLead> & { id: string; contatoNome: string; etapa: RmktEtapa }): RmktLead => ({
  origemFluxo: 'fluxo1_sem_resposta_bot', status: 'ativo', tentativas: 0, responsavelId: null, responsavelNome: null,
  proximaAcao: 'Contato imediato: mensagem personalizada + áudio', proximaAcaoEm: hAtras(1),
  entrouEtapaEm: hAtras(3), criadoEm: hAtras(3), encerradoEm: null, conversaId: 'c1', oportunidadeId: 'o' + n.id,
  contatoId: 'ct' + n.id, contatoTelefone: '5551999990000', ultimaEntradaEm: hAtras(30),
  instituicao: null, origem: 'WhatsApp', ...n,
});
export const DEMO_LEADS: RmktLead[] = [
  demoLead({ id: 'r1', contatoNome: 'Maria Aparecida Souza', etapa: 'remarketing_1', ultimaEntradaEm: hAtras(1) }),
  demoLead({ id: 'r2', contatoNome: 'José Carlos Ferreira', etapa: 'pendencia', origemFluxo: 'fluxo2_abandono_atendimento', responsavelId: 'u-mock', responsavelNome: 'Atendente', tentativas: 1, instituicao: 'BMG', ultimaEntradaEm: hAtras(52) }),
  demoLead({ id: 'r3', contatoNome: 'Sebastião R. Nunes', etapa: 'recuperacao_1', responsavelId: 'u-2', responsavelNome: 'Juliana', tentativas: 2, instituicao: 'Agibank', ultimaEntradaEm: hAtras(96) }),
  demoLead({ id: 'r4', contatoNome: 'Terezinha M. Alves', etapa: 'recuperacao_2', responsavelId: 'u-mock', responsavelNome: 'Atendente', tentativas: 3, ultimaEntradaEm: hAtras(150) }),
  demoLead({ id: 'r5', contatoNome: 'Cleusa M. Barros', etapa: 'pendencia', origemFluxo: 'fluxo2_abandono_atendimento', tentativas: 1, instituicao: 'Facta', ultimaEntradaEm: hAtras(60) }),
];
export const DEMO_TAREFAS: RmktTarefa[] = [
  { id: 't1', remarketingId: 'r1', conversaId: 'c1', tipo: 'acao', contatoNome: 'Maria Aparecida Souza', etapa: 'remarketing_1', responsavelId: null, responsavelNome: null, titulo: 'Recuperar lead — Remarketing 1', instrucoes: 'Envie uma mensagem personalizada, mande um áudio e tente recuperar o cliente.', sugestaoMensagem: null, venceEm: hAtras(6), criadoEm: hAtras(8) },
  { id: 't2', remarketingId: 'r2', conversaId: 'c2', tipo: 'acao', contatoNome: 'José Carlos Ferreira', etapa: 'pendencia', responsavelId: 'u-mock', responsavelNome: 'Atendente', titulo: 'Retomar atendimento pendente', instrucoes: 'Cliente demonstrou interesse e parou de responder.', sugestaoMensagem: 'Olá, tudo bem? Vi que sua análise ficou pendente. Falta muito pouco para concluirmos seu atendimento. Podemos finalizar agora?', venceEm: hAtras(-5), criadoEm: hAtras(4) },
  { id: 't3', remarketingId: 'r3', conversaId: 'c3', tipo: 'acao', contatoNome: 'Sebastião R. Nunes', etapa: 'recuperacao_1', responsavelId: 'u-2', responsavelNome: 'Juliana', titulo: 'Recuperação (1ª tentativa): ligar + WhatsApp + áudio', instrucoes: 'Faça uma ligação, envie WhatsApp e mande um áudio.', sugestaoMensagem: null, venceEm: hAtras(-30), criadoEm: hAtras(26) },
];
DEMO_TAREFAS.push(
  { id: 't4', remarketingId: 'r4', conversaId: 'c4', tipo: 'acompanhamento', contatoNome: 'Terezinha M. Alves', etapa: 'recuperacao_2', responsavelId: 'u-mock', responsavelNome: 'Atendente', titulo: 'Aguardar resposta do cliente', instrucoes: 'Se não responder até o prazo, o sistema escala sozinho.', sugestaoMensagem: null, venceEm: hAtras(-26), criadoEm: hAtras(20) },
  { id: 't5', remarketingId: 'r5', conversaId: 'c5', tipo: 'acao', contatoNome: 'Cleusa M. Barros', etapa: 'pendencia', responsavelId: null, responsavelNome: null, titulo: 'Retomar atendimento pendente', instrucoes: 'Retome com a mensagem sugerida.', sugestaoMensagem: 'Olá, tudo bem? Vi que sua análise ficou pendente. Podemos finalizar agora?', venceEm: hAtras(-80), criadoEm: hAtras(10) },
);
export const DEMO_EVENTOS: RmktEvento[] = [
  { id: 'e1', tipo: 'entrou_remarketing_1', detalhe: { etapa: 'remarketing_1' }, usuarioId: null, criadoEm: hAtras(72) },
  { id: 'e2', tipo: 'tarefa_concluida', detalhe: { titulo: 'Recuperar lead — Remarketing 1' }, usuarioId: 'u-mock', criadoEm: hAtras(70) },
  { id: 'e3', tipo: 'escalado', detalhe: { de: 'remarketing_1', para: 'recuperacao_1' }, usuarioId: null, criadoEm: hAtras(24) },
  { id: 'e4', tipo: 'transferido', detalhe: { de: 'recuperacao_1', para: 'recuperacao_2' }, usuarioId: null, criadoEm: hAtras(3) },
];
export const DEMO_NOTIFS: Notificacao[] = [
  { id: 'n1', tipo: 'remarketing', titulo: 'Novo lead entrou no Remarketing 1', corpo: 'O cliente ficou 15 minutos sem responder o fluxo inicial. Faça contato imediatamente.', rota: '/remarketing', lidaEm: null, criadoEm: hAtras(1) },
  { id: 'n2', tipo: 'remarketing', titulo: 'Lead com atendimento pendente', corpo: 'Cliente está há 2 dias sem responder. Retome o contato.', rota: '/remarketing', lidaEm: null, criadoEm: hAtras(4) },
  { id: 'n3', tipo: 'remarketing', titulo: 'Cliente respondeu — recuperado! 🎉', corpo: 'O cliente voltou a responder e saiu do remarketing.', rota: '/whatsapp', lidaEm: hAtras(20), criadoEm: hAtras(22) },
];

/* ---------- hooks ---------- */
export function useRemarketingDashboard() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['rmkt-dash', currentOrg.id],
    staleTime: 20_000, refetchInterval: 60_000,
    queryFn: async (): Promise<RmktDashboard> => {
      if (!REMARKETING_REAL) return DEMO_DASH;
      const { data, error } = await supabase!.rpc('remarketing_dashboard', { p_org: currentOrg.id });
      if (error) throw new Error(error.message);
      return (data ?? DEMO_DASH) as RmktDashboard;
    },
  });
}

interface DbLead {
  id: string; etapa: RmktEtapa; origem_fluxo: string; status: string; tentativas: number;
  responsavel_id: string | null; proxima_acao: string | null; proxima_acao_em: string | null;
  entrou_etapa_em: string; criado_em: string; encerrado_em: string | null;
  conversa_id: string | null; oportunidade_id: string; contato_id: string;
  contatos: { nome: string | null; telefone: string | null } | null;
  usuarios: { nome: string | null } | null;
  conversas: { ultima_entrada_em: string | null } | null;
  oportunidades: { instituicao: string | null; origem: string | null } | null;
}
export function useRemarketingLeads(status: 'ativo' | 'encerrados') {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['rmkt-leads', currentOrg.id, status],
    staleTime: 15_000, refetchInterval: 60_000,
    queryFn: async (): Promise<RmktLead[]> => {
      if (!REMARKETING_REAL) return status === 'ativo' ? DEMO_LEADS : [];
      let q = supabase!
        .from('remarketing_leads')
        .select('id, etapa, origem_fluxo, status, tentativas, responsavel_id, proxima_acao, proxima_acao_em, entrou_etapa_em, criado_em, encerrado_em, conversa_id, oportunidade_id, contato_id, contatos(nome, telefone), usuarios(nome), conversas(ultima_entrada_em), oportunidades(instituicao, origem)')
        .eq('organizacao_id', currentOrg.id)
        .order('entrou_etapa_em', { ascending: false })
        .limit(400);
      q = status === 'ativo' ? q.eq('status', 'ativo') : q.in('status', ['recuperado', 'perdido']);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return ((data as unknown as DbLead[]) ?? []).map((r) => ({
        id: r.id, etapa: r.etapa, origemFluxo: r.origem_fluxo, status: r.status, tentativas: r.tentativas,
        responsavelId: r.responsavel_id, responsavelNome: r.usuarios?.nome ?? null,
        proximaAcao: r.proxima_acao, proximaAcaoEm: r.proxima_acao_em,
        entrouEtapaEm: r.entrou_etapa_em, criadoEm: r.criado_em, encerradoEm: r.encerrado_em,
        conversaId: r.conversa_id, oportunidadeId: r.oportunidade_id,
        contatoId: r.contato_id, contatoNome: r.contatos?.nome || 'Contato', contatoTelefone: r.contatos?.telefone ?? null,
        ultimaEntradaEm: r.conversas?.ultima_entrada_em ?? null,
        instituicao: r.oportunidades?.instituicao ?? null, origem: r.oportunidades?.origem ?? null,
      }));
    },
  });
}

interface DbTarefa {
  id: string; remarketing_id: string; conversa_id: string | null; responsavel_id: string | null; tipo: 'acao' | 'acompanhamento';
  titulo: string; instrucoes: string | null; sugestao_mensagem: string | null; vence_em: string | null; criado_em: string;
  contatos: { nome: string | null } | null;
  usuarios: { nome: string | null } | null;
  remarketing_leads: { etapa: RmktEtapa } | null;
}
export function useRemarketingTarefas() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['rmkt-tarefas', currentOrg.id],
    staleTime: 15_000, refetchInterval: 45_000,
    queryFn: async (): Promise<RmktTarefa[]> => {
      if (!REMARKETING_REAL) return DEMO_TAREFAS;
      const { data, error } = await supabase!
        .from('remarketing_tarefas')
        .select('id, remarketing_id, conversa_id, responsavel_id, tipo, titulo, instrucoes, sugestao_mensagem, vence_em, criado_em, contatos(nome), usuarios(nome), remarketing_leads(etapa)')
        .eq('organizacao_id', currentOrg.id)
        .eq('status', 'pendente')
        .order('vence_em', { ascending: true, nullsFirst: false });
      if (error) throw new Error(error.message);
      return ((data as unknown as DbTarefa[]) ?? []).map((t) => ({
        id: t.id, remarketingId: t.remarketing_id, conversaId: t.conversa_id, tipo: t.tipo ?? 'acao',
        contatoNome: t.contatos?.nome || 'Contato', etapa: t.remarketing_leads?.etapa ?? null,
        responsavelId: t.responsavel_id, responsavelNome: t.usuarios?.nome ?? null,
        titulo: t.titulo, instrucoes: t.instrucoes, sugestaoMensagem: t.sugestao_mensagem,
        venceEm: t.vence_em, criadoEm: t.criado_em,
      }));
    },
  });
}

export function useRemarketingEventos(remarketingId: string | null) {
  return useQuery({
    queryKey: ['rmkt-eventos', remarketingId],
    enabled: !!remarketingId,
    queryFn: async (): Promise<RmktEvento[]> => {
      if (!REMARKETING_REAL) return DEMO_EVENTOS;
      const { data, error } = await supabase!
        .from('remarketing_eventos')
        .select('id, tipo, detalhe, usuario_id, criado_em')
        .eq('remarketing_id', remarketingId!)
        .order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; tipo: string; detalhe: Record<string, unknown>; usuario_id: string | null; criado_em: string }[])
        .map((e) => ({ id: e.id, tipo: e.tipo, detalhe: e.detalhe ?? {}, usuarioId: e.usuario_id, criadoEm: e.criado_em }));
    },
  });
}

export function useConcluirTarefa() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tarefaId: string) => {
      if (!REMARKETING_REAL) return;
      const { error } = await supabase!.rpc('remarketing_tarefa_concluir', { p_tarefa: tarefaId });
      if (error) throw new Error(error.message);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['rmkt-tarefas', currentOrg.id] });
      qc.invalidateQueries({ queryKey: ['rmkt-leads', currentOrg.id] });
      qc.invalidateQueries({ queryKey: ['rmkt-dash', currentOrg.id] });
    },
  });
}

export function useRemarketingConfig() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['rmkt-config', currentOrg.id],
    queryFn: async (): Promise<RmktConfig> => {
      if (!REMARKETING_REAL) return { ativo: false, ativoDesde: null, fluxo1Min: 15, pendenciaDias: 2, recuperacaoDias: 3, filaRecuperacao: [] };
      const { data, error } = await supabase!
        .from('remarketing_config')
        .select('ativo, ativo_desde, fluxo1_min, pendencia_dias, recuperacao_dias, fila_recuperacao')
        .eq('organizacao_id', currentOrg.id).maybeSingle();
      if (error) throw new Error(error.message);
      return data
        ? { ativo: data.ativo, ativoDesde: data.ativo_desde, fluxo1Min: data.fluxo1_min, pendenciaDias: data.pendencia_dias, recuperacaoDias: data.recuperacao_dias, filaRecuperacao: data.fila_recuperacao ?? [] }
        : { ativo: false, ativoDesde: null, fluxo1Min: 15, pendenciaDias: 2, recuperacaoDias: 3, filaRecuperacao: [] };
    },
  });
}

export function useSalvarRemarketingConfig() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: RmktConfig) => {
      if (!REMARKETING_REAL) return;
      const { error } = await supabase!.rpc('remarketing_config_salvar', {
        p_org: currentOrg.id, p_ativo: c.ativo, p_fluxo1_min: c.fluxo1Min,
        p_pendencia_dias: c.pendenciaDias, p_recuperacao_dias: c.recuperacaoDias, p_fila: c.filaRecuperacao,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['rmkt-config', currentOrg.id] }),
  });
}

/* ---------- notificações (central persistida) ---------- */
export function useNotificacoes() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['notificacoes', currentOrg.id],
    staleTime: 10_000, refetchInterval: 30_000,
    queryFn: async (): Promise<Notificacao[]> => {
      if (!REMARKETING_REAL) return DEMO_NOTIFS;
      const { data, error } = await supabase!
        .from('notificacoes')
        .select('id, tipo, titulo, corpo, rota, lida_em, criado_em')
        .eq('organizacao_id', currentOrg.id)
        .order('criado_em', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; tipo: string; titulo: string; corpo: string | null; rota: string | null; lida_em: string | null; criado_em: string }[])
        .map((n) => ({ id: n.id, tipo: n.tipo, titulo: n.titulo, corpo: n.corpo, rota: n.rota, lidaEm: n.lida_em, criadoEm: n.criado_em }));
    },
  });
}

/* ---------- ações rápidas da fila (F2.5 operacional) ---------- */
function useAcaoRmkt<TArgs>(fn: (args: TArgs) => Promise<void>) {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['rmkt-tarefas', currentOrg.id] });
      qc.invalidateQueries({ queryKey: ['rmkt-leads', currentOrg.id, 'ativo'] });
      qc.invalidateQueries({ queryKey: ['rmkt-leads', currentOrg.id, 'encerrados'] });
      qc.invalidateQueries({ queryKey: ['rmkt-dash', currentOrg.id] });
    },
  });
}
export function useTransferirLead() {
  return useAcaoRmkt(async (a: { leadId: string; usuarioId: string }) => {
    if (!REMARKETING_REAL) return;
    const { error } = await supabase!.rpc('remarketing_transferir', { p_lead: a.leadId, p_usuario: a.usuarioId });
    if (error) throw new Error(error.message);
  });
}
export function useReagendarTarefa() {
  return useAcaoRmkt(async (a: { tarefaId: string; quando: string }) => {
    if (!REMARKETING_REAL) return;
    const { error } = await supabase!.rpc('remarketing_reagendar', { p_tarefa: a.tarefaId, p_quando: a.quando });
    if (error) throw new Error(error.message);
  });
}
export function useRegistrarAcao() {
  return useAcaoRmkt(async (a: { leadId: string; acao: 'ligacao' | 'audio' | 'whatsapp' }) => {
    if (!REMARKETING_REAL) return;
    const { error } = await supabase!.rpc('remarketing_registrar_acao', { p_lead: a.leadId, p_acao: a.acao });
    if (error) throw new Error(error.message);
  });
}

export function useMudarEtapa() {
  return useAcaoRmkt(async (a: { leadId: string; etapa: RmktEtapa }) => {
    if (!REMARKETING_REAL) return;
    const { error } = await supabase!.rpc('remarketing_mudar_etapa', { p_lead: a.leadId, p_etapa: a.etapa });
    if (error) throw new Error(error.message);
  });
}
export function useObservacao() {
  return useAcaoRmkt(async (a: { leadId: string; texto: string }) => {
    if (!REMARKETING_REAL) return;
    const { error } = await supabase!.rpc('remarketing_observacao', { p_lead: a.leadId, p_texto: a.texto });
    if (error) throw new Error(error.message);
  });
}

export interface RmktProdutividade {
  id: string; nome: string; tarefas: number; vencidas: number; concluidas_hoje: number;
  recuperados_30d: number; tempo_medio_conclusao_h: number | null; tempo_medio_recuperacao_h: number | null;
}
export const DEMO_PROD: RmktProdutividade[] = [
  { id: 'u-mock', nome: 'Atendente', tarefas: 3, vencidas: 2, concluidas_hoje: 5, recuperados_30d: 6, tempo_medio_conclusao_h: 3.2, tempo_medio_recuperacao_h: 22.5 },
  { id: 'u-2', nome: 'Juliana', tarefas: 2, vencidas: 1, concluidas_hoje: 3, recuperados_30d: 3, tempo_medio_conclusao_h: 5.1, tempo_medio_recuperacao_h: 30.0 },
];
export function useProdutividade(habilitado: boolean) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['rmkt-prod', currentOrg.id],
    enabled: habilitado,
    staleTime: 30_000,
    queryFn: async (): Promise<RmktProdutividade[]> => {
      if (!REMARKETING_REAL) return DEMO_PROD;
      const { data, error } = await supabase!.rpc('remarketing_produtividade', { p_org: currentOrg.id });
      if (error) throw new Error(error.message);
      return (data ?? []) as RmktProdutividade[];
    },
  });
}

/* ---------- realtime: a fila atualiza sem F5 ----------
   Tabelas já na publication (F1/F2.5). Canal único por org, montado UMA vez
   pela página (mesma cautela do sla.ts: nunca .on depois de subscribe). */
export function useRemarketingRealtime() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  useEffect(() => {
    if (!REMARKETING_REAL || !currentOrg.id) return;
    const inval = () => {
      qc.invalidateQueries({ queryKey: ['rmkt-tarefas', currentOrg.id] });
      qc.invalidateQueries({ queryKey: ['rmkt-leads', currentOrg.id, 'ativo'] });
      qc.invalidateQueries({ queryKey: ['rmkt-dash', currentOrg.id] });
      qc.invalidateQueries({ queryKey: ['notificacoes', currentOrg.id] });
    };
    const ch = supabase!
      .channel(`rmkt-${currentOrg.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'remarketing_leads', filter: `organizacao_id=eq.${currentOrg.id}` }, inval)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'remarketing_tarefas', filter: `organizacao_id=eq.${currentOrg.id}` }, inval)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `organizacao_id=eq.${currentOrg.id}` }, inval)
      .subscribe();
    return () => { supabase!.removeChannel(ch); };
  }, [currentOrg.id, qc]);
}

export function useMarcarNotificacao() {
  const { currentOrg } = useOrg();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; todas?: boolean }) => {
      if (!REMARKETING_REAL) return;
      if (input.todas) {
        const { error } = await supabase!.rpc('notificacoes_marcar_todas', { p_org: currentOrg.id });
        if (error) throw new Error(error.message);
      } else if (input.id) {
        const { error } = await supabase!.rpc('notificacao_marcar_lida', { p_id: input.id });
        if (error) throw new Error(error.message);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notificacoes', currentOrg.id] }),
  });
}
