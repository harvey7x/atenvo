import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

/** Backend real disponível (fora do modo demo/mock). */
export const REL_REAL = isSupabaseConfigured && !!supabase;

// ---------------------------------------------------------------------------
// Vocabulários (rótulos de UI)
// ---------------------------------------------------------------------------
export type ReguaObjetivo =
  | 'relacionamento_cliente' | 'nutricao_lead' | 'reativacao'
  | 'documentacao' | 'pos_reuniao' | 'data_comemorativa' | 'conteudo';

export const OBJETIVOS: { id: ReguaObjetivo; label: string; nutricao: boolean }[] = [
  { id: 'relacionamento_cliente', label: 'Relacionamento — cliente fechado', nutricao: false },
  { id: 'nutricao_lead', label: 'Nutrição — lead', nutricao: true },
  { id: 'reativacao', label: 'Reativação', nutricao: true },
  { id: 'documentacao', label: 'Documentação pendente', nutricao: true },
  { id: 'pos_reuniao', label: 'Pós-reunião', nutricao: true },
  { id: 'data_comemorativa', label: 'Datas comemorativas', nutricao: false },
  { id: 'conteudo', label: 'Notícias e conteúdos', nutricao: true },
];
export const objetivoInfo = (o: string) => OBJETIVOS.find((x) => x.id === o) ?? { id: o as ReguaObjetivo, label: o, nutricao: false };

export type ReguaStatus = 'rascunho' | 'ativa' | 'arquivada';
export const REGUA_STATUS: Record<ReguaStatus, { label: string; badge: string }> = {
  rascunho: { label: 'Rascunho', badge: 'neutral' },
  ativa: { label: 'Ativa', badge: 'ok' },
  arquivada: { label: 'Arquivada', badge: 'neutral' },
};

export type AtivacaoStatus = 'ativo' | 'pausado' | 'desativado' | 'bloqueada';
export const ATIV_STATUS: Record<AtivacaoStatus, { label: string; badge: string }> = {
  ativo: { label: 'Ativo', badge: 'ok' },
  pausado: { label: 'Pausado', badge: 'warn' },
  desativado: { label: 'Desativado', badge: 'neutral' },
  bloqueada: { label: 'Bloqueada', badge: 'err' },
};

export type PassoTipo = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'texto_midia';
export const PASSO_TIPOS: { id: PassoTipo; label: string }[] = [
  { id: 'texto', label: 'Texto' },
  { id: 'imagem', label: 'Imagem' },
  { id: 'audio', label: 'Áudio' },
  { id: 'documento', label: 'Documento' },
  { id: 'texto_midia', label: 'Texto + mídia' },
];

export type AgendamentoTipo = 'relativo' | 'semanal' | 'data_fixa';
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']; // índice 0..6 = dow

// ---------------------------------------------------------------------------
// Tipos de domínio (camelCase) + mapeamento das linhas (snake_case)
// ---------------------------------------------------------------------------
export interface Regua {
  id: string; nome: string; objetivo: ReguaObjetivo; status: ReguaStatus;
  publicoSugerido: string | null; pausarSeResponder: boolean;
  tetoSemana: number; intervaloMinHoras: number;
  diasSemana: number[]; horaInicio: string; horaFim: string; timezone: string;
  canalPadraoId: string | null; criadoEm: string;
}
interface ReguaRow {
  id: string; nome: string; objetivo: ReguaObjetivo; status: ReguaStatus;
  publico_sugerido: string | null; pausar_se_responder: boolean;
  teto_semana: number; intervalo_min_horas: number;
  dias_semana: number[]; hora_inicio: string; hora_fim: string; timezone: string;
  canal_padrao_id: string | null; criado_em: string;
}
const mapRegua = (r: ReguaRow): Regua => ({
  id: r.id, nome: r.nome, objetivo: r.objetivo, status: r.status,
  publicoSugerido: r.publico_sugerido, pausarSeResponder: r.pausar_se_responder,
  tetoSemana: r.teto_semana, intervaloMinHoras: r.intervalo_min_horas,
  diasSemana: r.dias_semana ?? [], horaInicio: r.hora_inicio, horaFim: r.hora_fim, timezone: r.timezone,
  canalPadraoId: r.canal_padrao_id, criadoEm: r.criado_em,
});

