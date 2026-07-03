// ETAPA 2B — Data layer da camada oficial de dados dos Relatórios (RPCs no banco = fonte única).
// NÃO conectado aos componentes visuais atuais. Tipos explícitos (sem `any`). Período em SP,
// fim EXCLUSIVO. Toda RPC valida membership internamente; o front passa a org atual.
import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { useOrg } from '@/context/OrgContext';

export const REL2B_REAL = isSupabaseConfigured && !!supabase;

export interface RelPeriodo { inicio: string; fim_exclusivo: string; timezone: string }

/* ===================== Visão geral ===================== */
export interface VisaoGeralOperacional {
  contatos_novos: number; conversas_novas: number; conversas_com_inbound: number;
  conversas_atendidas: number; conversas_sem_resposta: number; taxa_atendimento_pct: number;
  categorias: Record<'sem_inbound' | 'inbound_sem_resposta' | 'inbound_painel' | 'inbound_so_celular' | 'inbound_humana_antes' | 'inbound_so_automacao' | 'total', number>;
  respostas_painel: number; respostas_celular: number; respostas_sem_atribuicao: number;
  cobertura_atribuicao_msgs_pct: number | null;
}
export interface VisaoGeralComercial {
  oportunidades_criadas: number; ganhos_coorte: number; conversao_coorte_pct: number;
  fechamentos_periodo: number; perdas_periodo: number; fechamentos_estimados: number;
  cobertura_responsavel_opp_pct: number | null;
}
export interface VisaoGeralFinanceiro {
  receita_contratada: number; receita_prevista: number; receita_recebida: number;
  pendente: number; vencido: number; inadimplencia_valor_pct: number | null;
  inadimplencia_parcelas_pct: number | null; ticket_medio_mensal: number; economia_gerada: number;
}
export interface VisaoGeralQualidade {
  oportunidades_sem_responsavel: number; mensagens_sem_autor: number; contatos_sem_telefone: number;
  fechamentos_com_data_estimada: number; alertas: string[];
}
export interface VisaoGeral {
  periodo: RelPeriodo; operacional: VisaoGeralOperacional; comercial: VisaoGeralComercial;
  financeiro: VisaoGeralFinanceiro; qualidade: VisaoGeralQualidade;
}

/* ===================== Canais ===================== */
export interface CanalComercial {
  canal_id: string | null; canal: string; contatos_originados: number; oportunidades_criadas: number;
  ganhos_coorte: number; conversao_coorte_pct: number; fechamentos_periodo: number; perdas_periodo: number;
  receita_contratada: number; receita_prevista: number; receita_recebida: number;
}
export interface CanalOperacional {
  canal_id: string | null; canal: string; conversas: number; conversas_com_inbound: number;
  conversas_atendidas: number; conversas_sem_resposta: number; taxa_atendimento_pct: number;
  mensagens_recebidas: number; mensagens_enviadas: number; respostas_painel: number; respostas_celular: number;
  primeira_resposta_min: number | null; falhas_envio: number;
}
export interface RelCanais { periodo: RelPeriodo; comercial: CanalComercial[]; operacional: CanalOperacional[] }

/* ===================== Equipe ===================== */
export interface EquipeUsuario {
  usuario_id: string; nome: string; mensagens_painel: number; conversas_respondidas: number;
  oportunidades_atuais: number; oportunidades_criadas: number; ganhos_coorte: number;
  fechamentos_periodo: number; perdas: number; conversao_pct: number; receita_contratada: number;
}
export interface RelEquipe {
  periodo: RelPeriodo; usuarios: EquipeUsuario[];
  sem_atribuicao: { mensagens_celular: number; conversas_celular: number; oportunidades_sem_responsavel: number; fechamentos_sem_responsavel_hist: number };
  cobertura: { atribuicao_msgs_pct: number | null; responsavel_opp_pct: number | null };
  alertas: string[];
}

