/* ============================================================================
   A IRIS AGORA (dono 14/11: "preciso saber quantas pessoas a Iris está atendendo… e de quem que é os clientes…
   como é que tá o atendimento da pessoa, tipo, quanto tempo a Iris está atendendo esse cliente… de qual tráfego é").
   Regras puras que a tela usa nos três jeitos (real, prévia, demonstração): a situação de cada atendimento, os grupos,
   os rótulos e o exemplo da demonstração. Não fala com o banco.
   ============================================================================ */
import { CAMPANHA_ROTULO } from '@/data/dashboardV5.abas.tipos';
import { EQUIPE } from './dados';
import { inicioPeriodo, fimPeriodo, type CategoriaChegada, type Chegadas, type ClienteIris, type IrisAgora, type Periodo } from './fonte';
import type { Lead } from './lead';

/* ---------------------------------------------------------------- os grupos (pela última mensagem do cliente) */
export type GrupoIris = 'conversando' | 'esperando' | 'parado' | 'nunca';
export const GRUPOS_IRIS: { id: GrupoIris; rotulo: string; ajuda: string }[] = [
  { id: 'conversando', rotulo: 'Conversando', ajuda: 'O cliente escreveu nas últimas 24 horas.' },
  { id: 'esperando', rotulo: 'Esperando o cliente', ajuda: 'O cliente escreveu pela última vez entre 1 e 3 dias atrás.' },
  { id: 'parado', rotulo: 'Parados há mais de 3 dias', ajuda: 'O cliente não escreve há mais de 3 dias. A Iris continua com ele.' },
  { id: 'nunca', rotulo: 'Nunca responderam', ajuda: 'O cliente mandou a primeira mensagem e não respondeu mais nada à Iris (há mais de 24 horas).' },
];
export function grupoDe(c: ClienteIris, agora: number): GrupoIris {
  if (!c.ultCliente) return 'nunca';
  const h = (agora - c.ultCliente) / 3_600_000;
  if (h < 24) return 'conversando';
  /* todo lead escreve primeiro: "nunca respondeu" é não ter escrito nada depois da 1ª mensagem da Iris */
  if (c.respondeuIris === false) return 'nunca';
  if (h < 72) return 'esperando';
  return 'parado';
}

/** quem falou por último: o cliente (espera a resposta), a Iris ou um atendente */
export type Vez = 'cliente' | 'iris' | 'atendente';
export function vezDe(c: ClienteIris): Vez | null {
  if (!c.ultCliente && !c.ultNossa) return null;
  if (c.ultCliente && (!c.ultNossa || c.ultCliente > c.ultNossa)) return 'cliente';
  return c.ultNossaOrigem === 'bot' ? 'iris' : 'atendente';
}
/** a última atividade da conversa (a lista vem da mais recente para a mais antiga) */
export const ultimaAtividade = (c: ClienteIris) => Math.max(c.ultCliente ?? 0, c.ultNossa ?? 0, c.desde);

/* ---------------------------------------------------------------- rótulos */
/** as etapas da Iris como o Dashboard (aba Iris) já escreve */
const ETAPA: Record<string, string> = {
  triagem_govbr: 'Triagem (senha gov.br)',
  qualificacao_inss: 'Qualificação',
  qualificacao_retomada: 'Retomada',
  coleta_docs: 'Coleta de documentos',
  docs_pessoais: 'Documentos pessoais',
  extratos: 'Extratos',
  conclusao: 'Conclusão',
  juros_conversa: 'Juros abusivo',
  juros_beneficio: 'Juros abusivo (benefício)',
  retorno: 'Retomando contato',
};
export const rotuloEtapa = (e: string | null | undefined) => (e ? ETAPA[e] ?? e.replace(/_/g, ' ') : 'Começando');

/** por que a Iris pediu um atendente (ia_sessoes.dados.aguardando_humano) */
const PEDIDO: Record<string, string> = {
  nao_entendeu: 'não entendeu o cliente',
  coleta_extratos: 'ajuda com os extratos',
  auxilio_extratos: 'ajuda com os extratos',
  quer_falar_valores: 'o cliente quer falar de valores',
  representacao: 'representação',
  comprovante_fora_janela: 'comprovante antigo',
  falha_leitura_docs: 'não conseguiu ler os documentos',
  falha_tecnica: 'falha técnica',
};
export const rotuloPedido = (p: string | null | undefined) => (p ? PEDIDO[p] ?? p.replace(/_/g, ' ') : null);

