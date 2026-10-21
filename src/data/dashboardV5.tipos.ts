/* Contrato do Dashboard v5 (21/10/2026) — o pedido fechado do dono, seis itens:
   entradas de clientes, entradas por número conectado, não elegíveis e o motivo,
   tempo para fechar, avaliação por atendente e o mapa dia × hora.

   A RPC public.dashboard_v5 devolve jsonb em snake_case
   (supabase/migrations/20261021200000_dashboard_v5.sql); normalizarDashV5
   (dashboardV5.ts) converte para os tipos abaixo, em camelCase. O demo
   (dashboardV5.demo.ts) já nasce nesta forma.

   DEFINIÇÕES (iguais ao SQL — conferidas no banco real em 21/10):
   - ENTRADA      = oportunidade criada no período, no número de canal_origem_id.
                    KPI = clientes distintos. Número interno do escritório fora.
   - NÚMEROS      = todo WhatsApp conectado aparece (mesmo com 0); o resto
                    (removidos, desconectados, sem número) soma em "Números antigos".
   - NÃO ELEGÍVEL = perdido como não elegível com fechado_em no período (estado atual).
   - FECHADO      = ganho com fechado_em no período.
   - TEMPO P/ FECHAR = fechado_em − criado_em (horas); mediana é o número principal.
   - ATENDENTE    = recebidos pelo rodízio, fechados creditados a ele, não elegíveis
                    que ele marcou, tempo de resposta humana em minutos úteis
                    (seg–sex, 9h–19h) e tempo para fechar desde a atribuição. */

/** Motivos de não elegível (códigos do Kanban) + o balde dos antigos sem motivo. */
export type MotivoNeV5 =
  | 'sem_beneficio_inss'
  | 'sem_emprestimo_banco'
  | 'sem_interesse'
  | 'nao_mora_rs'
  | 'muitos_processos'
  | 'sem_categoria';

export interface KpisV5 {
  /** clientes distintos que chegaram no período */
  entradas: number;
  /** não elegíveis marcados no período */
  ne: number;
  /** fechados (ganhos) no período */
  ganhos: number;
  /** tempo para fechar (horas) — null quando não há fechamento válido */
  fechMedianaH: number | null;
  fechMediaH: number | null;
  /** fechamentos que entraram na conta do tempo */
  fechN: number;
}

export type SituacaoCanalV5 = 'conectado' | 'antigo';

export interface CanalV5 {
  /** null = a linha "Números antigos" */
  canalId: string | null;
  nome: string;
  /** só dígitos, com 55 (ex.: '555194266757'); null na linha de antigos */
  numero: string | null;
  situacao: SituacaoCanalV5;
  /** oportunidades criadas no período por este número */
  entradas: number;
  ne: number;
  /** não elegíveis por motivo (código → quantidade) */
  neMotivos: Record<string, number>;
  ganhos: number;
  fechMedianaH: number | null;
  fechMediaH: number | null;
  fechN: number;
}

export interface MotivoQtdV5 { motivo: string; qtd: number }

export interface QuemMarcouV5 {
  /** IA / robô (sem usuário no fechamento) */
  ia: number;
  /** regra automática do DDD fora do RS (marcada na entrada) */
  regraRs: number;
  /** alguém da equipe */
  equipe: number;
}

export interface NeV5 {
  total: number;
  /** ordenado do maior para o menor */
  motivos: MotivoQtdV5[];
  quem: QuemMarcouV5;
}

export interface AtendenteV5 {
  usuarioId: string;
  nome: string;
  /** leads novos entregues pelo rodízio (contatos distintos) */
  recebidos: number;
  /** leads passados para ele por troca de dono — informativo, nunca somado */
  transferidos: number;
  /** fechados creditados a ele */
  ganhos: number;
  /** não elegíveis que ele mesmo marcou */
  neMarcados: number;
  /** vezes do cliente respondidas por uma pessoa (inclui celular) */
  respN: number;
  /** dessas, respondidas pelo celular (creditadas ao dono do lead) */
  respCelularN: number;
  /** minutos úteis (seg–sex, 9h–19h) */
  respMedianaMin: number | null;
  respMediaMin: number | null;
  fechN: number;
  fechMedianaH: number | null;
  fechMediaH: number | null;
}

export interface CelulaMapaV5 {
  /** 'YYYY-MM-DD' em São Paulo */
  dia: string;
  /** 0–23, São Paulo */
  hora: number;
  entradas: number;
}

export interface DashV5 {
  /** instante da foto (ISO) */
  geradoEm: string;
  periodo: { inicio: string; fim: string; mapaInicio: string };
  kpis: KpisV5;
  /** mesmo trecho do período anterior (cortado no mesmo tempo decorrido) */
  kpisAnterior: KpisV5 | null;
  /** conectados (sempre) ordenados por entradas; "Números antigos" por último, se houver */
  canais: CanalV5[];
  ne: NeV5;
  /** membros ativos com movimento no período, por recebidos */
  atendentes: AtendenteV5[];
  /** só as células com entrada; a tela completa os zeros */
  mapa: CelulaMapaV5[];
}

/** O que a busca precisa saber do período (o mesmo para a RPC e para o demo). */
export interface JanelaV5 {
  iniISO: string;
  fimISO: string;
  /** trecho comparado do período anterior (fim exclusivo) */
  antIniISO: string;
  antFimISO: string;
  /** início do mapa (pode ser antes do período quando ele é curto) */
  mapaIniISO: string;
}