export interface Passo {
  id: string; reguaId: string; ordem: number; tituloInterno: string; tipo: PassoTipo;
  texto: string | null; storagePath: string | null; mimeType: string | null; nomeArquivo: string | null;
  agendamentoTipo: AgendamentoTipo; offsetHoras: number | null; diaSemana: number | null; hora: string | null; data: string | null;
}
interface PassoRow {
  id: string; regua_id: string; ordem: number; titulo_interno: string; tipo: PassoTipo;
  texto: string | null; storage_path: string | null; mime_type: string | null; nome_arquivo: string | null;
  agendamento_tipo: AgendamentoTipo; offset_horas: number | null; dia_semana: number | null; hora: string | null; data: string | null;
}
const mapPasso = (r: PassoRow): Passo => ({
  id: r.id, reguaId: r.regua_id, ordem: r.ordem, tituloInterno: r.titulo_interno, tipo: r.tipo,
  texto: r.texto, storagePath: r.storage_path, mimeType: r.mime_type, nomeArquivo: r.nome_arquivo,
  agendamentoTipo: r.agendamento_tipo, offsetHoras: r.offset_horas, diaSemana: r.dia_semana, hora: r.hora, data: r.data,
});

export interface Ativacao {
  id: string; reguaId: string; contatoId: string; conversaId: string | null; canalId: string | null;
  responsavelId: string | null; status: AtivacaoStatus; passoAtual: number; proximoEm: string | null;
  ativadoEm: string; pausadoEm: string | null; desativadoEm: string | null; motivoSaida: string | null;
  reguaNome: string | null; reguaObjetivo: ReguaObjetivo | null;
  contatoNome: string | null; contatoTelefone: string | null;
  canalNome: string | null; canalNumero: string | null; responsavelNome: string | null;
}
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
interface AtivRow {
  id: string; regua_id: string; contato_id: string; conversa_id: string | null; canal_id: string | null;
  responsavel_id: string | null; status: AtivacaoStatus; passo_atual: number; proximo_em: string | null;
  ativado_em: string; pausado_em: string | null; desativado_em: string | null; motivo_saida: string | null;
  regua: { nome: string; objetivo: ReguaObjetivo } | { nome: string; objetivo: ReguaObjetivo }[] | null;
  contato: { nome: string; telefone: string | null } | { nome: string; telefone: string | null }[] | null;
  canal: { nome_interno: string | null; numero_conectado: string | null } | { nome_interno: string | null; numero_conectado: string | null }[] | null;
  responsavel: { nome: string } | { nome: string }[] | null;
}
const ATIV_SELECT =
  'id, regua_id, contato_id, conversa_id, canal_id, responsavel_id, status, passo_atual, proximo_em, ativado_em, pausado_em, desativado_em, motivo_saida, ' +
  'regua:reguas!fk_ativ_regua(nome, objetivo), contato:contatos!fk_ativ_contato(nome, telefone), ' +
  'canal:canais!fk_ativ_canal(nome_interno, numero_conectado), responsavel:usuarios!fk_ativ_resp(nome)';
function mapAtiv(r: AtivRow): Ativacao {
  const rg = one(r.regua); const ct = one(r.contato); const cn = one(r.canal); const rp = one(r.responsavel);
  return {
    id: r.id, reguaId: r.regua_id, contatoId: r.contato_id, conversaId: r.conversa_id, canalId: r.canal_id,
    responsavelId: r.responsavel_id, status: r.status, passoAtual: r.passo_atual, proximoEm: r.proximo_em,
    ativadoEm: r.ativado_em, pausadoEm: r.pausado_em, desativadoEm: r.desativado_em, motivoSaida: r.motivo_saida,
    reguaNome: rg?.nome ?? null, reguaObjetivo: rg?.objetivo ?? null,
    contatoNome: ct?.nome ?? null, contatoTelefone: ct?.telefone ?? null,
    canalNome: cn?.nome_interno ?? null, canalNumero: cn?.numero_conectado ?? null, responsavelNome: rp?.nome ?? null,
  };
}

