/* Baldes e leituras das SÉRIES por campanha (12/11) — funções PURAS (sem React, sem
   rede), cobertas por dashboardV5.abas.test.ts. O banco entrega a série SEMPRE por
   DIA (SP); semanal e mensal são agregados AQUI:
   - semana = seg–dom de São Paulo (chave = a segunda-feira);
   - mês    = o mês CAF da casa, do dia 11 ao dia 10 seguinte (chave = o dia 11) —
     NUNCA mês-calendário (regra da casa, a mesma de resolvePeriodo/adm_mes_inicio).
   Os cartões "melhor do dia/semana/mês" e as setas cresceu/caiu derivam DA MESMA
   série por estas funções — um caminho só de cálculo, sem números brigando. */

export type BaldeTipo = 'dia' | 'semana' | 'mes';

export interface Balde {
  /** chave estável: o próprio dia, a segunda da semana ou o dia 11 do mês CAF */
  chave: string;
  /** rótulo curto do eixo: '05/11', 'sem 03/11', '11/10–10/11' */
  rotulo: string;
  /** fim EXCLUSIVO (data) — balde fechado quando fim ≤ hoje */
  fim: string;
}

const DIA_MS = 86_400_000;
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export const addDiasSerie = (dia: string, n: number): string =>
  new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

/** dia da semana ISO (1 = segunda … 7 = domingo) de uma data YYYY-MM-DD */
const dow = (dia: string): number => {
  const g = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return g === 0 ? 7 : g;
};

/** segunda-feira da semana (SP) que contém o dia */
export function semanaDe(dia: string): string {
  return addDiasSerie(dia, 1 - dow(dia));
}

/** dia 11 que abre o mês CAF que contém o dia (dia < 11 → mês CAF aberto no mês anterior) */
export function mesCafDe(dia: string): string {
  const d = Number(dia.slice(8, 10));
  if (d >= 11) return `${dia.slice(0, 8)}11`;
  const fim = `${dia.slice(0, 8)}01`;
  const anterior = addDiasSerie(fim, -1); // último dia do mês anterior
  return `${anterior.slice(0, 8)}11`;
}

export function chaveBalde(dia: string, tipo: BaldeTipo): string {
  if (tipo === 'dia') return dia;
  if (tipo === 'semana') return semanaDe(dia);
  return mesCafDe(dia);
}

/** fim EXCLUSIVO (data) do balde */
function fimBalde(chave: string, tipo: BaldeTipo): string {
  if (tipo === 'dia') return addDiasSerie(chave, 1);
  if (tipo === 'semana') return addDiasSerie(chave, 7);
  // mês CAF: do dia 11 ao dia 10 do mês seguinte (fim exclusivo = o 11 seguinte)
  return mesCafDe(addDiasSerie(chave, 32));
}

function rotuloBalde(chave: string, tipo: BaldeTipo): string {
  if (tipo === 'dia') return ddmm(chave);
  if (tipo === 'semana') return `sem ${ddmm(chave)}`;
  return `${ddmm(chave)}–${ddmm(addDiasSerie(fimBalde(chave, 'mes'), -1))}`;
}

/** Fim de desenho de um período: nunca além de amanhã — período em andamento (mês
 *  corrente vai até o dia 10 seguinte) não ganha cauda de baldes futuros zerados. */
export function fimComHoje(fimDateExcl: string, hoje: string): string {
  const amanha = addDiasSerie(hoje, 1);
  return fimDateExcl < amanha ? fimDateExcl : amanha;
}

/** Todos os baldes que cobrem [iniDate, fimDateExcl), em ordem — inclusive os vazios
 *  (o gráfico desenha o zero; a série do banco só traz dias com movimento). */
export function baldesDe(iniDate: string, fimDateExcl: string, tipo: BaldeTipo): Balde[] {
  const out: Balde[] = [];
  let c = chaveBalde(iniDate, tipo);
  // trava de segurança: 45 dias de período → no máximo ~46 baldes diários
  for (let i = 0; c < fimDateExcl && i < 400; i++) {
    out.push({ chave: c, rotulo: rotuloBalde(c, tipo), fim: fimBalde(c, tipo) });
    c = fimBalde(c, tipo);
  }
  return out;
}

/** Soma uma série {dia, valor} nos baldes do tipo: Map chave → soma (só chaves com valor). */
export function somarEmBaldes(pontos: { dia: string; valor: number }[], tipo: BaldeTipo): Map<string, number> {
  const out = new Map<string, number>();
  for (const p of pontos) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dia)) continue;
    const k = chaveBalde(p.dia, tipo);
    out.set(k, (out.get(k) ?? 0) + p.valor);
  }
  return out;
}

/** O melhor de uma lista {campanha, …} por uma métrica, com desempate por outra;
 *  null quando ninguém pontuou (0 não elege "melhor"). */
export function melhorCampanha<T extends { campanha: string }>(
  lista: T[], metrica: (x: T) => number, desempate: (x: T) => number,
): T | null {
  let best: T | null = null;
  for (const x of lista) {
    if (metrica(x) <= 0) continue;
    if (!best
      || metrica(x) > metrica(best)
      || (metrica(x) === metrica(best) && desempate(x) > desempate(best))) best = x;
  }
  return best;
}

export type Tendencia = 'cresceu' | 'caiu' | 'estavel';

export interface LeituraOnda {
  campanha: string;
  /** último balde FECHADO vs o anterior a ele (o balde em andamento engana) */
  tendencia: Tendencia | null;
  /** teve balde zerado entre baldes com movimento e voltou (a "recaída" do dono) */
  recaida: boolean;
}

/** mesma régua da Variacao dos KPIs: contagens miúdas (os dois lados < 5) não viram seta */
const VAR_MIN = 5;

/** Leitura das ondas de UMA campanha sobre os baldes (em ordem): tendência do último
 *  balde fechado e se a onda zerou no meio e voltou. `fechados` = índices de baldes
 *  já encerrados (o corrente fica fora da tendência, nunca da recaída). */
export function leituraOnda(campanha: string, valores: number[], baldesFechados: number): LeituraOnda {
  let tendencia: Tendencia | null = null;
  if (baldesFechados >= 2) {
    const a = valores[baldesFechados - 1] ?? 0;
    const b = valores[baldesFechados - 2] ?? 0;
    if (a === 0 && b === 0) tendencia = null; // linha morta: "estável" seria ruído
    else if (Math.max(a, b) >= VAR_MIN) tendencia = a > b ? 'cresceu' : a < b ? 'caiu' : 'estavel';
    else tendencia = 'estavel';
  }
  // recaída: zero entre dois baldes com movimento (considera também o balde corrente)
  let viu = false; let zerou = false; let recaida = false;
  for (const v of valores) {
    if (v > 0) {
      if (viu && zerou) recaida = true;
      viu = true; zerou = false;
    } else if (viu) zerou = true;
  }
  return { campanha, tendencia, recaida };
}