/** o tráfego (campanha da origem do lead) como o Dashboard escreve */
export const rotuloTrafego = (c: string | null | undefined) => (c ? CAMPANHA_ROTULO[c] ?? c : 'Sem campanha');
/** a ordem dos tráfegos (a do gráfico do Dashboard) */
export const ORDEM_TRAFEGO = ['diego', 'antonio', 'antonio2', 'juros', 'outros', 'sem_campanha'];

/* ---------------------------------------------------------------- adicionados no período */
export const CATEGORIAS_CHEGADA: CategoriaChegada[] = ['quente', 'documentacao', 'sem_resposta'];
/** o período como se lê depois do "+": "+3 hoje", "+12 em 7 dias" */
export const ROTULO_ADICIONADOS: Record<Periodo, string> = { hoje: 'hoje', '7d': 'em 7 dias', mes: 'no mês', mes_ant: 'no mês passado' };

/* ---------------------------------------------------------------- a demonstração (clientes fictícios) */
const ETAPAS_EX = ['qualificacao_inss', 'triagem_govbr', 'coleta_docs', 'coleta_docs', 'conclusao'];
const TRAFEGOS_EX = ['diego', 'diego', 'juros', 'antonio2', 'diego', 'antonio'];
const NUMERO_EX: Record<string, string> = { diego: 'EMPRESTIMO DIEGO', juros: 'JUROS ABUSIVO (ANDRIUS)', antonio2: 'ANTONIO 2.0', antonio: 'ANTONIO 2.0' };
/** os clientes fictícios que a Iris "atende" na demonstração: os mesmos da fila, com tempos e etapas variados */
export function irisDeExemplo(leads: Lead[], agora = Date.now()): IrisAgora {
  const min = (m: number) => agora - m * 60_000;
  const clientes = leads.filter((_, i) => i % 3 !== 2).slice(0, 60).map((l, i): ClienteIris => {
    const camp = TRAFEGOS_EX[i % TRAFEGOS_EX.length];
    const resp = i % 7 === 6 ? undefined : min([8, 45, 300, 1500, 2900, 5200, 9000][i % 7] + i);
    return {
      contatoId: l.id, conversaId: l.conversaId ?? `ex-${l.id}`, nome: l.nome, fone: l.fone, dono: l.atendente,
      campanha: camp, numero: NUMERO_EX[camp] ?? null, numeroCampanha: camp === 'antonio' ? 'antonio2' : camp,
      respondeuIris: i % 5 !== 3, etapa: ETAPAS_EX[i % ETAPAS_EX.length],
      desde: min(600 + i * 97), ultCliente: resp, ultNossa: resp ? resp + (i % 4 === 0 ? -60_000 : 90_000) : min(400 + i),
      ultNossaOrigem: i % 9 === 4 ? 'painel' : 'bot', pediuHumano: i % 11 === 5 ? 'quer_falar_valores' : null,
      categoriaFila: l.cat,
    };
  });
  return { clientes, lidaEm: agora };
}
/** os adicionados da demonstração: quem "passou" para cada atendente dentro do período (pela hora da passagem) */
export function chegadasDeExemplo(leads: Lead[], agora = new Date()): Partial<Record<Periodo, Chegadas>> {
  const res: Partial<Record<Periodo, Chegadas>> = {};
  for (const p of ['hoje', '7d', 'mes', 'mes_ant'] as Periodo[]) {
    const ini = inicioPeriodo(p, agora).getTime();
    const fim = fimPeriodo(p, agora).getTime();
    const por: Chegadas['por'] = {};
    for (const a of EQUIPE) por[a.id] = {};
    for (const l of leads) {
      if (!l.passouEm || l.passouEm < ini || l.passouEm >= fim) continue;
      if (l.cat !== 'quente' && l.cat !== 'documentacao' && l.cat !== 'sem_resposta') continue;
      const linha = (por[l.atendente] ??= {});
      linha[l.cat] = (linha[l.cat] ?? 0) + 1;
    }
    res[p] = { por, desde: null };
  }
  return res;
}