export interface CanalNormal { id: string; nome: string; numero: string | null }

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------
export function useReguas() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['reguas', currentOrg.id],
    enabled: REL_REAL,
    queryFn: async (): Promise<Regua[]> => {
      const { data, error } = await supabase!.from('reguas')
        .select('id, nome, objetivo, status, publico_sugerido, pausar_se_responder, teto_semana, intervalo_min_horas, dias_semana, hora_inicio, hora_fim, timezone, canal_padrao_id, criado_em')
        .eq('organizacao_id', currentOrg.id)
        .order('criado_em', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as unknown as ReguaRow[]) ?? []).map(mapRegua);
    },
  });
}

export function usePassos(reguaId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['regua-passos', currentOrg.id, reguaId],
    enabled: REL_REAL && !!reguaId,
    queryFn: async (): Promise<Passo[]> => {
      const { data, error } = await supabase!.from('regua_passos')
        .select('id, regua_id, ordem, titulo_interno, tipo, texto, storage_path, mime_type, nome_arquivo, agendamento_tipo, offset_horas, dia_semana, hora, data')
        .eq('regua_id', reguaId!).order('ordem', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as unknown as PassoRow[]) ?? []).map(mapPasso);
    },
  });
}

/** Ativações da org. status='__vivas__' filtra ativo+pausado (clientes em relacionamento). */
export function useAtivacoes(status: 'vivas' | AtivacaoStatus | 'todas' = 'vivas') {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['relacionamento-ativacoes', currentOrg.id, status],
    enabled: REL_REAL,
    refetchInterval: 30_000,
    queryFn: async (): Promise<Ativacao[]> => {
      let q = supabase!.from('regua_ativacoes').select(ATIV_SELECT).eq('organizacao_id', currentOrg.id);
      if (status === 'vivas') q = q.in('status', ['ativo', 'pausado']);
      else if (status !== 'todas') q = q.eq('status', status);
      const { data, error } = await q.order('ativado_em', { ascending: false });
      if (error) throw new Error(error.message);
      return ((data as unknown as AtivRow[]) ?? []).map(mapAtiv);
    },
  });
}

/** Ativação viva (ativo/pausado) de um contato — usada no box do cliente (WhatsApp/Kanban). */
export function useAtivacaoDoContato(contatoId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['relacionamento-contato', currentOrg.id, contatoId],
    enabled: REL_REAL && !!contatoId,
    queryFn: async (): Promise<Ativacao | null> => {
      const { data, error } = await supabase!.from('regua_ativacoes').select(ATIV_SELECT)
        .eq('organizacao_id', currentOrg.id).eq('contato_id', contatoId!)
        .in('status', ['ativo', 'pausado']).limit(1);
      if (error) throw new Error(error.message);
      const rows = (data as unknown as AtivRow[]) ?? [];
      return rows.length ? mapAtiv(rows[0]) : null;
    },
  });
}

/** Bloqueio "não incomodar" de um contato. */
export function useBloqueio(contatoId: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['relacionamento-bloqueio', currentOrg.id, contatoId],
    enabled: REL_REAL && !!contatoId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase!.from('relacionamento_bloqueio').select('contato_id')
        .eq('contato_id', contatoId!).limit(1);
      if (error) throw new Error(error.message);
      return ((data as unknown[]) ?? []).length > 0;
    },
  });
}

