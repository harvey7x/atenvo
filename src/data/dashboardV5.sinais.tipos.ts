/* Contrato da LEITURA DO DIA (Dashboard v5, 22/10/2026) — a camada que lê os números
   para o dono e diz o que importa e o que fazer.

   A RPC public.dashboard_v5_sinais devolve SINAIS em snake_case
   (supabase/migrations/20261022100000_dashboard_inteligencia.sql): contagens, esperados
   pela taxa por hora, linhas de base. normalizarSinaisV5 (dashboardV5.sinais.ts) converte
   para os tipos abaixo. O motor (dashboardV5.inteligencia.ts) só compara, junta e escreve
   o texto — todo número da leitura sai do banco (sem LLM). O demo
   (dashboardV5.sinais.demo.ts) já nasce nesta forma, derivado do MESMO plano de leads
   do demo do dashboard. */

import type { PresetDash } from '@/data/dashboard';

export interface ContagemEsperadaV5 {
  /** o que chegou */
  rec: number;
  /** o que costuma chegar no mesmo trecho (taxa por hora dos dias saudáveis) */
  esp: number;
}

export interface QualidadeV5 {
  /** entradas na janela */
  n: number;
  /** descartadas na hora pela regra do DDD fora do RS */
  rs: number;
  /** descartadas pela IA (sem usuário) em até 1 h */
  iaDesc: number;
  /** descarte da IA por motivo */
  motivos: Record<string, number>;
}

export interface LacunaMsgV5 {
  inicio: string;
  /** null = ainda aberta (nenhuma mensagem desde o início) */
  fim: string | null;
  /** mensagens que costumam chegar nesse trecho */
  esperado: number;
  /** lacuna que acabou: mensagens que chegaram DEPOIS dela até agora e o esperado nesse
   *  trecho (é isso que diz se a conexão voltou de verdade ou só em parte) */
  recDepois: number | null;
  espDepois: number | null;
}

export interface QuedaV5 {
  inicio: string;
  /** a entrada que encerrou o trecho */
  fim: string;
  /** entradas que chegaram dentro do trecho */
  chegaram: number;
  esperado: number;
  /** entradas desde o fim (a que encerrou inclusive) até agora, e o esperado nesse trecho:
   *  a volta só se confirma com ≥ 3 entradas ou a última hora no normal */
  depois: number;
  espDepois: number;
}

export interface RajadaV5 {
  inicio: string;
  qtd: number;
  minutos: number;
  /** horas sem entrada antes da rajada */
  silencioAntesH: number | null;
}

export interface NumeroSinaisV5 {
  canalId: string;
  nome: string;
  numero: string | null;
  /** número de anúncio com história suficiente: as regras de volume valem para ele */
  trafego: boolean;
  /** número novo (< 7 dias de história): sem avisos de queda até esta data (YYYY-MM-DD) */
  aprendendoAte: string | null;
  historiaDesde: string | null;
  ultimaEntrada: string | null;
  /** clientes novos esperados desde a última entrada */
  esperadoDesdeUltima: number;
  ent3h: ContagemEsperadaV5;
  /** as mesmas 3 h terminando 15 min atrás (o filete já estava ligado?) */
  ent3h15: ContagemEsperadaV5;
  /** entradas na última hora (confirma a volta depois de uma queda) */
  ent60: ContagemEsperadaV5;
  ultimaMsg: string | null;
  msgsEsperadasDesdeUltimaMsg: number;
  msgs60: ContagemEsperadaV5;
  /** trechos ≥ 75 min sem mensagem com ≥ 20 esperadas, na janela do diagnóstico */
  lacunasMsg: LacunaMsgV5[];
  msgsDiag: ContagemEsperadaV5 & { desde: string };
  hoje: { entradas: number; normalAteAgora: number | null };
  ia3h: { n: number; comIa: number };
  iaCob7d: { n: number; comIa: number };
  qual24h: QualidadeV5;
  qualBase: QualidadeV5 & { dias: number };
  /** quedas encerradas no período */
  quedas: QuedaV5[];
  rajadas: RajadaV5[];
}

