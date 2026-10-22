/* Fixtures do Dashboard v5 para `vite --mode demo` (sem backend).
   DEMO É O CONTRATO: mesma forma de DashV5 que a RPC devolve (depois do normalizador),
   com proporções tiradas do banco real em 21/10/2026 (rel-canais / rel-atendentes):
   EMPRESTIMO ~110 entradas/dia e ~53% não elegíveis; JUROS ~19/dia e ~17%; ANTONIO
   CAMPANHA nasceu em 21/10; MURILLO CHIP ~1 por semana; OFICIAL sem entrada desde
   06/08 (WABA banida); o EMPRÉSTIMO antigo (números removidos) ainda fecha negócio.
   Rodízio 7/7/3/3 (Juliana, Matheus, Isadora, Luiz). Os números conectados são os
   números de verdade do escritório (é o que o dono reconhece na tela).

   CONSTRUÍDO POR LEAD e só depois agregado: cada (número, dia) tem um plano sorteado
   sobre TODAS as chegadas do dia, com gerador determinístico por lead (nada muda entre
   uma atualização e outra). O relógio só FILTRA: entra quem já chegou, conta o não
   elegível já marcado, o fechamento já feito e a resposta já dada. Por isso os totais
   fecham por construção: soma dos números = entradas, soma dos motivos = não elegíveis
   = IA + regra RS + equipe, fechados por atendente ≤ fechados. */

import type {
  AtendenteV5, CanalV5, CelulaMapaV5, DashV5, JanelaV5, KpisV5, MotivoNeV5, NeV5,
} from '@/data/dashboardV5.tipos';

/* ============================== PRNG ============================== */
function hash32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const rngDe = (k: string) => mulberry32(hash32(k));
const normal = (a: number, b: number) => Math.sqrt(-2 * Math.log(Math.max(1e-12, a))) * Math.cos(2 * Math.PI * b);
const logNormal = (med: number, sd: number, r: () => number) => med * Math.exp(sd * normal(r(), r()));
function poisson(lambda: number, r: () => number): number {
  const l = Math.exp(-lambda); let k = 0; let p = 1;
  do { k++; p *= r(); } while (p > l && k < 40);
  return k - 1;
}
export function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const r1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
const r3 = (n: number | null) => (n == null ? null : Math.round(n * 1000) / 1000);
function escolher<T>(itens: readonly (readonly [T, number])[], u: number): T {
  const tot = itens.reduce((a, [, p]) => a + p, 0);
  let acc = 0;
  for (const [v, p] of itens) { acc += p / tot; if (u < acc) return v; }
  return itens[itens.length - 1][0];
}

/* ============================== Relógio de SP (UTC-3 fixo) ============================== */
export const MIN = 60_000, HORA = 3_600_000, DIA = 86_400_000;
export const msDe = (dia: string, minDia = 0) => Date.parse(`${dia}T00:00:00-03:00`) + minDia * MIN;
export const diaDe = (ms: number) => new Date(ms - 3 * HORA).toISOString().slice(0, 10);
export const horaDe = (ms: number) => new Date(ms - 3 * HORA).getUTCHours();
export const addDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
export const dowDe = (dia: string) => { const g = new Date(`${dia}T12:00:00Z`).getUTCDay(); return g === 0 ? 7 : g; };
/** início do relógio do "tempo para fechar" (antes houve backfill) — igual ao SQL */
const CORTE_QUALIDADE = Date.parse('2026-08-01T00:00:00-03:00');

