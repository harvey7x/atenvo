/* =====================================================================
   Gestão de cobranças = "Excel 2.0" — CAMADA DE DADOS da planilha
   (contrato: design-ref/PLANILHA-EXCEL-CONTRATO.md §2.1–§3).

   - Tipos da folha: blocos (ciclos + NOVOS), colunas (campo/mês/livre),
     linhas (cliente/cabeçalho/vazia/rótulo) e células com o texto EXATO +
     estilo (cor, negrito…).
   - Parsers/formatadores do §2.1: a MESMA regra das funções private.pl_* do
     SQL e do scripts/reviza/planilha_substituir.py. Mexeu aqui, mexe lá.
   - Repo: real = RPCs planilha_* (Supabase da Reviza); demo = localStorage
     'alfa_planilha_v2' ligado ao store demo (planilha.demo.ts).
   - Hooks react-query v5 com UPDATE OTIMISTA em camadas: a edição aparece
     na hora e é re-aplicada por cima de qualquer refetch (polling, realtime)
     até o servidor confirmar; em erro, só aquelas células voltam.
   Todas as escritas da planilha passam por UMA fila (ordem garantida: a 2ª
   edição da mesma célula nunca chega no banco antes da 1ª).
   ===================================================================== */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRevizaMode, supabase } from '@/lib/supabase';
import { chavesCobranca } from './keys';
import { getCobrancaRepo } from './cobrancaRepo';
import { registrarDesfazer, registrarBloqueada } from '../desfazer';
// ciclo de import proposital: o demo usa os parsers daqui SÓ dentro de funções
// (nada no topo do módulo) — seguro em ESM/Vite.
import { criarPlanilhaRepoDemo } from './planilha.demo';
import type { SessaoPapel } from './sessao';
import type { Dados, GLinha, SitDebito } from './types';

/* =============================== TIPOS =============================== */

export type TipoColuna = 'campo' | 'mes' | 'livre';
export type CampoLigado =
  | 'fechamento' | 'comercial' | 'nome' | 'nb' | 'banco' | 'cpf'
  | 'senha_inss' | 'valor' | 'reclame' | 'parou' | 'telefone';
export type TipoLinha = 'cliente' | 'cabecalho' | 'vazia' | 'rotulo';
export type LadoColuna = 'esq' | 'dir';
export type LadoLinha = 'acima' | 'abaixo';

/** estilo da célula — chaves opcionais, igual ao jsonb planilha_celulas.estilo */
export interface Estilo { bg?: string; fg?: string; b?: boolean; i?: boolean; al?: 'l' | 'c' | 'r' }

/** bloco = uma "tabela" empilhada da folha: um ciclo (D24…) ou NOVOS */
export interface PlBloco { id: string; dia: number | null; situacao: SitDebito; compBase: string | null }
export interface PlColuna {
  id: string; ordem: number; titulo: string; tipo: TipoColuna;
  campo: CampoLigado | null; mesPos: number | null; largura: number; oculta: boolean;
}
export interface PlCelula { t: string | null; s: Estilo | null }
/** pagamento INFORMADO (tabela entradas) na célula de mês de um cliente — o "e" de
    planilha_dados. 'pendente' = aguardando o financeiro; 'recusada' = a última recusa,
    e só quando é mais nova que qualquer mudança no pagamento daquele mês (quem
    filtra é o banco / o demo). v = valor informado; por = quem informou; em = quando
    informou (ISO); dec = quando o financeiro recusou (ISO; null na pendente);
    mot = motivo da recusa; cp = veio com comprovante. */
export type EntradaCel = {
  st: 'pendente' | 'recusada'; id: string; v: number; por: string; em: string;
  dec: string | null; mot: string | null; cp: boolean;
};
export interface PlLinha {
  id: string; ordem: number; tipo: TipoLinha; bloco: string | null;
  leadId: string | null; altura: number | null; c: Record<string, PlCelula>;
  /** entradas por coluna de mês (colunaId → EntradaCel); ausente = nenhuma */
  e?: Record<string, EntradaCel>;
}
export interface PlDados { blocos: PlBloco[]; colunas: PlColuna[]; linhas: PlLinha[] }

/** item de planilha_salvar — chave AUSENTE = não mexe; t null/'' = limpar texto; s null = limpar estilo */
export interface PlItem { l: string; c: string; t?: string | null; s?: Estilo | null }
/** avisos = textos que não viraram dado (ex.: "PARCELA TOTAL '3,4O' não é número…"); n = células que mudaram */
export interface PlSalvarResultado { ok: true; avisos: string[]; n?: number }
/** campos alteráveis de uma coluna (planilha_coluna_alterar) */
export interface PlColunaPatch { titulo?: string; largura?: number; oculta?: boolean; ordem?: number }

/** o que a grade pede nas colunas (onColuna) */
export type PlColunaOp =
  | { op: 'criar'; ref: string; lado: LadoColuna; tipo: 'livre' | 'mes'; titulo: string; cab?: Record<string, string> }
  | { op: 'alterar'; coluna: string; patch: PlColunaPatch }
  | { op: 'excluir'; coluna: string };
/** o que a grade pede nas linhas (onLinha) */
export type PlLinhaOp =
  | { op: 'inserir'; ref: string; lado: LadoLinha; tipo: TipoLinha }
  | { op: 'excluir'; linha: string }
  | { op: 'mover'; linha: string; ref: string; lado: LadoLinha };

/** máx. de itens por chamada de planilha_salvar (o hook fatia acima disso) */
export const LIMITE_ITENS = 5000;

/* ==================== PARSERS / FORMATADORES (§2.1) ====================
   Espelho EXATO das funções private.pl_* da migration 57 (fonte da verdade:
   é o SQL que aplica a regra no banco). Mexeu lá, mexe aqui — e nos testes. */

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
const ESP = /[\s ]/; // espaço, tab, quebra e nbsp (o [\s ] do SQL)

/** pl_trim: tira TODO espaço das pontas (espaço, tab, quebra, nbsp) */
export function plTrim(s: string | null | undefined): string {
  return (s ?? '').replace(/^[\s ]+|[\s ]+$/g, '');
}
/** btrim() do Postgres: só o espaço comum (campos de texto: nome, comercial, NB, banco, CPF) */
export function btrim(s: string | null | undefined): string {
  return (s ?? '').replace(/^ +| +$/g, '');
}

/** pl_valor — valor BR → número ≥ 0; senão null. Não "conserta" nada ("3,4O" é texto).
    Tira R$ e espaços. Com vírgula: só "1.343,50" ou "263,81" (ponto = milhar);
    sem vírgula: "1.343" / "1234.567" / "1.343.500" = milhar; "1343.50"/"224" = decimal.
    ≥ 10.000.000 → null (telefone/lixo nunca vira valor). */
export function valorBR(t: string | null | undefined): number | null {
  if (t == null) return null;
  const s = String(t).replace(/R\$/gi, '').replace(new RegExp(ESP.source, 'g'), '');
  if (!s) return null;
  let v: number;
  if (s.includes(',')) {
    if (!/^[0-9]{1,3}(\.[0-9]{3})+,[0-9]+$/.test(s) && !/^[0-9]+,[0-9]+$/.test(s)) return null;
    v = Number(s.replace(/\./g, '').replace(',', '.'));
  } else if (/^[0-9]+\.[0-9]{3}$/.test(s) || /^[0-9]{1,3}(\.[0-9]{3}){2,}$/.test(s)) {
    v = Number(s.replace(/\./g, ''));
  } else if (/^[0-9]+(\.[0-9]+)?$/.test(s)) {
    v = Number(s);
  } else return null;
  if (!Number.isFinite(v) || v >= 10_000_000) return null;
  return v;
}

/** pl_nao_pagou — "NÃO PAGOU", "não pagou", "NAO PAGOU ", "não  pagou" (espaços do miolo contam como 1) */
export function ehNaoPagou(t: string | null | undefined): boolean {
  if (t == null) return false;
  return plTrim(t).replace(/[ÃãÁáÂâÀà]/g, 'A').replace(/[\s ]+/g, ' ').toUpperCase() === 'NAO PAGOU';
}

