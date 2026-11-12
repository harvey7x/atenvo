/* Contrato das ABAS do Dashboard (12/11/2026) — Campanhas, Atendentes e Iris.
   Três RPCs novas, uma por aba (supabase/migrations/20261112080000_dashboard_abas.sql),
   jsonb em snake_case; dashboardV5.abas.ts normaliza para os tipos abaixo. A aba
   Visão geral segue no contrato antigo (dashboardV5.tipos.ts). O demo
   (dashboardV5.abas.demo.ts) já nasce nesta forma.

   RÉGUAS (validadas no banco em 12/11 por caminhos independentes):
   - FECHADO  = pódio do CAF (reproduz o placar ao centavo; parceiros e fora_da_conta
                não pontuam; 0 em fim de semana/feriado é lançamento, não venda).
   - CAMPANHA = canais.campanha (diego · antonio · antonio2 · juros), pela origem
                canal_origem_id — nunca pelo status de conexão do número.
   - RETORNO  = já estava no sistema e mandou a mensagem do anúncio; a atribuição por
                número é exata só nos últimos ~14 dias (retornosConfiavelDesde).
   - PARENTE  = sessão de IA em que a pessoa disse que NÃO recebe INSS e um parente
                recebe; coorte pela criação da sessão. "Algum parente" (pai/mãe
                especificamente não é contável — parentesco gravado em 7 de 265).
   - IRIS     = sessões com a marca da Iris; "atendidas" tem banda de ±5% até os
                eventos novos do ia-sdr (exatidaoAtendidas o declara).
   - DOCS     = régua do código (checklistDe): identidade completa, comprovante
                presente (o "não tenho" aguardando analista conta; o ESTRITO não)
                e e-mail (ou e-mail a criar). */

/** Slug da campanha como está em canais.campanha ('outros' = número fora de campanha;
 *  'sem_campanha' = fechado do CAF sem cliente casado no Atenvo). */
export type CampanhaSlug = string;

export const CAMPANHA_ROTULO: Record<string, string> = {
  diego: 'Diego',
  antonio: 'Antônio',
  antonio2: 'Antônio 2.0',
  juros: 'Juros abusivo',
  outros: 'Outros números',
  sem_campanha: 'Sem campanha',
};
export const rotuloCampanha = (slug: string): string => CAMPANHA_ROTULO[slug] ?? slug;

/** As campanhas que viram LINHA no gráfico (na ordem e na cor fixas de cada uma). */
export const CAMPANHAS_GRAF: readonly { slug: string; cor: string; tracejado?: string }[] = [
  { slug: 'diego', cor: 'var(--dado-1)' },
  { slug: 'antonio', cor: 'var(--dado-2)', tracejado: '5 3' },
  { slug: 'antonio2', cor: 'var(--dado-3)', tracejado: '2 3' },
  { slug: 'juros', cor: 'var(--dado-4)', tracejado: '8 3 2 3' },
];

export interface CanalDaCampanhaV5 { id: string; nome: string; numero: string | null }

export interface CampanhaV5 {
  campanha: CampanhaSlug;
  canais: CanalDaCampanhaV5[];
  /** oportunidades criadas no período (a régua dos KPIs) */
  entradas: number;
  /** fechados do pódio do CAF */
  ganhos: number;
  fechMedianaH: number | null;
  fechN: number;
  ne: number;
  neMotivos: Record<string, number>;
  neQuem: { ia: number; regraRs: number; equipe: number };
  /** mandaram a mensagem do anúncio (novos + já estavam) */
  peloAnuncio: number;
  /** já estavam no sistema e voltaram pelo anúncio deste número */
  retornos: number;
  /** desses, os que já eram DA PRÓPRIA campanha (outro dia/número antigo) */
  retornosMesma: number;
  /** por qual campanha tinham entrado antes (aquisição congelada), maior primeiro */
  retornosOrigens: { campanha: CampanhaSlug; n: number }[];
  /** recuperados pelo parente cuja sessão nasceu neste período, nesta campanha */
  parenteRec: number;
}

export interface PontoSerieV5 {
  /** YYYY-MM-DD em São Paulo */
  dia: string;
  campanha: CampanhaSlug;
  entradas: number;
  ganhos: number;
  ne: number;
}

export interface ResumoCampanhaV5 { campanha: CampanhaSlug; entradas: number; ganhos: number; ne: number }

/** Um quadro fixo (hoje / semana atual / mês CAF): a janela e o anterior cortado no
 *  mesmo tempo decorrido (a régua das variações dos KPIs). */
export interface QuadroJanelaV5 {
  /** início ISO da janela */
  ini: string;
  atual: ResumoCampanhaV5[];
  anterior: ResumoCampanhaV5[];
}

