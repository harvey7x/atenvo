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

/* pools de nomes (perfil INSS: idosos) + gerador determinístico (mulberry32),
   pra ~600 clientes estáveis entre renders — simulação de escala real. */
export const CICLO_DIA: Record<string, number> = { D01: 1, D02: 2, D03: 3, D04: 4, D05: 5, D25: 25, D26: 26, D28: 28, D29: 29 };
const CICLOS_G = Object.keys(CICLO_DIA);
const ATEND_G = ['Augusto', 'Eduardo', 'Junior', 'Garcia', 'Emillyn', 'Paty', 'Alexandra', 'Leandro'];
const PRIMEIROS = ['Maria', 'José', 'Antônio', 'João', 'Francisco', 'Ana', 'Luiz', 'Paulo', 'Carlos', 'Manoel', 'Pedro', 'Francisca', 'Marcos', 'Raimundo', 'Sebastião', 'Antônia', 'Marcelo', 'Jorge', 'Márcia', 'Geraldo', 'Adriana', 'Sandra', 'Fernando', 'Rita', 'Rosa', 'Terezinha', 'Cleusa', 'Ivone', 'Nara', 'Rosana', 'Sônia', 'Vera', 'Cláudia', 'Marlene', 'Neusa', 'Osvaldo', 'Gilberto', 'Vanderlei', 'Ademar', 'Lourdes', 'Nelson', 'Cícero', 'Elza', 'Waldir'];
const SOBRENOMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Nunes', 'Moreira', 'Cardoso', 'Teixeira', 'Correia', 'Cavalcante', 'Machado', 'Freitas', 'Pinto', 'Monteiro', 'Mendes', 'Ramos', 'Araújo'];

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedClientes(): ClienteAnalise[] {
  const rnd = mulberry32(20260828);
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const out: ClienteAnalise[] = [];
  for (let i = 0; i < 600; i++) {
    const nome = `${pick(PRIMEIROS)} ${pick(SOBRENOMES)} ${pick(SOBRENOMES)}`;
    const ciclo = pick(CICLOS_G);
    const atendente = pick(ATEND_G);
    const mensalidade = 50 + Math.round(rnd() * 20) * 5;   // 50..150, passo 5
    const rc = rnd();
    const comp: Comportamento = rc < 0.55 ? 'em_dia' : rc < 0.70 ? 'voltou' : rc < 0.88 ? 'faltou' : 'inadimplente';
    const meses = MESES.map((c, k) => ({ competencia: c, status: PADRAO[comp][k] }));
    const pagas = meses.filter((m) => m.status === 'paga').length;
    const ra = rnd() < 0.7;
    const rr = rnd() < 0.4;
    const engajamento: ClienteAnalise['engajamento'] = [
      { tipo: 'antes', enviada: true, respondeu: ra },
      { tipo: 'cobranca', enviada: true, respondeu: comp === 'em_dia' || comp === 'voltou' },
      { tipo: 'depois', enviada: comp !== 'em_dia', respondeu: comp === 'voltou' || comp === 'faltou' },
      { tipo: 'remarketing', enviada: comp === 'voltou' || comp === 'inadimplente', respondeu: rr },
    ];
    const ur = comp === 'inadimplente' && rnd() < 0.5 ? null : `há ${1 + Math.floor(rnd() * 29)} dias`;
    out.push({ id: `cl-${i}`, nome, ciclo, atendente, mensalidade, comportamento: comp, meses, engajamento, faturamentoTotal: pagas * mensalidade, ultimaResposta: ur });
  }
  return out;
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
