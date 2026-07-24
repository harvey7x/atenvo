import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

export const KANBAN_REAL = isSupabaseConfigured && !!supabase;

export type ColResultado = 'neutro' | 'ganho' | 'perdido';
export interface KColuna { id: string; nome: string; cor: string; ordem: number; entrada: boolean; resultado: ColResultado; encerra: boolean; }

export type MovimentoTipo = 'neutro' | 'ganho' | 'perdido' | 'reabertura';
/** Decide o efeito de mover um card de uma coluna (resultado origem) para outra (resultado destino).
 *  Fonte da verdade = funil_colunas.resultado (NUNCA o nome). Espelha o trigger opp_sync_fechamento. */
export function classificarMovimento(resOrigem: ColResultado, resDestino: ColResultado): MovimentoTipo {
  if (resDestino === 'ganho') return 'ganho';        // neutra→ganho e perdido→ganho: confirma fechamento (sem motivo)
  if (resDestino === 'perdido') return 'perdido';    // →perdido: exige motivo de perda
  if (resOrigem === 'ganho' || resOrigem === 'perdido') return 'reabertura'; // terminal→neutra: exige motivo de reabertura
  return 'neutro';                                   // neutra→neutra: move direto
}

export const MOTIVOS_PERDA: [string, string][] = [
  ['sem_interesse', 'Sem interesse'], ['nao_respondeu', 'Não respondeu'], ['nao_elegivel', 'Não elegível'],
  ['concorrente', 'Fechou com concorrente'], ['dados_invalidos', 'Dados inválidos'], ['outro', 'Outro'],
];
export const rotuloMotivoPerda = (v: string | null) => (v ? MOTIVOS_PERDA.find(([k]) => k === v)?.[1] ?? v : '');

/** Traduz erros do trigger/RLS/lock em mensagens legíveis (nunca SQL bruto). */
export function traduzErroKanban(msg: string): string {
  const m = (msg || '').toLowerCase();
  if (m.includes('motivo_perda_desc')) return 'Descreva o motivo (você escolheu "Outro").';
  if (m.includes('motivo_perda')) return 'Selecione o motivo da perda.';
  if (m.includes('motivo_reabertura')) return 'Informe o motivo da reabertura.';
  if (m.includes('conflito_otimista') || m.includes('alterada por outra')) return 'A oportunidade foi alterada por outra pessoa. Atualize o Kanban.';
  if (m.includes('permission') || m.includes('row-level') || m.includes('rls') || m.includes('sem_permissao') || m.includes('42501')) return 'Você não tem permissão para realizar esta movimentação.';
  return 'Não foi possível mover a oportunidade. Tente novamente.';
}

// Rótulos do domínio previdenciário (compartilhados entre Kanban e painéis WA/FB)
export const TIPO_BENEFICIO_OPCOES: [string, string][] = [['aposentadoria', 'Aposentadoria'], ['pensao_por_morte', 'Pensão por morte'], ['bpc_loas', 'BPC/LOAS'], ['outro', 'Outro']];
export const TIPO_SERVICO_OPCOES: [string, string][] = [['analise_inicial', 'Análise inicial'], ['cancelamento', 'Cancelamento de descontos'], ['ressarcimento', 'Ressarcimento'], ['cancelamento_ressarcimento', 'Cancelamento e ressarcimento'], ['outro', 'Outro']];
export const STATUS_CANCEL_OPCOES: [string, string][] = [['nao_se_aplica', 'Não se aplica'], ['nao_iniciado', 'Não iniciado'], ['em_analise', 'Em análise'], ['solicitado', 'Solicitado'], ['aguardando_retorno', 'Aguardando retorno'], ['concluido', 'Concluído'], ['nao_foi_possivel', 'Não foi possível']];
export const STATUS_RESS_OPCOES: [string, string][] = [['nao_se_aplica', 'Não se aplica'], ['nao_iniciado', 'Não iniciado'], ['em_analise', 'Em análise'], ['solicitado', 'Solicitado'], ['aguardando_pagamento', 'Aguardando pagamento'], ['pago', 'Pago'], ['nao_foi_possivel', 'Não foi possível']];
export const rotuloDe = (arr: [string, string][], v: string | null) => (v ? arr.find(([k]) => k === v)?.[1] ?? v : '');
export interface KLead {
  id: string; colunaId: string | null; contatoId: string | null;
  conversaOrigemId: string | null; canalOrigemId: string | null;
  nome: string; telefone: string; email: string;
  respId: string | null; respNome: string; valor: number | null; origem: string; etiquetas: string[];
  observacoes: string; ordem: number; criadoEm: string; atualizadoEm: string;
  // SLA (S4.3): tempo de entrada/última movimentação de coluna + prioridade
  entradaEm: string; movimentadoEm: string; prioridade: string | null;
  // fechamento (Etapa 2A): status do funil + snapshot
  status: string; fechadoEm: string | null; motivoPerda: string | null; respNoFechamentoId: string | null;
  // domínio previdenciário
  tipoBeneficio: string | null; tipoServico: string; statusCancelamento: string; statusRessarcimento: string;
  numeroBeneficio: string | null; instituicao: string | null; tipoDesconto: string | null; dataInicioDesconto: string | null;
  valorDescontoMensal: number | null; valorRessarcimentoEstimado: number | null; valorRessarcido: number | null;
  // canal/chip de origem (FK) + etiquetas vivas do contato
  canalTipo: string | null; canalNome: string | null; canalNumero: string | null; contatoEtiquetas: string[];
}