/* ============================== Equipe ============================== */
interface AtendCfg {
  id: string; nome: string; peso: number;
  /** multiplica a chance de fechar um lead dele */
  fecha: number;
  /** multiplica a chance de ELE marcar o não elegível (em vez da IA) */
  marca: number;
  /** resposta (minutos úteis): mediana e espalhamento log-normal */
  respMed: number; respSd: number;
  /** vezes do cliente por lead recebido */
  vezes: number;
  /** fração respondida pelo celular */
  cel: number;
}
export type { AtendCfg, CanalCfg };
export const DEMO_ATENDENTES: readonly AtendCfg[] = [
  { id: 'demo-u-juliana', nome: 'Juliana', peso: 7, fecha: 0.35, marca: 1.25, respMed: 5.1, respSd: 2.0, vezes: 1.8, cel: 0.2 },
  { id: 'demo-u-matheus', nome: 'Matheus', peso: 7, fecha: 1.25, marca: 0.55, respMed: 16.5, respSd: 1.8, vezes: 1.1, cel: 0.09 },
  { id: 'demo-u-isadora', nome: 'Isadora', peso: 3, fecha: 3.0, marca: 0.9, respMed: 6.6, respSd: 1.6, vezes: 2.2, cel: 0.04 },
  { id: 'demo-u-luiz', nome: 'Luiz', peso: 3, fecha: 0.05, marca: 1.6, respMed: 3.3, respSd: 2.1, vezes: 1.7, cel: 0.09 },
];
const ATEND = new Map(DEMO_ATENDENTES.map((a) => [a.id, a]));

/* ============================== Números ============================== */
type Motivos = readonly (readonly [MotivoNeV5, number])[];
interface CanalCfg {
  chave: string;
  /** null = número antigo (removido) — cai na linha "Números antigos" */
  id: string | null;
  nome: string; numero: string | null;
  /** janela de vida [desde, ate) em datas SP (ate exclusiva; null = até hoje) */
  desde: string; ate: string | null;
  porDia: number;
  /** multiplicador do domingo (o JUROS quase para no domingo) */
  domingo: number;
  pNe: number; motivos: Motivos;
  /** minutos até a IA marcar (mediana) */
  iaMin: number;
  pGanho: number; ganhoMedH: number; ganhoSd: number;
  /** quem pode receber pelo rodízio (null = todos) */
  rodizio: string[] | null;
}
const MOTIVOS_EMP: Motivos = [['sem_beneficio_inss', 61], ['sem_emprestimo_banco', 24.5], ['nao_mora_rs', 7], ['sem_interesse', 6], ['muitos_processos', 1.5]];
const MOTIVOS_JUROS: Motivos = [['sem_beneficio_inss', 38], ['nao_mora_rs', 31], ['sem_emprestimo_banco', 19], ['sem_interesse', 12]];
const MOTIVOS_ANTONIO: Motivos = [['sem_emprestimo_banco', 60], ['sem_beneficio_inss', 30], ['nao_mora_rs', 10]];

export const DEMO_CANAIS: readonly CanalCfg[] = [
  { chave: 'emp', id: 'demo-canal-emprestimo', nome: 'EMPRESTIMO', numero: '555194266757', desde: '2026-09-25', ate: null,
    porDia: 108, domingo: 0.62, pNe: 0.53, motivos: MOTIVOS_EMP, iaMin: 4, pGanho: 0.045, ganhoMedH: 30, ganhoSd: 0.95, rodizio: null },
  { chave: 'juros', id: 'demo-canal-juros', nome: 'JUROS ABUSIVO (ANDRIUS)', numero: '555193930488', desde: '2026-07-30', ate: null,
    porDia: 19, domingo: 0.3, pNe: 0.17, motivos: MOTIVOS_JUROS, iaMin: 90, pGanho: 0.065, ganhoMedH: 110, ganhoSd: 1.2, rodizio: null },
  { chave: 'antonio', id: 'demo-canal-antonio', nome: 'ANTONIO CAMPANHA', numero: '555191655320', desde: '2026-10-21', ate: null,
    porDia: 17, domingo: 0.7, pNe: 0.29, motivos: MOTIVOS_ANTONIO, iaMin: 6, pGanho: 0.03, ganhoMedH: 60, ganhoSd: 1, rodizio: ['demo-u-juliana', 'demo-u-matheus'] },
  { chave: 'murillo', id: 'demo-canal-murillo', nome: 'MURILLO CHIP', numero: '555191035329', desde: '2026-07-31', ate: null,
    porDia: 0.16, domingo: 1, pNe: 0.1, motivos: MOTIVOS_JUROS, iaMin: 60, pGanho: 0.1, ganhoMedH: 70, ganhoSd: 1, rodizio: ['demo-u-matheus'] },
  { chave: 'oficial', id: 'demo-canal-oficial', nome: 'OFICIAL', numero: '555191781390', desde: '2026-07-23', ate: '2026-08-07',
    porDia: 6, domingo: 0.6, pNe: 0.3, motivos: MOTIVOS_EMP, iaMin: 30, pGanho: 0.05, ganhoMedH: 90, ganhoSd: 1.1, rodizio: null },
  // números antigos do EMPRÉSTIMO (removidos): os leads deles ainda fecham e ainda são descartados
  { chave: 'emp_antigo', id: null, nome: 'EMPRÉSTIMO (número antigo)', numero: null, desde: '2026-08-17', ate: '2026-09-25',
    porDia: 72, domingo: 0.62, pNe: 0.5, motivos: MOTIVOS_EMP, iaMin: 6, pGanho: 0.05, ganhoMedH: 40, ganhoSd: 1.05, rodizio: null },
];

