import { resolverComFaltas, type VarCtx } from '@/data/scripts';
import { acharTrechos, type Intervalo } from './texto';

/* ------------------------------------------------------------------
   Variáveis na PRÉVIA — paridade exata com o compositor.
   Cada {{token}} é resolvido pelo MESMO resolverComFaltas que o
   ScriptSequenceModal usa (via fetchEtapasParaEnvio), token a token:
   como a substituição não depende de vizinhos, a concatenação dos
   pedaços é idêntica ao texto que o compositor vai mostrar/enviar
   (garantido em teste). Assim a prévia nunca promete o que o envio
   não faz — e herda sozinha qualquer variável nova do resolvedor.
   ------------------------------------------------------------------ */

export type SegVar =
  | { k: 'txt'; v: string }
  /** variável preenchida com o dado do cliente/atendente */
  | { k: 'var'; v: string; nome: string }
  /** variável conhecida SEM valor: vira o aviso "[Telefone não informado]" do compositor */
  | { k: 'falta'; v: string; nome: string; rotulo: string }
  /** variável que o compositor não conhece: segue crua (e trava o envio até editar) */
  | { k: 'crua'; v: string; nome: string };

const RE_TOKEN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

export function segmentarVariaveis(texto: string, ctx: VarCtx): { segs: SegVar[]; faltando: string[]; final: string } {
  const segs: SegVar[] = [];
  const faltando: string[] = [];
  let i = 0;
  RE_TOKEN.lastIndex = 0;
  for (let m = RE_TOKEN.exec(texto); m; m = RE_TOKEN.exec(texto)) {
    if (m.index > i) segs.push({ k: 'txt', v: texto.slice(i, m.index) });
    const token = m[0];
    const nome = m[1].toLowerCase();
    const r = resolverComFaltas(token, ctx);
    if (r.texto === token) segs.push({ k: 'crua', v: token, nome });
    else if (r.faltando.length) {
      segs.push({ k: 'falta', v: r.texto, nome, rotulo: r.faltando[0] });
      for (const f of r.faltando) if (!faltando.includes(f)) faltando.push(f);
    } else segs.push({ k: 'var', v: r.texto, nome });
    i = m.index + token.length;
  }
  if (i < texto.length) segs.push({ k: 'txt', v: texto.slice(i) });
  return { segs, faltando, final: segs.map((s) => s.v).join('') };
}

/** Variáveis desconhecidas pelo compositor (ficam cruas e travam o envio). */
export function variaveisCruas(segs: SegVar[]): string[] {
  const out: string[] = [];
  for (const s of segs) if (s.k === 'crua' && !out.includes(s.nome)) out.push(s.nome);
  return out;
}

/* Nome HUMANO de uma variável para o atendente ("valor_parcela" → "valor da parcela"):
   o {{token}} fica só no title. Rótulos conhecidos primeiro; o resto vira palavras. */
const ROTULO_VAR: Record<string, string> = {
  valor_parcela: 'valor da parcela', valor_beneficio: 'valor do benefício', valor_emprestimo: 'valor do empréstimo',
  valor_contrato: 'valor do contrato', valor_causa: 'valor da causa', valor_total: 'valor total',
  numero_beneficio: 'número do benefício', nb: 'número do benefício', cpf: 'CPF', cpf_cliente: 'CPF do cliente',
  data_pagamento: 'data do pagamento', data_vencimento: 'data de vencimento', data_ligacao: 'data da ligação',
  horario: 'horário', banco: 'banco', link: 'link', endereco: 'endereço',
};
export function rotuloVariavel(nome: string): string {
  const k = nome.toLowerCase();
  return ROTULO_VAR[k] ?? (k.replace(/_+/g, ' ').trim() || k);
}

/* ---------- texto rico da bolha ----------
   Atributos por caractere sobre o texto FINAL (já preenchido): tipo de variável,
   destaque da busca, *negrito* do WhatsApp (marcadores somem, como no inbox) e link
   (sublinhado, não clicável dentro da prévia). Depois junta corridas iguais.
   Variável SEM valor (falta/crua) é UM trecho atômico com o rótulo humano ("valor da
   parcela" — nunca "{{valor_parcela}}"): a busca marca o chip inteiro ou nada. */
export interface Trecho {
  t: string;
  /** origem do trecho: texto do script ou variável */
  v?: 'var' | 'falta' | 'crua';
  /** casou com a busca */
  m?: boolean;
  b?: boolean;
  link?: boolean;
  /** nome da variável (title/aria) */
  nome?: string;
}

const RE_FMT = /(\*[^*\s][^*]*[^*\s]\*|\*[^*\s]\*|https?:\/\/\S+|www\.\S+)/g;