interface DbLead {
  id: string; coluna_id: string | null; contato_id: string | null; conversa_origem_id: string | null; canal_origem_id: string | null;
  contato_nome: string | null; titulo: string | null;
  telefone: string | null; responsavel_id: string | null; valor_estimado: number | null; origem: string | null;
  etiquetas: string[] | null; observacoes: string | null; ordem: number; criado_em: string; atualizado_em: string;
  entrada_em: string; movimentado_em: string; prioridade: string | null;
  status: string; fechado_em: string | null; motivo_perda: string | null; responsavel_no_fechamento_id: string | null;
  tipo_beneficio: string | null; tipo_servico: string; status_cancelamento: string; status_ressarcimento: string;
  numero_beneficio: string | null; instituicao: string | null; tipo_desconto: string | null; data_inicio_desconto: string | null;
  valor_desconto_mensal: number | null; valor_ressarcimento_estimado: number | null; valor_ressarcido: number | null;
  contatos: DbContatoJoin | DbContatoJoin[] | null;
  responsavel: { nome: string } | { nome: string }[] | null;
  canal_origem: DbCanalJoin | DbCanalJoin[] | null;
}
interface DbContatoJoin { nome: string; telefone: string | null; email: string | null; etiquetas: string[] | null; }
interface DbCanalJoin { tipo: string; nome_interno: string; numero_conectado: string | null; }
function one<T>(v: T | T[] | null): T | null { return Array.isArray(v) ? (v[0] ?? null) : v; }
function mapLead(l: DbLead): KLead {
  const ct = one(l.contatos);
  const rp = one(l.responsavel);
  const cn = one(l.canal_origem);
  return {
    id: l.id, colunaId: l.coluna_id, contatoId: l.contato_id,
    conversaOrigemId: l.conversa_origem_id, canalOrigemId: l.canal_origem_id,
    nome: l.contato_nome || l.titulo || ct?.nome || 'Lead',
    telefone: l.telefone || ct?.telefone || '', email: ct?.email || '',
    respId: l.responsavel_id, respNome: rp?.nome || '',
    valor: l.valor_estimado, origem: l.origem || '', etiquetas: l.etiquetas ?? [],
    observacoes: l.observacoes || '', ordem: l.ordem, criadoEm: l.criado_em, atualizadoEm: l.atualizado_em,
    entradaEm: l.entrada_em, movimentadoEm: l.movimentado_em, prioridade: l.prioridade ?? null,
    status: l.status || 'em_andamento', fechadoEm: l.fechado_em, motivoPerda: l.motivo_perda, respNoFechamentoId: l.responsavel_no_fechamento_id,
    tipoBeneficio: l.tipo_beneficio, tipoServico: l.tipo_servico || 'analise_inicial',
    statusCancelamento: l.status_cancelamento || 'nao_se_aplica', statusRessarcimento: l.status_ressarcimento || 'nao_se_aplica',
    numeroBeneficio: l.numero_beneficio, instituicao: l.instituicao, tipoDesconto: l.tipo_desconto, dataInicioDesconto: l.data_inicio_desconto,
    valorDescontoMensal: l.valor_desconto_mensal, valorRessarcimentoEstimado: l.valor_ressarcimento_estimado, valorRessarcido: l.valor_ressarcido,
    canalTipo: cn?.tipo || null, canalNome: cn?.nome_interno || null, canalNumero: cn?.numero_conectado || null,
    contatoEtiquetas: ct?.etiquetas ?? [],
  };
}