/** peso por hora do dia (SP): pico entre 11h e 16h, madrugada quase vazia */
export const PESO_HORA = [2.0, 1.2, 0.7, 0.5, 0.5, 0.8, 1.8, 3.5, 5.5, 8.0, 9.3, 9.8, 10.6, 9.4, 10.0, 9.8, 10.2, 8.5, 7.0, 6.6, 6.4, 6.0, 4.8, 3.4];
export const PESO_HORA_TOT = PESO_HORA.reduce((a, b) => a + b, 0);
/** volume por dia da semana ISO (1 = segunda): segunda forte, domingo fraco */
export const MULT_DOW = [0, 1.45, 1.06, 0.95, 0.93, 1.18, 0.86, 0.57];

/* ============================== Lead ============================== */
interface VezDemo { t0: number; resp: number; min: number; cel: boolean }
export interface LeadDemo {
  id: string;
  canalId: string | null;
  criado: number;
  dono: string | null;
  rotEm: number | null;
  ne: { em: number; motivo: MotivoNeV5; quem: 'ia' | 'regra_rs' | 'equipe'; por: string | null } | null;
  /** fechamento do plano base (fator 1) */
  ganho: { em: number; credito: string } | null;
  /** o fechamento POSSÍVEL (sorteio e chance) — o cenário da leitura escala a chance pelo
   *  dia do fechamento sem mudar o sorteio (fator 1 = exatamente `ganho`) */
  pot: { em: number; credito: string; u: number; p: number } | null;
  vezes: VezDemo[];
}

function minutoDoDia(r: () => number): number {
  const alvo = r() * PESO_HORA_TOT;
  let acc = 0;
  for (let h = 0; h < 24; h++) {
    acc += PESO_HORA[h];
    if (alvo < acc) return h * 60 + Math.floor(r() * 60);
  }
  return 23 * 60 + Math.floor(r() * 60);
}

function rotear(c: CanalCfg, u: number): string {
  const lista = DEMO_ATENDENTES.filter((a) => !c.rodizio || c.rodizio.includes(a.id));
  return escolher(lista.map((a) => [a.id, a.peso] as const), u);
}

const cachePlano = new Map<string, LeadDemo[]>();

/** Todas as chegadas planejadas de um número num dia (independe do relógio). */
function planoDoDia(c: CanalCfg, dia: string): LeadDemo[] {
  const chave = `${c.chave}|${dia}`;
  const pronto = cachePlano.get(chave);
  if (pronto) return pronto;
  const out: LeadDemo[] = [];
  if (dia >= c.desde && (!c.ate || dia < c.ate)) {
    const rd = rngDe(`v5|dia|${chave}`);
    const dow = dowDe(dia);
    const mult = (dow === 7 ? c.domingo : MULT_DOW[dow]) * Math.exp(0.14 * normal(rd(), rd()));
    const esperado = c.porDia * mult;
    const n = esperado < 1 ? (rd() < esperado ? 1 : 0) : Math.round(esperado);
    for (let i = 0; i < n; i++) out.push(montarLead(c, dia, i));
    out.sort((a, b) => a.criado - b.criado);
  }
  cachePlano.set(chave, out);
  return out;
}

