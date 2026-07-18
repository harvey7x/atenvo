/* Separadores de data no fio da conversa (estilo WhatsApp) — REGRA PURA, testada por vitest.
 *
 * Por que existe: as bolhas mostram só o horário (15:26). O atendente não sabe se a conversa
 * é de hoje, ontem ou de semanas atrás. Aqui calculamos o rótulo do dia e decidimos onde
 * inserir o separador.
 *
 * ⚠️ FUSO: tudo é calculado em America/Sao_Paulo. Não usar `.slice(0,10)` do ISO (isso dá a
 * data em UTC — uma msg das 21h de SP cai no dia seguinte). `hhmm` na tela usa hora local do
 * browser; para o separador bater com o horário exibido, ancoramos no fuso de SP de propósito
 * — assim o resultado é o mesmo em qualquer máquina, inclusive nos testes. */

const TZ = 'America/Sao_Paulo';

// en-CA formata como YYYY-MM-DD, o que dá uma chave de dia comparável e ordenável.
const FMT_DIA = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
// dd/mm/aaaa para as datas antigas.
const FMT_BR = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/** Chave de dia (YYYY-MM-DD) da mensagem, no fuso de São Paulo. '' se o ISO for inválido. */
export function chaveDiaSP(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return FMT_DIA.format(d);
}

/** Diferença em DIAS DE CALENDÁRIO (SP) entre dois ISOs: base - alvo. Ex.: ontem→1, hoje→0. */
function diasDeCalendario(alvoIso: string, baseIso: string): number {
  // Meia-noite UTC da chave de dia: subtrair dá dias inteiros sem horário no meio.
  const a = new Date(chaveDiaSP(alvoIso) + 'T00:00:00Z').getTime();
  const b = new Date(chaveDiaSP(baseIso) + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

/** Dia da semana da mensagem (SP), no domingo=0..sábado=6. -1 se inválido. */
function diaDaSemanaSP(iso: string): number {
  const dia = chaveDiaSP(iso);
  if (!dia) return -1;
  // getUTCDay sobre a meia-noite UTC da chave de dia = o dia da semana correto daquela data.
  return new Date(dia + 'T00:00:00Z').getUTCDay();
}

/**
 * Rótulo do separador para a data de uma mensagem, relativo a `agora`:
 *   0 dias  → "Hoje"
 *   1 dia   → "Ontem"
 *   2..6    → dia da semana ("Segunda-feira")
 *   ≥7 ou futuro → "15/07/2026"
 * `agora` é injetável para teste; por padrão usa o relógio real.
 */
export function rotuloDia(iso: string | null | undefined, agora?: Date): string {
  const dia = chaveDiaSP(iso);
  if (!dia) return '';
  const baseIso = (agora ?? new Date()).toISOString();
  const delta = diasDeCalendario(iso!, baseIso);
  if (delta === 0) return 'Hoje';
  if (delta === 1) return 'Ontem';
  if (delta >= 2 && delta <= 6) {
    const dow = diaDaSemanaSP(iso!);
    return dow >= 0 ? DIAS_SEMANA[dow] : FMT_BR.format(new Date(iso!));
  }
  // ≥7 dias, ou data no futuro (delta < 0): data cheia.
  return FMT_BR.format(new Date(iso!));
}

/** Precisa de separador antes desta mensagem? Sim se o dia (SP) mudou em relação à anterior. */
export function precisaSeparador(iso: string | null | undefined, isoAnterior: string | null | undefined): boolean {
  const atual = chaveDiaSP(iso);
  if (!atual) return false;              // sem data confiável: não quebra o fio
  if (!isoAnterior) return true;         // primeira mensagem da lista sempre abre o dia
  return atual !== chaveDiaSP(isoAnterior);
}

/** Item do fio: um separador de dia OU uma mensagem. Genérico em T para não depender do tipo do app. */
export type ItemConversa<T> =
  | { tipo: 'sep'; chave: string; label: string }
  | { tipo: 'msg'; chave: string; msg: T; indice: number };

/**
 * Monta a sequência renderizável: insere um separador antes da primeira mensagem de cada dia.
 * `getISO` extrai o timestamp de cada mensagem. Puro e testável — o componente só faz o JSX.
 * A chave do separador inclui a chave do dia (estável), então não depende de índice quebrado.
 */
export function construirItensConversa<T>(
  msgs: readonly T[],
  getISO: (m: T) => string | null | undefined,
  agora?: Date,
): ItemConversa<T>[] {
  const out: ItemConversa<T>[] = [];
  let diaAnterior = '';
  msgs.forEach((m, i) => {
    const iso = getISO(m);
    const dia = chaveDiaSP(iso);
    if (dia && dia !== diaAnterior) {
      out.push({ tipo: 'sep', chave: 'sep-' + dia, label: rotuloDia(iso, agora) });
      diaAnterior = dia;
    }
    out.push({ tipo: 'msg', chave: 'msg-' + i, msg: m, indice: i });
  });
  return out;
}
