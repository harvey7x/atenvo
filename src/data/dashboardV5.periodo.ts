/* Período do Dashboard v5 — funções PURAS (sem React, sem rede), usadas pelo hook
   (RPC real) e pelo demo: os dois comparam e desenham exatamente o mesmo trecho.

   1) Período anterior (portado do v4, testado): começa em prevIniISO (a matemática
      de @/data/relatorios) e dura o MESMO tempo decorrido do período atual. Período
      em andamento (hoje, 7 dias, nosso mês) → o anterior é cortado no mesmo ponto
      ("ontem até 14:05"); período já fechado → o anterior INTEIRO (mês comercial
      fechado 10/09–09/10 compara com 10/08–09/09 inteiro, mesmo que um tenha 30 dias e
      o outro 31 — o dono lê o mês da casa, dia 10 a dia 9). Sem o corte, 3 horas de
      hoje eram comparadas com o dia de ontem inteiro e a seta mostrava queda que não existe.

   2) Janela do mapa dia × hora: período com menos de 7 dias (Hoje, 3 dias) desenha
      os ÚLTIMOS 7 DIAS terminando no último dia do período; até 14 dias, uma linha
      por data; acima disso, média por dia da semana. Os dias contados são os que já
      começaram (o mês comercial no dia 12 tem 3 linhas, não 31) — desvio CONSCIENTE da
      regra "pela duração do período": com poucos dias, a média por dia da semana teria
      uma ocorrência só e esconderia as datas. */

import { addDias, type Periodo } from '@/data/relatorios';

export interface PeriodoAnteriorV5 {
  iniISO: string;
  /** fim EXCLUSIVO do trecho comparado (≤ início do período atual) */
  fimISO: string;
  /** true quando o anterior foi cortado antes do fim (mesmo tempo decorrido) */
  parcial: boolean;
  /** horas já decorridas do período atual (até agora, ou a duração inteira se fechado) */
  decorridoH: number;
  /** rótulo curto: "20/10 até 14:05", "08/10 a 14/10 até 14:05", "20/10" */
  rotulo: string;
}

const TZ = 'America/Sao_Paulo';
const ddmm = (ms: number) => new Date(ms).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

export function periodoAnteriorV5(p: Periodo, agora: Date): PeriodoAnteriorV5 {
  const ini = Date.parse(p.iniISO), fim = Date.parse(p.fimISO), prevIni = Date.parse(p.prevIniISO);
  const ate = Math.min(Math.max(agora.getTime(), ini), fim);
  const decorrido = ate - ini;
  const fechado = agora.getTime() >= fim;
  // arredonda para o minuto (a chamada não muda a cada segundo e o rótulo fica limpo) e
  // garante pelo menos 1 minuto de anterior (a RPC recusa fim <= início)
  const corte = fechado ? ini : Math.min(ini, Math.max(prevIni + 60_000, Math.floor((prevIni + decorrido) / 60_000) * 60_000));
  const parcial = corte < ini;
  if (!parcial) {
    // anterior inteiro: "13/10" ou "01/10 a 07/10" (mesmo formato curto do trecho cortado)
    const ult = ini - 1;
    const rotulo = ddmm(prevIni) === ddmm(ult) ? ddmm(prevIni) : `${ddmm(prevIni)} a ${ddmm(ult)}`;
    return { iniISO: p.prevIniISO, fimISO: p.iniISO, parcial: false, decorridoH: decorrido / 3_600_000, rotulo };
  }
  const meiaNoite = hhmm(corte) === '00:00';
  // corte exatamente à meia-noite = o dia anterior inteiro
  const ultimoDia = meiaNoite ? corte - 1 : corte;
  const fimTxt = meiaNoite ? ddmm(ultimoDia) : `${ddmm(ultimoDia)} até ${hhmm(corte)}`;
  const rotulo = ddmm(prevIni) === ddmm(ultimoDia)
    ? (meiaNoite ? ddmm(prevIni) : `${ddmm(prevIni)} até ${hhmm(corte)}`)
    : `${ddmm(prevIni)} a ${fimTxt}`;
  return { iniISO: p.prevIniISO, fimISO: new Date(corte).toISOString(), parcial: true, decorridoH: decorrido / 3_600_000, rotulo };
}

/** Frase do comparativo para o cartão: "vs ontem até 14:05", "vs 08/10 a 14/10 até 14:05". */
export function rotuloComparacaoV5(ant: PeriodoAnteriorV5, p: Periodo, hoje: string): string {
  const ontem = addDias(hoje, -1);
  const prevUm = p.dias === 1 && p.prevIniDate === ontem && p.iniDate === hoje;
  if (prevUm) {
    if (!ant.parcial) return 'vs ontem';
    return `vs ontem até ${ant.rotulo.split(' até ')[1] ?? ''}`.trim();
  }
  return `vs ${ant.rotulo}`;
}

export type ModoMapaV5 = 'dias' | 'semana';

export interface JanelaMapaV5 {
  /** primeiro dia desenhado (YYYY-MM-DD, SP) */
  iniDate: string;
  /** último dia da janela (inclusivo) e se ele é hoje */
  ultimoDate: string;
  terminaHoje: boolean;
  /** o período escolhido, em datas SP [ini, fim) — no mapa esticado, o que fica fora
   *  dele aparece esmaecido */
  periodoIniDate: string;
  periodoFimDate: string;
  /** instante de início que vai para a RPC (p_mapa_inicio) */
  iniISO: string;
  /** dias que já começaram dentro da janela, em ordem */
  dias: string[];
  modo: ModoMapaV5;
  /** true quando a janela foi esticada para 7 dias (período curto) */
  estendido: boolean;
}

/** Janela do mapa a partir do período escolhido e do dia de hoje (SP). */
export function janelaMapaV5(p: Periodo, hoje: string): JanelaMapaV5 {
  const ultimo = addDias(p.fimDate, -1);
  const estendido = p.dias < 7;
  const iniDate = estendido ? addDias(ultimo, -6) : p.iniDate;
  const dias: string[] = [];
  for (let d = iniDate; d <= ultimo && d <= hoje && dias.length < 400; d = addDias(d, 1)) dias.push(d);
  return {
    iniDate,
    ultimoDate: ultimo,
    terminaHoje: ultimo === hoje,
    periodoIniDate: p.iniDate,
    periodoFimDate: p.fimDate,
    iniISO: `${iniDate}T00:00:00-03:00`,
    dias,
    modo: dias.length > 14 ? 'semana' : 'dias',
    estendido,
  };
}

/** Dia da semana ISO (1 = segunda … 7 = domingo) de uma data YYYY-MM-DD. */
export function dowIsoV5(dia: string): number {
  const g = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return g === 0 ? 7 : g;
}
