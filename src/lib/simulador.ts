// Simulador de Valores (/simulador) — motor puro de cálculo + montagem das
// mensagens de cópia. 100% frontend, sem persistência (v1 da ferramenta).
//
// ATENÇÃO (regra da casa): os TEXTOS de mensagemCliente/resumoInterno são copy
// aprovada do dono — caractere por caractere, só os placeholders variam.
// Qualquer mudança de redação passa por aprovação; os testes byte a byte em
// simulador.test.ts travam os moldes.

export type ResultadoContrato = {
  dentroDaReferencia: boolean;
  parcelaJusta?: number;
  economiaMensal: number;
  totalProjetado: number;
  jaDescontado?: number;
};

// Sistema Price. Taxas entram em % a.m. e são convertidas p/ decimal.
const pv  = (pmt: number, i: number, n: number) => pmt * (1 - Math.pow(1 + i, -n)) / i;
const pmt = (p: number, i: number, n: number) => p * i / (1 - Math.pow(1 + i, -n));

export function calcularContrato(params: {
  parcela: number; prazo: number; taxaContratada: number;
  taxaReferencia: number; parcelasPagas?: number;
}): ResultadoContrato {
  const ic = params.taxaContratada / 100;
  const ir = params.taxaReferencia / 100;
  if (ic <= ir) return { dentroDaReferencia: true, economiaMensal: 0, totalProjetado: 0 };
  const principal = pv(params.parcela, ic, params.prazo);
  const parcelaJusta = pmt(principal, ir, params.prazo);
  const economiaMensal = params.parcela - parcelaJusta;
  return {
    dentroDaReferencia: false,
    parcelaJusta,
    economiaMensal,
    totalProjetado: economiaMensal * params.prazo,
    jaDescontado: params.parcelasPagas
      ? economiaMensal * Math.min(params.parcelasPagas, params.prazo)
      : undefined,
  };
}
// Modo "média do banco": rodar calcularContrato com taxaMin e taxaMax → faixa [min, max].

export function calcularCartao(params: {
  valorMensal: number;
  inicio: { mes: number; ano: number };
  fim?: { mes: number; ano: number }; // ausente = hoje
}) {
  const hoje = new Date();
  const fim = params.fim ?? { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() };
  const meses = Math.max((fim.ano - params.inicio.ano) * 12 + (fim.mes - params.inicio.mes) + 1, 0);
  const total = meses * params.valorMensal;
  return { meses, total, totalEmDobro: total * 2 };
}

/* ------------------------------------------------------------------
   Formatação pt-BR (validações da página: moeda via Intl.NumberFormat)
   ------------------------------------------------------------------ */
const fmt0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTaxa = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** Estimativas (totais projetados): inteiro arredondado — "27.000". */
export const numeroBR = (v: number): string => fmt0.format(Math.round(v));
/** Valores digitados (parcela/mensalidade): centavos só quando existem. */
export const valorBR = (v: number): string => (Number.isInteger(v) ? fmt0.format(v) : fmt2.format(v));
/** Taxa em % a.m. com vírgula — "1,85", "12". */
export const taxaBR = (v: number): string => fmtTaxa.format(v);
/** Competência "MM/AAAA". */
export const mesAnoBR = (c: { mes: number; ano: number }): string =>
  `${String(c.mes).padStart(2, '0')}/${c.ano}`;

/** Faixa "R$ A a R$ B" (mensagem) ou "R$ A – R$ B" (resumo/UI). Extremos que
    arredondam IGUAL colapsam para "R$ A" — única alteração de molde autorizada
    pelo dono (2026-08-17): nunca sai "R$ X a R$ X". */
export const faixaBR = (min: number, max: number, sep: 'a' | '–' = '–'): string =>
  Math.round(min) === Math.round(max)
    ? `R$ ${numeroBR(max)}`
    : `R$ ${numeroBR(min)} ${sep} R$ ${numeroBR(max)}`;

/** "1.234,56" | "1234,56" | "400" | "1,85" → número (null se não parseável). */
export function parseValorBR(bruto: string): number | null {
  const s = bruto.trim().replace(/\s/g, '').replace(/^R\$/, '');
  if (!s) return null;
  let normalizado: string;
  if (s.includes(',')) normalizado = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalizado = s.replace(/\./g, ''); // pontos de milhar
  else normalizado = s;
  if (!/^\d+(\.\d+)?$/.test(normalizado)) return null;
  const v = Number(normalizado);
  return Number.isFinite(v) ? v : null;
}

/** Inteiro estrito ("84" → 84; "8a"/"" → null). */
export function parseInteiro(bruto: string): number | null {
  const s = bruto.trim();
  return /^\d+$/.test(s) ? Number(s) : null;
}

/* ------------------------------------------------------------------
   Dados consolidados da simulação (montados pela página a partir das
   linhas VÁLIDAS) e mensagens de cópia.
   ------------------------------------------------------------------ */
export type EmprestimoResumo = {
  banco: string;            // nome de exibição
  parcela: number;
  prazo: number;
  modo: 'media' | 'exata';
  taxaMin: number;          // média: faixa do banco · exata: a taxa nos dois
  taxaMax: number;
  totalMin: number;         // recuperação projetada (exata: min === max)
  totalMax: number;
};