function montarLead(c: CanalCfg, dia: string, i: number): LeadDemo {
  const id = `${c.chave}:${dia}:${i}`;
  const r = rngDe(`v5|lead|${id}`);
  const criado = msDe(dia, minutoDoDia(r)) + Math.floor(r() * 60) * 1000;

  // rodízio: ~97% dos leads recebem dono ~1,6 min depois de chegar
  const roteado = r() < 0.97;
  const dono = roteado ? rotear(c, r()) : null;
  const rotEm = roteado ? criado + Math.round(logNormal(1.6, 0.9, r) * MIN) : null;
  const at = dono ? ATEND.get(dono)! : null;

  // não elegível
  let ne: LeadDemo['ne'] = null;
  const uNe = r();
  const motivo = escolher(c.motivos, r());
  const uQuem = r();
  if (uNe < c.pNe) {
    let quem: 'ia' | 'regra_rs' | 'equipe';
    if (motivo === 'nao_mora_rs') quem = 'regra_rs';
    else if (motivo === 'sem_interesse' || motivo === 'muitos_processos') quem = at ? 'equipe' : 'ia';
    else {
      const pEquipe = (motivo === 'sem_beneficio_inss' ? 0.3 : 0.08) * (at?.marca ?? 0);
      quem = at && uQuem < pEquipe ? 'equipe' : 'ia';
    }
    const atraso = quem === 'regra_rs' ? (5 + r() * 35) * 1000
      : quem === 'ia' ? logNormal(c.iaMin, 1, r) * MIN
        : logNormal(14, 1.1, r) * HORA;
    ne = { em: criado + Math.round(atraso), motivo, quem, por: quem === 'equipe' ? dono : null };
  }

  // fechado (só quem não foi descartado e tem dono)
  let ganho: LeadDemo['ganho'] = null;
  const uG = r();
  const durG = logNormal(c.ganhoMedH, c.ganhoSd, r);
  const pot = !ne && at ? { em: criado + Math.round(Math.max(3, durG) * HORA), credito: at.id, u: uG, p: c.pGanho * at.fecha } : null;
  if (pot && uG < pot.p) ganho = { em: pot.em, credito: pot.credito };

  // vezes do cliente respondidas por uma pessoa (a IA conduz quem ela descarta rápido)
  const vezes: VezDemo[] = [];
  if (at && !(ne && ne.quem !== 'equipe' && ne.em - criado < 30 * MIN)) {
    const k = poisson(at.vezes, r);
    let t0 = (rotEm ?? criado) + Math.round(logNormal(25, 1.1, r) * MIN);
    for (let j = 0; j < k; j++) {
      const min = Math.min(2400, logNormal(at.respMed, at.respSd, r));
      const cel = r() < at.cel;
      // resposta em minutos ÚTEIS: fora do expediente o relógio de parede corre mais
      const parede = min * MIN * (horaDe(t0) >= 9 && horaDe(t0) < 19 && dowDe(diaDe(t0)) <= 5 ? 1 : 3);
      const fim = ne ? ne.em : ganho ? ganho.em : Infinity;
      if (t0 > fim) break;
      vezes.push({ t0, resp: t0 + Math.round(parede), min, cel });
      t0 += Math.round(parede + logNormal(3, 1.1, r) * HORA);
    }
  }

  return { id, canalId: c.id, criado, dono, rotEm, ne, ganho, pot, vezes };
}