export function montarTrechos(segs: SegVar[], termos: string[] = []): Trecho[] {
  const final = segs.map((s) => s.v).join('');
  const n = final.length;
  const v: (Trecho['v'] | undefined)[] = new Array(n);
  const nomes: (string | undefined)[] = new Array(n);
  // posição inicial → segmento atômico (falta/crua): vira UM trecho com o rótulo humano
  const atomos = new Map<number, { fim: number; seg: Extract<SegVar, { k: 'falta' | 'crua' }> }>();
  let p = 0;
  for (const s of segs) {
    if (s.k !== 'txt') for (let j = 0; j < s.v.length; j++) { v[p + j] = s.k; nomes[p + j] = s.nome; }
    if ((s.k === 'falta' || s.k === 'crua') && s.v.length) atomos.set(p, { fim: p + s.v.length, seg: s });
    p += s.v.length;
  }
  const marca = new Uint8Array(n);
  for (const [a, b] of acharTrechos(final, termos) as Intervalo[]) for (let j = a; j < b; j++) marca[j] = 1;
  const negrito = new Uint8Array(n);
  const link = new Uint8Array(n);
  const oculto = new Uint8Array(n);
  RE_FMT.lastIndex = 0;
  for (let m = RE_FMT.exec(final); m; m = RE_FMT.exec(final)) {
    const a = m.index, b = a + m[0].length;
    if (m[0].startsWith('*')) {
      oculto[a] = 1; oculto[b - 1] = 1;
      for (let j = a + 1; j < b - 1; j++) negrito[j] = 1;
    } else for (let j = a; j < b; j++) link[j] = 1;
  }
  const out: Trecho[] = [];
  for (let j = 0; j < n; j++) {
    const at0 = atomos.get(j);
    if (at0) {
      const { seg } = at0;
      const rot = seg.k === 'falta' ? seg.rotulo.toLocaleLowerCase('pt-BR') : rotuloVariavel(seg.nome);
      const tok: Trecho = { t: rot, v: seg.k, nome: seg.nome };
      if (termos.length && (acharTrechos(rot, termos).length > 0 || acharTrechos(seg.nome, termos).length > 0)) tok.m = true;
      if (negrito[j]) tok.b = true;
      out.push(tok);
      j = at0.fim - 1;
      continue;
    }
    if (oculto[j]) continue;
    const at: Trecho = { t: final[j] };
    if (v[j]) { at.v = v[j]; at.nome = nomes[j]; }
    if (marca[j]) at.m = true;
    if (negrito[j]) at.b = true;
    if (link[j]) at.link = true;
    const ult = out[out.length - 1];
    const ultAtomo = ult && (ult.v === 'falta' || ult.v === 'crua');
    if (ult && !ultAtomo && ult.v === at.v && ult.nome === at.nome && !!ult.m === !!at.m && !!ult.b === !!at.b && !!ult.link === !!at.link) ult.t += at.t;
    else out.push(at);
  }
  return out;
}

/** Campos que o compositor vai pedir para preencher num texto (rótulos humanos, sem
 *  repetição): variável conhecida sem valor ("telefone") e variável que ele não conhece
 *  ("valor da parcela"). Prévia (aviso por etapa + rodapé) e lista (aviso no modo estreito). */
export function faltasDoTexto(texto: string, ctx: VarCtx): string[] {
  const r = segmentarVariaveis(texto, ctx);
  const out: string[] = [];
  for (const f of r.faltando) { const t = f.toLocaleLowerCase('pt-BR'); if (!out.includes(t)) out.push(t); }
  for (const c of variaveisCruas(r.segs)) { const t = rotuloVariavel(c); if (!out.includes(t)) out.push(t); }
  return out;
}

/* ---------- linha de apoio da LISTA ----------
   O texto da mensagem em UMA linha com as variáveis já preenchidas e as sem valor como
   RÓTULO humano ("valor da parcela" — nunca "{{valor_parcela}}"), o *negrito* sem os
   asteriscos e, com busca, recortado em volta do 1º trecho que casou ("…senha do gov.br").
   `raio` = caracteres de contexto antes do trecho; trecho até `limiar` não corta nada.
   O recorte nunca parte um rótulo de variável ao meio. */
export function linhaDeApoio(bruto: string, ctx: VarCtx, termos: string[] = [], raio = 14, limiar = raio + 10): Trecho[] {
  const segs = segmentarVariaveis(bruto, ctx).segs.map((s) => ({ ...s, v: s.v.replace(/\s+/g, ' ') }));
  const tr = montarTrechos(segs, termos).map((t) => ({ ...t }));
  // apara as pontas (o texto vira uma linha)
  while (tr.length && !tr[0].v && !tr[0].t.trim()) tr.shift();
  if (tr[0] && !tr[0].v) tr[0].t = tr[0].t.replace(/^\s+/, '');
  while (tr.length && !tr[tr.length - 1].v && !tr[tr.length - 1].t.trim()) tr.pop();
  const u = tr[tr.length - 1];
  if (u && !u.v) u.t = u.t.replace(/\s+$/, '');
  const im = tr.findIndex((t) => t.m);
  if (im < 0) return tr;
  const linha = tr.map((t) => t.t).join('');
  const pos = tr.slice(0, im).reduce((a, t) => a + t.t.length, 0);
  if (pos <= limiar) return tr;
  let ini = pos - raio;
  // começa na 1ª fronteira de palavra depois do corte (sem "…cumentos"), nunca depois do trecho
  const esp = linha.indexOf(' ', ini - 1);
  ini = esp >= 0 && esp + 1 <= pos ? esp + 1 : ini;
  const out: Trecho[] = [{ t: '…' }];
  let p = 0;
  for (const t of tr) {
    const fim = p + t.t.length;
    if (fim <= ini) { p = fim; continue; }
    if (p >= ini) out.push(t);
    else if (t.v === 'falta' || t.v === 'crua') out.push(t); // rótulo atômico: entra inteiro
    else out.push({ ...t, t: t.t.slice(ini - p) });
    p = fim;
  }
  return out;
}
