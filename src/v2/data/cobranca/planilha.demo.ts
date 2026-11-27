/* =====================================================================
   Planilha "Excel 2.0" — repositório DEMO (localStorage 'alfa_planilha_v2').
   Semeado a partir do store demo (demoStore, 'alfa_gestao_v4'): um bloco
   por ciclo (ordem dos chips), cabeçalho com os títulos, as linhas dos
   clientes e NOVOS no fim. LIGADO ao store nos dois sentidos com as MESMAS
   regras da migration 57 (demo é o contrato):
   - planilha → store (planilha_salvar): editar célula ligada muda o GLinha
     (nome, valor, células de mês…) com os mesmos parsers e avisos;
   - store → planilha (os gatilhos reversos): a cada leitura, o que mudou
     FORA da planilha (ficha, marcar célula, cadastro, excluir…) reescreve o
     texto da célula (só se ela já não disser o mesmo), move a linha pro fim
     do bloco certo, cria/oculta/religa linhas e abre a coluna do mês seguinte.
   "O que mudou fora" = diferença contra um retrato (snap) dos campos ligados
   gravado na última sincronização — faz o papel do set_config('planilha.sync').
   Sem papéis: o demo roda como gestor (igual ao resto do demo). Nunca há dado
   real aqui: tudo vem do seed sintético do demoStore.
   ===================================================================== */
import { decididasCarregar, garantirComp, gsCarregar, gsSalvar } from './demoStore';
import type { Dados, EntradaDecidida, GLinha, SitDebito } from './types';
import {
  LIMITE_ITENS, btrim, compSoma, dataCurta, dataNoTexto, ehEstadoPagamento, estadoMes, extrairTelefone,
  fmtDataCurta, fmtValorBR, mesesEntre, normalizarPatchColuna, ordemComFolga, prepararItens,
  textoEquivale, textoMes, valorBR,
  type CampoLigado, type EntradaCel, type Estilo, type PlBloco, type PlCelula, type PlColuna, type PlDados,
  type PlLinha, type PlanilhaRepo, type TipoLinha,
} from './planilha';

export const PL_LS = 'alfa_planilha_v2';   // v2 (29/09): re-semeia da Gestão demo v4 (pagos = líquido)

/* campos ligados que têm TEXTO na célula (senha/reclame vivem fora da célula) */
const CAMPOS_TEXTO = ['fechamento', 'comercial', 'nome', 'nb', 'banco', 'cpf', 'valor', 'parou', 'telefone'] as const;
type CampoTexto = (typeof CAMPOS_TEXTO)[number];

/** retrato dos campos ligados na última sincronização (por lead) */
interface Retrato {
  fechamento: string; comercial: string; nome: string; nb: string; banco: string; cpf: string;
  valor: number; parou: string; telefone: string; dia: number; situacao: SitDebito;
  cel: Record<string, string>; // comp → célula do store (só as ≠ '-')
}
/** linha guardada: cliente na Lixeira fica com leadId null + leadAntigo (restaurar religa) */
interface LinhaDemo extends PlLinha { leadAntigo?: string }
/** mm = quando o pagamento (lead, comp) mudou por último, visto pela planilha (ISO;
    chave `lead\0comp`) — a recusa do financeiro só pinta a célula se for mais nova */
interface Folha { v: 1; blocos: PlBloco[]; colunas: PlColuna[]; linhas: LinhaDemo[]; snap: Record<string, Retrato>; mm?: Record<string, string> }

/* as 10 colunas-campo A..J da planilha do cliente (+ meses; TELEFONE vai logo depois do CPF) */
const BASE: { campo: CampoLigado; titulo: string; cab: string; largura: number }[] = [
  { campo: 'fechamento', titulo: 'DATA FECHAMENTO', cab: 'DATA FECHAMENTO', largura: 96 },
  { campo: 'comercial', titulo: 'COMERCIAL', cab: 'COMERCIAL', largura: 104 },
  { campo: 'nome', titulo: 'CLIENTE', cab: 'CLIENTE', largura: 280 },
  { campo: 'nb', titulo: 'NB', cab: 'NB', largura: 120 },
  { campo: 'banco', titulo: 'BANCO', cab: 'BANCO', largura: 110 },
  { campo: 'cpf', titulo: 'CPF', cab: 'CPF', largura: 120 },
  { campo: 'senha_inss', titulo: 'SENHA INSS', cab: 'SENHA INSS', largura: 110 },
  { campo: 'valor', titulo: 'PARCELA TOTAL', cab: 'PARCELA TOTAL', largura: 104 },
  { campo: 'reclame', titulo: 'RECLAME AQUI', cab: 'SENHA RECLAME AQUI E DATA RECLAMAÇAO', largura: 220 },
  { campo: 'parou', titulo: 'DATA QUE PAROU', cab: 'DATA QUE PAROU O DEBITO', largura: 190 },
];