export type EstadoMes = { estado: 'pago'; valor: number } | { estado: 'nao_pagou' } | { estado: 'nada' };
/** pl_mes_estado — célula de mês → estado. 'nada' = SEM linha em pagamentos
    (vazio, "-", "--", datas, notas, telefones, "0"). */
export function estadoMes(t: string | null | undefined): EstadoMes {
  if (t == null) return { estado: 'nada' };
  if (ehNaoPagou(t)) return { estado: 'nao_pagou' };
  const v = valorBR(t);
  if (v != null && v > 0) return { estado: 'pago', valor: Math.round(v * 100) / 100 };
  return { estado: 'nada' };
}
/** pl_eh_estado — o texto é "estado de pagamento" (número, NÃO PAGOU, "-", vazio)?
    Só esses o sistema pode apagar; o resto é nota e fica. */
export function ehEstadoPagamento(t: string | null | undefined): boolean {
  if (t == null) return true;
  const s = plTrim(t);
  return s === '' || s === '-' || ehNaoPagou(t) || valorBR(t) != null;
}

const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
/** a carteira começou em ago/2025: data curta sem ano nunca cai antes disso */
const ANO_MIN = 2025;
let _fmtHojeSP: Intl.DateTimeFormat | null = null;
/** hoje + n dias no fuso do negócio (o `now() at time zone 'America/Sao_Paulo'` do SQL) → 'YYYY-MM-DD' */
function hojeSP(maisDias = 0): string {
  let y = NaN; let m = NaN; let d = NaN;
  try {
    _fmtHojeSP ??= new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
    const partes = _fmtHojeSP.formatToParts(new Date());
    const v = (t: string) => Number(partes.find((x) => x.type === t)?.value);
    y = v('year'); m = v('month'); d = v('day');
  } catch { /* sem Intl com fuso: cai no relógio local */ }
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    const n = new Date(); y = n.getFullYear(); m = n.getMonth() + 1; d = n.getDate();
  }
  const dt = new Date(Date.UTC(y, m - 1, d + maisDias));
  return `${String(dt.getUTCFullYear()).padStart(4, '0')}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
/** pl_data_partes — sem ano: o ano CORRENTE; se isso cair depois de hoje+7 dias, o
    anterior (fechamento, parou e reclamação são datas passadas); nunca antes de 2025.
    Até 30/09/2026 dá o mesmo que a regra antiga (out–dez → 2025, jan–set → 2026) e
    não vira 2025 a partir de out/2026. Compara com o dia preso em 28, igual ao SQL.
    `ref` ('YYYY-MM', o 1º mês pago do cliente — pl_mes_ref): enquanto o mês cair
    depois dele, volta 1 ano (ainda nunca antes de 2025). */
function dataPartes(d: string, m: string, a: string | undefined, ref?: string | null): string | null {
  const dia = Number(d);
  let mes: number;
  if (/^[0-9]+$/.test(m)) mes = Number(m);
  else {
    const k = MESES_CURTOS.indexOf(m.slice(0, 3).toLowerCase() as (typeof MESES_CURTOS)[number]);
    if (k < 0) return null;
    mes = k + 1;
  }
  if (mes < 1 || mes > 12) return null;
  let ano: number;
  if (!a) {
    ano = Number(hojeSP().slice(0, 4));
    if (`${String(ano).padStart(4, '0')}-${pad2(mes)}-${pad2(Math.min(dia, 28))}` > hojeSP(7)) ano -= 1;
    while (ref && ano > ANO_MIN && `${String(ano).padStart(4, '0')}-${pad2(mes)}` > ref) ano -= 1;
    if (ano < ANO_MIN) ano = ANO_MIN;
  } else ano = a.length === 2 ? 2000 + Number(a) : Number(a);
  if (ano < 1) return null;
  const ult = [31, bissexto(ano) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mes - 1];
  if (dia < 1 || dia > ult) return null;
  return `${String(ano).padStart(4, '0')}-${pad2(mes)}-${pad2(dia)}`;
}
const RE_DATA_INTEIRA = /^([0-9]{1,2})\/([0-9]{1,2}|[A-Za-z]{3}\.?)(?:\/([0-9]{4}|[0-9]{2}))?$/;
// igual ao SQL menos o (?<![0-9]) do começo — lookbehind quebra o parse em
// Safari antigo; o "dígito antes não vale" é conferido à mão no laço.
const RE_DATA_NO_TEXTO = /([0-9]{1,2})\/([0-9]{1,2}|[A-Za-z]{3}\.?)(?:\/([0-9]{4}|[0-9]{2}))?(?![0-9A-Za-z])/g;

/** pl_data — o texto INTEIRO é uma data curta (DATA FECHAMENTO): DD/mmm(.) · DD/MM ·
    DD/MM/AAAA · DD/MM/AA → 'YYYY-MM-DD'; senão null (o campo do sistema não muda).
    `ref` = 1º mês pago do cliente (regra do ano, ver dataPartes). */
export function dataCurta(t: string | null | undefined, ref?: string | null): string | null {
  const m = RE_DATA_INTEIRA.exec(plTrim(t));
  return m ? dataPartes(m[1], m[2], m[3], ref) : null;
}
/** pl_data_no_texto — 1ª data curta ACHADA no texto (RECLAME "reclame aqui 15/01 - …",
    PAROU "débito cancelado 16/04") → 'YYYY-MM-DD'; nenhuma → null. */
export function dataNoTexto(t: string | null | undefined, ref?: string | null): string | null {
  if (t == null) return null;
  const re = new RegExp(RE_DATA_NO_TEXTO.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    if (m.index > 0 && /[0-9]/.test(t[m.index - 1])) { re.lastIndex = m.index + 1; continue; }
    const iso = dataPartes(m[1], m[2], m[3], ref);
    if (iso) return iso;
  }
  return null;
}

/** pl_tel — telefone: tira ( ) . espaços e hífens/travessões; a 1ª sequência de
    10–13 dígitos vira o telefone. Não achou → null (o telefone do sistema NÃO muda). */
export function extrairTelefone(t: string | null | undefined): string | null {
  const s = (t ?? '').replace(/[().\s ‐-―-]/g, '');
  const m = /(?:^|[^0-9])([0-9]{10,13})(?![0-9])/.exec(s);
  return m ? m[1] : null;
}

/** pl_fmt_valor — número → "263,81", "224", 230.90 → "230,9" (sem R$, sem milhar) */
export function fmtValorBR(v: number): string {
  const n = Math.round(v * 100) / 100;
  return String(Object.is(n, -0) ? 0 : n).replace('.', ',');
}
/** pl_fmt_data — fechamento ISO → "15/jan" quando o texto curto LÊ DE VOLTA a mesma
    data (regra do ano de dataCurta); senão "15/01/2027" (o ano não se perde na ida e
    volta, com o mesmo `ref`). Não-ISO volta como está. */
export function fmtDataCurta(iso: string | null | undefined, ref?: string | null): string {
  const m = /^([0-9]{4})-(0[1-9]|1[0-2])-([0-9]{2})$/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const curto = `${m[3]}/${MESES_CURTOS[Number(m[2]) - 1]}`;
  return dataCurta(curto, ref) === iso ? curto : `${m[3]}/${m[2]}/${m[1]}`;
}
/** pl_mes_texto — pagamento (status/valor) → texto da célula de mês. Mantém o texto
    atual quando ele já diz a mesma coisa ("R$ 150,00" continua); sem pagamento
    (status null) só apaga (null) se o texto atual for estado — NUNCA apaga nota. */
export function textoMes(
  atual: string | null | undefined,
  status: 'pago' | 'nao_pagou' | 'fora' | null,
  valor?: number | null,
): string | null {
  const a = atual ?? null;
  if (status === 'pago') {
    if (a != null && !ehNaoPagou(a) && valor != null && valorBR(a) === valor) return a;
    return valor == null ? null : fmtValorBR(valor);
  }
  if (status === 'nao_pagou') return ehNaoPagou(a) ? a : 'NÃO PAGOU';
  if (status === 'fora') return a != null && plTrim(a) === '-' ? a : '-';
  return ehEstadoPagamento(a) ? null : a;
}
/** pl_equivale — o texto da célula já "diz" o valor do campo do lead? (aí o
    sistema não reescreve a célula quando o lead muda fora da planilha). `ref` só
    vale p/ fechamento (1º mês pago — regra do ano). */
export function textoEquivale(campo: CampoLigado, atual: string | null | undefined, valor: string | null | undefined, ref?: string | null): boolean {
  if (campo === 'fechamento') return (valor != null && dataCurta(atual, ref) === valor) || plTrim(atual) === plTrim(valor);
  if (campo === 'valor') {
    const n = valor == null || valor === '' ? null : Number(valor);
    return (n != null && valorBR(atual) === n) || (plTrim(atual) === '' && (n ?? 0) === 0);
  }
  if (campo === 'telefone') {
    const a = extrairTelefone(atual); const b = extrairTelefone(valor);
    return (a != null && b != null && a === b) || plTrim(atual) === plTrim(valor);
  }
  return btrim(atual) === btrim(valor);
}

/** 'YYYY-MM' + k meses (k pode ser negativo) */
export function compSoma(base: string, k: number): string {
  const [y, m] = base.split('-').map(Number);
  const n = y * 12 + (m - 1) + k;
  return `${String(Math.floor(n / 12)).padStart(4, '0')}-${pad2((((n % 12) + 12) % 12) + 1)}`;
}
/** quantos meses de `base` até `comp` (o k da coluna de mês) */
export function mesesEntre(base: string, comp: string): number {
  const [y1, m1] = base.split('-').map(Number);
  const [y2, m2] = comp.split('-').map(Number);
  return (y2 * 12 + m2) - (y1 * 12 + m1);
}

/** competência ('YYYY-MM') da célula = comp_base do bloco da linha + mes_pos da
    coluna (a mesma conta do private.pl_comp_soma). null: coluna que não é de mês,
    linha sem bloco ou bloco sem mês-base (NOVOS — lá o mês é só texto). */
export function compDaCelula(dados: Pick<PlDados, 'blocos'>, linha: PlLinha, coluna: PlColuna): string | null {
  if (coluna.tipo !== 'mes' || coluna.mesPos == null || !linha.bloco) return null;
  const base = dados.blocos.find((b) => b.id === linha.bloco)?.compBase;
  return base ? compSoma(base, coluna.mesPos) : null;
}

/** estado de PAGAMENTO de uma célula de mês de cliente (a cor da célula):
    - 'pendente'  = pagamento informado aguardando o financeiro (amarelo; valor = o informado)
    - 'pago'      = o texto da célula é valor > 0 (verde; valor = o da célula)
    - 'nao_pagou' = o texto é NÃO PAGOU (vermelho)
    - 'recusado'  = o financeiro recusou o último informado e o pagamento do mês
                    não mudou depois (vermelho; valor = o recusado; motivo em entrada.mot)
    - null        = sem estado (vazio, "-", notas, datas…) e toda célula que NÃO liga a
                    pagamento: coluna que não é de mês, linha que não é cliente, linha sem
                    bloco ou em bloco sem mês-base (NOVOS: lá o mês é só texto, não há
                    linha em pagamentos — número ali não é "Pago").
    Prioridade: pendente > pago > nao_pagou > recusado. `entrada` só vem em
    pendente/recusado. `dados` = os blocos da folha (a mesma checagem do compDaCelula). */
export interface EstadoMesCelula {
  tipo: 'pago' | 'pendente' | 'recusado' | 'nao_pagou' | null;
  valor: number | null;
  entrada?: EntradaCel;
}
export function estadoMesCelula(linha: PlLinha, coluna: PlColuna, dados: Pick<PlDados, 'blocos'>): EstadoMesCelula {
  if (coluna.tipo !== 'mes' || coluna.mesPos == null || linha.tipo !== 'cliente' || !linha.bloco) return { tipo: null, valor: null };
  if (!dados.blocos.find((b) => b.id === linha.bloco)?.compBase) return { tipo: null, valor: null };
  const ent = linha.e?.[coluna.id];
  if (ent?.st === 'pendente') return { tipo: 'pendente', valor: ent.v, entrada: ent };
  const e = estadoMes(linha.c[coluna.id]?.t);
  if (e.estado === 'pago') return { tipo: 'pago', valor: e.valor };
  if (e.estado === 'nao_pagou') return { tipo: 'nao_pagou', valor: null };
  if (ent?.st === 'recusada') return { tipo: 'recusado', valor: ent.v, entrada: ent };
  return { tipo: null, valor: null };
}

/* ============================ UTILITÁRIOS ============================ */

/** ordem fracionária entre duas vizinhas (null = ponta da folha) */
export function ordemEntre(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null && b == null) return 1000;
  if (a == null) return (b as number) - 1000;
  if (b == null) return a + 1000;
  return (a + b) / 2;
}
/** folga mínima entre duas ordens vizinhas. Cada inserção no MESMO ponto corta a
    folga pela metade; abaixo disto (~30 inserções) quem insere abre espaço antes do
    meio-termo — senão as ordens colidem (numeric de 12 casas no banco, double aqui)
    e o cliente aparece embaixo do cabeçalho de outro ciclo. Mesma regra do
    pl_ordem_linha / pl_fim_do_bloco / pl_ordem_coluna do SQL. */
export const FOLGA_MIN_ORDEM = 1e-6;
/** ordem p/ um item novo logo DEPOIS (ou ANTES) da ordem `ref`, entre TODOS os `itens`
    (linhas ou colunas; `sem` = o próprio item que está mudando de lugar). Sem folga:
    depois → +1000 em tudo que vem depois de ref; antes → −1000 em tudo que vem antes
    (igual ao banco). `empurrar` = id → ordem nova de quem teve que andar. */
export function ordemComFolga<T extends { id: string; ordem: number }>(
  itens: readonly T[], ref: number, depois: boolean, sem?: string,
): { ordem: number; empurrar: Map<string, number> } {
  const empurrar = new Map<string, number>();
  let viz: number | undefined;
  for (const x of itens) {
    if (x.id === sem) continue;
    if (depois ? x.ordem > ref && (viz === undefined || x.ordem < viz) : x.ordem < ref && (viz === undefined || x.ordem > viz)) viz = x.ordem;
  }
  if (viz === undefined) return { ordem: depois ? ref + 1000 : ref - 1000, empurrar };
  if (Math.abs(viz - ref) < FOLGA_MIN_ORDEM) {
    const delta = depois ? 1000 : -1000;
    for (const x of itens) {
      if (x.id === sem) continue;
      if (depois ? x.ordem > ref : x.ordem < ref) empurrar.set(x.id, x.ordem + delta);
    }
    viz += delta;
  }
  return { ordem: (ref + viz) / 2, empurrar };
}
/** 0 → A, 25 → Z, 26 → AA … (letra da coluna, como no Excel) */
export function letraColuna(i: number): string {
  let s = '';
  let n = Math.floor(i) + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const corHex = (x: unknown): string | undefined => {
  if (typeof x !== 'string') return undefined;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(x.trim());
  if (!m) return undefined;
  const h = m[1].length === 3 ? m[1].split('').map((ch) => ch + ch).join('') : m[1];
  return `#${h.toUpperCase()}`;
};
/** estilo só com as chaves válidas (#RRGGBB maiúsculo; b/i só quando true); vazio → null */
export function normalizarEstilo(s: unknown): Estilo | null {
  if (!s || typeof s !== 'object') return null;
  const e = s as Record<string, unknown>;
  const o: Estilo = {};
  const bg = corHex(e.bg); if (bg) o.bg = bg;
  const fg = corHex(e.fg); if (fg) o.fg = fg;
  if (e.b === true) o.b = true;
  if (e.i === true) o.i = true;
  if (e.al === 'l' || e.al === 'c' || e.al === 'r') o.al = e.al;
  return Object.keys(o).length ? o : null;
}
/** patch de coluna limpo (largura presa em 30..900 como o check do banco) */
export function normalizarPatchColuna(p: PlColunaPatch): PlColunaPatch {
  const o: PlColunaPatch = {};
  if (p.titulo !== undefined) o.titulo = String(p.titulo ?? '').trim();
  if (p.largura !== undefined && Number.isFinite(p.largura)) o.largura = Math.round(Math.min(900, Math.max(30, p.largura)));
  if (p.oculta !== undefined) o.oculta = !!p.oculta;
  if (p.ordem !== undefined && Number.isFinite(p.ordem)) o.ordem = p.ordem;
  return o;
}
/** itens prontos pro RPC: '' vira null (limpar), estilo normalizado, e a MESMA
    célula repetida no lote vira 1 item (a última vence) — um upsert em lote no
    banco não pode tocar a mesma linha 2x. Itens sem t nem s saem. */