/** Canais NORMAIS enviáveis (transporte evolution, papel atendimento/ambos, conectado). */
export function useCanaisNormais() {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['relacionamento-canais', currentOrg.id],
    enabled: REL_REAL,
    queryFn: async (): Promise<CanalNormal[]> => {
      const { data, error } = await supabase!.from('canais')
        .select('id, nome_interno, numero_conectado, ativo, status_integracao, envio_restrito, conflito_com, transporte, papel')
        .eq('organizacao_id', currentOrg.id)
        .eq('transporte', 'evolution').eq('ativo', true).eq('status_integracao', 'conectado').eq('envio_restrito', false)
        .is('conflito_com', null).in('papel', ['atendimento', 'ambos']);
      if (error) throw new Error(error.message);
      return ((data as { id: string; nome_interno: string | null; numero_conectado: string | null }[]) ?? [])
        .map((c) => ({ id: c.id, nome: c.nome_interno || 'Canal', numero: c.numero_conectado }));
    },
  });
}

/** Histórico de envios (regua_envios). Vazio enquanto o motor estiver inerte. */
export interface Envio {
  id: string; ativacaoId: string; status: string; executarEm: string | null; enviadoEm: string | null;
  respostaEm: string | null; erro: string | null; criadoEm: string;
  reguaNome: string | null; contatoNome: string | null;
}
export function useHistoricoEnvios(limit = 100) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['relacionamento-envios', currentOrg.id, limit],
    enabled: REL_REAL,
    queryFn: async (): Promise<Envio[]> => {
      const { data, error } = await supabase!.from('regua_envios')
        .select('id, ativacao_id, status, executar_em, enviado_em, resposta_em, erro, criado_em, ativacao:regua_ativacoes!fk_env_ativ(contato:contatos!fk_ativ_contato(nome), regua:reguas!fk_ativ_regua(nome))')
        .eq('organizacao_id', currentOrg.id).order('criado_em', { ascending: false }).limit(limit);
      if (error) throw new Error(error.message);
      type Row = { id: string; ativacao_id: string; status: string; executar_em: string | null; enviado_em: string | null; resposta_em: string | null; erro: string | null; criado_em: string; ativacao: unknown };
      return ((data as unknown as Row[]) ?? []).map((r) => {
        const a = one(r.ativacao as Record<string, unknown> | Record<string, unknown>[] | null) as { contato?: unknown; regua?: unknown } | null;
        const ct = a ? one(a.contato as { nome: string } | { nome: string }[] | null) : null;
        const rg = a ? one(a.regua as { nome: string } | { nome: string }[] | null) : null;
        return { id: r.id, ativacaoId: r.ativacao_id, status: r.status, executarEm: r.executar_em, enviadoEm: r.enviado_em, respostaEm: r.resposta_em, erro: r.erro, criadoEm: r.criado_em, reguaNome: rg?.nome ?? null, contatoNome: ct?.nome ?? null };
      });
    },
  });
}

/** Busca de contatos (para ativar relacionamento a partir da aba). */
export function useContatosBusca(termo: string) {
  const { currentOrg } = useOrg();
  return useQuery({
    queryKey: ['relacionamento-contatos', currentOrg.id, termo],
    enabled: REL_REAL && termo.trim().length >= 2,
    queryFn: async (): Promise<{ id: string; nome: string; telefone: string | null }[]> => {
      const t = termo.trim();
      const { data, error } = await supabase!.from('contatos').select('id, nome, telefone')
        .eq('organizacao_id', currentOrg.id).is('mesclado_em', null)
        .or(`nome.ilike.%${t}%,telefone.ilike.%${t}%`).limit(8);
      if (error) throw new Error(error.message);
      return (data as { id: string; nome: string; telefone: string | null }[]) ?? [];
    },
  });
}

// ---------------------------------------------------------------------------
// Escritas (RPCs SECURITY DEFINER — gate de papel no banco)
// ---------------------------------------------------------------------------
function useInvalidar() {
  const { currentOrg } = useOrg(); const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['reguas', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['relacionamento-ativacoes', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['relacionamento-contato', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['relacionamento-bloqueio', currentOrg.id] });
    qc.invalidateQueries({ queryKey: ['relacionamento-envios', currentOrg.id] });
  };
}