/** Trocas de dono (transferências) do dia — poucas por dia, mais o lote real de 21/10 13:06. */
interface TransfDemo { em: number; para: string; contato: string }
const cacheTransf = new Map<string, TransfDemo[]>();
export function transferenciasDoDia(dia: string): TransfDemo[] {
  const pronto = cacheTransf.get(dia);
  if (pronto) return pronto;
  const r = rngDe(`v5|transf|${dia}`);
  const out: TransfDemo[] = [];
  // antes do primeiro número (23/07) não havia carteira para transferir
  const n = dia < '2026-07-23' ? 0 : poisson(1.4, r);
  for (let i = 0; i < n; i++) {
    out.push({ em: msDe(dia, 540 + Math.floor(r() * 540)), para: rotear(DEMO_CANAIS[0], r()), contato: `t:${dia}:${i}` });
  }
  if (dia === '2026-10-21') {
    // lote: a carteira do Luiz redistribuída numa transação só
    const para: [string, number][] = [['demo-u-juliana', 29], ['demo-u-matheus', 27], ['demo-u-isadora', 27]];
    for (const [uid, q] of para) for (let i = 0; i < q; i++) out.push({ em: msDe(dia, 786), para: uid, contato: `lote:${uid}:${i}` });
  }
  cacheTransf.set(dia, out);
  return out;
}

/* ============================== Cenários da Leitura do dia ============================== */
/** `?leitura=` no demo: padrao (3 achados), calmo (nada a dizer), incidente (o 05/10) e
 *  cheio (5 achados: mostra o "Ver mais 1"). */
export type CenarioDemoV5 = 'padrao' | 'calmo' | 'incidente' | 'cheio';

export interface AjusteDemoV5 {
  /** entradas planejadas que não chegam: número em [ini, fim) */
  suprimir: { canalId: string; ini: number; fim: number }[];
  /** mensagens que não chegam: número a partir de `ini` (até agora) */
  silencioMsg: { canalId: string; ini: number }[];
  /** fator da chance de fechar, pelo dia (SP) do fechamento */
  fatorGanho: Record<string, number>;
  /** fator das fichas finalizadas, pelo dia */
  fatorFichas: Record<string, number>;
  /** rajada: entradas do número que chegariam em [de, ate) chegam juntas a partir de `em` */
  rajada: { canalId: string; de: number; ate: number; em: number; n: number } | null;
  /** crédito do Gemini acabou em [ini, agora) */
  creditoIni: number | null;
  /** fila da 1ª mensagem do Matheus acima do normal */
  filaMatheus: boolean;
}

/** Cenário da leitura no demo: `?leitura=padrao|calmo|incidente` (só no demo — o hook
 *  real nunca chama). Sem parâmetro: padrao. */
export function cenarioDemoV5(): CenarioDemoV5 {
  try {
    const v = new URLSearchParams(window.location.search).get('leitura');
    if (v === 'calmo' || v === 'incidente' || v === 'padrao' || v === 'cheio') return v;
  } catch { /* sem window (teste) */ }
  return 'padrao';
}

const SEM_AJUSTE: AjusteDemoV5 = { suprimir: [], silencioMsg: [], fatorGanho: {}, fatorFichas: {}, rajada: null, creditoIni: null, filaMatheus: false };