export function prepararItens(itens: readonly PlItem[]): PlItem[] {
  const porCel = new Map<string, PlItem>();
  for (const it of itens) {
    if (!it || typeof it.l !== 'string' || typeof it.c !== 'string' || !it.l || !it.c) continue;
    const k = `${it.l}\u0000${it.c}`;
    const acc = porCel.get(k) ?? { l: it.l, c: it.c };
    if (it.t !== undefined) acc.t = it.t == null || it.t === '' ? null : String(it.t);
    if (it.s !== undefined) acc.s = normalizarEstilo(it.s);
    porCel.set(k, acc);
  }
  return [...porCel.values()].filter((it) => it.t !== undefined || it.s !== undefined);
}

/* ================================ REPO ================================ */

export interface PlanilhaRepo {
  /** a folha inteira (só o que o papel pode ver; cliente na Lixeira fica de fora) */
  carregar(): Promise<PlDados>;
  /** grava células (texto exato + estilo) e aplica as ligações do §2.2. Tudo-ou-nada. */
  salvar(itens: PlItem[], origem?: string): Promise<PlSalvarResultado>;
  /** nova coluna à esq/dir da ref; 'mes' = o PRÓXIMO mês (cab = texto do cabeçalho por bloco) */
  colunaCriar(a: { ref: string; lado: LadoColuna; tipo: 'livre' | 'mes'; titulo: string; cab?: Record<string, string> }): Promise<string>;
  colunaAlterar(coluna: string, patch: PlColunaPatch): Promise<void>;
  /** só coluna 'livre' */
  colunaExcluir(coluna: string): Promise<void>;
  /** nova linha acima/abaixo da ref, no bloco da ref ('cliente' cria o lead) */
  linhaInserir(ref: string, lado: LadoLinha, tipo: TipoLinha): Promise<string>;
  /** cliente → Lixeira (restaurar religa); outras → apaga a linha */
  linhaExcluir(linha: string): Promise<void>;
  /** muda a posição; cliente indo pra outro bloco muda dia/situação do lead */
  linhaMover(linha: string, ref: string, lado: LadoLinha): Promise<void>;
}