export interface ReguaInput {
  id?: string | null; nome?: string; objetivo?: string; status?: string; publico?: string | null;
  pausarSeResponder?: boolean; tetoSemana?: number; intervaloMinHoras?: number;
  diasSemana?: number[]; horaInicio?: string; horaFim?: string; timezone?: string; canalPadrao?: string | null;
}
export function useSalvarRegua() {
  const { currentOrg } = useOrg(); const inval = useInvalidar();
  return useMutation({
    mutationFn: async (v: ReguaInput): Promise<Regua> => {
      const { data, error } = await supabase!.rpc('regua_salvar', {
        p_org: currentOrg.id, p_id: v.id ?? null, p_nome: v.nome ?? null, p_objetivo: v.objetivo ?? null,
        p_status: v.status ?? null, p_publico: v.publico ?? null, p_pausar_se_responder: v.pausarSeResponder ?? null,
        p_teto_semana: v.tetoSemana ?? null, p_intervalo_min_horas: v.intervaloMinHoras ?? null,
        p_dias_semana: v.diasSemana ?? null, p_hora_inicio: v.horaInicio ?? null, p_hora_fim: v.horaFim ?? null,
        p_timezone: v.timezone ?? null, p_canal_padrao: v.canalPadrao ?? null,
      });
      if (error) throw new Error(error.message);
      return mapRegua(data as unknown as ReguaRow);
    },
    onSettled: inval,
  });
}
export function useArquivarRegua() {
  const { currentOrg } = useOrg(); const inval = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase!.rpc('regua_arquivar', { p_org: currentOrg.id, p_id: id }); if (error) throw new Error(error.message); },
    onSettled: inval,
  });
}
export function useExcluirRegua() {
  const { currentOrg } = useOrg(); const inval = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase!.rpc('regua_excluir', { p_org: currentOrg.id, p_id: id }); if (error) throw new Error(error.message); },
    onSettled: inval,
  });
}

export interface PassoInput {
  id?: string | null; reguaId: string; ordem: number; titulo: string; tipo: string;
  texto?: string | null; storagePath?: string | null; mime?: string | null; nome?: string | null; tamanho?: number | null;
  agendamentoTipo: string; offsetHoras?: number | null; diaSemana?: number | null; hora?: string | null; data?: string | null;
}
export function useSalvarPasso() {
  const { currentOrg } = useOrg(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: PassoInput): Promise<Passo> => {
      const { data, error } = await supabase!.rpc('regua_passo_salvar', {
        p_org: currentOrg.id, p_regua: v.reguaId, p_id: v.id ?? null, p_ordem: v.ordem, p_titulo: v.titulo, p_tipo: v.tipo,
        p_texto: v.texto ?? null, p_storage_path: v.storagePath ?? null, p_mime: v.mime ?? null, p_nome: v.nome ?? null, p_tamanho: v.tamanho ?? null,
        p_agendamento_tipo: v.agendamentoTipo, p_offset_horas: v.offsetHoras ?? null, p_dia_semana: v.diaSemana ?? null, p_hora: v.hora ?? null, p_data: v.data ?? null,
      });
      if (error) throw new Error(error.message);
      return mapPasso(data as unknown as PassoRow);
    },
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: ['regua-passos', currentOrg.id, v.reguaId] }),
  });
}
export function useRemoverPasso() {
  const { currentOrg } = useOrg(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; reguaId: string }) => { const { error } = await supabase!.rpc('regua_passo_remover', { p_org: currentOrg.id, p_id: v.id }); if (error) throw new Error(error.message); },
    onSettled: (_d, _e, v) => qc.invalidateQueries({ queryKey: ['regua-passos', currentOrg.id, v.reguaId] }),
  });
}