/** Os botões do cenário, aplicados ao MESMO plano de leads (deterministas, relativos a agora). */
export function ajusteDemoV5(cenario: CenarioDemoV5 | undefined, agora: Date): AjusteDemoV5 {
  if (!cenario || cenario === 'calmo') return SEM_AJUSTE;
  const ag = agora.getTime();
  const hoje = diaDe(ag);
  const ontem = addDias(hoje, -1), anteontem = addDias(hoje, -2);
  const FIM = ag + 2 * DIA;
  if (cenario === 'padrao' || cenario === 'cheio') {
    const padrao: AjusteDemoV5 = {
      ...SEM_AJUSTE,
      // JUROS: último cliente novo há 2 h 50 e última mensagem há 1 h 40 (o chip caiu)
      suprimir: [{ canalId: 'demo-canal-juros', ini: ag - (2 * 60 + 50) * MIN, fim: FIM }],
      silencioMsg: [{ canalId: 'demo-canal-juros', ini: ag - 100 * MIN }],
      // semana boa: os 2 últimos dias fecharam bem mais (e as fichas acompanharam) e HOJE
      // também — o cartão "Fechados" de Hoje compara com ontem no mesmo horário e não pode
      // despencar ao lado de uma semana boa (o teste do demo confere: nunca abaixo de −50%)
      fatorGanho: { [hoje]: 8, [ontem]: 4, [anteontem]: 4 },
      fatorFichas: { [ontem]: 2.2, [anteontem]: 2.2 },
      filaMatheus: true,
    };
    if (cenario === 'padrao') return padrao;
    // cheio: o padrão + o crédito da IA acabou há 52 min + o EMPRESTIMO ficou de 7 h a 4 h
    // atrás sem entradas e já voltou (queda encerrada) — 5 achados, 4 na tela
    return {
      ...padrao,
      suprimir: [...padrao.suprimir, { canalId: 'demo-canal-emprestimo', ini: ag - 7 * HORA, fim: ag - 4 * HORA }],
      creditoIni: ag - 52 * MIN,
    };
  }
  // incidente (o padrão de 04–05/10): os dois números de anúncio param juntos, o crédito da
  // IA acaba e os fechamentos dos últimos 4 dias caem (as fichas seguem no normal)
  const fg: Record<string, number> = {};
  for (let i = 1; i <= 4; i++) fg[addDias(hoje, -i)] = 0.15;
  const nove = msDe(hoje, 9 * 60 + 5);
  return {
    ...SEM_AJUSTE,
    suprimir: [
      { canalId: 'demo-canal-emprestimo', ini: ag - 150 * MIN, fim: FIM },
      { canalId: 'demo-canal-juros', ini: ag - 160 * MIN, fim: FIM },
    ],
    silencioMsg: [
      { canalId: 'demo-canal-emprestimo', ini: ag - 110 * MIN },
      { canalId: 'demo-canal-juros', ini: ag - 120 * MIN },
    ],
    fatorGanho: fg,
    rajada: ag >= nove + 20 * MIN ? { canalId: 'demo-canal-emprestimo', de: nove + 12 * MIN, ate: msDe(hoje, 13 * 60), em: nove, n: 22 } : null,
    creditoIni: ag - 52 * MIN,
  };
}

/** Fechamento do lead neste cenário (fator 1 = o do plano). */
export function ganhoDe(l: LeadDemo, aj: AjusteDemoV5): LeadDemo['ganho'] {
  if (!l.pot) return null;
  const f = aj.fatorGanho[diaDe(l.pot.em)] ?? 1;
  return l.pot.u < l.pot.p * f ? { em: l.pot.em, credito: l.pot.credito } : null;
}

/** Os leads do plano depois dos botões do cenário: primeiro a rajada (entradas que
 *  chegariam depois chegam juntas — antes, nunca depois: nada do lead acontece antes de o
 *  cliente chegar), depois a supressão (a rajada já chegou e não é suprimida). */
export function aplicarAjusteDemoV5(leads: LeadDemo[], aj: AjusteDemoV5): LeadDemo[] {
  if (!aj.suprimir.length && !aj.rajada) return leads;
  let out = leads;
  const movidos = new Set<string>();
  const rj = aj.rajada;
  if (rj) {
    const mover = out.filter((l) => l.canalId === rj.canalId && l.criado >= rj.de && l.criado < rj.ate)
      .sort((a, b) => a.criado - b.criado).slice(0, rj.n);
    const pos = new Map(mover.map((l, i) => [l.id, i]));
    out = out.map((l) => {
      const i = pos.get(l.id);
      if (i == null) return l;
      movidos.add(l.id);
      return { ...l, criado: rj.em + i * 30_000 };
    }).sort((a, b) => a.criado - b.criado);
  }
  return out.filter((l) => movidos.has(l.id)
    || !aj.suprimir.some((x) => x.canalId === l.canalId && l.criado >= x.ini && l.criado < x.fim));
}

/** Todos os leads do plano entre dois dias (fim exclusivo), já com o cenário. */
export function leadsDemoV5(iniDia: string, fimDiaExcl: string, aj: AjusteDemoV5 = SEM_AJUSTE): LeadDemo[] {
  return aplicarAjusteDemoV5(leadsEntre(iniDia, fimDiaExcl), aj);
}

/* ============================== Agregação ============================== */
const ehMesmo = (a: string | null, b: string | null) => a === b;

