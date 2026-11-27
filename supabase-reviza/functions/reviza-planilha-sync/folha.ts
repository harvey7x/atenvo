// reviza-planilha-sync/folha.ts — PORTE FIEL de scripts/reviza/planilha_substituir.py
// (parsers §2.1, montar_folha e casar) para a sincronização contínua.
// A ÚNICA diferença combinada: o número e a posição das colunas NÃO são fixos em 25 —
// o mapa coluna↔campo/mês vem de public.planilha_colunas ordenada por (ordem, id)
// (hoje 27: 10 campos, 15 meses mes_pos 0..14, TELEFONE e 1 livre). A semântica de
// cada parser é byte-fiel ao Python: a prova de paridade (scripts/reviza/paridade_sync.ts)
// compara as contagens dos dois lados nos CSVs reais.
// Nada aqui toca rede ou banco: tudo puro e testável (folha_test.ts).

/* ================= colunas (o mapa) ================= */

export type TipoColuna = 'campo' | 'mes' | 'livre';
export interface Coluna {
  /** uuid de public.planilha_colunas (sintético nos testes/paridade) */
  id: string;
  /** posição 0-based na grade (= coluna da planilha do Google) */
  pos: number;
  tipo: TipoColuna;
  campo: string | null;
  mesPos: number | null;
  titulo: string;
}
export interface Mapa {
  colunas: Coluna[];
  ncol: number;
  /** campo → pos (fechamento, comercial, nome, nb, banco, cpf, senha_inss, valor, reclame, parou, telefone) */
  posCampo: Map<string, number>;
  /** colunas de mês em ordem de posição na grade */
  meses: Coluna[];
}

/** colunas de senha: nunca viram texto de célula no sistema; no espelho entram como sha256: */
export const CAMPOS_SENHA: ReadonlySet<string> = new Set(['senha_inss', 'reclame']);

export class ErroEstrutura extends Error {}

export function montarMapa(colunas: Coluna[]): Mapa {
  const posCampo = new Map<string, number>();
  for (const c of colunas) if (c.tipo === 'campo' && c.campo) posCampo.set(c.campo, c.pos);
  const meses = colunas.filter((c) => c.tipo === 'mes').sort((a, b) => a.pos - b.pos);
  for (const obrig of ['fechamento', 'nome']) {
    if (!posCampo.has(obrig)) throw new ErroEstrutura(`mapa de colunas sem o campo obrigatório "${obrig}"`);
  }
  if (!meses.length) throw new ErroEstrutura('mapa de colunas sem nenhuma coluna de mês');
  return { colunas, ncol: colunas.length, posCampo, meses };
}

/** mesma (titulo, campo) do colunas_padrao() do Python: 25 colunas A..Y (testes e paridade) */
const BASE_PADRAO: ReadonlyArray<readonly [string, string]> = [
  ['DATA FECHAMENTO', 'fechamento'], ['COMERCIAL', 'comercial'], ['CLIENTE', 'nome'], ['NB', 'nb'],
  ['BANCO', 'banco'], ['CPF', 'cpf'], ['SENHA INSS', 'senha_inss'], ['PARCELA TOTAL', 'valor'],
  ['RECLAME AQUI', 'reclame'], ['DATA QUE PAROU', 'parou'],
];
export const MES0_PADRAO = 10;
export const NMES_PADRAO = 14;

export function mapaPadrao(): Mapa {
  const cols: Coluna[] = BASE_PADRAO.map(([titulo, campo], pos) =>
    ({ id: `campo-${campo}`, pos, tipo: 'campo' as const, campo, mesPos: null, titulo }));
  for (let k = 0; k < NMES_PADRAO; k++) {
    cols.push({ id: `mes-${k}`, pos: MES0_PADRAO + k, tipo: 'mes', campo: null, mesPos: k, titulo: `Mês ${k + 1}` });
  }
  cols.push({ id: 'campo-telefone', pos: 24, tipo: 'campo', campo: 'telefone', mesPos: null, titulo: 'TELEFONE' });
  return montarMapa(cols);
}