/* ===================== Funil ===================== */
export interface FunilColunaRel {
  coluna_id: string; coluna: string; ordem: number; resultado: 'neutro' | 'ganho' | 'perdido';
  quantidade_atual: number; ganhos_periodo: number; perdas_periodo: number; oportunidades_paradas_7d: number;
  idade_media_dias: number; tempo_medio_etapa_dias: number;
  entradas_periodo: number | null; saidas_periodo: number | null; conversao_proxima_etapa_pct: number | null;
}
export interface RelFunil { periodo: RelPeriodo; cobertura_historico: string; colunas: FunilColunaRel[] }

/* ===================== Financeiro (v2: ESTOQUE × FLUXO × POSIÇÃO na data de corte) ===================== */
export interface FinContratadoServico { servico: string; valor_contratado: number }
export interface FinContratadoCanal { canal_id: string | null; canal: string; valor_contratado: number }
export interface FinContratadoResp { responsavel_id: string | null; nome: string; valor_contratado: number }
export interface FinRecebidoServico { servico: string; receita_recebida: number }
export interface FinRecebidoCanal { canal_id: string | null; canal: string; receita_recebida: number }
export interface FinRecebidoResp { responsavel_id: string | null; nome: string; receita_recebida: number }
export interface RelFinanceiro {
  periodo: RelPeriodo;
  /** Data usada para reconstruir a POSIÇÃO (a vencer/vencido/inadimplência). Ecoa p_data_corte ou hoje (SP). */
  data_corte: string;
  /** Qualidade da reconstrução da posição na data de corte. */
  qualidade_posicao: { status: 'completa' | 'completa_reconstruida' | 'limitada'; motivo: string | null };
  /** Limites do modelo (ex.: pagamento parcial não é representável). */
  modelo: { pagamento_parcial_suportado: boolean; observacao: string };
  /** ESTOQUE — carteira viva (independe do período). */
  estoque: {
    carteira_contratada_ativa: number; contratos_ativos: number;
    ticket_medio_mensal_ativo: number; ticket_medio_contratado_ativo: number; economia_gerada_ativa: number;
  };
  /** FLUXO do período (contratos por data_inicio; parcelas por data_prevista/data_pagamento). */
  fluxo: {
    novos_contratos_periodo: number; valor_contratado_periodo: number;
    receita_prevista_periodo: number; receita_recebida_periodo: number; valor_com_vencimento_no_periodo: number;
  };
  /** POSIÇÃO na data de corte (saldo em aberto). */
  posicao: {
    saldo_total_em_aberto: number; saldo_a_vencer_data_corte: number; saldo_vencido_data_corte: number;
    inadimplencia_valor_data_corte_pct: number | null; inadimplencia_parcelas_data_corte_pct: number | null;
  };
  /** CONTRATADO por dimensão (cada soma fecha com estoque.carteira_contratada_ativa). */
  contratado: {
    por_servico: FinContratadoServico[]; por_canal_origem: FinContratadoCanal[]; por_responsavel_fechamento: FinContratadoResp[];
  };
  /** RECEBIDO por dimensão (cada soma fecha com fluxo.receita_recebida_periodo). */
  recebido: {
    por_servico: FinRecebidoServico[]; por_canal_origem: FinRecebidoCanal[]; por_responsavel_fechamento: FinRecebidoResp[];
  };
  /** Saldo aberto futuro por mês (soma fecha com posicao.saldo_a_vencer_data_corte). */
  previsao_proximos_meses: { mes: string; previsto: number }[];
}

/* ===================== Qualidade ===================== */
export interface ServicoVarianteItem { original: string; cobrancas: number; valor_contratado: number }
export interface ServicoVarianteGrupo {
  normalizado: string; variantes: number; cobrancas: number; impacto_financeiro: number; itens: ServicoVarianteItem[];
}
export interface AlertaQualidade {
  codigo: string; titulo: string; quantidade: number; percentual: number | null;
  severidade: 'alta' | 'media' | 'baixa'; orientacao: string; drill: string;
  /** Preenchido apenas em alertas com detalhamento (ex.: servico_nao_normalizado); null nos demais. */
  detalhe: ServicoVarianteGrupo[] | null;
}
export interface RelQualidade { org: string; alertas: AlertaQualidade[] }