/** Valor relevante do card conforme o tipo de serviço (regra aprovada). mensal=true só quando vem de valor_desconto_mensal. */
export function valorRelevante(l: Pick<KLead, 'tipoServico' | 'valor' | 'valorDescontoMensal' | 'valorRessarcimentoEstimado'>): { valor: number | null; mensal: boolean } {
  let v: number | null = null; let mensal = false;
  if (l.tipoServico === 'ressarcimento' || l.tipoServico === 'cancelamento_ressarcimento') v = l.valorRessarcimentoEstimado ?? l.valor ?? null;
  else if (l.tipoServico === 'cancelamento') { mensal = l.valorDescontoMensal != null && l.valorDescontoMensal > 0; v = l.valorDescontoMensal ?? l.valor ?? null; }
  else v = l.valor ?? null;
  if (v == null || !(v > 0)) return { valor: null, mensal: false };
  return { valor: v, mensal };
}

export interface ConversaDoContato { id: string; canalId: string | null; canalTipo: string | null; canalNome: string | null; canalNumero: string | null; atendenteId: string | null; atendenteNome: string; ultimaInteracao: string | null; }
/** Conversas do contato (mais recentes primeiro) p/ herdar conversa/canal/chip/atendente no modal. */
export function useConversasDoContato(contatoId: string | null) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['conversas-contato', org, contatoId],
    enabled: KANBAN_REAL && !!contatoId,
    queryFn: async (): Promise<ConversaDoContato[]> => {
      const { data, error } = await supabase!.from('conversas')
        .select('id, canal_id, atendente_id, ultima_interacao_em, canais(tipo, nome_interno, numero_conectado), atendente:usuarios!conversas_atendente_id_fkey(nome)')
        .eq('organizacao_id', org).eq('contato_id', contatoId!)
        .order('ultima_interacao_em', { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      return (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((r) => {
        const cn = one(r.canais as DbCanalJoin | DbCanalJoin[] | null);
        const at = one(r.atendente as { nome: string } | { nome: string }[] | null);
        return { id: r.id as string, canalId: (r.canal_id as string) ?? null, canalTipo: cn?.tipo ?? null, canalNome: cn?.nome_interno ?? null, canalNumero: cn?.numero_conectado ?? null, atendenteId: (r.atendente_id as string) ?? null, atendenteNome: at?.nome ?? '', ultimaInteracao: (r.ultima_interacao_em as string) ?? null };
      });
    },
  });
}

export interface OppAberta { id: string; contatoId: string; colunaId: string | null; colunaNome: string; funilId: string | null; respNome: string; valor: number | null; atualizadoEm: string; }
/** Mapa contatoId -> oportunidade ABERTA (em_andamento) do contato. Uma query (sem N+1). */
/** Não lidas por CONTATO — a bolinha de "mensagem nova do cliente" no card do Kanban.
 *  Query separada e leve DE PROPÓSITO: o Kanban já traz 385 oportunidades com 3 embeds, e um
 *  embed de conversas ali multiplicaria as linhas — foi exatamente o erro que custou caro na
 *  lista do WhatsApp. Aqui vêm só as conversas que TÊM não lida (medido: 0,2 ms), e o cruzamento
 *  por contato_id acontece no cliente.
 *  Só conversa NÃO arquivada conta, e as não lidas do contato são somadas (o schema garante uma
 *  conversa ativa por contato, então na prática é uma linha só). */