export interface ParenteV5 {
  total: number;
  serie: { dia: string; n: number }[];
  funil: {
    /** disseram que NÃO recebem INSS (sessões criadas no período) */
    semBeneficio: number;
    familiarSim: number;
    familiarNao: number;
    semResposta: number;
    /** viraram NE pelo timer de 30 min sem resposta sobre o parente */
    neTimer: number;
  };
  /** desfecho ATUAL (última oportunidade do contato) — muda ao vivo */
  desfecho: {
    ganho: number;
    emAndamento: number;
    perdido: number;
    semOpp: number;
    perdidoMotivos: Record<string, number>;
  };
  /** NE desfeito pelo cliente (o parente respondeu depois do descarte) — contador à parte */
  neDesfeito: number;
}

export interface CampanhasV5 {
  geradoEm: string;
  periodo: { inicio: string; fim: string };
  campanhas: CampanhaV5[];
  /** série DIÁRIA (só dias com movimento; a tela completa os zeros e agrega semana/mês) */
  serie: PontoSerieV5[];
  /** o período anterior (mesmo tempo decorrido), por campanha */
  anterior: ResumoCampanhaV5[];
  quadro: { dia: QuadroJanelaV5; semana: QuadroJanelaV5; mes: QuadroJanelaV5 };
  parente: ParenteV5;
  /** a partir deste dia a atribuição de retornos por número é exata (retenção de 14 dias) */
  retornosConfiavelDesde: string;
}

/* ====================== Atendentes ====================== */

export interface CampanhaDoAtendenteV5 { campanha: CampanhaSlug; ganhos: number }

export interface AtendenteAbaV5 {
  usuarioId: string;
  nome: string;
  recebidos: number;
  transferidos: number;
  ganhos: number;
  /** ganhos do período anterior (mesmo tempo decorrido) — para a seta */
  ganhosAnt: number;
  neMarcados: number;
  respN: number;
  respCelularN: number;
  respMedianaMin: number | null;
  respMediaMin: number | null;
  /** relógio do ATENDENTE: fechamento − atribuição a ele (a métrica viva) */
  fechN: number;
  fechMedianaH: number | null;
  fechMediaH: number | null;
  /** ganhos SEM relógio (sem cliente casado, ou criado antes do corte de qualidade) —
   *  expostos, nunca escondidos (exigência de exatidão do dono) */
  fechSemRelogio: number;
  /** relógio do CLIENTE: fechamento − entrada do lead */
  cliN: number;
  cliMedianaH: number | null;
  cliMediaH: number | null;
  /** por qual campanha ele fecha, maior primeiro */
  campanhas: CampanhaDoAtendenteV5[];
  /** FOTOS DE AGORA (independem do período): clientes no 3º aviso do vácuo,
   *  carteira de conversas abertas e paradas há 7+ dias (dominadas por legado) */
  vacuo3o: number;
  carteira: number;
  parados7d: number;
}

export interface AtendentesAbaV5 {
  geradoEm: string;
  periodo: { inicio: string; fim: string };
  atendentes: AtendenteAbaV5[];
  /** fechados do pódio por dia × atendente (para as ondas da equipe) */
  serieGanhos: { dia: string; usuarioId: string; ganhos: number }[];
}

/* ====================== Iris ====================== */

export interface IrisFunilV5 {
  /** sessões em que a Iris FALOU no período (banda de ±5% — ver exatidaoAtendidas) */
  atendidasSessoes: number;
  atendidasContatos: number;
  /** sessões da Iris CRIADAS no período */
  coorteNovas: number;
  /** passou na porta das 5 financeiras (evento com data exata) */
  qualificadas: number;
  reprovadas: number;
  /** propostas de portabilidade POR EVENTO (a pré-aprovada clássica não tem data — subconta) */
  propostasPortab: number;
  aceiteSim: number;
  aceiteDuvida: number;
  aceiteNao: number;
  docsAlgum: number;
  /** o "FECHOU" da aba: pegou a documentação completa no período */
  docsCompletos: number;
  /** completo com comprovante de verdade (sem o "não tenho" aguardando analista) */
  docsCompletosEstrito: number;
  /** completos que também disseram "sim" à proposta (linha secundária) */
  fechouAceite: number;
}

export interface IrisFaltasV5 {
  /** em coleta sem completar (pré-aprovada enviada ou aceite, e não completo) — foto do agora */
  universo: number;
  comprovante: number;
  email: number;
  identidade: number;
  soOutroLado: number;
  nadaDos3: number;
  comprPendenteAnalista: number;
}

export interface IrisV5 {
  geradoEm: string;
  periodo: { inicio: string; fim: string };
  /** 'banda_5pct' até os eventos novos do ia-sdr; a tela declara */
  exatidaoAtendidas: string;
  funil: IrisFunilV5;
  funilAnt: IrisFunilV5 | null;
  faltas: IrisFaltasV5;
  /** sessão criada → documentação completa (só sessões da era Iris, criadas ≥ 01/11) */
  tempo: { n: number; medianaMin: number | null; p90H: number | null };
  /** onde as sessões estão AGORA (estado), etapa → quantidade */
  etapas: Record<string, number>;
  porCampanha: { campanha: CampanhaSlug; sessoes: number; docsCompletos: number }[];
  serie: { dia: string; atendidas: number; qualificadas: number; docsCompletos: number }[];
}