const pad2 = (n: number) => String(n).padStart(2, '0');
const porOrdem = (a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem;
function novoId(): string {
  try { return crypto.randomUUID(); } catch { return `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`; }
}
function compAtual(): string { const n = new Date(); return `${n.getFullYear()}-${pad2(n.getMonth() + 1)}`; }
/* célula do store: '' e ausente = '-' (sem pagamento) */
const celNorm = (x: string | undefined | null) => (x == null || x.trim() === '' ? '-' : x);
const mesmoEstilo = (a: Estilo | null | undefined, b: Estilo | null | undefined) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/* ---------------------------- persistência ---------------------------- */

function lerFolha(): Folha | null {
  try {
    const raw = localStorage.getItem(PL_LS);
    if (!raw) return null;
    const p = JSON.parse(raw) as Folha;
    if (p && p.v === 1 && Array.isArray(p.blocos) && Array.isArray(p.colunas) && p.colunas.length
      && Array.isArray(p.linhas) && p.snap && typeof p.snap === 'object') return arrumarLayout(p);
  } catch { /* blob corrompido: semeia de novo */ }
  return null;
}
/** layout de 25/09 (dono): TELEFONE logo depois do CPF e meses com 96px (o "NÃO PAGOU" cabe).
    Ajusta folhas demo já gravadas; só mexe no que ainda está no layout antigo */
function arrumarLayout(f: Folha): Folha {
  const cpf = f.colunas.find((c) => c.campo === 'cpf');
  const tel = f.colunas.find((c) => c.campo === 'telefone');
  if (cpf && tel && tel.ordem > cpf.ordem) {
    const depois = f.colunas.filter((c) => c.ordem > cpf.ordem && c.id !== tel.id).sort((a, b) => a.ordem - b.ordem)[0];
    if (depois && tel.ordem > depois.ordem) tel.ordem = (cpf.ordem + depois.ordem) / 2;
  }
  for (const c of f.colunas) if (c.tipo === 'mes' && c.largura === 84) c.largura = 96;
  // a coluna de telefone ganha título nos cabeçalhos dos blocos (igual à planilha real — mig 60)
  if (tel) for (const l of f.linhas) if (l.tipo === 'cabecalho' && !(l.c[tel.id]?.t ?? '').trim()) l.c[tel.id] = { t: 'TELEFONE', s: l.c[tel.id]?.s ?? null };
  return f;
}
function gravarFolha(f: Folha) {
  try { localStorage.setItem(PL_LS, JSON.stringify(f)); } catch {
    throw new Error('O navegador não deixou gravar a planilha de demonstração (sem espaço?).');
  }
}

/* ------------------------------ helpers ------------------------------ */

/** valor do campo no lead, como o banco compara (texto; valor como número) */
function valorCampo(l: GLinha, campo: CampoTexto): string | number {
  if (campo === 'valor') return Number(l.valor ?? 0);
  return String(l[campo] ?? '');
}
/** pl_mes_ref: 1º mês PAGO do cliente ('YYYY-MM') — referência do ano das datas
    curtas sem ano (fechamento/parou/reclamação); sem pagamento → null */
function mesRef(l: GLinha, comps: readonly string[]): string | null {
  let r: string | null = null;
  for (let i = 0; i < comps.length; i++) {
    if (estadoMes(l.celulas[i]).estado === 'pago' && (r == null || comps[i] < r)) r = comps[i];
  }
  return r;
}
/** pl_campo_reflete: texto que o gatilho escreve quando o campo muda fora
    (fechamento: DD/mmm, ou DD/MM/AAAA se o curto leria outro ano) */
function textoCampo(l: GLinha, campo: CampoTexto, comps: readonly string[]): string | null {
  if (campo === 'valor') return fmtValorBR(Number(l.valor ?? 0));
  if (campo === 'fechamento') return fmtDataCurta(l.fechamento ?? '', mesRef(l, comps)) || null;
  return String(l[campo] ?? '') || null;
}
function retratoDe(l: GLinha, comps: string[]): Retrato {
  const cel: Record<string, string> = {};
  comps.forEach((comp, i) => { const v = celNorm(l.celulas[i]); if (v !== '-') cel[comp] = v; });
  return {
    fechamento: l.fechamento ?? '', comercial: l.comercial ?? '', nome: l.nome ?? '', nb: l.nb ?? '',
    banco: l.banco ?? '', cpf: l.cpf ?? '', valor: Number(l.valor ?? 0), parou: l.parou ?? '',
    telefone: l.telefone ?? '', dia: l.dia, situacao: l.situacao, cel,
  };
}
const chaveLeadComp = (leadId: string, comp: string) => `${leadId}\u0000${comp}`;
/** o pagamento (lead, comp) mudou agora: edição na grade = na hora; mudança FORA =
    quando a leitura notou (reconciliar) */
function marcarMudancaPagamento(f: Folha, leadId: string, comp: string) {
  (f.mm ??= {})[chaveLeadComp(leadId, comp)] = new Date().toISOString();
}
/** pl_set_texto: grava o texto (mantém o estilo); texto e estilo vazios = célula some */
function escrever(ln: PlLinha, col: string, t: string | null) {
  const tt = t === '' ? null : t;
  const s = ln.c[col]?.s ?? null;
  if (tt == null && s == null) delete ln.c[col]; else ln.c[col] = { t: tt, s };
}
/** célula do STORE → (status, valor) de pagamentos. O "-" do demo é o limpar
    (= 'fora' no real); `semLinhaNoTraco` trata "-" como "sem pagamento". */
function pagamentoDe(cel: string, semLinhaNoTraco = false): { st: 'pago' | 'nao_pagou' | 'fora' | null; valor: number | null; livre?: string } {
  const s = cel.trim();
  if (s === '' || (s === '-' && semLinhaNoTraco)) return { st: null, valor: null };
  if (s === '-') return { st: 'fora', valor: null };
  const e = estadoMes(s);
  if (e.estado === 'nao_pagou') return { st: 'nao_pagou', valor: null };
  if (e.estado === 'pago') return { st: 'pago', valor: e.valor };
  return { st: null, valor: null, livre: cel }; // texto livre legado do demo (ex.: data)
}
/** texto da célula de mês a partir da célula do store (pl_mes_texto) */
function textoMesDemo(cel: string, atual: string | null, semLinhaNoTraco = false): string | null {
  const p = pagamentoDe(cel, semLinhaNoTraco);
  if (p.livre != null) return p.livre;
  return textoMes(atual, p.st, p.valor);
}
function ordenadas(f: Folha, sem?: string): LinhaDemo[] {
  return f.linhas.filter((x) => x.id !== sem).sort(porOrdem);
}
/** o "abrir espaço" do banco: quem ficou sem folga anda ±1000 (ordemComFolga) */
function empurrarOrdens(itens: { id: string; ordem: number }[], empurrar: ReadonlyMap<string, number>) {
  if (!empurrar.size) return;
  for (const x of itens) { const o = empurrar.get(x.id); if (o !== undefined) x.ordem = o; }
}
/** pl_ordem_linha: ordem antes/depois de uma referência (entre TODAS as linhas);
    sem folga (< 1e-6), empurra as seguintes (+1000) ou as anteriores (−1000) */
function ordemLinha(f: Folha, refOrdem: number, depois: boolean, sem?: string): number {
  const { ordem, empurrar } = ordemComFolga(f.linhas, refOrdem, depois, sem);
  empurrarOrdens(f.linhas, empurrar);
  return ordem;
}
/** pl_ordem_coluna: idem, entre as colunas */
function ordemColuna(f: Folha, refOrdem: number, depois: boolean): number {
  const { ordem, empurrar } = ordemComFolga(f.colunas, refOrdem, depois);
  empurrarOrdens(f.colunas, empurrar);
  return ordem;
}
/** pl_fim_do_bloco: depois da última linha do bloco, antes da próxima da folha
    (sem folga, a próxima e as de baixo andam +1000 — 60 clientes no fim do mesmo
    bloco não colidem com o cabeçalho/linha em branco de baixo) */
function fimDoBloco(f: Folha, blocoId: string, sem?: string): number {
  let ult: number | undefined;
  let max: number | undefined;
  for (const x of f.linhas) {
    if (x.id === sem) continue;
    if (max === undefined || x.ordem > max) max = x.ordem;
    if (x.bloco === blocoId && (ult === undefined || x.ordem > ult)) ult = x.ordem;
  }
  if (ult === undefined) return (max ?? 0) + 1000;
  return ordemLinha(f, ult, true, sem);
}
/** pl_bloco_vizinho: bloco de uma linha solta = o mais próximo acima; senão abaixo */
function blocoVizinho(f: Folha, ordem: number, sem?: string): string | null {
  const ord = ordenadas(f, sem);
  const acima = [...ord].reverse().find((x) => x.bloco != null && x.ordem <= ordem);
  if (acima) return acima.bloco;
  return ord.find((x) => x.bloco != null && x.ordem > ordem)?.bloco ?? null;
}
function maxMesPos(f: Folha): number {
  return f.colunas.reduce((m, c) => (c.tipo === 'mes' && c.mesPos != null ? Math.max(m, c.mesPos) : m), -1);
}
/** pl_coluna_mes_nova: coluna do mês k (depois da última de mês) já preenchida
    com os pagamentos que existem pra ele */
function criarColunaMes(f: Folha, d: Dados, k: number, ordem?: number): PlColuna {
  const existe = f.colunas.find((c) => c.tipo === 'mes' && c.mesPos === k);
  if (existe) return existe;
  let o = ordem;
  if (o == null) {
    const cols = [...f.colunas].sort(porOrdem);
    const mesesOrd = cols.filter((c) => c.tipo === 'mes');
    const ult = mesesOrd.length ? mesesOrd[mesesOrd.length - 1].ordem : cols[cols.length - 1]?.ordem;
    o = ult == null ? 1000 : ordemColuna(f, ult, true);
  }
  const col: PlColuna = { id: novoId(), ordem: o, titulo: `Mês ${k + 1}`, tipo: 'mes', campo: null, mesPos: k, largura: 96, oculta: false };
  f.colunas.push(col);
  const leads = new Map(d.linhas.map((l) => [l.id, l]));
  for (const ln of f.linhas) {
    if (ln.tipo !== 'cliente' || !ln.leadId) continue;
    const bl = f.blocos.find((b) => b.id === ln.bloco);
    const lead = leads.get(ln.leadId);
    if (!bl?.compBase || !lead) continue;
    const i = d.comps.indexOf(compSoma(bl.compBase, k));
    if (i < 0) continue;
    const p = pagamentoDe(celNorm(lead.celulas[i]), true);
    if (p.st) escrever(ln, col.id, textoMes(null, p.st, p.valor));
  }
  return col;
}
/** pl_reescrever_meses: todas as células de mês da linha a partir do store (notas ficam).
    soPagamento (troca de bloco): só mexe onde HÁ pagamento e a célula não é nota —
    o que foi digitado sem pagamento nunca é apagado. */
function reescreverMeses(f: Folha, d: Dados, ln: PlLinha, l: GLinha, soPagamento = false) {
  const bl = f.blocos.find((b) => b.id === ln.bloco);
  if (!bl?.compBase) return;
  for (const c of f.colunas) {
    if (c.tipo !== 'mes' || c.mesPos == null) continue;
    const i = d.comps.indexOf(compSoma(bl.compBase, c.mesPos));
    const cel = i >= 0 ? celNorm(l.celulas[i]) : '-';
    const atual = ln.c[c.id]?.t ?? null;
    if (soPagamento && (pagamentoDe(cel, true).st == null || !ehEstadoPagamento(atual))) continue;
    const novo = textoMesDemo(cel, atual, true);
    if (novo !== atual) escrever(ln, c.id, novo);
  }
}
/** pl_meses_trocar_base — a linha trocou de bloco; as células de mês acompanham o
    SEU mês (competência):
    - base nova null (foi p/ NOVOS) ou igual à anterior → nada muda;
    - saindo de NOVOS (base anterior null): o texto digitado fica (em NOVOS o mês é
      só texto); só escreve onde há pagamento;
    - entre blocos com base diferente (D24..D30 ↔ D01..D07): texto+estilo andam para a
      coluna do mesmo mês (k novo = k antigo − Δ). Mês sem coluna no bloco novo: estado
      (número, NÃO PAGOU, '-', só cor) sai da grade (o pagamento continua no sistema);
      nota fica na coluna antiga se ela ficar livre (o real ainda deixa no registro a
      que não coube — o demo não tem registro).
    Por fim, onde há pagamento e a célula não é nota, o texto segue o pagamento. */
function realinharMeses(f: Folha, d: Dados, ln: PlLinha, l: GLinha, baseAnt: string | null, baseNova: string | null) {
  if (!baseNova || baseNova === baseAnt) return;
  if (baseAnt) {
    const delta = mesesEntre(baseAnt, baseNova);
    const colDoK = new Map<number, string>();
    for (const c of f.colunas) if (c.tipo === 'mes' && c.mesPos != null) colDoK.set(c.mesPos, c.id);
    const cels: { de: string; k: number; cel: PlCelula }[] = [];
    for (const c of f.colunas) {
      if (c.tipo !== 'mes' || c.mesPos == null || !ln.c[c.id]) continue;
      cels.push({ de: c.id, k: c.mesPos - delta, cel: ln.c[c.id] });
      delete ln.c[c.id];
    }
    for (const x of cels) {
      const para = colDoK.get(x.k);
      if (para) ln.c[para] = { t: x.cel.t, s: x.cel.s };
    }
    for (const x of cels) {
      if (colDoK.has(x.k) || ehEstadoPagamento(x.cel.t)) continue;
      if (!ln.c[x.de]) ln.c[x.de] = { t: x.cel.t, s: x.cel.s };
    }
  }
  reescreverMeses(f, d, ln, l, true);
}
/** cabeçalho de um bloco no seed: títulos + a data do INSS de cada mês (DD/MM/AAAA) */
function preencherCabecalho(f: Folha, ln: PlLinha, bl: PlBloco) {
  for (const c of f.colunas) {
    if (c.tipo === 'campo') { const b = BASE.find((x) => x.campo === c.campo); if (b) escrever(ln, c.id, b.cab); }
    else if (c.tipo === 'mes' && c.mesPos != null && bl.compBase && bl.dia) {
      const [y, m] = compSoma(bl.compBase, c.mesPos).split('-');
      escrever(ln, c.id, `${pad2(bl.dia)}/${m}/${y}`);
    }
  }
}
/** células de uma linha cliente a partir do lead. seed = texto cru do store (inclusive
    "-"); linha nova (pl_preencher_linha) = formatadores, valor 0 e mês vazio sem texto. */
function preencherCliente(f: Folha, ln: PlLinha, l: GLinha, d: Dados, seed: boolean) {
  for (const c of f.colunas) {
    if (c.tipo !== 'campo' || !c.campo || !(CAMPOS_TEXTO as readonly string[]).includes(c.campo)) continue;
    const campo = c.campo as CampoTexto;
    escrever(ln, c.id, campo === 'valor' && !Number(l.valor) ? null : textoCampo(l, campo, d.comps));
  }
  const bl = f.blocos.find((b) => b.id === ln.bloco);
  if (bl?.compBase) {
    for (const c of f.colunas) {
      if (c.tipo !== 'mes' || c.mesPos == null) continue;
      const i = d.comps.indexOf(compSoma(bl.compBase, c.mesPos));
      if (i < 0) continue;
      const cel = celNorm(l.celulas[i]);
      escrever(ln, c.id, seed ? cel : textoMesDemo(cel, null, true));
    }
  }
  f.snap[l.id] = retratoDe(l, d.comps);
}
/** o bloco define dia/situação do lead (NOVOS não tem dia: o do lead fica) */
function aplicarBlocoNoLead(l: GLinha, bl: PlBloco) {
  // Novos → cobrança só pelo fluxo do débito parado (igual ao planilha_linha_mover):
  // sem pedido pendente recusa; com pedido, arrastar = aprovar (aprovar_parado)
  if (l.situacao === 'ativo' && bl.situacao === 'cancelado') {
    if (!l.paradoPendente) throw new Error('Para levar um cliente dos Novos para a cobrança, marque "débito parado" nos Novos — a aprovação coloca no ciclo.');
    l.paradoAprovadoNome = 'Você'; l.paradoAprovadoEm = new Date().toISOString();
  }
  l.situacao = bl.situacao;
  l.dia = bl.dia ?? l.dia; // NOVOS mantém o dia (coalesce(b.dia, ld.dia) no banco)
  if (bl.situacao === 'cancelado') l.paradoPendente = false; // igual ao guard do banco
}

/* ------------------------------ blocos ------------------------------ */

/** pl_bloco_para: 'ativo' → NOVOS; 'cancelado' → bloco do dia (cria Dnn no fim da
    folha, com comp_base e cabeçalho copiados do D24/D01 ou do mais parecido);
    cancelado sem dia ("aguardando ciclo") → null (a linha fica onde está). */
function blocoPara(f: Folha, situacao: SitDebito, dia: number): PlBloco | null {
  if (situacao === 'ativo') {
    const b = f.blocos.find((x) => x.id === 'NOVOS') ?? f.blocos.find((x) => x.situacao === 'ativo');
    if (b) return b;
    const novo: PlBloco = { id: 'NOVOS', dia: null, situacao: 'ativo', compBase: null };
    f.blocos.push(novo);
    return novo;
  }
  if (!(dia >= 1 && dia <= 31)) return null;
  const achou = f.blocos.find((b) => b.situacao === 'cancelado' && b.dia === dia);
  if (achou) return achou;
  const ciclos = f.blocos.filter((b) => b.situacao === 'cancelado' && b.compBase && b.dia != null);
  const modelo = ciclos.find((b) => b.id === (dia >= 15 ? 'D24' : 'D01'))
    ?? [...ciclos].sort((a, b) => {
      const la = ((a.dia ?? 0) >= 15) === (dia >= 15) ? 0 : 1; const lb = ((b.dia ?? 0) >= 15) === (dia >= 15) ? 0 : 1;
      return la - lb || Math.abs((a.dia ?? 0) - dia) - Math.abs((b.dia ?? 0) - dia) || a.id.localeCompare(b.id);
    })[0];
  let id = `D${pad2(dia)}`;
  if (f.blocos.some((b) => b.id === id)) id = `${id}-${novoId().replace(/-/g, '').slice(0, 4)}`;
  const bl: PlBloco = { id, dia, situacao: 'cancelado', compBase: modelo?.compBase ?? compAtual() };
  f.blocos.push(bl);
  const cab: LinhaDemo = { id: novoId(), ordem: (ordenadas(f).pop()?.ordem ?? 0) + 1000, tipo: 'cabecalho', bloco: id, leadId: null, altura: null, c: {} };
  const cabModelo = modelo ? ordenadas(f).find((x) => x.tipo === 'cabecalho' && x.bloco === modelo.id) : undefined;
  if (cabModelo) for (const [k, v] of Object.entries(cabModelo.c)) cab.c[k] = { t: v.t ?? null, s: v.s ?? null };
  f.linhas.push(cab);
  return bl;
}
/** pl_mover_para_bloco: fim do outro bloco; mês-base mudou → realinha os meses */
function moverParaBloco(f: Folha, d: Dados, ln: LinhaDemo, bl: PlBloco, l: GLinha | undefined) {
  const baseAnt = f.blocos.find((b) => b.id === ln.bloco)?.compBase ?? null;
  ln.ordem = fimDoBloco(f, bl.id, ln.id);
  ln.bloco = bl.id;
  if (l) realinharMeses(f, d, ln, l, baseAnt, bl.compBase);
}

/* ------------------------------- seed ------------------------------- */

function semear(d: Dados): Folha {
  const f: Folha = { v: 1, blocos: [], colunas: [], linhas: [], snap: {} };
  let oc = 0;
  for (const b of BASE) f.colunas.push({ id: `pc-${b.campo}`, ordem: (oc += 1000), titulo: b.titulo, tipo: 'campo', campo: b.campo, mesPos: null, largura: b.largura, oculta: false });
  d.comps.forEach((_, k) => f.colunas.push({ id: `pc-m${k}`, ordem: (oc += 1000), titulo: `Mês ${k + 1}`, tipo: 'mes', campo: null, mesPos: k, largura: 96, oculta: false }));
  // TELEFONE logo depois do CPF (dono 25/09)
  const oCpf = f.colunas.find((c) => c.campo === 'cpf')?.ordem ?? oc;
  f.colunas.push({ id: 'pc-telefone', ordem: oCpf + 500, titulo: 'TELEFONE', tipo: 'campo', campo: 'telefone', mesPos: null, largura: 136, oculta: false });

  const base = d.comps[0] ?? compAtual();
  // blocos na ordem dos chips (ciclosOrdem); sem ela, como a planilha do cliente: D≥15 antes
  const dias = [...new Set(d.linhas.filter((l) => l.situacao === 'cancelado' && l.dia >= 1).map((l) => l.dia))];
  const pref = (d.ciclosOrdem ?? []).filter((x) => dias.includes(x));
  const peso = (x: number) => (x >= 15 ? x : x + 100);
  const ordemDias = [...pref, ...dias.filter((x) => !pref.includes(x)).sort((a, b) => peso(a) - peso(b))];

  let ol = 0;
  const nova = (tipo: TipoLinha, bloco: string | null, leadId: string | null): LinhaDemo => {
    const ln: LinhaDemo = { id: novoId(), ordem: (ol += 1000), tipo, bloco, leadId, altura: null, c: {} };
    f.linhas.push(ln);
    return ln;
  };
  ordemDias.forEach((dia, i) => {
    if (i > 0) nova('vazia', null, null); // linha em branco separa os blocos
    const bl: PlBloco = { id: `D${pad2(dia)}`, dia, situacao: 'cancelado', compBase: base };
    f.blocos.push(bl);
    preencherCabecalho(f, nova('cabecalho', bl.id, null), bl);
    for (const l of d.linhas) if (l.situacao === 'cancelado' && l.dia === dia) preencherCliente(f, nova('cliente', bl.id, l.id), l, d, true);
  });
  // NOVOS: rótulo + clientes 'ativo' (sem ciclo: comp_base null → mês é só texto)
  f.blocos.push({ id: 'NOVOS', dia: null, situacao: 'ativo', compBase: null });
  escrever(nova('rotulo', 'NOVOS', null), 'pc-nome', 'NOVOS');
  for (const l of d.linhas) if (l.situacao === 'ativo') preencherCliente(f, nova('cliente', 'NOVOS', l.id), l, d, true);
  return arrumarLayout(f);
}

/* ------------------- store → planilha (os "gatilhos") ------------------- */

function reconciliar(f: Folha, d: Dados): boolean {
  let mudou = false;
  const leads = new Map(d.linhas.map((l) => [l.id, l]));
  // lead que sumiu (excluído → Lixeira) → linha órfã, fora da grade; restaurar religa
  for (const ln of f.linhas) {
    if (ln.tipo === 'cliente' && ln.leadId && !leads.has(ln.leadId)) {
      ln.leadAntigo = ln.leadId; delete f.snap[ln.leadId]; ln.leadId = null; mudou = true;
    }
  }
  const porLead = new Map<string, LinhaDemo>();
  for (const ln of f.linhas) if (ln.leadId) porLead.set(ln.leadId, ln);
  for (const l of d.linhas) {
    const ln = porLead.get(l.id);
    if (!ln) {
      const orfa = f.linhas.find((x) => x.tipo === 'cliente' && !x.leadId && x.leadAntigo === l.id);
      if (orfa) { // lead_restaurar: religa a MESMA linha (textos e cores como estavam)
        orfa.leadId = l.id; delete orfa.leadAntigo; f.snap[l.id] = retratoDe(l, d.comps); mudou = true;
        continue;
      }
      // pl_garantir_linha: cliente novo → fim do bloco certo
      const bl = blocoPara(f, l.situacao, l.dia);
      if (!bl) continue; // cancelado sem dia: sem linha até ganhar um ciclo
      const nova: LinhaDemo = { id: novoId(), ordem: fimDoBloco(f, bl.id), tipo: 'cliente', bloco: bl.id, leadId: l.id, altura: null, c: {} };
      f.linhas.push(nova);
      preencherCliente(f, nova, l, d, false);
      mudou = true;
      continue;
    }
    const sn = f.snap[l.id];
    if (!sn) { f.snap[l.id] = retratoDe(l, d.comps); mudou = true; continue; }
    // dia/situação mudou → linha vai pro fim do bloco certo
    if (sn.dia !== l.dia || sn.situacao !== l.situacao) {
      const bl = blocoPara(f, l.situacao, l.dia);
      if (bl && bl.id !== ln.bloco) moverParaBloco(f, d, ln, bl, l);
      sn.dia = l.dia; sn.situacao = l.situacao; mudou = true;
    }
    // campos ligados que mudaram fora → reescreve (só se a célula já não disser o mesmo)
    for (const campo of CAMPOS_TEXTO) {
      const v = valorCampo(l, campo);
      if (v === sn[campo]) continue;
      const col = f.colunas.find((c) => c.tipo === 'campo' && c.campo === campo);
      const ref = campo === 'fechamento' ? mesRef(l, d.comps) : null;
      if (col && !textoEquivale(campo, ln.c[col.id]?.t ?? null, String(v), ref)) escrever(ln, col.id, textoCampo(l, campo, d.comps));
      if (campo === 'valor') sn.valor = v as number; else sn[campo] = v as string;
      mudou = true;
    }
    // pagamentos (células do store) que mudaram fora → coluna de mês do bloco
    const bl = f.blocos.find((b) => b.id === ln.bloco);
    d.comps.forEach((comp, i) => {
      const cur = celNorm(l.celulas[i]);
      if (cur === (sn.cel[comp] ?? '-')) return;
      if (cur === '-') delete sn.cel[comp]; else sn.cel[comp] = cur;
      marcarMudancaPagamento(f, l.id, comp);
      mudou = true;
      if (!bl?.compBase) return; // NOVOS: mês é só texto
      const k = mesesEntre(bl.compBase, comp);
      if (k < 0) return;
      let col = f.colunas.find((c) => c.tipo === 'mes' && c.mesPos === k);
      if (!col) {
        if (k !== maxMesPos(f) + 1) return; // fora da grade: ignora (igual ao real)
        col = criarColunaMes(f, d, k);
      }
      const atual = ln.c[col.id]?.t ?? null;
      const novo = textoMesDemo(cur, atual);
      if (novo !== atual) escrever(ln, col.id, novo);
    });
  }
  return mudou;
}

/** abre a folha (semeia na 1ª vez) já sincronizada com o store */
function abrir(d: Dados): Folha {
  let f = lerFolha();
  let novo = false;
  if (!f) { f = semear(d); novo = true; }
  if (reconciliar(f, d) || novo) gravarFolha(f);
  return f;
}
/** o "e" do planilha_dados, por (lead, comp) — mesma regra do SQL (mig 58): a entrada
    PENDENTE mais nova; senão a ÚLTIMA decisão (entradas decididas, fora do histórico);
    confirmada não pinta; recusada só se o pagamento daquele mês não mudou depois dela
    (a célula do store ainda é a do momento da recusa E a última mudança vista pela
    planilha é mais velha que a recusa) */
function entradasPorComp(d: Dados, mm: Record<string, string> = {}): Map<string, EntradaCel> {
  const m = new Map<string, EntradaCel>();
  for (const e of d.pendentes ?? []) {
    if (!e?.leadId || !e.comp) continue;
    const k = chaveLeadComp(e.leadId, e.comp);
    const ja = m.get(k);
    if (ja && ja.em >= (e.quando ?? '')) continue;
    m.set(k, { st: 'pendente', id: e.id, v: Number(e.valor ?? 0), por: e.por ?? '', em: e.quando ?? '', dec: null, mot: null, cp: !!e.comprovante });
  }
  const ultima = new Map<string, EntradaDecidida>();
  for (const x of decididasCarregar()) {
    const k = chaveLeadComp(x.leadId, x.comp);
    const ja = ultima.get(k);
    if (!ja || x.resolvidoEm > ja.resolvidoEm) ultima.set(k, x);
  }
  const leads = new Map(d.linhas.map((l) => [l.id, l]));
  for (const [k, x] of ultima) {
    if (m.has(k) || x.estado !== 'recusada') continue; // pendente vence; confirmada não pinta
    const lead = leads.get(x.leadId);
    if (!lead) continue;
    const i = d.comps.indexOf(x.comp);
    const agora = celNorm(i >= 0 ? lead.celulas[i] : null);
    if (x.celula != null && celNorm(x.celula) !== agora) continue; // o pagamento mudou depois
    const mudou = mm[k];
    if (mudou && mudou >= x.resolvidoEm) continue; // …ou mudou e voltou
    m.set(k, {
      st: 'recusada', id: x.id, v: Number(x.valor ?? 0), por: x.por ?? '', em: x.quando ?? '',
      dec: x.resolvidoEm, mot: x.motivo?.trim() || null, cp: !!x.temComprovante,
    });
  }
  return m;
}

/** planilha_dados: linhas em ordem, cliente na Lixeira fora, célula só com texto/estilo;
    blocos na ordem em que aparecem na folha; "e" = entradas nas colunas de mês */
function paraDados(f: Folha, d?: Dados): PlDados {
  const linhas: PlLinha[] = [];
  const primeira = new Map<string, number>();
  const ents = d ? entradasPorComp(d, f.mm) : new Map<string, EntradaCel>();
  const bases = new Map(f.blocos.map((b) => [b.id, b.compBase]));
  const meses = f.colunas.filter((c) => c.tipo === 'mes' && c.mesPos != null);
  for (const l of ordenadas(f)) {
    if (l.bloco != null && !primeira.has(l.bloco)) primeira.set(l.bloco, l.ordem);
    if (l.tipo === 'cliente' && !l.leadId) continue;
    const c: Record<string, PlCelula> = {};
    for (const [k, v] of Object.entries(l.c)) if (v && (v.t != null || v.s != null)) c[k] = { t: v.t ?? null, s: v.s ?? null };
    const ln: PlLinha = { id: l.id, ordem: l.ordem, tipo: l.tipo, bloco: l.bloco, leadId: l.leadId, altura: l.altura ?? null, c };
    const base = l.bloco != null ? bases.get(l.bloco) : null;
    if (ents.size && l.tipo === 'cliente' && l.leadId && base) {
      const e: Record<string, EntradaCel> = {};
      for (const col of meses) {
        const x = ents.get(chaveLeadComp(l.leadId, compSoma(base, col.mesPos!)));
        if (x) e[col.id] = { ...x };
      }
      if (Object.keys(e).length) ln.e = e;
    }
    linhas.push(ln);
  }
  const pos = (b: PlBloco) => primeira.get(b.id) ?? Number.POSITIVE_INFINITY;
  const blocos = [...f.blocos].sort((a, b) => pos(a) - pos(b) || a.id.localeCompare(b.id)).map((b) => ({ ...b }));
  return { blocos, colunas: [...f.colunas].sort(porOrdem).map((c) => ({ ...c })), linhas };
}

/* ------------------- planilha → store (as ligações §2.2) ------------------- */

/** aplica no lead o texto novo de uma célula ligada (planilha_salvar); true = mexeu no store */
function ligar(f: Folha, d: Dados, ln: PlLinha, col: PlColuna, l: GLinha, t: string | null, avisos: string[]): boolean {
  const sn = f.snap[l.id] ?? (f.snap[l.id] = retratoDe(l, d.comps));
  const tit = btrim(col.titulo);
  if (col.tipo === 'livre') return false;
  if (col.tipo === 'mes') {
    const bl = f.blocos.find((b) => b.id === ln.bloco);
    if (!bl?.compBase || col.mesPos == null) return false; // NOVOS: só texto
    const comp = compSoma(bl.compBase, col.mesPos);
    const i = garantirComp(d, comp);
    const e = estadoMes(t);
    const cel = e.estado === 'nao_pagou' ? 'NÃO PAGOU' : e.estado === 'pago' ? String(e.valor) : '-';
    if (celNorm(l.celulas[i]) !== cel) marcarMudancaPagamento(f, l.id, comp);
    const cs = [...l.celulas]; cs[i] = cel; l.celulas = cs;
    if (cel === '-') delete sn.cel[comp]; else sn.cel[comp] = cel;
    return true;
  }
  switch (col.campo) {
    case 'senha_inss': case 'reclame': {
      // demo guarda a senha em claro no store (dado fictício); o real cifra (set_senha)
      if (col.campo === 'senha_inss') l.senha = t ?? '';
      else {
        l.reclameSenha = t ?? '';
        const iso = dataNoTexto(t, mesRef(l, d.comps));
        if (iso) l.dataReclamacao = iso;
      }
      return true;
    }
    case 'fechamento': {
      const iso = dataCurta(t, mesRef(l, d.comps));
      if (iso) { l.fechamento = iso; sn.fechamento = iso; return true; }
      avisos.push(`${tit} '${t ?? ''}' não é data (DD/mmm, DD/MM ou DD/MM/AAAA) — a data do sistema não mudou`);
      return false;
    }
    case 'valor': {
      const v = valorBR(t);
      if (v != null) { l.valor = Math.round(v * 100) / 100; sn.valor = l.valor; return true; }
      avisos.push(`${tit} '${t ?? ''}' não é número — o valor do sistema não mudou`);
      return false;
    }
    case 'nome': case 'comercial': case 'nb': case 'banco': case 'cpf': {
      const v = btrim(t);
      l[col.campo] = v; sn[col.campo] = v;
      return true;
    }
    case 'parou': {
      l.parou = t ?? ''; sn.parou = l.parou;
      const iso = dataNoTexto(t, mesRef(l, d.comps));
      if (iso) l.dataParou = iso;
      return true;
    }
    case 'telefone': {
      const tel = extrairTelefone(t);
      if (!tel) return false; // sem telefone no texto: o do sistema não muda
      l.telefone = tel; sn.telefone = tel;
      return true;
    }
    default: return false;
  }
}

/* ------------------------------- o repo ------------------------------- */

export function criarPlanilhaRepoDemo(): PlanilhaRepo {
  return {
    async carregar() {
      const d = gsCarregar();
      return paraDados(abrir(d), d);
    },

    async salvar(itensBrutos) {
      const itens = prepararItens(itensBrutos);
      if (!itens.length) return { ok: true, avisos: [], n: 0 };
      if (itens.length > LIMITE_ITENS) throw new Error(`Máximo de ${LIMITE_ITENS} células por vez (vieram ${itens.length}).`);
      const d = gsCarregar();
      const f = abrir(d);
      const lin = new Map(f.linhas.map((l) => [l.id, l]));
      const col = new Map(f.colunas.map((c) => [c.id, c]));
      // tudo-ou-nada: confere tudo antes de gravar qualquer coisa (o real desfaz a transação)
      for (const it of itens) {
        const l = lin.get(it.l);
        if (!l) throw new Error('Linha não encontrada — a planilha mudou, recarregue.');
        if (!col.has(it.c)) throw new Error('Coluna não encontrada — a planilha mudou, recarregue.');
        if (l.tipo === 'cliente' && !l.leadId) throw new Error('Este cliente está na Lixeira — restaure antes de editar.');
      }
      const leads = new Map(d.linhas.map((g) => [g.id, g]));
      const avisos: string[] = [];
      let n = 0;
      let mexeuStore = false;
      for (const it of itens) {
        const ln = lin.get(it.l)!; const c = col.get(it.c)!;
        const lead = ln.tipo === 'cliente' && ln.leadId ? leads.get(ln.leadId) : undefined;
        const senhaCol = ln.tipo === 'cliente' && (c.campo === 'senha_inss' || c.campo === 'reclame');
        const atual = ln.c[c.id];
        const curT = atual?.t ?? null; const curS = atual?.s ?? null;
        const temT = it.t !== undefined; const temS = it.s !== undefined;
        const t = temT ? (it.t ?? null) : null;
        const mudaS = temS && !mesmoEstilo(it.s, curS);
        const mudaT = temT && (senhaCol || t !== curT);
        if (!mudaT && !mudaS) continue; // nada mudou: nem célula, nem sistema, nem aviso
        let senhaMudou = false;
        if (lead && mudaT) {
          if (senhaCol) {
            const guardada = c.campo === 'senha_inss' ? lead.senha : lead.reclameSenha;
            senhaMudou = (t ?? '') !== (guardada ?? '');
          }
          if (ligar(f, d, ln, c, lead, t, avisos)) mexeuStore = true;
        }
        // a célula: texto EXATO + estilo; senha de cliente nunca vira texto de célula
        const novoT = senhaCol ? null : temT ? t : curT;
        const novoS = temS ? (it.s ?? null) : curS;
        if (novoT !== curT || !mesmoEstilo(novoS, curS)) {
          if (novoT == null && novoS == null) delete ln.c[c.id]; else ln.c[c.id] = { t: novoT, s: novoS };
          n++;
        } else if (senhaMudou) n++;
      }
      if (mexeuStore) gsSalvar(d);
      gravarFolha(f);
      return { ok: true, avisos, n };
    },

    async colunaCriar(a) {
      const d = gsCarregar();
      const f = abrir(d);
      if (a.tipo !== 'livre' && a.tipo !== 'mes') throw new Error('tipo de coluna inválido');
      if (a.lado !== 'esq' && a.lado !== 'dir') throw new Error('lado inválido (esq|dir)');
      const cols = [...f.colunas].sort(porOrdem);
      const i = cols.findIndex((c) => c.id === a.ref);
      if (i < 0) throw new Error('Coluna de referência não encontrada — recarregue.');
      const ordem = ordemColuna(f, cols[i].ordem, a.lado === 'dir');
      let id: string;
      if (a.tipo === 'livre') {
        id = novoId();
        f.colunas.push({ id, ordem, titulo: btrim(a.titulo) || 'Nova coluna', tipo: 'livre', campo: null, mesPos: null, largura: 110, oculta: false });
      } else {
        // só o PRÓXIMO mês (max+1), já com os pagamentos que existirem; cabeçalho por bloco
        const nova = criarColunaMes(f, d, maxMesPos(f) + 1, ordem);
        if (btrim(a.titulo)) nova.titulo = btrim(a.titulo);
        for (const [bid, txt] of Object.entries(a.cab ?? {})) {
          for (const ln of f.linhas) if (ln.tipo === 'cabecalho' && ln.bloco === bid) escrever(ln, nova.id, txt);
        }
        id = nova.id;
      }
      gravarFolha(f);
      return id;
    },
    async colunaAlterar(coluna, patch) {
      const f = abrir(gsCarregar());
      const c = f.colunas.find((x) => x.id === coluna);
      if (!c) throw new Error('Coluna não encontrada — recarregue.');
      Object.assign(c, normalizarPatchColuna(patch));
      gravarFolha(f);
    },
    async colunaExcluir(coluna) {
      const f = abrir(gsCarregar());
      const c = f.colunas.find((x) => x.id === coluna);
      if (!c) throw new Error('Coluna não encontrada — recarregue.');
      if (c.tipo !== 'livre') throw new Error('Só colunas criadas na planilha (livres) podem ser excluídas — as da planilha original e os meses alimentam o sistema.');
      f.colunas = f.colunas.filter((x) => x.id !== coluna);
      for (const ln of f.linhas) delete ln.c[coluna];
      gravarFolha(f);
    },

    async linhaInserir(ref, lado, tipo) {
      if (lado !== 'acima' && lado !== 'abaixo') throw new Error('lado inválido (acima|abaixo)');
      if (!['cliente', 'cabecalho', 'vazia', 'rotulo'].includes(tipo)) throw new Error('tipo de linha inválido');
      const d = gsCarregar();
      const f = abrir(d);
      const r = f.linhas.find((x) => x.id === ref);
      if (!r) throw new Error('Linha de referência não encontrada — recarregue.');
      let bloco = r.bloco;
      let bl: PlBloco | undefined;
      // cabeçalho/rótulo levam o bloco de BAIXO: "acima" deles o cliente nasceria num
      // bloco e apareceria no fim do de cima (igual ao planilha_linha_inserir)
      if (tipo === 'cliente' && lado === 'acima' && (r.tipo === 'cabecalho' || r.tipo === 'rotulo')) {
        throw new Error('Para incluir cliente num bloco, use "Inserir cliente abaixo" no cabeçalho ou numa linha do bloco.');
      }
      if (tipo === 'cliente') {
        if (bloco == null) bloco = blocoVizinho(f, r.ordem);
        bl = f.blocos.find((b) => b.id === bloco);
        if (!bl) throw new Error('Escolha uma linha dentro de um bloco (ciclo ou NOVOS).');
      }
      const ln: LinhaDemo = { id: novoId(), ordem: ordemLinha(f, r.ordem, lado === 'abaixo'), tipo, bloco, leadId: null, altura: null, c: {} };
      if (bl) {
        const lead: GLinha = {
          id: novoId(), nome: '', comercial: '', dia: bl.dia ?? 0, banco: '', nb: '', cpf: '', senha: '',
          reclameLogin: '', reclameSenha: '', valor: 0, ultimoPgto: '', fechamento: '', recebe: '', telefone: '',
          situacao: bl.situacao, dataReclamacao: '', dataParou: '', parou: '', celulas: d.comps.map(() => '-'),
        };
        d.linhas = [...d.linhas, lead];
        ln.leadId = lead.id;
        f.linhas.push(ln);
        preencherCliente(f, ln, lead, d, false);
        gsSalvar(d);
      } else {
        f.linhas.push(ln);
      }
      gravarFolha(f);
      return ln.id;
    },
    async linhaExcluir(linha) {
      const d = gsCarregar();
      const f = abrir(d);
      const ln = f.linhas.find((x) => x.id === linha);
      if (!ln) return; // já saiu
      if (ln.tipo === 'cliente') {
        if (!ln.leadId) return;
        // cliente → sai do sistema (no real: Lixeira); a linha fica órfã e religa se ele voltar
        const id = ln.leadId;
        d.linhas = d.linhas.filter((g) => g.id !== id);
        ln.leadAntigo = id; ln.leadId = null; delete f.snap[id];
        gsSalvar(d);
      } else {
        f.linhas = f.linhas.filter((x) => x.id !== linha);
      }
      gravarFolha(f);
    },
    async linhaMover(linha, ref, lado) {
      if (lado !== 'acima' && lado !== 'abaixo') throw new Error('lado inválido (acima|abaixo)');
      if (linha === ref) return;
      const d = gsCarregar();
      const f = abrir(d);
      const ln = f.linhas.find((x) => x.id === linha);
      if (!ln) throw new Error('Linha não encontrada — recarregue.');
      const r = f.linhas.find((x) => x.id === ref);
      if (!r) throw new Error('Linha de referência não encontrada — recarregue.');
      ln.ordem = ordemLinha(f, r.ordem, lado === 'abaixo', linha);
      // cliente caindo em outro bloco: muda o bloco e o lead (dia/situação do bloco)
      if (ln.tipo === 'cliente') {
        const dest = r.bloco ?? blocoVizinho(f, ln.ordem, linha);
        const bl = dest != null && dest !== ln.bloco ? f.blocos.find((b) => b.id === dest) : undefined;
        if (bl) {
          const baseAnt = f.blocos.find((b) => b.id === ln.bloco)?.compBase ?? null;
          ln.bloco = bl.id;
          const lead = ln.leadId ? d.linhas.find((g) => g.id === ln.leadId) : undefined;
          if (lead) {
            aplicarBlocoNoLead(lead, bl);
            const sn = f.snap[lead.id];
            if (sn) { sn.dia = lead.dia; sn.situacao = lead.situacao; }
            realinharMeses(f, d, ln, lead, baseAnt, bl.compBase);
            gsSalvar(d);
          }
        }
      }
      gravarFolha(f);
    },
  };
}