export function useNaoLidasPorContato() {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['kanban-naolidas', org],
    enabled: KANBAN_REAL,
    refetchInterval: 8000,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase!.from('conversas')
        .select('contato_id, nao_lidas')
        .eq('organizacao_id', org).gt('nao_lidas', 0).is('arquivada_em', null);
      if (error) throw new Error(error.message);
      const map: Record<string, number> = {};
      for (const r of ((data as unknown[]) ?? []) as Record<string, unknown>[]) {
        const cid = r.contato_id as string | null;
        if (!cid) continue;
        map[cid] = (map[cid] ?? 0) + ((r.nao_lidas as number) ?? 0);
      }
      return map;
    },
  });
}

export function useOportunidadesAbertasDeContatos(ids: string[]) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  const chave = [...new Set(ids)].sort().join(',');
  return useQuery({
    queryKey: ['opp-abertas', org, chave],
    enabled: KANBAN_REAL && ids.length > 0,
    queryFn: async (): Promise<Record<string, OppAberta>> => {
      const { data, error } = await supabase!.from('oportunidades')
        .select('id, contato_id, coluna_id, funil_id, valor_estimado, atualizado_em, funil_colunas(nome), responsavel:usuarios!oportunidades_responsavel_id_fkey(nome)')
        .eq('organizacao_id', org).eq('status', 'em_andamento').in('contato_id', [...new Set(ids)]);
      if (error) throw new Error(error.message);
      const map: Record<string, OppAberta> = {};
      for (const r of ((data as unknown[]) ?? []) as Record<string, unknown>[]) {
        const cid = r.contato_id as string | null;
        if (!cid || map[cid]) continue;
        const col = r.funil_colunas as { nome: string } | { nome: string }[] | null;
        const rp = r.responsavel as { nome: string } | { nome: string }[] | null;
        map[cid] = { id: r.id as string, contatoId: cid, colunaId: (r.coluna_id as string) ?? null, colunaNome: (Array.isArray(col) ? col[0]?.nome : col?.nome) || '', funilId: (r.funil_id as string) ?? null, respNome: (Array.isArray(rp) ? rp[0]?.nome : rp?.nome) || '', valor: (r.valor_estimado as number) ?? null, atualizadoEm: (r.atualizado_em as string) || '' };
      }
      return map;
    },
  });
}

interface OppCampos {
  nome: string; telefone?: string | null; responsavelId?: string | null; valor?: number | null; origem?: string | null;
  etiquetas?: string[]; observacoes?: string | null; colunaId?: string; conversaOrigemId?: string | null; canalOrigemId?: string | null;
  tipoBeneficio?: string | null; tipoServico?: string; statusCancelamento?: string; statusRessarcimento?: string;
  numeroBeneficio?: string | null; instituicao?: string | null; tipoDesconto?: string | null; dataInicioDesconto?: string | null;
  valorDescontoMensal?: number | null; valorRessarcimentoEstimado?: number | null; valorRessarcido?: number | null;
}
export interface OppCriar extends OppCampos { colunaId: string; nome: string; contatoId?: string | null; }
export interface OppEditar extends Partial<OppCampos> { id: string; }

export interface FunilLite { id: string; nome: string; padrao: boolean; }
/** Funis ativos da org (para escolher destino ao adicionar ao Kanban). */
export function useFunisDaOrg() {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['funis-org', org], enabled: KANBAN_REAL,
    queryFn: async (): Promise<FunilLite[]> => {
      const { data, error } = await supabase!.from('funis').select('id, nome, padrao').eq('organizacao_id', org).eq('arquivado', false).order('padrao', { ascending: false }).order('ordem', { ascending: true });
      if (error) throw new Error(error.message);
      return (data as FunilLite[]) ?? [];
    },
  });
}

