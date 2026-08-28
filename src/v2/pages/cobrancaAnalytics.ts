/* ------------------------------------------------------------------
   Modo Cobrança — camada de análise (Fase B+, inteligência).
   Seed de demonstração + métricas derivadas: por atendente, por
   cliente (comportamento de pagamento), por ciclo, e engajamento
   das mensagens (respondeu antes/remarketing). Sem backend ainda —
   os dados reais entram na Fase C; aqui é a forma pra revisão.
   ------------------------------------------------------------------ */

export type Comportamento = 'em_dia' | 'voltou' | 'faltou' | 'inadimplente';
export type StatusMes = 'paga' | 'atraso' | 'nao_paga' | 'prevista';
export type TipoMsg = 'antes' | 'cobranca' | 'depois' | 'remarketing';

export const ROTULO_COMP: Record<Comportamento, string> = {
  em_dia: 'Em dia', voltou: 'Voltou a pagar', faltou: 'Faltou pagar', inadimplente: 'Inadimplente',
};

export interface ClienteAnalise {
  id: string;
  nome: string;
  ciclo: string;
  atendente: string;
  mensalidade: number;
  comportamento: Comportamento;
  meses: { competencia: string; status: StatusMes }[];
  engajamento: { tipo: TipoMsg; enviada: boolean; respondeu: boolean }[];
  faturamentoTotal: number;   // soma paga histórica
  ultimaResposta: string | null;
}

const MESES = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];

/* padrão de pagamento por comportamento (6 meses, mais recente ao fim) */
const PADRAO: Record<Comportamento, StatusMes[]> = {
  em_dia:       ['paga', 'paga', 'paga', 'paga', 'paga', 'prevista'],
  voltou:       ['paga', 'nao_paga', 'nao_paga', 'atraso', 'paga', 'prevista'],
  faltou:       ['paga', 'paga', 'paga', 'atraso', 'nao_paga', 'prevista'],
  inadimplente: ['paga', 'paga', 'nao_paga', 'nao_paga', 'nao_paga', 'prevista'],
};

type Semente = [nome: string, ciclo: string, atendente: string, mensalidade: number, comp: Comportamento, respAntes: boolean, respRemk: boolean, ultResp: string | null];

const SEMENTES: Semente[] = [
  ['Maria Aparecida Souza', 'D01', 'Giovana', 108, 'em_dia', true, false, 'há 2 dias'],
  ['João Batista Ferreira', 'D01', 'Giovana', 96, 'em_dia', true, false, 'há 5 dias'],
  ['Cleusa M. Ribeiro', 'D01', 'Matheus', 120, 'faltou', false, false, 'há 12 dias'],
  ['José Carlos Ferreira', 'D02', 'Matheus', 127, 'voltou', true, true, 'ontem'],
  ['Terezinha M. Alves', 'D02', 'Giovana', 85, 'em_dia', true, false, 'há 3 dias'],
  ['Antônio Pereira Lima', 'D03', 'Junior', 150, 'inadimplente', false, false, null],
  ['Rosana M. Ferreira', 'D03', 'Junior', 92, 'voltou', true, true, 'há 1 dia'],
  ['Sebastião R. Nunes', 'D25', 'Garcia', 65, 'em_dia', true, false, 'há 6 dias'],
  ['Ivone F. Cardoso', 'D25', 'Garcia', 72, 'faltou', true, false, 'há 4 dias'],
  ['Nara T. Rodrigues', 'D28', 'Junior', 90, 'inadimplente', false, true, 'há 20 dias'],
  ['Carlos R. Machado', 'D02', 'Matheus', 110, 'em_dia', true, false, 'há 8 dias'],
  ['Eva de Fátima Trindade', 'D01', 'Giovana', 88, 'voltou', false, true, 'há 2 dias'],
  ['Gerson P. Evaristo', 'D03', 'Junior', 130, 'faltou', true, false, 'há 9 dias'],
  ['Ana Paula da Silva', 'D25', 'Garcia', 78, 'em_dia', true, false, 'há 1 dia'],
  ['Neuri Maia', 'D28', 'Matheus', 105, 'inadimplente', false, false, null],
  ['Letícia F. da Silva', 'D02', 'Giovana', 99, 'voltou', true, true, 'há 3 dias'],
];