/** 0 → 'A', 25 → 'Z', 26 → 'AA' (= letra() do Python) */
export function letra(pos: number): string {
  let s = '';
  let n = pos + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    n = Math.floor((n - 1) / 26);
    s = String.fromCharCode(65 + r) + s;
  }
  return s;
}

/* ================= parsers §2.1 (byte-fiéis ao Python) ================= */

export function semAcento(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/\p{Mn}/gu, '');
}

/** btrim() do Postgres: só espaço comum */
export function btrim(s: string | null | undefined): string {
  return (s ?? '').replace(/^ +| +$/g, '');
}

const RE_PL_TRIM = /^[ \t\n\r\v\f ]+|[ \t\n\r\v\f ]+$/g;
/** private.pl_trim do SQL: tira espaço, tab, quebra e nbsp das pontas */
export function plTrim(s: string | null | undefined): string {
  return (s ?? '').replace(RE_PL_TRIM, '');
}

/** round(v, 2) do Python: arredonda a expansão DECIMAL do double (toFixed é exato),
    meio-exato vai para o par — nunca o atalho v*100, que erra perto do meio. */
export function arred2(v: number): number {
  if (!Number.isFinite(v)) return v;
  const neg = v < 0;
  const [ip, fp] = Math.abs(v).toFixed(20).split('.');
  let int = BigInt(ip) * 100n + BigInt(fp.slice(0, 2));
  const resto = fp.slice(2);
  const primeiro = resto[0] ?? '0';
  const soZeros = /^0*$/.test(resto.slice(1));
  if (primeiro > '5' || (primeiro === '5' && !soZeros)) int += 1n;
  else if (primeiro === '5' && soZeros && int % 2n === 1n) int += 1n;
  const r = Number(int) / 100;
  return neg ? -r : r;
}

/** Valor BR → número >= 0 ou null. Não "conserta" nada: o que não parsear é texto. */
export function valorBr(t: string | null | undefined): number | null {
  if (t == null) return null;
  const s = t.replace(/r\$/gi, '').replace(/\s+/g, '');
  if (!s || !/^[0-9.,]+$/.test(s)) return null;
  let s2: string;
  if (s.includes(',')) s2 = s.replaceAll('.', '').replace(',', '.');   // ',' decimal, '.' milhar
  else if (s.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s2 = s.replaceAll('.', '');     // 1.343 / 1.343.500 → milhar
    else s2 = s;                                                       // 1343.50 → decimal
  } else s2 = s;
  if (!/^\d+(\.\d+)?$/.test(s2)) return null;
  return Number(s2);
}

export function ehNaoPagou(t: string | null | undefined): boolean {
  return semAcento(btrim(t)).toUpperCase() === 'NAO PAGOU';
}

export type EstadoMes = readonly ['nao_pagou', null] | readonly ['pago', number] | null;

/** ('nao_pagou', null) | ('pago', valor) | null (sem linha em pagamentos) */
export function estadoMes(t: string | null | undefined): EstadoMes {
  if (t == null) return null;
  if (ehNaoPagou(t)) return ['nao_pagou', null] as const;
  const v = valorBr(t);
  if (v !== null && v > 0) return ['pago', arred2(v)] as const;
  return null;
}

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};
const RE_DATA = /(?<!\d)(\d{1,2})\/(\d{1,2}(?!\d)|[A-Za-z]{3})\.?(?:\/(\d{4}|\d{2})(?!\d))?/g;

function dataValida(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const dm = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dia <= dm[mes - 1];
}

/** 1ª data curta achada no texto → 'YYYY-MM-DD' ou null.
    Aceita DD/mmm (pt, com/sem ponto), DD/MM, DD/MM/YYYY, DD/MM/YY.
    Sem ano: out-dez → 2025, jan-set → 2026. */