export interface IaSinaisV5 {
  /** último episódio de falta de crédito do Gemini (48 h): falhas "prepayment credits are
   *  depleted" seguidas, sem ≥ 3 respostas boas no meio; okDepois = respostas depois dele */
  credito: { inicio: string; fim: string; erros: number; conversas: number; okDepois: number } | null;
  credito60: number;
  /** outras falhas (sem crédito, sem finish_max_tokens; inclui o limite de taxa 429) na última hora */
  erros60: number;
  /** respostas da IA na última hora */
  ok60: number;
}

export interface EquipeSinaisV5 {
  respHoje: { n: number; medianaMin: number | null };
  /** mediana de cada dia útil da base cortado no mesmo horário (só dias com n ≥ 20) */
  respBase: number[];
  filaAgora: number;
  /** a fila há 15 e há 30 min (histerese: o cartão não pisca perto do limite) */
  filaAntes: number[];
  /** fila em cada um dos 10 dias úteis anteriores, na hora cheia de agora e na seguinte */
  filaBase: number[];
  filaBaseProx: number[] | null;
}

export interface PessoaSinaisV5 {
  usuarioId: string;
  nome: string;
  /** parte da pessoa nos leads do rodízio (14 dias), 0–1 */
  parteRodizio14d: number;
  primeiraMsgHoje: string | null;
  /** minuto do dia (SP) em que a pessoa costuma mandar a 1ª mensagem */
  primeiraMsgMedianaMin: number | null;
  /** os 10 dias úteis da base: em quais a pessoa trabalhou (recebeu lead ou mandou mensagem).
   *  Os outros não são "fila zero" e saem da mediana e da recorrência. Vazio = todos. */
  diasAtivos: boolean[];
  fila: { agora: number; maisAntigo: string | null; base: number[]; baseProx: number[] | null };
  respHoje: { n: number; medianaMin: number | null } | null;
  respRestoMedianaMin: number | null;
  respBase: { n: number; med: number | null }[];
  passados: { n: number; semContato: number } | null;
}

export interface FechDiaV5 { dia: string; ganhos: number; fichas: number; entradas: number }

/** Uma janela de 7 dias do cartão "fechados da semana": a 0 é a do "7 dias" da tela (hoje e
 *  os 6 dias anteriores, até agora); 1–4 são as semanas antes, cortadas no mesmo relógio. */
export interface SemanaFechV5 { inicio: string; fim: string; ganhos: number; fichas: number; entradas: number }

export interface LoteNeV5 {
  minuto: string;
  sistema: boolean;
  quem: string | null;
  qtd: number;
  retroativos: number;
  antigos: number;
  dMin: string | null;
  dMax: string | null;
}

export interface TransferenciaLoteV5 {
  minuto: string;
  qtd: number;
  de: string | null;
  para: { nome: string; qtd: number }[];
}

export interface SinaisV5 {
  versao: number;
  geradoEm: string;
  /** o instante lido (é dele que saem todos os "desde", "há" e "hoje") */
  agora: string;
  /** quem vê é admin ou supervisor (os blocos por pessoa só vêm para ele) */
  admin: boolean;
  baseCalculadaEm: string | null;
  janela: { inicio: string; fim: string; incluiAgora: boolean };
  diaUtil: boolean;
  /** feriados em dia útil dentro do período (YYYY-MM-DD) */
  feriadosNoPeriodo: string[];
  numeros: NumeroSinaisV5[];
  total: { hoje: number; normalAteAgora: number | null; rajadaHoje: boolean };
  ia: IaSinaisV5;
  /** null fora de dia útil 11:00–19:59 (ou quando o período não chega a agora) */
  equipe: EquipeSinaisV5 | null;
  pessoas: PessoaSinaisV5[];
  fechamentos: {
    diario: FechDiaV5[];
    semanas: SemanaFechV5[];
    /** fichas finalizadas da semana 0 que ainda não estão marcadas ganho nem perdido */
    semFechadoSemana: number;
  };
  notas: {
    lotesNe: LoteNeV5[];
    transferencias: TransferenciaLoteV5[];
    fichasSemFechado: { total: number; porPessoa: { nome: string; qtd: number }[] };
  };
  /** só no demo: rótulo do rodapé */
  demo?: boolean;
  /** o preset com que ESTE sinal foi buscado (posto pelo hook): ao trocar de período, a
   *  leitura do sinal antigo continua com o preset antigo até o novo chegar */
  preset?: PresetDash;
}