export type CartaoResumo = {
  tipo: 'RMC' | 'RCC';
  banco: string;
  valorMensal: number;
  inicio: { mes: number; ano: number };
  meses: number;
  total: number;
  totalEmDobro: number;
};

export type DadosSimulacao = {
  nome: string;             // pode ser vazio
  taxaReferencia: number;
  emprestimos: EmprestimoResumo[];
  cartoes: CartaoResumo[];
};

/** Somas do consolidado. Total geral = faixa dos empréstimos + DOBRO dos cartões. */
export function totaisSimulacao(d: Pick<DadosSimulacao, 'emprestimos' | 'cartoes'>) {
  const empMin = d.emprestimos.reduce((s, e) => s + e.totalMin, 0);
  const empMax = d.emprestimos.reduce((s, e) => s + e.totalMax, 0);
  const cartTotal = d.cartoes.reduce((s, c) => s + c.total, 0);
  const cartDobro = d.cartoes.reduce((s, c) => s + c.totalEmDobro, 0);
  return { empMin, empMax, cartTotal, cartDobro, totalMin: empMin + cartDobro, totalMax: empMax + cartDobro };
}

// Nome opcional: sem nome, o par " — {NOME}" sai do cabeçalho (placeholder de
// campo vazio não vira texto pendurado).
const tituloCom = (base: string, nome: string) => (nome.trim() ? `${base} — ${nome.trim()}` : base);

/** Mensagem p/ cliente — molde LITERAL aprovado. Linha de bloco vazio é omitida;
    cada cartão gera a própria linha. Empréstimos "dentro da referência" (total 0)
    não entram na contagem/lista de bancos. */
export function mensagemCliente(d: DadosSimulacao): string {
  const emps = d.emprestimos.filter((e) => e.totalMax > 0);
  const { totalMin, totalMax } = totaisSimulacao(d);
  const linhas: string[] = [];
  linhas.push(`*${tituloCom('Simulação de valores', d.nome)}*`);
  linhas.push('');
  linhas.push('Com base nas informações dos seus descontos, fizemos o recálculo pela taxa de referência do Banco Central. A estimativa de valores a recuperar é:');
  linhas.push('');
  if (emps.length > 0) {
    const bancos = [...new Set(emps.map((e) => e.banco))].join(', ');
    const min = emps.reduce((s, e) => s + e.totalMin, 0);
    const max = emps.reduce((s, e) => s + e.totalMax, 0);
    linhas.push(`- Empréstimos (${emps.length} contrato(s) — ${bancos}): ${faixaBR(min, max, 'a')}`);
  }
  for (const c of d.cartoes) {
    linhas.push(`- Cartão ${c.tipo} (${c.banco}): R$ ${numeroBR(c.total)} já descontados — a ação busca a devolução em dobro: R$ ${numeroBR(c.totalEmDobro)}`);
  }
  linhas.push('');
  linhas.push(`*Total estimado: ${faixaBR(totalMin, totalMax, 'a')}*`);
  linhas.push('');
  linhas.push('_Os valores não incluem correção monetária e juros, que podem aumentar o total._');
  linhas.push('');
  linhas.push('Importante: estes valores são uma estimativa e dependem da análise dos contratos e da decisão da Justiça. O processo é conduzido pelo escritório do Dr. Rafael Ribeiro de Menezes (OAB/RS 91.310).');
  return linhas.join('\n');
}

/** Resumo interno — molde LITERAL aprovado. `data` chega pronta (dd/mm/aaaa).
    Bloco vazio é omitido por inteiro (cabeçalho junto). Aqui entram TODAS as
    linhas válidas, inclusive as "dentro da referência" (→ R$ 0) — registro do
    que foi simulado. */
export function resumoInterno(d: DadosSimulacao, data: string): string {
  const linhas: string[] = [];
  linhas.push(tituloCom(`SIMULAÇÃO ${data}`, d.nome));
  linhas.push(`Taxa de referência: ${taxaBR(d.taxaReferencia)}% a.m.`);
  if (d.emprestimos.length > 0) {
    linhas.push('[EMPRÉSTIMOS]');
    for (const e of d.emprestimos) {
      const taxa = e.modo === 'media'
        ? `média ${taxaBR(e.taxaMin)}–${taxaBR(e.taxaMax)}%`
        : `exata ${taxaBR(e.taxaMin)}%`;
      const valor = e.modo === 'media' ? faixaBR(e.totalMin, e.totalMax) : `R$ ${numeroBR(e.totalMax)}`;
      linhas.push(`- ${e.banco} | parcela R$ ${valorBR(e.parcela)} | ${e.prazo}x | taxa ${taxa} → ${valor}`);
    }
  }
  if (d.cartoes.length > 0) {
    linhas.push('[CARTÕES]');
    for (const c of d.cartoes) {
      linhas.push(`- ${c.tipo} ${c.banco} | R$ ${valorBR(c.valorMensal)}/mês desde ${mesAnoBR(c.inicio)} | ${c.meses} meses → R$ ${numeroBR(c.total)} (dobro R$ ${numeroBR(c.totalEmDobro)})`);
    }
  }
  const { totalMin, totalMax } = totaisSimulacao(d);
  linhas.push(`TOTAL: ${faixaBR(totalMin, totalMax)}`);
  return linhas.join('\n');
}
