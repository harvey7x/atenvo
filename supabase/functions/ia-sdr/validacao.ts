// Validações PURAS da IA SDR (sem Deno/DB): fuzzy de nome, janela de meses do comprovante,
// mosaico de cobertura dos extratos e formatação de períodos em PT-BR.

// ---------- normalização e fuzzy de nome ----------
const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

export function normalizarTexto(s: string): string {
  return (s ?? '')
    .normalize('NFD').replace(/\p{M}+/gu, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function tokensNome(s: string): string[] {
  return normalizarTexto(s).split(' ').filter((t) => t && !CONECTIVOS.has(t));
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

function tokenBate(a: string, b: string): boolean {
  if (a === b) return true;
  // abreviação: "j" ou "j." casa "jose"; qualquer prefixo de 1–3 letras casa o token completo
  if (a.length <= 3 && b.startsWith(a)) return true;
  if (b.length <= 3 && a.startsWith(b)) return true;
  // erro de digitação/OCR: 1 edição para tokens médios, 2 para longos
  if (a.length >= 4 && b.length >= 4) {
    const d = levenshtein(a, b);
    if (d <= 1) return true;
    if (a.length >= 7 && b.length >= 7 && d <= 2) return true;
  }
  return false;
}

/** Fuzzy de nome tolerante a abreviação, acento, OCR e nome de casada: TODOS os tokens do nome
 *  MENOR precisam casar com algum token do MAIOR (sobrenome extra — casamento — não invalida).
 *  Exige ao menos 2 tokens casados (ou 1 quando um dos nomes só tem 1 token útil). */
export function nomesBatem(a: string, b: string): boolean {
  const ta = tokensNome(a), tb = tokensNome(b);
  if (!ta.length || !tb.length) return false;
  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const usados = new Set<number>();
  let casados = 0;
  for (const t of menor) {
    let achou = false;
    for (let i = 0; i < maior.length; i++) {
      if (usados.has(i)) continue;
      if (tokenBate(t, maior[i])) { usados.add(i); achou = true; casados++; break; }
    }
    if (!achou) return false;
  }
  return casados >= Math.min(2, menor.length);
}

export function somenteDigitos(s: string): string { return (s ?? '').replace(/\D/g, ''); }

/** CPFs iguais? Compara os 11 dígitos; vazio de um lado = "não dá pra comparar" (true = não bloqueia). */
export function cpfsCompativeis(a?: string | null, b?: string | null): boolean {
  const da = somenteDigitos(a ?? ''), db = somenteDigitos(b ?? '');
  if (da.length !== 11 || db.length !== 11) return true;
  return da === db;
}

// ---------- tempo em São Paulo ----------
// America/Sao_Paulo é UTC-3 FIXO desde 2019 (sem horário de verão) — offset constante de propósito.
export const SP_OFFSET_MIN = -180;

/** Date "deslocada": os getters getUTC* devolvem o relógio de parede de São Paulo. */
export function spWallClock(agora = new Date()): Date {
  return new Date(agora.getTime() + SP_OFFSET_MIN * 60_000);
}

/** Instante UTC correspondente a (ano, mes 1-12, dia, hora, min) no relógio de SP. */
export function spParaUtc(ano: number, mes: number, dia: number, hora: number, min: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia, hora, min) - SP_OFFSET_MIN * 60_000);
}

export const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Meses aceitos no comprovante de residência: o ATUAL e o ANTERIOR (relógio de SP), calculados
 *  no servidor a cada turno — nunca hardcode. */
export function mesesComprovante(agora = new Date()): Array<{ mes: number; ano: number; rotulo: string }> {
  const sp = spWallClock(agora);
  const ano = sp.getUTCFullYear(), mes = sp.getUTCMonth() + 1;
  const antAno = mes === 1 ? ano - 1 : ano, antMes = mes === 1 ? 12 : mes - 1;
  return [
    { mes, ano, rotulo: `${MESES_PT[mes - 1]} de ${ano}` },
    { mes: antMes, ano: antAno, rotulo: `${MESES_PT[antMes - 1]} de ${antAno}` },
  ];
}

// ---------- mosaico de cobertura dos extratos ----------
// Competência como índice linear (ano*12 + mes-1). Meta: 120 meses CONTÍGUOS contados do último
// mês FECHADO para trás. Critério é COBERTURA (qualquer conjunto de janelas serve, dedup de
// repetidas), não alinhamento de meses.

export function competParaIdx(compet: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec((compet ?? '').trim());
  if (!m) return null;
  const ano = Number(m[1]), mes = Number(m[2]);
  if (mes < 1 || mes > 12 || ano < 1990 || ano > 2100) return null;
  return ano * 12 + (mes - 1);
}
export function idxParaRotulo(idx: number): string {
  return `${MESES_PT[idx % 12]} de ${Math.floor(idx / 12)}`;
}
export function idxParaCompet(idx: number): string {
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Último mês FECHADO (SP): o mês anterior ao corrente. */
export function ultimoMesFechadoIdx(agora = new Date()): number {
  const sp = spWallClock(agora);
  return sp.getUTCFullYear() * 12 + sp.getUTCMonth() - 1;
}

export interface Janela { ini: number; fim: number }
export interface Cobertura {
  alvoIni: number; alvoFim: number;
  janelas: Janela[];              // já mescladas/deduplicadas, recortadas ao alvo
  faltando: Janela[];
  completo: boolean;
  mesesCobertos: number;
}

/** Mescla janelas e calcula o que falta dentro de [alvoFim-119, alvoFim]. */
export function calcularCobertura(janelasBrutas: Janela[], alvoFim: number, metaMeses = 120): Cobertura {
  const alvoIni = alvoFim - (metaMeses - 1);
  const validas = janelasBrutas
    .filter((j) => Number.isFinite(j.ini) && Number.isFinite(j.fim) && j.ini <= j.fim)
    .map((j) => ({ ini: Math.max(j.ini, alvoIni), fim: Math.min(j.fim, alvoFim) }))
    .filter((j) => j.ini <= j.fim)
    .sort((a, b) => a.ini - b.ini);
  const mescladas: Janela[] = [];
  for (const j of validas) {
    const ult = mescladas[mescladas.length - 1];
    if (ult && j.ini <= ult.fim + 1) ult.fim = Math.max(ult.fim, j.fim);
    else mescladas.push({ ...j });
  }
  const faltando: Janela[] = [];
  let cursor = alvoIni;
  for (const j of mescladas) {
    if (j.ini > cursor) faltando.push({ ini: cursor, fim: j.ini - 1 });
    cursor = Math.max(cursor, j.fim + 1);
  }
  if (cursor <= alvoFim) faltando.push({ ini: cursor, fim: alvoFim });
  const mesesCobertos = mescladas.reduce((s, j) => s + (j.fim - j.ini + 1), 0);
  return { alvoIni, alvoFim, janelas: mescladas, faltando, completo: faltando.length === 0, mesesCobertos };
}

/** "setembro de 2019 a agosto de 2020" / "março de 2021" — para a mensagem exata do que falta. */
export function formatarFaltas(faltando: Janela[]): string {
  const partes = faltando.map((j) =>
    j.ini === j.fim ? idxParaRotulo(j.ini) : `${idxParaRotulo(j.ini)} a ${idxParaRotulo(j.fim)}`);
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join('; ')} e ${partes[partes.length - 1]}`;
}

// ---------- bancos-alvo nos históricos de créditos ----------
const BANCOS_ALVO = ['agibank', 'bmg', 'mercantil', 'crefisa'];
/** Detecta banco-alvo num nome de banco pagador/OP vindo do extrato. */
export function bancoAlvoDe(nome: string): string | null {
  const n = normalizarTexto(nome);
  for (const b of BANCOS_ALVO) if (n.includes(b)) return b;
  return null;
}