/* ============================== saída do motor ============================== */

export type SeveridadeV5 = 'atencao' | 'bom' | 'info';

export type TipoAchadoV5 =
  | 'numero_parado'
  | 'numeros_parados_juntos'
  | 'ia_parada'
  | 'qualidade_trafego'
  | 'equipe_lenta'
  | 'atendente_atrasado'
  | 'queda_encerrada'
  | 'fechamentos_semana'
  | 'passados_sem_contato'
  | 'ritmo_dia';

/** Onde a ação leva na própria página (a linha é rolada até a tela e realçada). */
export type AlvoV5 =
  | { bloco: 'numeros'; canalId: string }
  | { bloco: 'atendentes'; usuarioId?: string }
  | { bloco: 'motivos'; motivo: string }
  | { bloco: 'kpi'; kpi: 'entradas' | 'ne' | 'ganhos' };

export type RotaAcaoV5 = '/integracoes' | '/ia';

/** O controle à direita do achado: o verbo vai no rótulo ("Reconectar em Integrações",
 *  "Ver Matheus", "Ver os 7 dias"). Um destino só: rota, alvo na página ou outro período. */
export interface LinkAcaoV5 {
  rotulo: string;
  rota?: RotaAcaoV5;
  alvo?: AlvoV5;
  preset?: PresetDash;
}

export interface AchadoV5 {
  /** `${tipo}:${chave}` — estável entre atualizações (chave React, sem piscar) */
  id: string;
  tipo: TipoAchadoV5;
  severidade: SeveridadeV5;
  prioridade: number;
  titulo: string;
  frase: string;
  /** o que fazer: `texto` só quando a instrução é FORA da tela (Gerenciador, conversa com a
   *  equipe) — quando o link já diz tudo, texto = null; `link` = o controle à direita */
  acao: { texto: string | null; link: LinkAcaoV5 | null } | null;
  /** cartão sobre uma pessoa (só admin/supervisor) */
  soAdmin: boolean;
}

export interface NotaV5 { id: string; texto: string; link?: LinkAcaoV5 }

export interface MarcadorV5 { texto: string; tom: 'ambar' | 'mudo' }

export interface OpcoesLeituraV5 { agora: Date; preset: PresetDash; admin: boolean }

export interface LeituraV5 {
  /** 'Leitura do dia' (Hoje), 'Leitura dos 3 dias' ou 'Leitura do período' */
  titulo: string;
  /** ordenados, sem repetidos e já filtrados por papel; os `visiveis` primeiros aparecem */
  achados: AchadoV5[];
  /** quantos aparecem antes do "+N" (≤ 4) */
  visiveis: number;
  /** nada a dizer: "Tudo dentro do normal" e o porquê em uma linha */
  vazio: { titulo: string; motivo: string } | null;
  /** a linha fixa do rodapé ("Números reais do banco. …"; a hora fica só no cabeçalho) */
  rodape: string;
  notas: NotaV5[];
  /** marcas nas linhas das tabelas enquanto o achado está ativo */
  marcadores: { numeros: Record<string, MarcadorV5>; atendentes: Record<string, MarcadorV5> };
}