export function seedClientes(): ClienteAnalise[] {
  return SEMENTES.map(([nome, ciclo, atendente, mens, comp, ra, rr, ur], i) => {
    const meses = MESES.map((c, k) => ({ competencia: c, status: PADRAO[comp][k] }));
    const pagas = meses.filter((m) => m.status === 'paga').length;
    const engajamento: ClienteAnalise['engajamento'] = [
      { tipo: 'antes', enviada: true, respondeu: ra },
      { tipo: 'cobranca', enviada: true, respondeu: comp === 'em_dia' || comp === 'voltou' },
      { tipo: 'depois', enviada: comp !== 'em_dia', respondeu: comp === 'voltou' || comp === 'faltou' },
      { tipo: 'remarketing', enviada: comp === 'voltou' || comp === 'inadimplente', respondeu: rr },
    ];
    return {
      id: `cl-${i}`, nome, ciclo, atendente, mensalidade: mens, comportamento: comp,
      meses, engajamento, faturamentoTotal: pagas * mens, ultimaResposta: ur,
    };
  });
}

export interface MetricaAtendente {
  nome: string;
  clientes: number;
  faturamento: number;     // recebido histórico
  recorrencia: number;     // soma das mensalidades ativas
  emAtraso: number;        // clientes com faltou/inadimplente
  adimplencia: number;     // % em dia+voltou
  taxaResposta: number;    // % que respondeu alguma msg
}

export function metricasPorAtendente(cs: ClienteAnalise[]): MetricaAtendente[] {
  const map = new Map<string, ClienteAnalise[]>();
  for (const c of cs) { const a = map.get(c.atendente) ?? []; a.push(c); map.set(c.atendente, a); }
  return [...map.entries()].map(([nome, lista]) => {
    const emDia = lista.filter((c) => c.comportamento === 'em_dia' || c.comportamento === 'voltou').length;
    const respond = lista.filter((c) => c.engajamento.some((e) => e.respondeu)).length;
    return {
      nome, clientes: lista.length,
      faturamento: lista.reduce((s, c) => s + c.faturamentoTotal, 0),
      recorrencia: lista.reduce((s, c) => s + c.mensalidade, 0),
      emAtraso: lista.filter((c) => c.comportamento === 'faltou' || c.comportamento === 'inadimplente').length,
      adimplencia: Math.round((emDia / lista.length) * 100),
      taxaResposta: Math.round((respond / lista.length) * 100),
    };
  }).sort((a, b) => b.faturamento - a.faturamento);
}

export interface MetricaCiclo { codigo: string; clientes: number; faturamento: number; recorrencia: number; }
export function metricasPorCiclo(cs: ClienteAnalise[]): MetricaCiclo[] {
  const map = new Map<string, ClienteAnalise[]>();
  for (const c of cs) { const a = map.get(c.ciclo) ?? []; a.push(c); map.set(c.ciclo, a); }
  return [...map.entries()].map(([codigo, lista]) => ({
    codigo, clientes: lista.length,
    faturamento: lista.reduce((s, c) => s + c.faturamentoTotal, 0),
    recorrencia: lista.reduce((s, c) => s + c.mensalidade, 0),
  })).sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export interface ResumoCarteira {
  faturamentoTotal: number;
  recorrencia: number;
  recebidoMes: number;
  emAtrasoValor: number;
  adimplencia: number;
  porComportamento: { comp: Comportamento; n: number; valor: number }[];
  faturamentoMensal: { competencia: string; valor: number }[];
  respostaPorTipo: { tipo: TipoMsg; enviadas: number; respostas: number }[];
}

export function resumoCarteira(cs: ClienteAnalise[]): ResumoCarteira {
  const comps: Comportamento[] = ['em_dia', 'voltou', 'faltou', 'inadimplente'];
  const porComportamento = comps.map((comp) => {
    const l = cs.filter((c) => c.comportamento === comp);
    return { comp, n: l.length, valor: l.reduce((s, c) => s + c.mensalidade, 0) };
  });
  const faturamentoMensal = MESES.map((competencia, k) => ({
    competencia, valor: cs.reduce((s, c) => s + (c.meses[k].status === 'paga' ? c.mensalidade : 0), 0),
  }));
  const tipos: TipoMsg[] = ['antes', 'cobranca', 'depois', 'remarketing'];
  const respostaPorTipo = tipos.map((tipo) => {
    const env = cs.flatMap((c) => c.engajamento).filter((e) => e.tipo === tipo && e.enviada);
    return { tipo, enviadas: env.length, respostas: env.filter((e) => e.respondeu).length };
  });
  const emDia = cs.filter((c) => c.comportamento === 'em_dia' || c.comportamento === 'voltou').length;
  return {
    faturamentoTotal: cs.reduce((s, c) => s + c.faturamentoTotal, 0),
    recorrencia: cs.reduce((s, c) => s + c.mensalidade, 0),
    recebidoMes: faturamentoMensal[faturamentoMensal.length - 2]?.valor ?? 0,
    emAtrasoValor: cs.filter((c) => c.comportamento === 'faltou' || c.comportamento === 'inadimplente').reduce((s, c) => s + c.mensalidade, 0),
    adimplencia: Math.round((emDia / cs.length) * 100),
    porComportamento, faturamentoMensal, respostaPorTipo,
  };
}