/* ===================== Snapshot (comparador atual × anterior, dois cortes) ===================== */
export type KpiTipo = 'fluxo' | 'estoque' | 'posicao';
export type KpiUnidade = 'quantidade' | 'percentual' | 'moeda' | 'minutos';
export type KpiSentido = 'maior_melhor' | 'menor_melhor' | 'neutro';
/** Direção semântica: melhora/piora consideram o sentido; aumento/queda para sentido neutro. */
export type KpiDirecao = 'melhora' | 'piora' | 'estavel' | 'aumento' | 'queda' | 'aumento_sem_base' | 'indefinido';
export type KpiGrupo = 'atendimento' | 'comercial' | 'financeiro_fluxo' | 'financeiro_estoque' | 'financeiro_posicao';
export type QualidadePosicao = 'completa' | 'completa_reconstruida' | 'limitada';

export interface SnapshotKpi {
  codigo: string; titulo: string; grupo: KpiGrupo;
  tipo: KpiTipo; unidade: KpiUnidade; sentido: KpiSentido;
  formula: string; fonte: string;
  valor_atual: number | null; valor_anterior: number | null;
  /** Para unidade 'percentual' vem em pontos percentuais (p.p.). */
  diferenca_absoluta: number | null;
  /** null para unidade 'percentual' (usa-se p.p.) e quando anterior=0 e atual>0 (sem base). */
  variacao_percentual: number | null;
  direcao: KpiDirecao;
  qualidade_atual: string | null; qualidade_anterior: string | null;
  cobertura_atual: string | null; cobertura_anterior: string | null;
}
export interface RelSnapshot {
  periodo_atual: { inicio: string; fim_exclusivo: string; data_corte: string; timezone: string };
  periodo_anterior: { inicio: string; fim_exclusivo: string; data_corte: string; timezone: string };
  comparabilidade: {
    duracao_atual_dias: number; duracao_anterior_dias: number; mesma_duracao: boolean;
    offset_corte_atual_dias: number; offset_corte_anterior_dias: number; cortes_equivalentes: boolean;
    atual_parcial: boolean; anterior_parcial: boolean; periodos_comparaveis: boolean; aviso_periodo: string | null;
  };
  qualidade_financeira: {
    atual: { status: QualidadePosicao; motivo: string | null };
    anterior: { status: QualidadePosicao; motivo: string | null };
    orientacao: string | null;
  };
  kpis: SnapshotKpi[];
}

/* ===================== Detalhamento ===================== */
export interface DetalheOportunidade {
  id: string; cliente: string; status: string; coluna: string | null; resultado: string | null;
  responsavel: string | null; canal_origem: string | null; origem: string | null;
  valor: number | null; criado_em: string; fechado_em: string | null; fechado_em_estimado: boolean;
}
export interface DetalheOportunidadesPage { total: number; limit: number; offset: number; itens: DetalheOportunidade[] }
export interface DetalheFiltros {
  por?: 'criacao' | 'fechamento'; canalOrigem?: string | null; responsavel?: string | null;
  status?: string | null; coluna?: string | null; origem?: string | null;
  order?: 'recente' | 'antigo' | 'valor'; limit?: number; offset?: number;
}

/* ===================== Chamadas às RPCs (jsonb -> tipo) ===================== */
async function rpc<T>(fn: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase!.rpc(fn, params);
  if (error) throw new Error(error.message);
  return data as T;
}