function leadsEntre(iniDia: string, fimDiaExcl: string): LeadDemo[] {
  const out: LeadDemo[] = [];
  for (let d = iniDia; d < fimDiaExcl; d = addDias(d, 1)) {
    for (const c of DEMO_CANAIS) out.push(...planoDoDia(c, d));
  }
  return out;
}

interface Janela { ini: number; fim: number }
const dentro = (t: number, j: Janela, agora: number) => t >= j.ini && t < j.fim && t <= agora;

function statsFech(horas: number[]): Pick<KpisV5, 'fechMedianaH' | 'fechMediaH' | 'fechN'> {
  return { fechMedianaH: r3(mediana(horas)), fechMediaH: r3(media(horas)), fechN: horas.length };
}
const horasGanho = (l: LeadDemo, g: LeadDemo['ganho']) =>
  (g && l.criado >= CORTE_QUALIDADE && g.em >= l.criado ? (g.em - l.criado) / HORA : null);

function kpisDe(leads: LeadDemo[], j: Janela, agora: number, aj: AjusteDemoV5): KpisV5 {
  const contatos = new Set<string>();
  let ne = 0; let ganhos = 0; const horas: number[] = [];
  for (const l of leads) {
    if (dentro(l.criado, j, agora)) contatos.add(l.id);
    if (l.ne && dentro(l.ne.em, j, agora)) ne++;
    const g = ganhoDe(l, aj);
    if (g && dentro(g.em, j, agora)) {
      ganhos++;
      const h = horasGanho(l, g);
      if (h != null) horas.push(h);
    }
  }
  return { entradas: contatos.size, ne, ganhos, ...statsFech(horas) };
}

/** Foto do período no demo. `agora` só filtra o que já aconteceu; `cenario` (o da Leitura
 *  do dia) aplica os mesmos botões que os sinais do demo — tabela e leitura batem. */