const porOrdem = (a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem;

/** uma entrada do "e" de planilha_dados ({st,id,v,por,em,dec,mot,cp}) → EntradaCel;
    st fora de pendente/recusada ou sem id → null (ignora) */
export function normalizarEntradaCel(x: unknown): EntradaCel | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  if ((o.st !== 'pendente' && o.st !== 'recusada') || o.id == null || o.id === '') return null;
  const v = Number(o.v);
  const txt = (y: unknown) => (y == null || y === '' ? null : String(y));
  return {
    st: o.st, id: String(o.id), v: Number.isFinite(v) ? v : 0,
    por: txt(o.por) ?? '', em: txt(o.em) ?? '', dec: txt(o.dec), mot: txt(o.mot), cp: o.cp === true,
  };
}

/** jsonb de planilha_dados() → PlDados (tolerante: aceita célula como [t,s] ou {t,s};
    "e" = entradas por coluna de mês, só nas linhas que têm) */
export function normalizarDados(raw: unknown): PlDados {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const arr = (x: unknown) => (Array.isArray(x) ? x : []) as Record<string, unknown>[];
  const numOuNull = (x: unknown) => (x == null ? null : Number(x));
  const blocos: PlBloco[] = arr(r.blocos).map((b) => ({
    id: String(b.id), dia: numOuNull(b.dia),
    situacao: (b.situacao === 'ativo' ? 'ativo' : 'cancelado') as SitDebito,
    compBase: b.comp_base == null ? null : String(b.comp_base),
  }));
  const colunas: PlColuna[] = arr(r.colunas).map((c) => ({
    id: String(c.id), ordem: Number(c.ordem), titulo: String(c.titulo ?? ''),
    tipo: c.tipo as TipoColuna, campo: (c.campo ?? null) as CampoLigado | null,
    mesPos: numOuNull(c.mes_pos), largura: Number(c.largura ?? 110), oculta: c.oculta === true,
  })).sort(porOrdem);
  const linhas: PlLinha[] = arr(r.linhas).map((l) => {
    const c: Record<string, PlCelula> = {};
    const bruto = (l.c && typeof l.c === 'object' ? l.c : {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(bruto)) {
      let t: unknown = null; let s: unknown = null;
      if (Array.isArray(v)) { t = v[0]; s = v[1]; } else if (v && typeof v === 'object') { t = (v as PlCelula).t; s = (v as PlCelula).s; }
      const tt = t == null ? null : String(t);
      const ss = normalizarEstilo(s);
      if (tt != null || ss != null) c[k] = { t: tt, s: ss };
    }
    const linha: PlLinha = {
      id: String(l.id), ordem: Number(l.ordem), tipo: l.tipo as TipoLinha,
      bloco: l.bloco == null ? null : String(l.bloco), leadId: l.lead_id == null ? null : String(l.lead_id),
      altura: numOuNull(l.altura), c,
    };
    if (l.e && typeof l.e === 'object' && !Array.isArray(l.e)) {
      const e: Record<string, EntradaCel> = {};
      for (const [k, v] of Object.entries(l.e as Record<string, unknown>)) {
        const ent = normalizarEntradaCel(v);
        if (ent) e[k] = ent;
      }
      if (Object.keys(e).length) linha.e = e;
    }
    return linha;
  }).sort(porOrdem);
  return { blocos, colunas, linhas };
}

/* erros do PostgREST → texto que o usuário lê (as RPCs já falam PT) */
function erroRpc(e: { message?: string; code?: string } | null): Error | null {
  if (!e) return null;
  if (e.code === '57014') return new Error('A planilha demorou demais para responder — tente de novo com menos células por vez.');
  if (e.code === 'PGRST202') return new Error('A planilha nova ainda não está instalada no banco (função não encontrada).');
  return new Error(e.message || 'Falha ao falar com o banco.');
}
const msgLimite = (n: number) => `No máximo ${LIMITE_ITENS} células por vez (foram ${n}) — selecione menos.`;

function criarPlanilhaRepoSupabase(c: SupabaseClient): PlanilhaRepo {
  const rpc = async <T>(nome: string, args?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await c.rpc(nome, args);
    const e = erroRpc(error);
    if (e) throw e;
    return data as T;
  };
  return {
    async carregar() { return normalizarDados(await rpc<unknown>('planilha_dados')); },
    async salvar(itensBrutos, origem = 'edicao') {
      const itens = prepararItens(itensBrutos);
      if (itens.length > LIMITE_ITENS) throw new Error(msgLimite(itens.length));
      if (!itens.length) return { ok: true, avisos: [], n: 0 };
      const r = await rpc<{ avisos?: unknown; n?: unknown } | null>('planilha_salvar', { p_itens: itens, p_origem: origem });
      const av = r?.avisos;
      return { ok: true, avisos: Array.isArray(av) ? av.map((x) => String(x)) : [], n: Number(r?.n ?? 0) };
    },
    async colunaCriar(a) {
      const args: Record<string, unknown> = { p_ref: a.ref, p_lado: a.lado, p_tipo: a.tipo, p_titulo: a.titulo };
      if (a.cab && Object.keys(a.cab).length) args.p_cab = a.cab; // parâmetro opcional (só quando há texto)
      return String(await rpc<string>('planilha_coluna_criar', args));
    },
    async colunaAlterar(coluna, patch) {
      await rpc('planilha_coluna_alterar', { p_coluna: coluna, p_patch: normalizarPatchColuna(patch) });
    },
    async colunaExcluir(coluna) { await rpc('planilha_coluna_excluir', { p_coluna: coluna }); },
    async linhaInserir(ref, lado, tipo) {
      return String(await rpc<string>('planilha_linha_inserir', { p_ref: ref, p_lado: lado, p_tipo: tipo }));
    },
    async linhaExcluir(linha) { await rpc('planilha_linha_excluir', { p_linha: linha }); },
    async linhaMover(linha, ref, lado) { await rpc('planilha_linha_mover', { p_linha: linha, p_ref: ref, p_lado: lado }); },
  };
}

let _repo: PlanilhaRepo | null = null;
/** repo certo pro modo (igual ao getCobrancaRepo: real SÓ na instância Reviza) */
export function getPlanilhaRepo(): PlanilhaRepo {
  if (_repo) return _repo;
  _repo = (isRevizaMode && supabase) ? criarPlanilhaRepoSupabase(supabase) : criarPlanilhaRepoDemo();
  return _repo;
}

/* ==================== OTIMISTA EM CAMADAS (pendentes) ==================== */

/** uma edição ainda não confirmada: célula (texto/estilo), coluna (patch) ou linha (posição) */
export type Camada =
  | { k: 'cel'; mut: number; l: string; c: string; temT: boolean; t: string | null; temS: boolean; s: Estilo | null }
  | { k: 'col'; mut: number; id: string; patch: PlColunaPatch }
  | { k: 'lin'; mut: number; id: string; ordem: number; bloco?: string };

/** aplica camadas por cima dos dados (cópia só das linhas/colunas tocadas) */
export function aplicarCamadas(d: PlDados, cs: readonly Camada[]): PlDados {
  if (!cs.length) return d;
  const linhas = d.linhas.slice();
  const colunas = d.colunas.slice();
  const idx = new Map<string, number>();
  linhas.forEach((l, i) => idx.set(l.id, i));
  const copiadas = new Set<number>();
  const pegar = (id: string): PlLinha | null => {
    const i = idx.get(id);
    if (i == null) return null; // linha sumiu (excluída por outra pessoa): ignora
    if (!copiadas.has(i)) { linhas[i] = { ...linhas[i], c: { ...linhas[i].c } }; copiadas.add(i); }
    return linhas[i];
  };
  let reordLinhas = false;
  let reordColunas = false;
  for (const k of cs) {
    if (k.k === 'cel') {
      if (!k.temT && !k.temS) continue;
      const l = pegar(k.l); if (!l) continue;
      const atual = l.c[k.c];
      const t = k.temT ? k.t : (atual?.t ?? null);
      const s = k.temS ? k.s : (atual?.s ?? null);
      if (t == null && s == null) delete l.c[k.c]; else l.c[k.c] = { t, s };
    } else if (k.k === 'lin') {
      const l = pegar(k.id); if (!l) continue;
      l.ordem = k.ordem;
      if (k.bloco !== undefined) l.bloco = k.bloco;
      reordLinhas = true;
    } else {
      const i = colunas.findIndex((c) => c.id === k.id);
      if (i < 0) continue;
      colunas[i] = { ...colunas[i], ...k.patch };
      if (k.patch.ordem !== undefined) reordColunas = true;
    }
  }
  if (reordLinhas) linhas.sort(porOrdem);
  if (reordColunas) colunas.sort(porOrdem);
  return { ...d, linhas, colunas };
}

/** Guarda as edições pendentes. Cada leitura do servidor re-aplica as camadas
    por cima; uma camada só sai quando uma leitura que COMEÇOU depois da
    confirmação dela termina (assim um refetch que saiu antes do commit não
    "desfaz" a edição na tela). Em erro, as camadas daquela mutação saem e a
    folha é recalculada a partir da última leitura do servidor. Leitura que
    começou ANTES de outra já aplicada (chegou atrasada) não mexe em nada: a
    folha mais nova continua valendo. */
export class PendentesPlanilha {
  private camadas: Camada[] = [];
  private confirmadas = new Map<number, number>(); // mut → nº da última leitura iniciada na confirmação
  private leituras = 0;
  private ultimaLida = 0; // nº da leitura mais nova já aplicada em `servidor`
  private seq = 0;
  private servidor: PlDados | null = null;

  novoMut(): number { return ++this.seq; }
  iniciarLeitura(): number { return ++this.leituras; }
  get quantas(): number { return this.camadas.length; }

  aoLer(leitura: number, bruto: PlDados): PlDados {
    // leitura atrasada: não sobrescreve o servidor mais novo nem tira camada
    if (leitura < this.ultimaLida) return aplicarCamadas(this.servidor ?? bruto, this.camadas);
    this.ultimaLida = leitura;
    this.servidor = bruto;
    this.camadas = this.camadas.filter((k) => {
      const conf = this.confirmadas.get(k.mut);
      return conf == null || conf >= leitura;
    });
    const vivas = new Set(this.camadas.map((k) => k.mut));
    for (const m of [...this.confirmadas.keys()]) if (!vivas.has(m)) this.confirmadas.delete(m);
    return aplicarCamadas(bruto, this.camadas);
  }
  empilhar(cs: readonly Camada[]): void { for (const k of cs) this.camadas.push(k); }
  confirmar(mut: number): void {
    if (this.camadas.some((k) => k.mut === mut)) this.confirmadas.set(mut, this.leituras);
  }
  /** tira as camadas destas mutações; devolve a folha recalculada (null se ainda não leu nada) */
  descartar(muts: readonly number[]): PlDados | null {
    if (!muts.length) return null;
    const fora = new Set(muts);
    this.camadas = this.camadas.filter((k) => !fora.has(k.mut));
    for (const m of muts) this.confirmadas.delete(m);
    return this.servidor ? aplicarCamadas(this.servidor, this.camadas) : null;
  }
}

/* ================================ HOOKS ================================ */

export const chavesPlanilha = {
  planilha: ['cobranca', 'planilha'] as const,
  /** prefixo das mutações (useIsMutating({ mutationKey }) = "salvando…") */
  escrita: ['cobranca', 'planilha', 'escrita'] as const,
};
const CHAVE_SENHAS = ['cobranca', 'senhas-grade'] as const;
const CHAVE_REGISTROS = ['reviza', 'registros'] as const;

let pend = new PendentesPlanilha();
/* sobe a cada troca de usuário (resetarPlanilha): o que a sessão anterior deixou
   na fila não sai mais, e mutação que termina depois não mexe em cache nem no Desfazer */
let geracao = 0;
const MSG_SESSAO = 'A sessão mudou (saiu ou entrou outro usuário) — esta edição da planilha não foi salva.';

/* fila única de escrita: RPCs da planilha saem na ordem em que foram pedidas */
let fila: Promise<unknown> = Promise.resolve();
let naFila = 0; // pedidos na fila + o que está gravando agora
function enfileirar<T>(f: () => Promise<T>): Promise<T> {
  const ger = geracao;
  const job = () => (ger === geracao ? f() : Promise.reject(new Error(MSG_SESSAO)));
  naFila++;
  const p = fila.then(job, job);
  fila = p.then(() => undefined, () => undefined);
  const baixa = () => { naFila = Math.max(0, naFila - 1); };
  void p.then(baixa, baixa);
  return p;
}
/** a planilha ainda tem escrita na fila ou gravando? (fechar/recarregar agora perde) */
export const planilhaOcupada = (): boolean => naFila > 0;

/* eco do realtime: a própria escrita volta como evento logo depois. O onSuccess
   dos hooks já relê a folha — o useRealtimeCobranca ignora eventos até ECO_MS
   depois disto (sem ler 1 MB duas vezes por célula). */
let ultimaEscrita = 0;
const marcarEscrita = () => { ultimaEscrita = Date.now(); };
/** Date.now() da última escrita desta aba confirmada pelo banco (0 = nenhuma) */
export const ultimaEscritaPlanilha = (): number => ultimaEscrita;
/* entradas pendentes vistas na folha que já pediram releitura dos Dados (usePlanilha;
   não pede de novo pela mesma) */
const dadosPedidos = new Set<string>();

/** Troca de usuário na mesma aba (Sair, sessão expirada, login de outra pessoa):
    zera as edições pendentes e a fila (nada da sessão anterior grava com a nova).
    O AuthContext chama isto junto com o queryClient.clear(). */
export function resetarPlanilha(): void {
  geracao++;
  pend = new PendentesPlanilha();
  fila = Promise.resolve();
  ultimaEscrita = 0;
  dadosPedidos.clear();
}

if (typeof window !== 'undefined') {
  // fechar/recarregar a aba com escrita na fila: o navegador pergunta antes (o
  // otimista já mostra o valor, mas ele ainda não chegou no banco)
  window.addEventListener('beforeunload', (e) => {
    if (!planilhaOcupada()) return;
    e.preventDefault();
    e.returnValue = '';
  });
  // ganchos sem import: o takeover de atualização (main.tsx) espera a fila esvaziar
  // e o AuthContext zera a planilha na troca de usuário — sem puxar este módulo
  // (e o repo da cobrança) pro chunk de entrada
  const w = window as unknown as { __rvEscritaPendente?: () => boolean; __rvResetPlanilha?: () => void };
  w.__rvEscritaPendente = planilhaOcupada;
  w.__rvResetPlanilha = resetarPlanilha;
}

async function lerPlanilha(): Promise<PlDados> {
  const pd = pend;
  const leitura = pd.iniciarLeitura();
  const bruto = await getPlanilhaRepo().carregar();
  // trocou de usuário no meio da leitura: não entrega a folha da sessão anterior
  if (pd !== pend) throw new Error(MSG_SESSAO);
  return pd.aoLer(leitura, bruto);
}

function fatiar<T>(xs: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out.length ? out : [[]];
}
/** erro de um salvar fatiado: `feitos` = quantos lotes JÁ foram gravados */
class ErroLote extends Error {
  feitos: number;
  constructor(msg: string, feitos: number) { super(msg); this.name = 'ErroLote'; this.feitos = feitos; }
}
/** grava em lotes de LIMITE_ITENS (cada lote é tudo-ou-nada no banco), na fila */
function salvarEmLotes(itens: PlItem[], origem?: string): Promise<PlSalvarResultado> {
  const lotes = fatiar(itens, LIMITE_ITENS);
  return enfileirar(async () => {
    const avisos: string[] = [];
    let n = 0;
    for (let i = 0; i < lotes.length; i++) {
      if (!lotes[i].length) continue;
      try {
        const r = await getPlanilhaRepo().salvar(lotes[i], origem);
        avisos.push(...r.avisos);
        n += r.n ?? 0;
      } catch (e) {
        const msg = (e as Error)?.message || 'Falha ao salvar a planilha.';
        const feitas = lotes.slice(0, i).reduce((s, l) => s + l.length, 0);
        throw new ErroLote(i === 0 ? msg : `Salvei ${feitas} de ${itens.length} células; o resto não foi salvo: ${msg}`, i);
      }
    }
    return { ok: true as const, avisos, n };
  });
}

const papelDe = (qc: QueryClient) => qc.getQueryData<SessaoPapel>(chavesCobranca.papel);
/* sem papel no cache (demo) = pleno, igual aos outros hooks da cobrança */
const ehGestor = (p: SessaoPapel | undefined) => !p || p.gestor;
const ehFinanceiroMais = (p: SessaoPapel | undefined) => !p || p.gestor || p.papel === 'financeiro';

function invalidar(qc: QueryClient, o: { dados?: boolean; senhas?: boolean; lixeira?: boolean } = {}) {
  void qc.invalidateQueries({ queryKey: chavesPlanilha.planilha });
  void qc.invalidateQueries({ queryKey: CHAVE_REGISTROS }); // RPCs gravam auditoria
  if (o.dados) void qc.invalidateQueries({ queryKey: chavesCobranca.dados }); // painel, régua, ficha…
  if (o.senhas) void qc.invalidateQueries({ queryKey: CHAVE_SENHAS });
  if (o.lixeira) void qc.invalidateQueries({ queryKey: ['reviza', 'lixeira'] });
}

/** A folha inteira. Key ['cobranca','planilha']; polling 30s + foco; no real o
    realtime (blocos/colunas/linhas + planilha_versao, e leads/pagamentos pelos
    gatilhos reversos) invalida — useRealtimeCobranca, 1,5 s agrupando, máx. 5 s.
    No demo, acompanha o store Dados: quando ele muda (ficha, marcar célula,
    cadastro…), relê — e a leitura do demo sincroniza a folha. */
export function usePlanilha() {
  const qc = useQueryClient();
  useEffect(() => {
    if (isRevizaMode && supabase) return; // real: realtime + polling cobrem
    let ultimo: unknown = qc.getQueryData(chavesCobranca.dados);
    return qc.getQueryCache().subscribe((e) => {
      if (e.type !== 'updated' || e.action.type !== 'success') return;
      const k = e.query.queryKey;
      if (k.length !== 2 || k[0] !== chavesCobranca.dados[0] || k[1] !== chavesCobranca.dados[1]) return;
      const d = e.query.state.data;
      if (d === ultimo) return;
      ultimo = d;
      void qc.invalidateQueries({ queryKey: chavesPlanilha.planilha });
    });
  }, [qc]);
  const q = useQuery<PlDados>({
    queryKey: chavesPlanilha.planilha,
    queryFn: lerPlanilha,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  /* pagamento informado em OUTRA sessão: o gatilho da mig 58 sobe a planilha_versao e a
     folha já chega amarela (~1,5 s), mas `entradas` está fora do realtime (mig 51) e os
     Dados — de onde o "Ver comprovante" tira o path — só viriam no polling de 30 s.
     Pendente na folha que os Dados ainda não têm → relê os Dados na hora (1x por entrada). */
  const folha = q.data;
  useEffect(() => {
    if (!folha) return;
    const dd = qc.getQueryData<Dados>(chavesCobranca.dados);
    if (!dd) return; // Dados ainda não carregaram: quando chegarem, já vêm com ela
    const novas = pendentesForaDosDados(folha, dd.pendentes ?? []).filter((id) => !dadosPedidos.has(id));
    if (!novas.length) return;
    for (const id of novas) dadosPedidos.add(id);
    void qc.invalidateQueries({ queryKey: chavesCobranca.dados });
  }, [folha, qc]);
  return q;
}

/** ids das entradas PENDENTES que a folha mostra (célula amarela) e que ainda não estão
    em `pendentes` (Dados.pendentes) */
export function pendentesForaDosDados(pl: Pick<PlDados, 'linhas'>, pendentes: readonly { id: string }[]): string[] {
  const tem = new Set(pendentes.map((x) => x.id));
  const out: string[] = [];
  for (const l of pl.linhas) {
    if (!l.e) continue;
    for (const x of Object.values(l.e)) if (x.st === 'pendente' && !tem.has(x.id)) out.push(x.id);
  }
  return out;
}

export type PlSalvarVars = PlItem[] | { itens: PlItem[]; origem?: string; rotulo?: string };
type MapaSenhas = Map<string, { inss: string; reclame: string }>;
interface SenhaAntes { leadId: string; campo: 'inss' | 'reclame'; antes: string; novo: string }
interface CtxSalvar {
  /** tocaSistema = texto em coluna ligada (campo/mês) de linha cliente → leads/pagamentos mudam */
  ger: number; muts: number[]; inverso: PlItem[]; tocaSistema: boolean; tocouSenha: boolean;
  tiraPagamento: boolean; senhasAntes: SenhaAntes[]; n: number; rotulo?: string;
}
const lerVars = (v: PlSalvarVars) => (Array.isArray(v)
  ? { itens: prepararItens(v), origem: undefined as string | undefined, rotulo: undefined as string | undefined }
  : { itens: prepararItens(v.itens), origem: v.origem, rotulo: v.rotulo });

/* coluna de senha em linha cliente: o texto NUNCA vai pra célula (vive cifrado) */
function campoSenha(l: PlLinha | undefined, c: PlColuna | undefined): 'inss' | 'reclame' | null {
  if (!l || !c || l.tipo !== 'cliente') return null;
  return c.campo === 'senha_inss' ? 'inss' : c.campo === 'reclame' ? 'reclame' : null;
}
/* a coluna de senha da grade lê de ['cobranca','senhas-grade'] → otimista lá */
function senhasOtimistas(qc: QueryClient, alvos: { leadId: string; campo: 'inss' | 'reclame'; valor: string }[]): SenhaAntes[] {
  const atual = alvos.length ? qc.getQueryData<MapaSenhas>(CHAVE_SENHAS) : undefined;
  if (!atual) return []; // sem permissão de ver senha: não há o que mostrar
  const m: MapaSenhas = new Map(atual);
  const antes: SenhaAntes[] = [];
  for (const a of alvos) {
    const e = m.get(a.leadId) ?? { inss: '', reclame: '' };
    antes.push({ leadId: a.leadId, campo: a.campo, antes: e[a.campo], novo: a.valor });
    m.set(a.leadId, a.campo === 'inss' ? { ...e, inss: a.valor } : { ...e, reclame: a.valor });
  }
  qc.setQueryData(CHAVE_SENHAS, m);
  return antes;
}
function reverterSenhas(qc: QueryClient, xs: SenhaAntes[]) {
  const atual = xs.length ? qc.getQueryData<MapaSenhas>(CHAVE_SENHAS) : undefined;
  if (!atual) return;
  const m: MapaSenhas = new Map(atual);
  for (const x of [...xs].reverse()) {
    const e = m.get(x.leadId);
    if (!e || e[x.campo] !== x.novo) continue; // outra edição já mexeu: não pisa
    m.set(x.leadId, x.campo === 'inss' ? { ...e, inss: x.antes } : { ...e, reclame: x.antes });
  }
  qc.setQueryData(CHAVE_SENHAS, m);
}

/** Salva células (digitar, colar, limpar, pintar). OTIMISTA: aplica na hora; as
    edições ficam pendentes (re-aplicadas sobre qualquer refetch) até o banco
    confirmar; em erro, SÓ aquelas células voltam e a mensagem sai em `error`
    (mutateAsync rejeita). Acima de 5000 células, grava em lotes na ordem.
    Aceita `mutate(itens)` ou `mutate({ itens, origem, rotulo })`. Resolve com
    { ok, avisos } (ex.: "PARCELA TOTAL '3,4O' não é número…"). */
export function useSalvarCelulas() {
  const qc = useQueryClient();
  return useMutation<PlSalvarResultado, Error, PlSalvarVars, CtxSalvar>({
    mutationKey: [...chavesPlanilha.escrita, 'celulas'],
    mutationFn: (v) => { const { itens, origem } = lerVars(v); return salvarEmLotes(itens, origem); },
    onMutate: (v) => {
      const { itens, rotulo } = lerVars(v);
      const d = qc.getQueryData<PlDados>(chavesPlanilha.planilha);
      const cols = new Map((d?.colunas ?? []).map((c) => [c.id, c]));
      const lins = new Map((d?.linhas ?? []).map((l) => [l.id, l]));
      const blocos = new Map((d?.blocos ?? []).map((b) => [b.id, b]));
      const lotes = fatiar(itens, LIMITE_ITENS);
      const muts = lotes.map(() => pend.novoMut());
      const camadas: Camada[] = [];
      const inverso: PlItem[] = [];
      const alvosSenha: { leadId: string; campo: 'inss' | 'reclame'; valor: string }[] = [];
      let tocaSistema = false; let tocouSenha = false; let tiraPagamento = false;
      lotes.forEach((lote, i) => {
        for (const it of lote) {
          const lin = lins.get(it.l); const col = cols.get(it.c);
          const temT = it.t !== undefined; const temS = it.s !== undefined;
          const senha = campoSenha(lin, col);
          // só texto de coluna campo/mês em linha cliente mexe no resto do sistema (coluna
          // livre, cabeçalho, cor: só a planilha). Linha/coluna fora do cache: por via das dúvidas, sim.
          if (temT && (!lin || !col || (lin.tipo === 'cliente' && (col.tipo === 'campo' || col.tipo === 'mes')))) tocaSistema = true;
          if (temT && senha) {
            tocouSenha = true;
            if (lin?.leadId) alvosSenha.push({ leadId: lin.leadId, campo: senha, valor: it.t ?? '' });
          }
          camadas.push({ k: 'cel', mut: muts[i], l: it.l, c: it.c, temT: temT && !senha, t: it.t ?? null, temS, s: it.s ?? null });
          // inverso pro Desfazer global = o que estava na tela antes
          const antes = lin?.c[it.c];
          const inv: PlItem = { l: it.l, c: it.c };
          if (temT) inv.t = antes?.t ?? null;
          if (temS) inv.s = antes?.s ?? null;
          inverso.push(inv);
          const ligaMes = col?.tipo === 'mes' && lin?.tipo === 'cliente' && !!lin.bloco && !!blocos.get(lin.bloco)?.compBase;
          if (temT && ligaMes && estadoMes(antes?.t).estado === 'nada' && estadoMes(it.t).estado !== 'nada') tiraPagamento = true;
        }
      });
      pend.empilhar(camadas);
      qc.setQueryData<PlDados>(chavesPlanilha.planilha, (old) => (old ? aplicarCamadas(old, camadas) : old));
      const senhasAntes = senhasOtimistas(qc, alvosSenha);
      return { ger: geracao, muts, inverso, tocaSistema, tocouSenha, tiraPagamento, senhasAntes, n: itens.length, rotulo };
    },
    onSuccess: (_r, _v, ctx) => {
      if (ctx && ctx.ger !== geracao) return; // sessão anterior: nada de cache nem Desfazer
      marcarEscrita();
      if (!ctx) { invalidar(qc, { dados: true }); return; }
      for (const m of ctx.muts) pend.confirmar(m);
      invalidar(qc, { dados: ctx.tocaSistema, senhas: ctx.tocouSenha });
      if (!ctx.n) return;
      const rot = ctx.rotulo || (ctx.n === 1 ? 'edição de 1 célula na planilha' : `edição de ${ctx.n} células na planilha`);
      // senha é só-escrita (não dá pra repor a anterior) → não oferece inverso errado
      if (ctx.tocouSenha) { registrarBloqueada(rot, 'Senha não volta pelo Desfazer — se precisar, digite a anterior na célula (trocar senha já gravada é só de gestor).'); return; }
      // desfazer aqui APAGARIA um pagamento: só financeiro/gestor podem
      if (ctx.tiraPagamento && !ehFinanceiroMais(papelDe(qc))) { registrarBloqueada(rot, 'Desfazer isto tiraria um pagamento da planilha, e isso é só do financeiro/gestor — peça a um deles ou ajuste a célula.'); return; }
      const inverso = ctx.inverso;
      registrarDesfazer({ rotulo: rot, inverso: async () => { await salvarEmLotes(inverso, 'desfazer'); } });
    },
    onError: (e, _v, ctx) => {
      if (ctx && ctx.ger !== geracao) return;
      if (!ctx) { invalidar(qc); return; }
      const feitos = e instanceof ErroLote ? e.feitos : 0;
      ctx.muts.forEach((m, i) => { if (i < feitos) pend.confirmar(m); });
      const volta = pend.descartar(ctx.muts.slice(feitos));
      if (volta) qc.setQueryData(chavesPlanilha.planilha, volta);
      reverterSenhas(qc, ctx.senhasAntes);
      // parte gravada (lotes) ou senha mexida: relê o resto do sistema também
      invalidar(qc, { dados: feitos > 0 && ctx.tocaSistema, senhas: ctx.tocouSenha });
    },
  });
}

interface CtxColuna { ger: number; mut: number | null; antes?: PlColuna }
/** Operações de coluna (criar/alterar/excluir). `alterar` (largura, ocultar,
    título, ordem) é otimista. Resolve com o id da coluna criada (ou null).
    Largura/ocultar são ajuste de layout: NÃO ocupam o Desfazer global (nível
    único) — a última ação importante continua desfazível. */
export function useColunaOps() {
  const qc = useQueryClient();
  return useMutation<string | null, Error, PlColunaOp, CtxColuna>({
    mutationKey: [...chavesPlanilha.escrita, 'coluna'],
    mutationFn: (op) => enfileirar(async () => {
      const r = getPlanilhaRepo();
      if (op.op === 'criar') return r.colunaCriar({ ref: op.ref, lado: op.lado, tipo: op.tipo, titulo: op.titulo, cab: op.cab });
      if (op.op === 'alterar') { await r.colunaAlterar(op.coluna, op.patch); return null; }
      await r.colunaExcluir(op.coluna);
      return null;
    }),
    onMutate: (op) => {
      const d = qc.getQueryData<PlDados>(chavesPlanilha.planilha);
      const antes = d?.colunas.find((c) => c.id === (op.op === 'criar' ? op.ref : op.coluna));
      if (op.op !== 'alterar') return { ger: geracao, mut: null, antes };
      const mut = pend.novoMut();
      const cam: Camada = { k: 'col', mut, id: op.coluna, patch: normalizarPatchColuna(op.patch) };
      pend.empilhar([cam]);
      qc.setQueryData<PlDados>(chavesPlanilha.planilha, (old) => (old ? aplicarCamadas(old, [cam]) : old));
      return { ger: geracao, mut, antes };
    },
    onSuccess: (id, op, ctx) => {
      if (ctx && ctx.ger !== geracao) return; // sessão anterior
      marcarEscrita();
      if (ctx?.mut != null) pend.confirmar(ctx.mut);
      invalidar(qc);
      const r = getPlanilhaRepo();
      if (op.op === 'criar') {
        const rot = `nova coluna "${op.titulo || (op.tipo === 'mes' ? 'mês' : 'livre')}"`;
        if (op.tipo === 'mes') { registrarBloqueada(rot, 'Coluna de mês não se exclui — se não usar, é só ocultar.'); return; }
        if (!id) return;
        if (!ehGestor(papelDe(qc))) { registrarBloqueada(rot, 'Excluir coluna é só de gestor/admin — se não usar, oculte a coluna.'); return; }
        registrarDesfazer({ rotulo: rot, destrutivo: true, inverso: () => enfileirar(() => r.colunaExcluir(id)) });
        return;
      }
      if (op.op === 'excluir') {
        registrarBloqueada(`excluir a coluna "${ctx?.antes?.titulo ?? ''}"`, 'A coluna saiu com o texto dela — não dá pra desfazer por aqui.');
        return;
      }
      const antes = ctx?.antes; if (!antes) return;
      // só largura/ocultar (arrastar a borda, "Ocultar"): ajuste de layout, não toma o slot
      if (op.patch.titulo === undefined && op.patch.ordem === undefined) return;
      const volta: PlColunaPatch = {};
      if (op.patch.titulo !== undefined) volta.titulo = antes.titulo;
      if (op.patch.largura !== undefined) volta.largura = antes.largura;
      if (op.patch.oculta !== undefined) volta.oculta = antes.oculta;
      if (op.patch.ordem !== undefined) volta.ordem = antes.ordem;
      if (!Object.keys(volta).length) return;
      registrarDesfazer({ rotulo: `ajuste da coluna "${antes.titulo}"`, inverso: () => enfileirar(() => r.colunaAlterar(op.coluna, volta)) });
    },
    onError: (_e, _op, ctx) => {
      if (ctx && ctx.ger !== geracao) return;
      if (ctx?.mut != null) {
        const volta = pend.descartar([ctx.mut]);
        if (volta) qc.setQueryData(chavesPlanilha.planilha, volta);
      }
      invalidar(qc);
    },
  });
}

interface CtxLinha {
  ger: number; mut: number | null; tipo?: TipoLinha; leadCap?: GLinha | null;
  volta?: { ref: string; lado: LadoLinha } | null;
}
/** Operações de linha (inserir/excluir/mover). `mover` é otimista. Resolve com
    o id da linha inserida (ou null). Excluir cliente = Lixeira (Desfazer
    restaura e o banco religa a linha). */
export function useLinhaOps() {
  const qc = useQueryClient();
  return useMutation<string | null, Error, PlLinhaOp, CtxLinha>({
    mutationKey: [...chavesPlanilha.escrita, 'linha'],
    mutationFn: (op) => enfileirar(async () => {
      const r = getPlanilhaRepo();
      if (op.op === 'inserir') return r.linhaInserir(op.ref, op.lado, op.tipo);
      if (op.op === 'excluir') { await r.linhaExcluir(op.linha); return null; }
      await r.linhaMover(op.linha, op.ref, op.lado);
      return null;
    }),
    onMutate: (op) => {
      const d = qc.getQueryData<PlDados>(chavesPlanilha.planilha);
      if (op.op === 'inserir') return { ger: geracao, mut: null, tipo: op.tipo };
      const linhas = d?.linhas ?? [];
      const i = linhas.findIndex((x) => x.id === op.linha);
      const ln = linhas[i];
      if (op.op === 'excluir') {
        // captura o cliente (Dados) ANTES: o Desfazer restaura da Lixeira por ele
        const leadCap = ln?.leadId ? (qc.getQueryData<Dados>(chavesCobranca.dados)?.linhas.find((g) => g.id === ln.leadId) ?? null) : null;
        return { ger: geracao, mut: null, tipo: ln?.tipo, leadCap };
      }
      if (!ln) return { ger: geracao, mut: null };
      // vizinha pra voltar (Desfazer) — de preferência do MESMO bloco
      const ant = linhas[i - 1]; const prox = linhas[i + 1];
      const volta = ant && ant.bloco === ln.bloco ? { ref: ant.id, lado: 'abaixo' as const }
        : prox && prox.bloco === ln.bloco ? { ref: prox.id, lado: 'acima' as const }
          : ant ? { ref: ant.id, lado: 'abaixo' as const } : prox ? { ref: prox.id, lado: 'acima' as const } : null;
      const ref = linhas.find((x) => x.id === op.ref && x.id !== op.linha);
      if (!ref) return { ger: geracao, mut: null, tipo: ln.tipo, volta };
      // mesma conta do pl_ordem_linha: sem folga, as vizinhas andam ±1000 (camadas
      // absolutas, então reaplicar por cima de uma leitura já empurrada não soma de novo)
      const { ordem, empurrar } = ordemComFolga(linhas, ref.ordem, op.lado === 'abaixo', op.linha);
      const bloco = ln.tipo === 'cliente' && ref.bloco && ref.bloco !== ln.bloco ? ref.bloco : undefined;
      const mut = pend.novoMut();
      const cams: Camada[] = [...empurrar].map(([id, o]) => ({ k: 'lin' as const, mut, id, ordem: o }));
      cams.push({ k: 'lin', mut, id: op.linha, ordem, bloco });
      pend.empilhar(cams);
      qc.setQueryData<PlDados>(chavesPlanilha.planilha, (old) => (old ? aplicarCamadas(old, cams) : old));
      return { ger: geracao, mut, tipo: ln.tipo, volta };
    },
    onSuccess: (id, op, ctx) => {
      if (ctx && ctx.ger !== geracao) return; // sessão anterior
      marcarEscrita();
      if (ctx?.mut != null) pend.confirmar(ctx.mut);
      const cliente = ctx?.tipo === 'cliente';
      invalidar(qc, { dados: cliente || op.op === 'inserir', lixeira: op.op === 'excluir' && cliente });
      const r = getPlanilhaRepo();
      if (op.op === 'inserir') {
        if (!id) return;
        if (op.tipo === 'cliente') {
          if (!ehGestor(papelDe(qc))) { registrarBloqueada('novo cliente na planilha', 'Excluir cliente é só de gestor/admin — peça a um gestor ou use a Lixeira.'); return; }
          registrarDesfazer({ rotulo: 'novo cliente na planilha', destrutivo: true, inverso: () => enfileirar(() => r.linhaExcluir(id)) });
          return;
        }
        if (!ehFinanceiroMais(papelDe(qc))) { registrarBloqueada('nova linha na planilha', 'Apagar linha é do financeiro/gestor.'); return; }
        registrarDesfazer({ rotulo: 'nova linha na planilha', inverso: () => enfileirar(() => r.linhaExcluir(id)) });
        return;
      }
      if (op.op === 'excluir') {
        const cap = ctx?.leadCap;
        if (cliente && cap) {
          registrarDesfazer({ rotulo: `exclusão de ${cap.nome || 'cliente'}`, inverso: async () => { await getCobrancaRepo().restaurarExcluido(cap); } });
          return;
        }
        registrarBloqueada('excluir linha da planilha', cliente
          ? 'O cliente foi pra Lixeira — restaure por lá (a linha volta sozinha).'
          : 'A linha saiu com o texto dela — não dá pra desfazer por aqui.');
        return;
      }
      const volta = ctx?.volta;
      if (volta) registrarDesfazer({ rotulo: 'mover linha na planilha', inverso: () => enfileirar(() => r.linhaMover(op.linha, volta.ref, volta.lado)) });
    },
    onError: (_e, _op, ctx) => {
      if (ctx && ctx.ger !== geracao) return;
      if (ctx?.mut != null) {
        const volta = pend.descartar([ctx.mut]);
        if (volta) qc.setQueryData(chavesPlanilha.planilha, volta);
      }
      invalidar(qc);
    },
  });
}