export function useRelVisaoGeral(inicio: string, fim: string) {
  const { currentOrg } = useOrg();
  return useQuery({ queryKey: ['rel2b-visao', currentOrg.id, inicio, fim], enabled: REL2B_REAL, staleTime: 60_000,
    queryFn: () => rpc<VisaoGeral>('relatorio_visao_geral', { p_org: currentOrg.id, p_inicio: inicio, p_fim: fim }) });
}
export function useRelCanais(inicio: string, fim: string) {
  const { currentOrg } = useOrg();
  return useQuery({ queryKey: ['rel2b-canais', currentOrg.id, inicio, fim], enabled: REL2B_REAL, staleTime: 60_000,
    queryFn: () => rpc<RelCanais>('relatorio_canais', { p_org: currentOrg.id, p_inicio: inicio, p_fim: fim }) });
}
export function useRelEquipe(inicio: string, fim: string) {
  const { currentOrg } = useOrg();
  return useQuery({ queryKey: ['rel2b-equipe', currentOrg.id, inicio, fim], enabled: REL2B_REAL, staleTime: 60_000,
    queryFn: () => rpc<RelEquipe>('relatorio_equipe', { p_org: currentOrg.id, p_inicio: inicio, p_fim: fim }) });
}
export function useRelFunil(inicio: string, fim: string) {
  const { currentOrg } = useOrg();
  return useQuery({ queryKey: ['rel2b-funil', currentOrg.id, inicio, fim], enabled: REL2B_REAL, staleTime: 60_000,
    queryFn: () => rpc<RelFunil>('relatorio_funil', { p_org: currentOrg.id, p_inicio: inicio, p_fim: fim }) });
}
export function useRelFinanceiro(inicio: string, fim: string, dataCorte?: string | null) {
  const { currentOrg } = useOrg();
  return useQuery({ queryKey: ['rel2b-fin', currentOrg.id, inicio, fim, dataCorte ?? null], enabled: REL2B_REAL, staleTime: 60_000,
    queryFn: () => rpc<RelFinanceiro>('relatorio_financeiro', { p_org: currentOrg.id, p_inicio: inicio, p_fim: fim, p_data_corte: dataCorte ?? null }) });
}
export function useRelQualidade() {
  const { currentOrg } = useOrg();
  return useQuery({ queryKey: ['rel2b-qual', currentOrg.id], enabled: REL2B_REAL, staleTime: 60_000,
    queryFn: () => rpc<RelQualidade>('relatorio_qualidade_dados', { p_org: currentOrg.id }) });
}
export interface SnapshotPeriodos {
  iniAtual: string; fimAtual: string; corteAtual: string;
  iniAnterior: string; fimAnterior: string; corteAnterior: string;
}
export function useRelSnapshot(p: SnapshotPeriodos) {
  const { currentOrg } = useOrg();
  return useQuery({ queryKey: ['rel2b-snap', currentOrg.id, p], enabled: REL2B_REAL, staleTime: 60_000,
    queryFn: () => rpc<RelSnapshot>('relatorio_snapshot', {
      p_org: currentOrg.id,
      p_inicio_atual: p.iniAtual, p_fim_atual: p.fimAtual, p_corte_atual: p.corteAtual,
      p_inicio_anterior: p.iniAnterior, p_fim_anterior: p.fimAnterior, p_corte_anterior: p.corteAnterior,
    }) });
}
export function useRelDetalheOportunidades(inicio: string, fim: string, f: DetalheFiltros = {}) {
  const { currentOrg } = useOrg();
  return useQuery({ queryKey: ['rel2b-det-opp', currentOrg.id, inicio, fim, f], enabled: REL2B_REAL, staleTime: 30_000,
    queryFn: () => rpc<DetalheOportunidadesPage>('relatorio_detalhe_oportunidades', {
      p_org: currentOrg.id, p_inicio: inicio, p_fim: fim, p_por: f.por ?? 'criacao',
      p_canal_origem: f.canalOrigem ?? null, p_responsavel: f.responsavel ?? null, p_status: f.status ?? null,
      p_coluna: f.coluna ?? null, p_origem: f.origem ?? null, p_order: f.order ?? 'recente',
      p_limit: f.limit ?? 50, p_offset: f.offset ?? 0,
    }) });
}