export function dataCurta(t: string | null | undefined): string | null {
  if (!t) return null;
  for (const m of t.matchAll(RE_DATA)) {
    const d = parseInt(m[1], 10);
    const mm = m[2];
    let mes: number | undefined;
    if (/^\d+$/.test(mm)) mes = parseInt(mm, 10);
    else {
      mes = MESES[semAcento(mm).toLowerCase()];
      if (mes === undefined) continue;
    }
    const a = m[3];
    const ano = a ? parseInt(a, 10) + (a.length === 2 ? 2000 : 0) : (mes >= 10 ? 2025 : 2026);
    if (!dataValida(ano, mes, d)) continue;
    return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return null;
}

/** 1ª sequência com 10-13 dígitos (ignorando ()-. e espaço) ou null */
export function telefone(t: string | null | undefined): string | null {
  for (const run of (t ?? '').match(/[\d()\-. ]+/g) ?? []) {
    const dig = run.replace(/\D/g, '');
    if (dig.length >= 10 && dig.length <= 13) return dig;
  }
  return null;
}

/** '2025-08' + 1 → '2025-09' (= comp_soma do Python) */
export function compSoma(base: string, k: number): string {
  const [y, m] = base.split('-');
  const n = parseInt(y, 10) * 12 + parseInt(m, 10) - 1 + k;
  return `${String(Math.floor(n / 12)).padStart(4, '0')}-${String((n % 12) + 1).padStart(2, '0')}`;
}

const ROTULO_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** '2026-09' → 'set/26' (rótulo curto dos grupos/conflitos) */
export function mmmAa(comp: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(comp);
  if (!m) return comp;
  const mes = parseInt(m[2], 10);
  if (mes < 1 || mes > 12) return comp;
  return `${ROTULO_MES[mes - 1]}/${m[1].slice(2)}`;
}

/* ================= normalização (casamento) ================= */

export function soDigitos(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

export function cpfChave(s: string | null | undefined): string | null {
  const d = soDigitos(s);
  if (!d) return null;
  return d.length < 11 ? d.padStart(11, '0') : d;
}

export function nomeChave(s: string | null | undefined): string {
  let x = semAcento(s ?? '').toUpperCase();
  x = x.replace(/[^A-Z0-9 ]/g, ' ');
  return x.replace(/\s+/g, ' ').trim();
}

export function nbChave(s: string | null | undefined): string {
  const d = soDigitos(s);
  if (d) return d.replace(/^0+/, '') || '0';
  return nomeChave(s);
}

/* ================= folha (montar_folha) ================= */

export interface Bloco {
  id: string;
  dia: number | null;
  situacao: 'cancelado' | 'ativo';
  compBase: string | null;
}
export type TipoLinha = 'cabecalho' | 'cliente' | 'vazia' | 'rotulo';
export interface LinhaFolha {
  /** índice 0-based da linha na aba (linha da planilha = r + 1) */
  r: number;
  ordem: number;
  tipo: TipoLinha;
  bloco: string | null;
  /** textos EXATOS, sempre com ncol posições */
  t: string[];
}
export interface Folha { blocos: Bloco[]; linhas: LinhaFolha[]; avisos: string[] }

export const BLOCOS_CONTRATO = ['D24', 'D25', 'D28', 'D29', 'D30', 'D01', 'D02', 'D05', 'D06', 'D07', 'NOVOS'];

const cel = (row: string[], pos: number): string => row[pos] ?? '';

export function ehVazia(row: string[], ncol: number): boolean {
  for (let i = 0; i < ncol; i++) if (cel(row, i).trim() !== '') return false;
  return true;
}

export function ehCabecalho(row: string[], m: Mapa): boolean {
  return nomeChave(cel(row, m.posCampo.get('fechamento')!)) === 'DATA FECHAMENTO'
    && nomeChave(cel(row, m.posCampo.get('nome')!)) === 'CLIENTE';
}

/** rótulo NOVOS: 'NOVOS' na coluna do cliente e os demais campos (fora nome/telefone) vazios
    (no mapa padrão são exatamente as posições 0,1,3..9 do Python) */
export function ehRotuloNovos(row: string[], m: Mapa): boolean {
  if (nomeChave(cel(row, m.posCampo.get('nome')!)) !== 'NOVOS') return false;
  for (const [campo, pos] of m.posCampo) {
    if (campo === 'nome' || campo === 'telefone') continue;
    if (cel(row, pos).trim() !== '') return false;
  }
  return true;
}

function mesDoTexto(t: string): number | null {
  const m = /^\s*\d{1,2}\/(\d{1,2}|[A-Za-z]{3})/.exec(t ?? '');
  if (!m) return null;
  const g = m[1];
  return /^\d+$/.test(g) ? parseInt(g, 10) : (MESES[g.toLowerCase()] ?? null);
}

/** Monta blocos + linhas na ordem exata da aba (cabecalho/cliente/vazia/rotulo).
    As vazias do fim não entram. Lança ErroEstrutura com mensagem clara (vira freio). */
export function montarFolha(rows: string[][], m: Mapa, blocosEsperados: string[] = BLOCOS_CONTRATO): Folha {
  let fim = rows.length;
  while (fim > 0 && ehVazia(rows[fim - 1], m.ncol)) fim -= 1;
  const blocos: Bloco[] = [];
  const linhas: LinhaFolha[] = [];
  const avisos: string[] = [];
  const ids = new Set<string>();
  let atual: string | null = null;
  for (let r = 0; r < fim; r++) {
    const row = rows[r];
    if (ehCabecalho(row, m)) {
      let dia: number | null = null;
      for (let j = m.meses.length - 1; j >= 0; j--) {        // último mês com dia legível
        const mt = /^\s*(\d{1,2})\//.exec(cel(row, m.meses[j].pos));
        if (mt) { dia = parseInt(mt[1], 10); break; }
      }
      if (dia === null || dia < 1 || dia > 31) {
        throw new ErroEstrutura(`cabeçalho na linha ${r + 1} da aba sem data legível no último mês`);
      }
      const bid = `D${String(dia).padStart(2, '0')}`;
      if (ids.has(bid)) throw new ErroEstrutura(`bloco ${bid} repetido (linha ${r + 1} da aba)`);
      const base = dia >= 15 ? '2025-08' : '2025-09';
      const mesC1 = mesDoTexto(cel(row, m.meses[0].pos));
      if (mesC1 !== null && mesC1 !== parseInt(base.slice(5), 10)) {
        avisos.push(`bloco ${bid}: cabeçalho da 1ª coluna de mês fala do mês ${mesC1}, comp_base ${base} (vale a posição)`);
      }
      blocos.push({ id: bid, dia, situacao: 'cancelado', compBase: base });
      ids.add(bid);
      atual = bid;
      linhas.push({ r, ordem: 0, tipo: 'cabecalho', bloco: bid, t: row.slice(0, m.ncol) });
    } else if (ehVazia(row, m.ncol)) {
      linhas.push({ r, ordem: 0, tipo: 'vazia', bloco: null, t: row.slice(0, m.ncol) });
    } else if (ehRotuloNovos(row, m)) {
      if (ids.has('NOVOS')) throw new ErroEstrutura(`segundo rótulo NOVOS na linha ${r + 1} da aba`);
      blocos.push({ id: 'NOVOS', dia: null, situacao: 'ativo', compBase: null });
      ids.add('NOVOS');
      atual = 'NOVOS';
      linhas.push({ r, ordem: 0, tipo: 'rotulo', bloco: 'NOVOS', t: row.slice(0, m.ncol) });
    } else {
      if (atual === null) throw new ErroEstrutura(`linha de dados antes do 1º cabeçalho (linha ${r + 1} da aba)`);
      linhas.push({ r, ordem: 0, tipo: 'cliente', bloco: atual, t: row.slice(0, m.ncol) });
    }
  }
  linhas.forEach((ln, i) => { ln.ordem = 1000 * (i + 1); });
  // pad: toda linha com exatamente ncol textos
  for (const ln of linhas) while (ln.t.length < m.ncol) ln.t.push('');
  const ordemIds = blocos.map((b) => b.id);
  if (blocosEsperados.length && (ordemIds.length !== blocosEsperados.length || ordemIds.some((x, i) => x !== blocosEsperados[i]))) {
    avisos.push(`ESTRUTURA DIFERENTE DO CONTRATO: blocos ${JSON.stringify(ordemIds)} (esperado ${JSON.stringify(blocosEsperados)})`);
  }
  return { blocos, linhas, avisos };
}

/* ================= casamento (casar) ================= */

export interface LeadCasar {
  id: string;
  nome: string | null;
  cpf: string | null;
  nb: string | null;
  banco: string | null;
  dia: number | null;
  situacao: string | null;
  comercial?: string | null;
  parado_pendente?: boolean | null;
}
/** {lead_id → {comp → [status, valor arredondado em 2 casas]}} */
export type Pags = Map<string, Map<string, readonly [string, number | null]>>;

export interface Casado { leadId: string; passada: 'P1' | 'P2' | 'P3'; candidatos: number; empate: boolean }

interface LeadNorm {
  id: string; cpf: string | null; nome: string; nb: string; bancoNb: string;
  dia: number | null; sit: string | null;
}
interface LinhaNorm {
  cpf: string | null; nome: string; nb: string; bloco: Bloco; meses: EstadoMes[];
}

/** idx da linha 'cliente' → lead casado. 3 passadas (P1 CPF+bloco+NB, P2 CPF+nome,
    P3 nome+bloco), cada uma sobre a folha inteira; 1 lead por linha; a ordem da
    folha desempata — PORTE FIEL do casar() do Python, incluindo o placar. */
export function casar(
  linhas: LinhaFolha[], blocos: Bloco[], leads: LeadCasar[], pags: Pags, m: Mapa,
): Map<number, Casado> {
  const bmap = new Map(blocos.map((b) => [b.id, b]));
  const L: LeadNorm[] = leads.map((ld) => ({
    id: ld.id,
    cpf: cpfChave(ld.cpf),
    nome: nomeChave(ld.nome),
    nb: nbChave(ld.nb),
    bancoNb: soDigitos(ld.banco) ? nbChave(ld.banco) : '',
    dia: ld.dia ?? null,
    sit: ld.situacao ?? null,
  }));
  const porCpf = new Map<string, LeadNorm[]>();
  const porNome = new Map<string, LeadNorm[]>();
  for (const x of L) {
    if (x.cpf) (porCpf.get(x.cpf) ?? porCpf.set(x.cpf, []).get(x.cpf)!).push(x);
    if (x.nome) (porNome.get(x.nome) ?? porNome.set(x.nome, []).get(x.nome)!).push(x);
  }

  const posCpf = m.posCampo.get('cpf');
  const posNome = m.posCampo.get('nome')!;
  const posNb = m.posCampo.get('nb');
  const R = new Map<number, LinhaNorm>();
  for (let i = 0; i < linhas.length; i++) {
    const ln = linhas[i];
    if (ln.tipo !== 'cliente') continue;
    R.set(i, {
      cpf: posCpf !== undefined ? cpfChave(ln.t[posCpf]) : null,
      nome: nomeChave(ln.t[posNome]),
      nb: posNb !== undefined ? nbChave(ln.t[posNb]) : '',
      bloco: bmap.get(ln.bloco!)!,
      meses: m.meses.map((c) => estadoMes(ln.t[c.pos])),
    });
  }

  const compat = (x: LeadNorm, b: Bloco): boolean =>
    b.id === 'NOVOS' ? x.sit === 'ativo' : (x.dia !== null && Math.trunc(x.dia) === b.dia);

  const nbEq = (r: LinhaNorm, x: LeadNorm): boolean => {
    if (r.nb === x.nb) return true;
    // import D07 de 17/09: NB gravado em `banco` (e o nome do banco em `nb`)
    return r.nb !== '' && x.bancoNb === r.nb;
  };

  const pagSim = (r: LinhaNorm, x: LeadNorm): number => {
    const b = r.bloco;
    if (!b.compBase) return 0;
    const pl = pags.get(x.id);
    let n = 0;
    for (let k = 0; k < m.meses.length; k++) {
      const est = r.meses[k];
      const atual = pl?.get(compSoma(b.compBase, m.meses[k].mesPos ?? k)) ?? null;
      if (est === null && atual == null) continue;
      if (est !== null && atual != null && est[0] === atual[0] && (est[0] !== 'pago' || est[1] === atual[1])) n += 1;
    }
    return n;
  };

  const placar = (r: LinhaNorm, x: LeadNorm): number[] => [
    r.cpf && r.cpf === x.cpf ? 1 : 0,
    r.nome && r.nome === x.nome ? 1 : 0,
    compat(x, r.bloco) ? 1 : 0,
    nbEq(r, x) ? 1 : 0,
    pagSim(r, x),
    x.sit === r.bloco.situacao ? 1 : 0,
  ];

  type Passada = readonly [
    'P1' | 'P2' | 'P3',
    (r: LinhaNorm) => LeadNorm[],
    (r: LinhaNorm, x: LeadNorm) => boolean,
  ];
  const passadas: Passada[] = [
    ['P1', (r) => (r.cpf ? porCpf.get(r.cpf) ?? [] : []), (r, x) => compat(x, r.bloco) && nbEq(r, x)],
    ['P2', (r) => (r.cpf ? porCpf.get(r.cpf) ?? [] : []), (r, x) => !!r.nome && r.nome === x.nome],
    ['P3', (r) => (r.nome ? porNome.get(r.nome) ?? [] : []), (r, x) => compat(x, r.bloco)],
  ];

  const usados = new Set<string>();
  const res = new Map<number, Casado>();
  const idxOrdenados = [...R.keys()].sort((a, b) => a - b);
  for (const [nomeP, candsDe, ok] of passadas) {
    for (const i of idxOrdenados) {
      if (res.has(i)) continue;
      const r = R.get(i)!;
      const cands = candsDe(r).filter((x) => !usados.has(x.id) && ok(r, x));
      if (!cands.length) continue;
      const pl = new Map(cands.map((x) => [x.id, placar(r, x)]));
      cands.sort((a, b) => {
        const pa = pl.get(a.id)!, pb = pl.get(b.id)!;
        for (let j = 0; j < pa.length; j++) if (pa[j] !== pb[j]) return pb[j] - pa[j];   // placar desc
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;                                   // menor id
      });
      const empate = cands.length > 1
        && pl.get(cands[0].id)!.every((v, j) => v === pl.get(cands[1].id)![j]);
      res.set(i, { leadId: cands[0].id, passada: nomeP, candidatos: cands.length, empate });
      usados.add(cands[0].id);
    }
  }
  return res;
}

/** leads sem linha na folha → (saem, pendentes de aprovação de débito parado) */
export function leadsSemLinha(leads: LeadCasar[], casados: Map<number, Casado>): { saem: LeadCasar[]; pendentes: LeadCasar[] } {
  const usados = new Set([...casados.values()].map((c) => c.leadId));
  const sobra = leads.filter((ld) => !usados.has(ld.id));
  return {
    saem: sobra.filter((ld) => !ld.parado_pendente),
    pendentes: sobra.filter((ld) => !!ld.parado_pendente),
  };
}

/* ================= SHA-256 síncrono =================
   O hash do espelho e das senhas precisa ser síncrono (o diff é puro e testável);
   o crypto.subtle é assíncrono, então a rodada clássica vai aqui mesmo (sem lib). */

const K256 = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(texto: string): string {
  const msg = new TextEncoder().encode(texto);
  const l = msg.length;
  const blocos = ((l + 8) >> 6) + 1;
  const bytes = new Uint8Array(blocos * 64);
  bytes.set(msg);
  bytes[l] = 0x80;
  const dv = new DataView(bytes.buffer);
  dv.setUint32(bytes.length - 8, Math.floor(l / 0x20000000), false);
  dv.setUint32(bytes.length - 4, (l << 3) >>> 0, false);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Int32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = dv.getInt32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/** marca de senha no espelho: nunca o texto, sempre o hash (vazio inclusive) */
export const marcaSenha = (texto: string): string => `sha256:${sha256Hex(texto)}`;