export function useAtivarRelacionamento() {
  const { currentOrg } = useOrg(); const inval = useInvalidar();
  return useMutation({
    mutationFn: async (v: { reguaId: string; contatoId: string; canalId: string; conversaId?: string | null }) => {
      const { data, error } = await supabase!.rpc('regua_ativar', {
        p_org: currentOrg.id, p_regua: v.reguaId, p_contato: v.contatoId, p_canal: v.canalId, p_conversa: v.conversaId ?? null,
      });
      if (error) throw new Error(error.message);
      return data as unknown;
    },
    onSettled: inval,
  });
}
function useAcaoAtivacao(rpc: string) {
  const inval = useInvalidar();
  return useMutation({
    mutationFn: async (v: { ativacaoId: string; motivo?: string }) => {
      const params: Record<string, unknown> = { p_ativacao: v.ativacaoId };
      if (rpc === 'regua_desativar') params.p_motivo = v.motivo ?? null;
      const { error } = await supabase!.rpc(rpc, params);
      if (error) throw new Error(error.message);
    },
    onSettled: inval,
  });
}
export const usePausar = () => useAcaoAtivacao('regua_pausar');
export const useRetomar = () => useAcaoAtivacao('regua_retomar');
export const useDesativar = () => useAcaoAtivacao('regua_desativar');

export function useTrocarRegua() {
  const inval = useInvalidar();
  return useMutation({
    mutationFn: async (v: { ativacaoId: string; novaReguaId: string }) => {
      const { error } = await supabase!.rpc('regua_trocar', { p_ativacao: v.ativacaoId, p_nova_regua: v.novaReguaId });
      if (error) throw new Error(error.message);
    },
    onSettled: inval,
  });
}
export function useBloquear() {
  const { currentOrg } = useOrg(); const inval = useInvalidar();
  return useMutation({
    mutationFn: async (v: { contatoId: string; motivo?: string }) => { const { error } = await supabase!.rpc('relacionamento_bloquear', { p_org: currentOrg.id, p_contato: v.contatoId, p_motivo: v.motivo ?? null }); if (error) throw new Error(error.message); },
    onSettled: inval,
  });
}
export function useDesbloquear() {
  const { currentOrg } = useOrg(); const inval = useInvalidar();
  return useMutation({
    mutationFn: async (contatoId: string) => { const { error } = await supabase!.rpc('relacionamento_desbloquear', { p_org: currentOrg.id, p_contato: contatoId }); if (error) throw new Error(error.message); },
    onSettled: inval,
  });
}

/** admin/gestor podem gerir réguas e ativar em qualquer contato; atendente só nos próprios. */
export function podeGerirReguas(role: string) { return role === 'admin'; }
export function podeGerirRelacionamento(role: string) { return role === 'admin' || role === 'gestor'; }

/** Traduz mensagens de erro dos RPCs para texto amigável. */
export function traduzErro(msg: string): string {
  const m: Record<string, string> = {
    sem_permissao: 'Você não tem permissão para esta ação.',
    canal_nao_enviavel: 'Este canal não está disponível para envio (precisa ser um número normal conectado).',
    canal_nao_encontrado: 'Canal não encontrado.',
    contato_bloqueado: 'Este contato está marcado como "não incomodar".',
    ja_tem_relacionamento_ativo: 'Este cliente já tem um relacionamento ativo. Troque a régua em vez de ativar outra.',
    regua_nao_ativa: 'A régua precisa estar ativa para ser aplicada a um cliente.',
    regua_possui_historico: 'Esta régua já foi usada e não pode ser excluída — arquive-a.',
    conversa_invalida: 'A conversa informada não é válida para este cliente.',
    contato_nao_encontrado: 'Contato não encontrado.',
    nome_obrigatorio: 'Informe o nome da régua.',
    objetivo_obrigatorio: 'Escolha o objetivo da régua.',
  };
  for (const k of Object.keys(m)) if (msg.includes(k)) return m[k];
  return msg;
}