export function demoDashV5(janela: JanelaV5, agora: Date, cenario?: CenarioDemoV5): DashV5 {
  const aj = ajusteDemoV5(cenario, agora);
  const ag = agora.getTime();
  const per: Janela = { ini: Date.parse(janela.iniISO), fim: Date.parse(janela.fimISO) };
  const ant: Janela = { ini: Date.parse(janela.antIniISO), fim: Date.parse(janela.antFimISO) };
  const mapaIni = Date.parse(janela.mapaIniISO);
  // fechamentos do período podem vir de leads de até ~90 dias antes
  const desde = Math.min(per.ini, ant.ini, mapaIni) - 95 * DIA;
  const ate = Math.min(per.fim, ag + DIA);
  const leads = leadsDemoV5(diaDe(desde), addDias(diaDe(ate), 1), aj);

  const kpis = kpisDe(leads, per, ag, aj);
  const kpisAnterior = kpisDe(leads, ant, ag, aj);

  /* ---- números ---- */
  const linhas = DEMO_CANAIS.filter((c) => c.id).map((c) => ({ id: c.id, nome: c.nome, numero: c.numero, situacao: 'conectado' as const }));
  const canais: CanalV5[] = [...linhas, { id: null, nome: 'Números antigos', numero: null, situacao: 'antigo' as const }].map((ln) => {
    const meus = leads.filter((l) => ehMesmo(l.canalId, ln.id));
    const neMotivos: Record<string, number> = {};
    let entradas = 0; let ne = 0; let ganhos = 0; const horas: number[] = [];
    for (const l of meus) {
      if (dentro(l.criado, per, ag)) entradas++;
      if (l.ne && dentro(l.ne.em, per, ag)) { ne++; neMotivos[l.ne.motivo] = (neMotivos[l.ne.motivo] ?? 0) + 1; }
      const g = ganhoDe(l, aj);
      if (g && dentro(g.em, per, ag)) {
        ganhos++;
        const h = horasGanho(l, g);
        if (h != null) horas.push(h);
      }
    }
    return { canalId: ln.id, nome: ln.nome, numero: ln.numero, situacao: ln.situacao, entradas, ne, neMotivos, ganhos, ...statsFech(horas) };
  }).filter((c) => c.situacao === 'conectado' || c.entradas + c.ne + c.ganhos > 0);
  canais.sort((a, b) => Number(a.situacao === 'antigo') - Number(b.situacao === 'antigo')
    || b.entradas - a.entradas || b.ganhos - a.ganhos || a.nome.localeCompare(b.nome));

  /* ---- não elegíveis ---- */
  const contagem = new Map<string, number>();
  const quem = { ia: 0, regraRs: 0, equipe: 0 };
  for (const l of leads) {
    if (!l.ne || !dentro(l.ne.em, per, ag)) continue;
    contagem.set(l.ne.motivo, (contagem.get(l.ne.motivo) ?? 0) + 1);
    if (l.ne.quem === 'ia') quem.ia++; else if (l.ne.quem === 'regra_rs') quem.regraRs++; else quem.equipe++;
  }
  const ne: NeV5 = {
    total: quem.ia + quem.regraRs + quem.equipe,
    motivos: [...contagem].map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd || a.motivo.localeCompare(b.motivo)),
    quem,
  };

  /* ---- atendentes ---- */
  const transf = new Map<string, Set<string>>();
  const ultimoDia = diaDe(Math.min(per.fim, ag + 1) - 1);
  for (let d = diaDe(per.ini); d <= ultimoDia; d = addDias(d, 1)) {
    for (const t of transferenciasDoDia(d)) {
      if (!dentro(t.em, per, ag)) continue;
      if (!transf.has(t.para)) transf.set(t.para, new Set());
      transf.get(t.para)!.add(t.contato);
    }
  }
  const atendentes: AtendenteV5[] = DEMO_ATENDENTES.map((a) => {
    let recebidos = 0; let ganhos = 0; let neMarcados = 0;
    const resp: number[] = []; let cel = 0; const horas: number[] = [];
    for (const l of leads) {
      if (l.dono !== a.id) continue;
      if (l.rotEm != null && dentro(l.rotEm, per, ag)) recebidos++;
      if (l.ne && l.ne.por === a.id && dentro(l.ne.em, per, ag)) neMarcados++;
      const g = ganhoDe(l, aj);
      if (g && g.credito === a.id && dentro(g.em, per, ag)) {
        ganhos++;
        const h = horasGanho(l, g);
        if (h != null) horas.push(h - (Math.max(l.criado, l.rotEm ?? l.criado) - l.criado) / HORA);
      }
      for (const v of l.vezes) {
        if (!dentro(v.t0, per, ag) || v.resp > ag || v.resp >= per.fim) continue;
        resp.push(v.min);
        if (v.cel) cel++;
      }
    }
    return {
      usuarioId: a.id, nome: a.nome, recebidos, transferidos: transf.get(a.id)?.size ?? 0, ganhos, neMarcados,
      respN: resp.length, respCelularN: cel, respMedianaMin: r1(mediana(resp)), respMediaMin: r1(media(resp)),
      fechN: horas.length, fechMedianaH: r3(mediana(horas)), fechMediaH: r3(media(horas)),
    };
  }).filter((a) => a.recebidos + a.transferidos + a.ganhos + a.neMarcados + a.respN > 0)
    .sort((x, y) => y.recebidos - x.recebidos || y.ganhos - x.ganhos || x.nome.localeCompare(y.nome));

  /* ---- mapa ---- */
  const celulas = new Map<string, CelulaMapaV5>();
  const jMapa: Janela = { ini: mapaIni, fim: per.fim };
  for (const l of leads) {
    if (!dentro(l.criado, jMapa, ag)) continue;
    const dia = diaDe(l.criado), hora = horaDe(l.criado), k = `${dia}|${hora}`;
    const c = celulas.get(k);
    if (c) c.entradas++; else celulas.set(k, { dia, hora, entradas: 1 });
  }
  const mapa = [...celulas.values()].sort((a, b) => a.dia.localeCompare(b.dia) || a.hora - b.hora);

  return {
    geradoEm: agora.toISOString(),
    buscaEm: agora.toISOString(),
    periodo: { inicio: janela.iniISO, fim: janela.fimISO, mapaInicio: janela.mapaIniISO },
    kpis, kpisAnterior, canais, ne, atendentes, mapa,
  };
}