export interface OppDoContato {
  id: string; status: string; aberta: boolean; funilId: string | null; funilNome: string; colunaNome: string; respNome: string;
  tipoServico: string; tipoBeneficio: string | null; valor: number | null; valorDescontoMensal: number | null;
  valorRessarcimentoEstimado: number | null; valorRessarcido: number | null; origem: string; criadoEm: string; atualizadoEm: string;
}
/** Oportunidades (todas as situações) de um contato, com funil/coluna/responsável/valores/datas. */
export function useOportunidadesDoContato(contatoId: string | null) {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  return useQuery({
    queryKey: ['opp-do-contato', org, contatoId], enabled: KANBAN_REAL && !!contatoId,
    queryFn: async (): Promise<OppDoContato[]> => {
      const { data, error } = await supabase!.from('oportunidades')
        .select('id, status, funil_id, tipo_servico, tipo_beneficio, valor_estimado, valor_desconto_mensal, valor_ressarcimento_estimado, valor_ressarcido, origem, criado_em, atualizado_em, funis(nome), funil_colunas(nome), responsavel:usuarios!oportunidades_responsavel_id_fkey(nome)')
        .eq('organizacao_id', org).eq('contato_id', contatoId!).order('criado_em', { ascending: false });
      if (error) throw new Error(error.message);
      return (((data as unknown[]) ?? []) as Record<string, unknown>[]).map((r) => {
        const fn = one(r.funis as { nome: string } | { nome: string }[] | null);
        const cl = one(r.funil_colunas as { nome: string } | { nome: string }[] | null);
        const rp = one(r.responsavel as { nome: string } | { nome: string }[] | null);
        const status = r.status as string;
        return {
          id: r.id as string, status, aberta: status === 'em_andamento', funilId: (r.funil_id as string) ?? null,
          funilNome: fn?.nome || '', colunaNome: cl?.nome || '', respNome: rp?.nome || '',
          tipoServico: (r.tipo_servico as string) || 'analise_inicial', tipoBeneficio: (r.tipo_beneficio as string) ?? null,
          valor: (r.valor_estimado as number) ?? null, valorDescontoMensal: (r.valor_desconto_mensal as number) ?? null,
          valorRessarcimentoEstimado: (r.valor_ressarcimento_estimado as number) ?? null, valorRessarcido: (r.valor_ressarcido as number) ?? null,
          origem: (r.origem as string) || '', criadoEm: (r.criado_em as string) || '', atualizadoEm: (r.atualizado_em as string) || '',
        };
      });
    },
  });
}

/** Chama a RPC idempotente (membro autenticado). Org/coluna de entrada derivadas no banco. */
export async function chamarGarantirEntrada(p: { contatoId: string; funilId: string; origem?: string | null; conversaId?: string | null; canalId?: string | null }): Promise<string | null> {
  if (!supabase) throw new Error('Supabase indisponível');
  const { data, error } = await supabase.rpc('garantir_oportunidade_entrada', { p_contato: p.contatoId, p_funil: p.funilId, p_origem: p.origem ?? null, p_conversa: p.conversaId ?? null, p_canal: p.canalId ?? null });
  if (error) throw new Error(error.message);
  return (data as string) ?? null;
}

/** Funil padrão da org (cria um na primeira vez se o usuário tiver permissão). */
async function garantirFunil(org: string): Promise<{ id: string; nome: string } | null> {
  const { data } = await supabase!.from('funis').select('id, nome').eq('organizacao_id', org).eq('arquivado', false).order('padrao', { ascending: false }).order('ordem', { ascending: true }).limit(1).maybeSingle();
  if (data) return data as { id: string; nome: string };
  const { data: novo } = await supabase!.from('funis').insert({ organizacao_id: org, nome: 'Funil comercial', padrao: true }).select('id, nome').maybeSingle();
  return (novo as { id: string; nome: string } | null) ?? null;
}

/** Núcleo do Kanban: funil + colunas + leads (oportunidades em andamento) + ações + realtime. */
export function useKanban() {
  const { currentOrg } = useOrg();
  const org = currentOrg.id;
  const qc = useQueryClient();

  const funilQ = useQuery({ queryKey: ['kanban-funil', org], enabled: KANBAN_REAL, queryFn: () => garantirFunil(org) });
  const funilId = funilQ.data?.id ?? null;

  const colunasQ = useQuery({
    queryKey: ['kanban-colunas', org, funilId], enabled: KANBAN_REAL && !!funilId, refetchInterval: 8000,
    queryFn: async (): Promise<KColuna[]> => {
      const { data, error } = await supabase!.from('funil_colunas').select('id, nome, cor, ordem, entrada, resultado, encerra_oportunidade').eq('organizacao_id', org).eq('funil_id', funilId!).eq('arquivada', false).order('ordem', { ascending: true });
      if (error) throw new Error(error.message);
      type CRow = { id: string; nome: string; cor: string; ordem: number; entrada: boolean; resultado: string | null; encerra_oportunidade: boolean | null };
      return ((data as CRow[]) ?? []).map((c) => ({ id: c.id, nome: c.nome, cor: c.cor, ordem: c.ordem, entrada: c.entrada, resultado: (c.resultado as ColResultado) ?? 'neutro', encerra: Boolean(c.encerra_oportunidade) }));
    },
  });

  const leadsQ = useQuery({
    queryKey: ['kanban-leads', org, funilId], enabled: KANBAN_REAL && !!funilId, refetchInterval: 8000,
    queryFn: async (): Promise<KLead[]> => {
      const { data, error } = await supabase!.from('oportunidades')
        .select('id, coluna_id, contato_id, conversa_origem_id, canal_origem_id, contato_nome, titulo, telefone, responsavel_id, valor_estimado, origem, etiquetas, observacoes, ordem, criado_em, atualizado_em, entrada_em, movimentado_em, prioridade, status, fechado_em, motivo_perda, responsavel_no_fechamento_id, tipo_beneficio, tipo_servico, status_cancelamento, status_ressarcimento, numero_beneficio, instituicao, tipo_desconto, data_inicio_desconto, valor_desconto_mensal, valor_ressarcimento_estimado, valor_ressarcido, contatos(nome, telefone, email, etiquetas), responsavel:usuarios!oportunidades_responsavel_id_fkey(nome), canal_origem:canais(tipo, nome_interno, numero_conectado)')
        .eq('organizacao_id', org).eq('funil_id', funilId!).in('status', ['em_andamento', 'ganho', 'perdido'])
        .order('ordem', { ascending: true }).order('criado_em', { ascending: true });
      if (error) throw new Error(error.message);
      return ((data as unknown as DbLead[]) ?? []).map(mapLead);
    },
  });

  useEffect(() => {
    if (!KANBAN_REAL) return;
    const ch = supabase!
      .channel(`kanban-${org}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'oportunidades', filter: `organizacao_id=eq.${org}` }, () => qc.invalidateQueries({ queryKey: ['kanban-leads', org] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funil_colunas', filter: `organizacao_id=eq.${org}` }, () => qc.invalidateQueries({ queryKey: ['kanban-colunas', org] }))
      .subscribe();
    return () => { supabase!.removeChannel(ch); };
  }, [org, qc]);

  const colunas = colunasQ.data ?? [];
  const leads = leadsQ.data ?? [];
  const invalida = () => { qc.invalidateQueries({ queryKey: ['kanban-colunas', org] }); qc.invalidateQueries({ queryKey: ['kanban-leads', org] }); };

  async function criarColuna(input: { nome: string; cor: string }) {
    const ordem = (colunas.reduce((m, c) => Math.max(m, c.ordem), 0)) + 1;
    const { error } = await supabase!.from('funil_colunas').insert({ organizacao_id: org, funil_id: funilId, nome: input.nome, cor: input.cor, ordem });
    if (error) throw new Error(error.message);
    invalida();
  }
  async function editarColuna(input: { id: string; nome?: string; cor?: string; ordem?: number }) {
    const patch: Record<string, unknown> = {};
    if (input.nome !== undefined) patch.nome = input.nome;
    if (input.cor !== undefined) patch.cor = input.cor;
    if (input.ordem !== undefined) patch.ordem = input.ordem;
    const { error } = await supabase!.from('funil_colunas').update(patch).eq('id', input.id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalida();
  }
  /** Move leads para destino (se houver) e exclui a coluna. */
  async function excluirColuna(id: string, destinoId: string | null) {
    if (destinoId) {
      const { error: em } = await supabase!.from('oportunidades').update({ coluna_id: destinoId }).eq('coluna_id', id).eq('organizacao_id', org);
      if (em) throw new Error(em.message);
    }
    const { error } = await supabase!.from('funil_colunas').delete().eq('id', id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalida();
  }
  async function criarLead(input: OppCriar) {
    const ordem = (leads.filter((l) => l.colunaId === input.colunaId).reduce((m, l) => Math.max(m, l.ordem), 0)) + 1;
    const { error } = await supabase!.from('oportunidades').insert({
      organizacao_id: org, funil_id: funilId, coluna_id: input.colunaId,
      contato_id: input.contatoId ?? null, contato_nome: input.contatoId ? null : input.nome, titulo: input.nome,
      conversa_origem_id: input.conversaOrigemId ?? null, canal_origem_id: input.canalOrigemId ?? null,
      telefone: input.telefone || null, responsavel_id: input.responsavelId ?? null,
      valor_estimado: input.valor ?? null, origem: input.origem || null,
      etiquetas: input.etiquetas ?? [], observacoes: input.observacoes || null, ordem,
      tipo_beneficio: input.tipoBeneficio ?? null, tipo_servico: input.tipoServico ?? 'analise_inicial',
      status_cancelamento: input.statusCancelamento ?? 'nao_se_aplica', status_ressarcimento: input.statusRessarcimento ?? 'nao_se_aplica',
      numero_beneficio: input.numeroBeneficio ?? null, instituicao: input.instituicao ?? null,
      tipo_desconto: input.tipoDesconto ?? null, data_inicio_desconto: input.dataInicioDesconto ?? null,
      valor_desconto_mensal: input.valorDescontoMensal ?? null, valor_ressarcimento_estimado: input.valorRessarcimentoEstimado ?? null, valor_ressarcido: input.valorRessarcido ?? null,
    });
    if (error) throw new Error(error.message);
    invalida();
  }
  async function editarLead(input: OppEditar) {
    const patch: Record<string, unknown> = {};
    if (input.nome !== undefined) { patch.titulo = input.nome; patch.contato_nome = input.nome; }
    if (input.telefone !== undefined) patch.telefone = input.telefone;
    if (input.responsavelId !== undefined) patch.responsavel_id = input.responsavelId;
    if (input.valor !== undefined) patch.valor_estimado = input.valor;
    if (input.origem !== undefined) patch.origem = input.origem;
    if (input.etiquetas !== undefined) patch.etiquetas = input.etiquetas;
    if (input.observacoes !== undefined) patch.observacoes = input.observacoes;
    if (input.colunaId !== undefined) patch.coluna_id = input.colunaId;
    if (input.tipoBeneficio !== undefined) patch.tipo_beneficio = input.tipoBeneficio;
    if (input.tipoServico !== undefined) patch.tipo_servico = input.tipoServico;
    if (input.statusCancelamento !== undefined) patch.status_cancelamento = input.statusCancelamento;
    if (input.statusRessarcimento !== undefined) patch.status_ressarcimento = input.statusRessarcimento;
    if (input.numeroBeneficio !== undefined) patch.numero_beneficio = input.numeroBeneficio;
    if (input.instituicao !== undefined) patch.instituicao = input.instituicao;
    if (input.tipoDesconto !== undefined) patch.tipo_desconto = input.tipoDesconto;
    if (input.dataInicioDesconto !== undefined) patch.data_inicio_desconto = input.dataInicioDesconto;
    if (input.valorDescontoMensal !== undefined) patch.valor_desconto_mensal = input.valorDescontoMensal;
    if (input.valorRessarcimentoEstimado !== undefined) patch.valor_ressarcimento_estimado = input.valorRessarcimentoEstimado;
    if (input.valorRessarcido !== undefined) patch.valor_ressarcido = input.valorRessarcido;
    const { error } = await supabase!.from('oportunidades').update(patch).eq('id', input.id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalida();
  }
  /** Arquiva o lead (status='cancelado') — sai do quadro sem exclusão física. */
  async function arquivarLead(id: string) {
    const { error } = await supabase!.from('oportunidades').update({ status: 'cancelado' }).eq('id', id).eq('organizacao_id', org);
    if (error) throw new Error(error.message);
    invalida();
  }
  /** Move a oportunidade para outra coluna com CONTROLE OTIMISTA (atualizado_em esperado) e os motivos
   *  exigidos pelo trigger. Distingue conflito (linha mudou) de permissão (linha invisível/RLS). O banco
   *  é a fonte final de status/fechado_em/fechado_por/snapshot/histórico. Lança em erro (caller faz rollback). */
  async function moverOportunidade(input: { id: string; colunaId: string; atualizadoEmEsperado: string; motivoPerda?: string | null; motivoPerdaDesc?: string | null; motivoReabertura?: string | null }) {
    const ordem = (leads.filter((l) => l.colunaId === input.colunaId).reduce((m, l) => Math.max(m, l.ordem), 0)) + 1;
    const patch: Record<string, unknown> = { coluna_id: input.colunaId, ordem };
    if (input.motivoPerda !== undefined) patch.motivo_perda = input.motivoPerda ?? null;
    if (input.motivoPerdaDesc !== undefined) patch.motivo_perda_desc = input.motivoPerdaDesc ?? null;
    if (input.motivoReabertura !== undefined) patch.motivo_reabertura = input.motivoReabertura ?? null;
    const { data, error } = await supabase!.from('oportunidades')
      .update(patch)
      .eq('id', input.id).eq('organizacao_id', org).eq('atualizado_em', input.atualizadoEmEsperado)
      .select('id');
    if (error) throw new Error(error.message);          // erro do trigger (motivo_*) / permissão
    if (!data || data.length === 0) {
      // 0 linhas: ou a linha mudou (lock otimista) ou não é visível (permissão). Desambigua.
      const { data: existe } = await supabase!.from('oportunidades').select('id').eq('id', input.id).eq('organizacao_id', org).maybeSingle();
      throw new Error(existe ? 'conflito_otimista' : 'sem_permissao');
    }
    invalida();
  }

  return {
    funilId, colunas, leads,
    loading: funilQ.isLoading || colunasQ.isLoading || leadsQ.isLoading,
    isError: colunasQ.isError || leadsQ.isError,
    error: (colunasQ.error || leadsQ.error) as Error | null,
    semFunil: funilQ.isFetched && !funilId,
    refetch: () => { colunasQ.refetch(); leadsQ.refetch(); },
    criarColuna, editarColuna, excluirColuna, criarLead, editarLead, arquivarLead, moverOportunidade,
  };
}

export interface OppEvento { id: string; evento: string; colunaAnteriorId: string | null; colunaNovaId: string | null; motivoPerda: string | null; motivoReabertura: string | null; respNoFechamentoId: string | null; respNoFechamentoNome: string | null; executadoPor: string | null; executadoPorNome: string | null; criadoEm: string; }
/** Histórico comercial (ganho/perdido/reaberto) de uma oportunidade — legível, sem IDs crus na UI. */
export function useOportunidadeEventos(oppId: string | null) {
  return useQuery({
    queryKey: ['opp-eventos', oppId], enabled: KANBAN_REAL && !!oppId, staleTime: 30_000,
    queryFn: async (): Promise<OppEvento[]> => {
      const { data, error } = await supabase!.from('oportunidade_eventos')
        .select('id, evento, coluna_anterior_id, coluna_nova_id, motivo_perda, motivo_reabertura, responsavel_no_fechamento_id, executado_por, criado_em, executor:usuarios!oportunidade_eventos_executado_por_fkey(nome), resp_fech:usuarios!oportunidade_eventos_resp_fech_fkey(nome)')
        .eq('oportunidade_id', oppId!).order('criado_em', { ascending: false });
      if (error) throw new Error(error.message);
      type Row = { id: string; evento: string; coluna_anterior_id: string | null; coluna_nova_id: string | null; motivo_perda: string | null; motivo_reabertura: string | null; responsavel_no_fechamento_id: string | null; executado_por: string | null; criado_em: string; executor: { nome: string } | { nome: string }[] | null; resp_fech: { nome: string } | { nome: string }[] | null };
      return ((data as unknown as Row[]) ?? []).map((r) => ({ id: r.id, evento: r.evento, colunaAnteriorId: r.coluna_anterior_id, colunaNovaId: r.coluna_nova_id, motivoPerda: r.motivo_perda, motivoReabertura: r.motivo_reabertura, respNoFechamentoId: r.responsavel_no_fechamento_id, respNoFechamentoNome: (Array.isArray(r.resp_fech) ? r.resp_fech[0]?.nome : r.resp_fech?.nome) ?? null, executadoPor: r.executado_por, executadoPorNome: (Array.isArray(r.executor) ? r.executor[0]?.nome : r.executor?.nome) ?? null, criadoEm: r.criado_em }));
    },
  });
}
