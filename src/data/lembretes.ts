import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { DEMO_MODE } from '@/lib/demo';
import { VOZ_BOM_DIA } from '@/data/bomDia';

/* ------------------------------------------------------------------
   LEMBRETES POR VOZ (dono 30/10 ~23h40: "Eu peço para ela me lembrar
   alguma coisa, tal data … e ela pega e aí … na hora ela me lembra").
   A conversa de voz cria o lembrete (fase 2: ferramenta criar_lembrete);
   aqui mora a HORA DO AVISO na tela (o cartão: LembreteAviso.tsx).
   - Os lembretes da pessoa: RPC meus_lembretes_devidos (pendentes das
     próximas 24 h + avisados sem confirmação de até 12 h atrás) — ao
     montar, a cada 2 min e ao voltar para a aba.
   - Um relógio por lembrete (≤ 24 h). Na hora, confere no servidor que
     ele ainda vale (cancelado por voz não toca) e o aviso abre. Vários:
     fila — o que chega na hora vai para a frente; os atrasados entram em
     ordem, atrás. Atrasado (até 12 h, sem confirmação) aparece ao abrir.
   - "Ok" → lembrete_confirmar; "Lembrar em 10 min" → lembrete_adiar.
     Sem rede, a tela segura sozinha (o Ok não volta; o adiado volta em
     10 min) e tenta o servidor de novo.
   - ELA FALA: "{primeiro nome}, seu lembrete: {texto}." pela edge
     bom-dia-voz (a voz do bom dia, Despina; pedida 2 min antes). Sem voz
     (limite do dia, crédito, rede): um som curto e discreto (Web Audio,
     sem arquivo). Som travado pelo navegador (nenhum clique na página
     ainda): ela fala no primeiro toque/tecla com o aviso na tela.
   - UMA ABA SÓ FALA: a dona da trava 'atenvo-lembretes' (Web Locks, como
     o bom dia), e a marca no localStorage não deixa repetir. O cartão
     aparece em TODAS as abas (a pessoa vê onde estiver); Ok/adiar numa
     fecha nas outras (evento storage). A aba com SOM (a conversa de voz
     aberta, o bom dia falando) segura a trava compartilhada
     'atenvo-lembretes-espera': a aba que fala espera ela soltar (a voz
     do lembrete nunca entra no microfone da conversa aberta em outra aba).
     A dona da trava não falou em 10 s (aba sem clique desde que abriu: o
     navegador não deixa tocar) → a aba à vista, com clique, fala no lugar.
   - Notificação do sistema SÓ com a permissão já dada e a aba em segundo
     plano — nunca pede permissão sozinha.
   - A conversa de voz criou/cancelou um lembrete: avisarLembretesMudaram()
     → esta aba e as outras buscam de novo NA HORA (o "daqui a 1 minuto"
     não espera a busca de 2 em 2 min).
   - Demo (só demo/DEV): ?lembrete-demo=1 (ou fila, longo, atrasado)
     dispara um lembrete simulado 3 s depois, para ver o visual.
   ------------------------------------------------------------------ */

export const LEMBRETES_REAL = isSupabaseConfigured && !!supabase;
/** a simulação da tela (?lembrete-demo=…) nunca vale num build publicado do sistema real */
const DEMO_PERMITIDA = import.meta.env.DEV || DEMO_MODE;

/** a voz do bom dia (Despina) — o lembrete fala com a mesma */
export const VOZ_LEMBRETE = VOZ_BOM_DIA;
export const FUSO_LEMBRETE = 'America/Sao_Paulo';
export const ADIAR_MIN = 10;
export const INTERVALO_BUSCA_MS = 2 * 60_000;
/** sem resposta do servidor, a próxima busca espera mais (2 → 4 → 8 → 16 → 30 min) */
export const TETO_BUSCA_MS = 30 * 60_000;
/** a conferência local (sem rede): o notebook que dormiu, o atrasado que passou de 12 h */
export const INTERVALO_CONFERE_MS = 30_000;
export const JANELA_FUTURO_MS = 24 * 3_600_000;
export const JANELA_ATRASO_MS = 12 * 3_600_000;
/** até 2 min depois da hora ainda é "na hora" (vai para a frente da fila e fala) */
export const NA_HORA_MS = 2 * 60_000;
/** a voz é pedida 2 min antes: na hora ela já está pronta */
export const PRE_VOZ_MS = 2 * 60_000;
/** na hora, espera a voz no máximo isto antes do som curto */
export const ESPERA_VOZ_MS = 4_000;
/** a voz que chegou atrasada ainda fala (com o aviso na tela) até este tempo depois do som */
export const VOZ_TARDIA_MS = 25_000;
/** a frente da fila mudou: espera assentar (dois lembretes na mesma hora) antes de falar */
export const ASSENTAR_MS = 600;
export const TRAVA_LEMBRETES = 'atenvo-lembretes';
/** "esta aba tem som" (a conversa de voz aberta, o bom dia falando): trava COMPARTILHADA que as outras abas
    enxergam — a aba que fala espera (a voz do lembrete não entra no microfone da conversa de voz aberta em outra
    aba nem por cima do bom dia dela) */
export const TRAVA_ESPERA = 'atenvo-lembretes-espera';
/** a aba que fala confere a trava de espera neste ritmo enquanto há lembrete na frente */
export const CONFERE_ESPERA_MS = 1_000;
/** depois de falado, ainda confere este tempo (a voz que chega atrasada toca até 25 s depois do som curto) */
export const CONFERE_ESPERA_DEPOIS_MS = 45_000;
const PREFIXO = 'atenvo-lmb:';
const K_SILENCIO = `${PREFIXO}r:`;
const K_FALADO = `${PREFIXO}f:`;
/** "os lembretes mudaram" (a voz criou/cancelou): o evento desta aba e a marca que chega às outras (storage) */
export const EVENTO_LEMBRETES_MUDARAM = 'atenvo:lembretes-mudaram';
export const K_MUDARAM = `${PREFIXO}mudaram`;
/** marcas velhas saem do localStorage */
const VALIDADE_FALADO_MS = 36 * 3_600_000;

/* ================================================================== tipos */

export type StatusLembrete = 'pendente' | 'avisado';

/** Uma linha de meus_lembretes_devidos (contrato do banco). */
export interface LembreteDevido {
  id: string;
  texto: string;
  /** timestamptz ISO */
  quando: string;
  status: StatusLembrete;
}

/** um lembrete da agenda: os do servidor e os da simulação da demo (nunca vão ao servidor) */
export interface ItemAgenda extends LembreteDevido {
  demo?: boolean;
}

/** Um aviso na fila: uma OCORRÊNCIA do lembrete (o adiado volta como outra ocorrência). */
export interface AvisoLembrete {
  /** id@quando (adiado sem o servidor saber: id@quando~fim) — a fala e o Ok valem por ocorrência */
  chave: string;
  id: string;
  texto: string;
  /** o quando do servidor (ISO) */
  quando: string;
  /** o momento desta ocorrência (no adiado local, o fim do adiamento) */
  quandoMs: number;
  /** entrou mais de 2 min depois da hora (ao abrir o Atenvo, notebook que dormiu) */
  atrasado: boolean;
  demo: boolean;
}

export type AcaoLembrete = 'ok' | 'adiar';

interface Silencio {
  acao: AcaoLembrete;
  /** ok: até quando a marca vale (depois o servidor já não devolve); adiar: quando volta */
  ate: number;
}

/** o pedaço do localStorage que a agenda usa (injetável nos testes) */
export interface ArmazenamentoLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  key?(i: number): string | null;
  readonly length?: number;
}

/** o pedaço do Web Locks que a tela usa (navigator.locks; injetável nos testes) */
export interface TravasLike {
  request(
    nome: string, opcoes: { signal?: AbortSignal; mode?: 'exclusive' | 'shared' }, cb: (trava: unknown) => Promise<unknown> | unknown,
  ): Promise<unknown>;
  /** as travas seguradas agora, de TODAS as abas da origem (só a espera usa) */
  query?(): Promise<{ held?: ReadonlyArray<{ name?: string }> } | undefined>;
}

export interface RelogioLike {
  definir(fn: () => void, ms: number): unknown;
  limpar(h: unknown): void;
}

/* ================================================================== banco */

const STATUS = new Set<StatusLembrete>(['pendente', 'avisado']);

/** A resposta da RPC → linhas válidas (o que vier torto fica de fora; nunca quebra a tela). */
export function normalizarLembretes(data: unknown): LembreteDevido[] {
  const bruto = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { lembretes?: unknown }).lembretes)
      ? (data as { lembretes: unknown[] }).lembretes
      : [];
  const out: LembreteDevido[] = [];
  const vistos = new Set<string>();
  for (const l of bruto) {
    if (!l || typeof l !== 'object') continue;
    const o = l as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    const texto = typeof o.texto === 'string' ? o.texto.replace(/\s+/g, ' ').trim() : '';
    const quando = typeof o.quando === 'string' ? o.quando : '';
    const status = typeof o.status === 'string' ? o.status : '';
    if (!id || !texto || vistos.has(id) || !Number.isFinite(Date.parse(quando)) || !STATUS.has(status as StatusLembrete)) continue;
    vistos.add(id);
    out.push({ id, texto, quando, status: status as StatusLembrete });
  }
  return out;
}

/** Um retrato do servidor: os lembretes e a diferença entre o relógio dele e o deste notebook. */
export interface RetratoLembretes {
  lembretes: LembreteDevido[];
  /** relógio do servidor − relógio daqui, em ms (0 = iguais); null = a resposta não trouxe a hora dela */
  desvioMs: number | null;
}

/** A resposta de meus_lembretes_devidos ({agora, primeiro_nome, lembretes:[…]}) → o retrato. O relógio do
    notebook pode estar errado: a agenda marca pela hora do SERVIDOR (o "agora" da resposta, contra o meio da
    ida e volta). O "agora" vem em segundos inteiros: menos de 2 s de diferença é arredondamento, não relógio. */
export function lerRetrato(data: unknown, enviadoEm: number, recebidoEm: number): RetratoLembretes {
  const lembretes = normalizarLembretes(data);
  const agora = data && typeof data === 'object' && !Array.isArray(data) ? (data as { agora?: unknown }).agora : undefined;
  const servidor = typeof agora === 'string' ? Date.parse(agora) : NaN;
  if (!Number.isFinite(servidor)) return { lembretes, desvioMs: null };
  const desvio = Math.round(servidor - (enviadoEm + recebidoEm) / 2);
  return { lembretes, desvioMs: Math.abs(desvio) < 2_000 ? 0 : desvio };
}

export async function buscarLembretesDevidos(org: string): Promise<RetratoLembretes> {
  const enviadoEm = Date.now();
  const { data, error } = await supabase!.rpc('meus_lembretes_devidos', { p_org: org });
  if (error) throw new Error(error.message);
  return lerRetrato(data, enviadoEm, Date.now());
}

export async function confirmarLembrete(id: string): Promise<void> {
  const { error } = await supabase!.rpc('lembrete_confirmar', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function adiarLembrete(id: string, minutos: number = ADIAR_MIN): Promise<void> {
  const { error } = await supabase!.rpc('lembrete_adiar', { p_id: id, p_minutos: minutos });
  if (error) throw new Error(error.message);
}

const comTeto = <T,>(p: Promise<T>, ms: number, reserva: T): Promise<T> =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(reserva), ms))]);

/** A voz de uma fala (WAV) pela bom-dia-voz — null quando não há (limite do dia, crédito, rede, demo). */
export async function pedirVozLembrete(fala: string): Promise<ArrayBuffer | null> {
  if (!LEMBRETES_REAL) return null;
  try {
    return await comTeto((async () => {
      const { data, error } = await supabase!.functions.invoke('bom-dia-voz', { body: { texto: fala, voz: VOZ_LEMBRETE } });
      if (error || !data?.url) return null;
      const r = await fetch(data.url as string);
      return r.ok ? r.arrayBuffer() : null;
    })(), 20_000, null);
  } catch {
    return null;
  }
}

/* ================================================================== textos */

/** "MATHEUS ribeiro" → "Matheus" (o nome todo em caixa alta ou baixa vira nome próprio) */
export function primeiroNomeLembrete(nome: string | null | undefined): string {
  const p = (nome ?? '').trim().split(/\s+/)[0] ?? '';
  if (!p) return '';
  if (p === p.toUpperCase() || p === p.toLowerCase()) return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR');
  return p;
}

/** O que ela fala: "{primeiro nome}, seu lembrete: {texto}." (o número mascarado no banco — •••• — não é lido) */
export function falaDoLembrete(nome: string | null | undefined, texto: string): string {
  const pn = primeiroNomeLembrete(nome);
  const t = texto.replace(/•+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[\s,;:]+$/, '');
  const fim = /[.!?…]$/.test(t) ? '' : '.';
  return pn ? `${pn}, seu lembrete: ${t}${fim}` : `Seu lembrete: ${t}${fim}`;
}

/** O texto do cartão: a primeira letra em maiúscula ("ligar para o João" → "Ligar para o João"). */
export function textoDoCartao(texto: string): string {
  const t = texto.replace(/\s+/g, ' ').trim();
  return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1);
}

/** o tamanho da letra do cartão pelo comprimento (texto do banco: até 200 caracteres) */
export function tamanhoDoTexto(texto: string): 'g' | 'm' | 'p' {
  const n = texto.trim().length;
  return n <= 52 ? 'g' : n <= 110 ? 'm' : 'p';
}

const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_LEMBRETE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_LEMBRETE });
const fmtDiaMes = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_LEMBRETE, day: '2-digit', month: '2-digit' });

/** "Marcado para 13:00" (hoje) · "Marcado para ontem, 22:00" · "Marcado para 29/10, 22:00" — no horário de Brasília */
export function horaMarcada(quandoMs: number, agora: number = Date.now()): string {
  const h = fmtHora.format(quandoMs);
  const dia = fmtDia.format(quandoMs);
  if (dia === fmtDia.format(agora)) return `Marcado para ${h}`;
  if (dia === fmtDia.format(agora - 86_400_000)) return `Marcado para ontem, ${h}`;
  return `Marcado para ${fmtDiaMes.format(quandoMs)}, ${h}`;
}

/* ================================================================== marcas (localStorage) */

let armazenamentoDaPagina: ArmazenamentoLike | null | undefined;
/** o localStorage, quando dá para usar (aba anônima com o armazenamento bloqueado → null). Testado UMA vez por
    página, com uma chave fora do prefixo (gravar dispara o evento storage nas outras abas). */
export function armazenamentoSeguro(): ArmazenamentoLike | null {
  if (armazenamentoDaPagina !== undefined) return armazenamentoDaPagina;
  try {
    const s = window.localStorage;
    s.setItem('atenvo-teste-armazenamento', '1');
    s.removeItem('atenvo-teste-armazenamento');
    armazenamentoDaPagina = s;
  } catch {
    armazenamentoDaPagina = null;
  }
  return armazenamentoDaPagina;
}

// sem localStorage (ou cheio), as marcas ficam só na memória desta aba
const memoria = new Map<string, string>();
function ler(a: ArmazenamentoLike | null, k: string): string | null {
  if (a) {
    try {
      const v = a.getItem(k);
      if (v !== null) return v;
    } catch { /* cai na memória */ }
  }
  return memoria.get(k) ?? null;
}
function gravar(a: ArmazenamentoLike | null, k: string, v: string): void {
  if (a) {
    try { a.setItem(k, v); return; } catch { /* fica na memória */ }
  }
  memoria.set(k, v);
}
/** só para os testes: esquece as marcas que ficaram na memória (sem localStorage) */
export function esquecerMarcasDaMemoria(): void {
  memoria.clear();
}

export const chaveBase = (id: string, quando: string) => `${id}@${quando}`;

/** Esta ocorrência já foi falada (nesta ou em outra aba)? */
export function jaFalado(a: ArmazenamentoLike | null, chave: string): boolean {
  return ler(a, K_FALADO + chave) !== null;
}

export function marcarFalado(a: ArmazenamentoLike | null, chave: string, agora: number = Date.now()): void {
  gravar(a, K_FALADO + chave, String(agora));
}

function lerSilencio(a: ArmazenamentoLike | null, base: string): Silencio | null {
  const v = ler(a, K_SILENCIO + base);
  if (!v) return null;
  try {
    const o = JSON.parse(v) as Silencio;
    return (o.acao === 'ok' || o.acao === 'adiar') && Number.isFinite(o.ate) ? o : null;
  } catch {
    return null;
  }
}

/** tira do localStorage as marcas que já não servem (o servidor não devolve mais aquele lembrete) */
export function limparMarcasVelhas(a: ArmazenamentoLike | null, agora: number = Date.now()): void {
  if (!a || typeof a.key !== 'function' || typeof a.length !== 'number') return;
  const sair: string[] = [];
  try {
    for (let i = 0; i < a.length; i++) {
      const k = a.key(i);
      if (!k || !k.startsWith(PREFIXO)) continue;
      const v = a.getItem(k) ?? '';
      if (k.startsWith(K_FALADO)) {
        if (!(agora - Number(v) < VALIDADE_FALADO_MS)) sair.push(k);
      } else if (k.startsWith(K_SILENCIO)) {
        let o: Silencio | null = null;
        try { o = JSON.parse(v) as Silencio; } catch { o = null; }
        const fim = o && Number.isFinite(o.ate) ? (o.acao === 'ok' ? o.ate : o.ate + JANELA_ATRASO_MS + 3_600_000) : 0;
        if (fim < agora) sair.push(k);
      }
    }
    for (const k of sair) a.removeItem(k);
  } catch { /* armazenamento bloqueado no meio: fica para a próxima */ }
}

/** A voz criou ou cancelou um lembrete: a agenda desta aba (o evento) e a das outras abas (a marca no
    localStorage → evento storage; a aba que FALA pode ser outra) buscam de novo agora. Sem evento nem
    armazenamento, a busca de 2 em 2 min resolve. */
export function avisarLembretesMudaram(
  alvo: Pick<EventTarget, 'dispatchEvent'> | null = typeof window === 'undefined' ? null : window,
  armazenamento: ArmazenamentoLike | null = armazenamentoSeguro(),
  agora: number = Date.now(),
): void {
  try { alvo?.dispatchEvent(new Event(EVENTO_LEMBRETES_MUDARAM)); } catch { /* fora do navegador */ }
  if (!armazenamento) return;
  try { armazenamento.setItem(K_MUDARAM, String(agora)); } catch { /* cheio ou bloqueado */ }
}

/** O evento storage de OUTRA aba: a marca "mudaram" (a voz criou/cancelou lá) → buscar de novo no servidor; uma
    marca de Ok/adiar (ou o armazenamento limpo, chave null) → refazer a fila; o resto não é dos lembretes. */
export function acaoDoArmazenamento(chave: string | null): 'buscar' | 'refazer' | null {
  if (chave === K_MUDARAM) return 'buscar';
  if (chave === null || chave.startsWith(PREFIXO)) return 'refazer';
  return null;
}

/* ================================================================== a agenda (pura: relógio, rede e armazenamento injetados) */

export interface DepsAgenda {
  /** o relógio deste notebook (a agenda corrige pelo do servidor quando o retrato traz o desvio) */
  agora: () => number;
  buscar: () => Promise<LembreteDevido[] | RetratoLembretes>;
  confirmar: (id: string) => Promise<void>;
  adiar: (id: string, minutos: number) => Promise<void>;
  relogio: RelogioLike;
  armazenamento: ArmazenamentoLike | null;
  /** a fila mudou (a frente = fila[0]) */
  aoMudar: (fila: AvisoLembrete[]) => void;
  /** 2 min antes da hora (ou já, se faltar menos): a aba que fala pede a voz */
  aoPreparar?: (item: ItemAgenda) => void;
  aviso?: (m: string) => void;
}

export interface AgendaLembretes {
  iniciar(): void;
  parar(): void;
  /** busca no servidor e refaz relógios e fila (sem rede: refaz com o último retrato) */
  atualizar(): Promise<void>;
  /** Ok / Lembrar em 10 min — false se a ocorrência já não está na fila */
  resolver(chave: string, acao: AcaoLembrete): boolean;
  /** outra aba mexeu nas marcas (evento storage): refaz a fila sem ir ao servidor */
  aoArmazenamento(chave: string | null): void;
  /** demo: lembretes simulados (nunca vão ao servidor) */
  injetar(itens: ItemAgenda[]): void;
  fila(): AvisoLembrete[];
}

type Estado =
  | { tipo: 'ignorar' }
  | { tipo: 'agendar'; em: number; chave: string }
  | { tipo: 'vencido'; em: number; chave: string };

const igualFila = (a: AvisoLembrete[], b: AvisoLembrete[]) =>
  a.length === b.length && a.every((x, i) => x.chave === b[i].chave && x.texto === b[i].texto);

export function criarAgendaLembretes(deps: DepsAgenda): AgendaLembretes {
  const itens = new Map<string, ItemAgenda>();
  const relogios = new Map<string, { em: number; chave: string; h: unknown; hPre: unknown }>();
  const preparados = new Set<string>();
  let fila: AvisoLembrete[] = [];
  let vivo = false;
  let hBusca: unknown = null;
  let hConfere: unknown = null;
  let emCurso: Promise<void> | null = null;
  let deNovo = false;
  let falhas = 0;
  let ultimoErro = '';
  // relógio do servidor − relógio do notebook: tudo aqui é medido na hora do SERVIDOR (o quando é dele)
  let desvio = 0;
  const agoraServidor = () => deps.agora() + desvio;

  const estado = (item: ItemAgenda, agora: number): Estado => {
    const q = Date.parse(item.quando);
    if (!Number.isFinite(q)) return { tipo: 'ignorar' };
    const base = chaveBase(item.id, item.quando);
    const s = lerSilencio(deps.armazenamento, base);
    let em = q;
    let chave = base;
    if (s) {
      if (s.acao === 'ok') return { tipo: 'ignorar' };
      // adiado aqui sem o servidor saber (o pedido falhou ou ainda não voltou): volta no fim do adiamento
      em = Math.max(q, s.ate);
      chave = `${base}~${s.ate}`;
    }
    if (em > agora) return em - agora <= JANELA_FUTURO_MS ? { tipo: 'agendar', em, chave } : { tipo: 'ignorar' };
    if (agora - em > JANELA_ATRASO_MS) return { tipo: 'ignorar' };
    return { tipo: 'vencido', em, chave };
  };

  const preparar = (item: ItemAgenda, chave: string) => {
    if (preparados.has(chave)) return;
    preparados.add(chave);
    try { deps.aoPreparar?.(item); } catch { /* a voz é um extra: nunca derruba a agenda */ }
  };

  const desarmar = (id: string) => {
    const r = relogios.get(id);
    if (!r) return;
    deps.relogio.limpar(r.h);
    if (r.hPre !== null) deps.relogio.limpar(r.hPre);
    relogios.delete(id);
  };

  const armar = (item: ItemAgenda, em: number, chave: string, agora: number) => {
    const r = relogios.get(item.id);
    if (r && r.chave === chave && r.em === em) return;
    desarmar(item.id);
    const h = deps.relogio.definir(() => {
      const atual = relogios.get(item.id);
      if (atual?.h === h) relogios.delete(item.id);
      // na hora: confere no servidor (cancelado por voz não toca; sem rede, vale o último retrato)
      void atualizar();
    }, Math.max(0, em - agora));
    let hPre: unknown = null;
    if (em - agora <= PRE_VOZ_MS) preparar(item, chave);
    else hPre = deps.relogio.definir(() => preparar(item, chave), em - agora - PRE_VOZ_MS);
    relogios.set(item.id, { em, chave, h, hPre });
  };

  const reconciliar = (lista: ItemAgenda[] | null) => {
    if (!vivo) return;
    const agora = agoraServidor();
    if (lista) {
      const demos = [...itens.values()].filter((i) => i.demo);
      itens.clear();
      for (const i of lista) itens.set(i.id, i);
      for (const d of demos) if (!itens.has(d.id)) itens.set(d.id, d);
    }
    const vencidos: Array<{ item: ItemAgenda; em: number; chave: string }> = [];
    for (const item of itens.values()) {
      const e = estado(item, agora);
      if (e.tipo === 'agendar') armar(item, e.em, e.chave, agora);
      else {
        desarmar(item.id);
        if (e.tipo === 'vencido') vencidos.push({ item, em: e.em, chave: e.chave });
      }
    }
    for (const id of [...relogios.keys()]) if (!itens.has(id)) desarmar(id);
    // sai da fila o que não vale mais (confirmado, cancelado, adiado — aqui, em outra aba ou no servidor)
    const valem = new Set(vencidos.map((v) => v.chave));
    let nova = fila.filter((a) => valem.has(a.chave));
    // entram os novos, do mais antigo ao mais novo: o atrasado vai para o fim; o da hora, para a frente
    vencidos.sort((a, b) => a.em - b.em);
    for (const v of vencidos) {
      if (nova.some((a) => a.chave === v.chave)) continue;
      const atrasado = agora - v.em > NA_HORA_MS;
      const aviso: AvisoLembrete = {
        chave: v.chave, id: v.item.id, texto: v.item.texto, quando: v.item.quando, quandoMs: v.em, atrasado, demo: !!v.item.demo,
      };
      nova = atrasado ? [...nova, aviso] : [aviso, ...nova];
    }
    if (!igualFila(nova, fila)) {
      fila = nova;
      deps.aoMudar(fila);
    }
  };

  function atualizar(): Promise<void> {
    if (!vivo) return Promise.resolve();
    if (emCurso) { deNovo = true; return emCurso; }
    emCurso = (async () => {
      do {
        deNovo = false;
        let lista: ItemAgenda[] | null = null;
        try {
          const r = await deps.buscar();
          const retrato: RetratoLembretes = Array.isArray(r) ? { lembretes: r, desvioMs: null } : r;
          if (retrato.desvioMs !== null) desvio = retrato.desvioMs;
          lista = retrato.lembretes;
          falhas = 0;
          ultimoErro = '';
        } catch (e) {
          falhas += 1;
          const m = String((e as Error)?.message ?? e);
          if (m !== ultimoErro) deps.aviso?.(`lembretes: ${m}`);
          ultimoErro = m;
        }
        reconciliar(lista);
      } while (deNovo && vivo);
    })().finally(() => { emCurso = null; });
    return emCurso;
  }

  const proximaBusca = () => {
    if (!vivo) return;
    const ms = Math.min(TETO_BUSCA_MS, INTERVALO_BUSCA_MS * 2 ** Math.min(falhas, 4));
    hBusca = deps.relogio.definir(() => { void atualizar().finally(proximaBusca); }, ms);
  };
  const proximaConferencia = () => {
    if (!vivo) return;
    hConfere = deps.relogio.definir(() => { reconciliar(null); proximaConferencia(); }, INTERVALO_CONFERE_MS);
  };

  /** o servidor, com insistência: agora, +3 s e +15 s (o Ok/adiar já valeu na tela) */
  const comInsistencia = async (fn: () => Promise<void>): Promise<boolean> => {
    const esperas = [0, 3_000, 15_000];
    for (let i = 0; i < esperas.length; i++) {
      if (esperas[i]) await new Promise<void>((r) => { deps.relogio.definir(r, esperas[i]); });
      if (!vivo) return false;
      try { await fn(); return true; } catch (e) {
        if (i === esperas.length - 1) deps.aviso?.(`lembretes: o servidor não guardou (${String((e as Error)?.message ?? e)})`);
      }
    }
    return false;
  };

  return {
    iniciar() {
      if (vivo) return;
      vivo = true;
      limparMarcasVelhas(deps.armazenamento, deps.agora());
      void atualizar();
      proximaBusca();
      proximaConferencia();
    },
    parar() {
      vivo = false;
      if (hBusca !== null) deps.relogio.limpar(hBusca);
      if (hConfere !== null) deps.relogio.limpar(hConfere);
      hBusca = hConfere = null;
      for (const id of [...relogios.keys()]) desarmar(id);
    },
    atualizar,
    resolver(chave, acao) {
      const a = fila.find((x) => x.chave === chave);
      if (!a || !vivo) return false;
      const agora = agoraServidor();
      const s: Silencio = acao === 'ok'
        ? { acao, ate: Math.max(Date.parse(a.quando), a.quandoMs) + JANELA_ATRASO_MS + 3_600_000 }
        : { acao, ate: agora + ADIAR_MIN * 60_000 };
      gravar(deps.armazenamento, K_SILENCIO + chaveBase(a.id, a.quando), JSON.stringify(s));
      // o adiado já fica armado aqui (volta em 10 min mesmo sem servidor); o Ok some de vez
      reconciliar(null);
      if (a.demo) return true;
      void comInsistencia(() => (acao === 'ok' ? deps.confirmar(a.id) : deps.adiar(a.id, ADIAR_MIN)))
        .then((ok) => { if (ok && acao === 'adiar') void atualizar(); }); // o quando novo do servidor
      return true;
    },
    aoArmazenamento(chave) {
      if (chave === null || chave.startsWith(K_SILENCIO)) reconciliar(null);
    },
    injetar(novos) {
      for (const i of novos) itens.set(i.id, { ...i, demo: true });
      reconciliar(null);
    },
    fila: () => fila,
  };
}

/* ================================================================== uma aba só fala (Web Locks) */

/** Entra na disputa pela trava: a aba que a tem fala; quando ela fecha, a próxima assume. Devolve o "sair". */
export function disputarLideranca(travas: TravasLike | null, aoMudar: (lider: boolean) => void, nome: string = TRAVA_LEMBRETES): () => void {
  if (!travas) { aoMudar(true); return () => aoMudar(false); }
  let vivo = true;
  let lider = false;
  let soltar: (() => void) | null = null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const virarLider = () => { if (vivo && !lider) { lider = true; aoMudar(true); } };
  try {
    travas.request(nome, ctrl ? { signal: ctrl.signal } : {}, () => new Promise<void>((resolve) => {
      if (!vivo) { resolve(); return; }
      soltar = resolve;
      virarLider();
    })).catch(() => {
      // desistiu (saiu da página) — ou o navegador recusou a trava: esta aba fala sozinha
      if (vivo && !ctrl?.signal.aborted) virarLider();
    });
  } catch {
    virarLider();
  }
  return () => {
    vivo = false;
    ctrl?.abort();
    if (soltar) { (soltar as () => void)(); soltar = null; }
    if (lider) { lider = false; aoMudar(false); }
  };
}

/** Segura a trava de ESPERA (modo compartilhado: várias abas com som ao mesmo tempo) enquanto esta aba tem som;
    as outras abas a enxergam por esperaEmAlgumaAba. Sem Web Locks, nada (as outras abas não sabem — como antes).
    A aba que fecha solta sozinha. Devolve o "soltar". */
export function segurarEspera(travas: TravasLike | null, nome: string = TRAVA_ESPERA): () => void {
  if (!travas) return () => undefined;
  let vivo = true;
  let soltar: (() => void) | null = null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  try {
    travas.request(nome, { mode: 'shared', ...(ctrl ? { signal: ctrl.signal } : {}) }, () => new Promise<void>((resolve) => {
      if (!vivo) { resolve(); return; }
      soltar = resolve;
    })).catch(() => undefined);
  } catch { /* o navegador recusou: segue sem o sinal */ }
  return () => {
    vivo = false;
    ctrl?.abort();
    if (soltar) { (soltar as () => void)(); soltar = null; }
  };
}

/** Alguma aba (esta ou outra) tem som agora? — false sem Web Locks ou se a consulta falhar (nunca segura a fala
    por erro do navegador). */
export async function esperaEmAlgumaAba(travas: TravasLike | null, nome: string = TRAVA_ESPERA): Promise<boolean> {
  if (!travas || typeof travas.query !== 'function') return false;
  try {
    const q = await travas.query();
    return !!q?.held?.some((t) => t?.name === nome);
  } catch {
    return false;
  }
}

/** A aba que fala ainda precisa conferir a espera das outras abas? Enquanto não falou e até um tempo depois de
    começar a falar (a voz atrasada ainda pode tocar); falada há mais tempo e calada, não. */
export function precisaConferirEspera(a: ArmazenamentoLike | null, chave: string, falando: boolean, agora: number = Date.now()): boolean {
  if (falando) return true;
  const v = ler(a, K_FALADO + chave);
  if (v === null) return true;
  const t = Number(v);
  return !Number.isFinite(t) || agora - t < CONFERE_ESPERA_DEPOIS_MS;
}

/** RESERVA: quem não é a dona da trava fala no lugar dela quando, passado este tempo, ninguém falou (a dona sem
    nenhum clique desde que abriu — o navegador não deixa tocar —, congelada ou fechando). A dona fala em ≤ ~5 s
    (assentar + liberar o som + a espera da voz de 4 s → o som curto); em segundo plano o navegador atrasa cada
    relógio dela até ~1 s — daí a folga. */
export const RESERVA_FALA_MS = 10_000;

/** Esta aba (que NÃO é a dona da trava) fala de reserva? Só à vista (a pessoa está nela), com clique (o navegador
    deixa tocar), sem nada por cima e se ninguém falou ainda. */
export function podeFalarDeReserva(p: {
  lider: boolean; oculto: boolean; aviso: AvisoLembrete | null; armazenamento: ArmazenamentoLike | null; aVista: boolean; ativada: boolean;
}): boolean {
  return !!p.aviso && !p.lider && !p.oculto && p.aVista && p.ativada && !jaFalado(p.armazenamento, p.aviso.chave);
}

/** A aba já recebeu um clique/tecla (o navegador deixa tocar)? Sem a API, supõe que sim (como antes). */
export function abaAtivada(): boolean {
  const ua = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : true;
}

/** A aba fala este aviso agora? (a dona da trava, sem nada por cima e sem já ter falado) */
export function podeAnunciar(p: { lider: boolean; oculto: boolean; aviso: AvisoLembrete | null; armazenamento: ArmazenamentoLike | null }): boolean {
  return !!p.aviso && p.lider && !p.oculto && !jaFalado(p.armazenamento, p.aviso.chave);
}

/* ================================================================== o som (Web Audio) */

export interface SomLembrete {
  /** cria/retoma o som — false = o navegador não deixa tocar agora (nenhum gesto na página ainda) */
  liberar(): Promise<boolean>;
  /** toca a voz (WAV) até o fim — false se não deu para tocar */
  tocarVoz(wav: ArrayBuffer, aoNivel?: (nivel: number) => void): Promise<boolean>;
  /** o som curto e discreto (sem voz): duas notas suaves, sem arquivo */
  tocarSino(): Promise<boolean>;
  parar(): void;
  fechar(): void;
}

type CtorAudio = typeof AudioContext;

export function criarSomLembrete(): SomLembrete {
  const Ctor: CtorAudio | undefined = typeof window === 'undefined'
    ? undefined
    : window.AudioContext ?? (window as unknown as { webkitAudioContext?: CtorAudio }).webkitAudioContext;
  let ctx: AudioContext | null = null;
  let fontes: AudioScheduledSourceNode[] = [];
  let raf = 0;

  const pararNivel = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };

  async function liberar(): Promise<boolean> {
    if (!Ctor) return false;
    const ativacao = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ativacao && !ativacao.hasBeenActive) return false; // nenhum clique/tecla na página: o navegador bloqueia
    try {
      if (!ctx || ctx.state === 'closed') ctx = new Ctor();
      if (ctx.state !== 'running') await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 500))]);
      return ctx.state === 'running';
    } catch {
      return false;
    }
  }

  function parar() {
    pararNivel();
    for (const f of fontes) { try { f.onended = null; f.stop(); } catch { /* já parou */ } }
    fontes = [];
  }

  async function tocarVoz(wav: ArrayBuffer, aoNivel?: (nivel: number) => void): Promise<boolean> {
    if (!(await liberar()) || !ctx) return false;
    const c = ctx;
    let buf: AudioBuffer;
    try { buf = await c.decodeAudioData(wav.slice(0)); } catch { return false; }
    parar();
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    fontes.push(src);
    if (aoNivel) {
      // o nível da voz para a esfera (RMS de cada quadro, suavizado)
      const an = c.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      const amostras = new Float32Array(an.fftSize);
      let nivel = 0;
      const laco = () => {
        an.getFloatTimeDomainData(amostras);
        let s = 0;
        for (let i = 0; i < amostras.length; i++) s += amostras[i] * amostras[i];
        const alvo = Math.min(1, Math.sqrt(s / amostras.length) * 4.2);
        nivel += (alvo - nivel) * (alvo > nivel ? 0.45 : 0.16);
        aoNivel(nivel);
        raf = requestAnimationFrame(laco);
      };
      raf = requestAnimationFrame(laco);
    }
    return new Promise<boolean>((res) => {
      src.onended = () => {
        pararNivel();
        aoNivel?.(0);
        fontes = fontes.filter((f) => f !== src);
        res(true);
      };
      try { src.start(); } catch { pararNivel(); res(false); }
    });
  }

  async function tocarSino(): Promise<boolean> {
    if (!(await liberar()) || !ctx) return false;
    const c = ctx;
    const t0 = c.currentTime + 0.03;
    const nota = (freq: number, t: number, pico: number, dur: number) => {
      // fundamental + um parcial bem fraco (timbre de sino pequeno), ataque curto e queda suave
      for (const [mult, peso] of [[1, 1], [2.006, 0.14]] as const) {
        const o = c.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq * mult;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(pico * peso, t + 0.014);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(c.destination);
        o.start(t);
        o.stop(t + dur + 0.05);
        fontes.push(o);
      }
    };
    nota(659.25, t0, 0.075, 0.95);        // mi
    nota(987.77, t0 + 0.14, 0.06, 1.15);  // si (a quinta acima)
    await new Promise((r) => setTimeout(r, 1_400));
    return true;
  }

  return {
    liberar,
    tocarVoz,
    tocarSino,
    parar,
    fechar() {
      parar();
      const c = ctx;
      ctx = null;
      if (c && c.state !== 'closed') void c.close().catch(() => undefined);
    },
  };
}

/* ================================================================== o anúncio (voz, som, notificação) */

export interface DepsAnuncio {
  obterVoz: (fala: string) => Promise<ArrayBuffer | null>;
  som: SomLembrete;
  esperar: (ms: number) => Promise<void>;
  /** aba escondida ou janela sem foco: vale a notificação do sistema */
  emSegundoPlano: () => boolean;
  /** a notificação do sistema (só com a permissão já dada); devolve o "fechar" */
  notificar: (aviso: AvisoLembrete, silenciosa: boolean) => (() => void) | null;
  /** som travado: chama `fn` no primeiro toque/tecla da pessoa; devolve o "desarmar" */
  armarGesto: (fn: () => void) => () => void;
  /** o som começou: a ocorrência não fala de novo (nem em outra aba) */
  marcarFalado: () => void;
  /** outra aba já falou esta ocorrência? (o gesto que chega tarde não repete a fala) */
  jaFalado?: () => boolean;
  aoFalar?: (falando: boolean) => void;
  aoNivel?: (nivel: number) => void;
}

/** Fala o aviso: a voz dela; sem voz, o som curto; som travado, no primeiro gesto. Devolve o "cancelar". */
export function anunciar(aviso: AvisoLembrete, fala: string, d: DepsAnuncio): () => void {
  let cancelado = false;
  let marcado = false;
  let fecharNotif: (() => void) | null = null;
  let desarmar: (() => void) | null = null;
  const voz = d.obterVoz(fala).catch(() => null);
  const marcar = () => { if (!marcado) { marcado = true; d.marcarFalado(); } };

  const tocarVoz = async (wav: ArrayBuffer): Promise<boolean> => {
    if (cancelado) return false;
    marcar();
    d.aoFalar?.(true);
    const ok = await d.som.tocarVoz(wav, d.aoNivel).catch(() => false);
    d.aoFalar?.(false);
    return ok;
  };

  void (async () => {
    const liberado = await d.som.liberar().catch(() => false);
    if (cancelado) return;
    if (d.emSegundoPlano()) fecharNotif = d.notificar(aviso, liberado);
    if (!liberado) {
      // o navegador ainda não deixa tocar (nenhum clique nesta página): ela fala no primeiro toque/tecla
      desarmar = d.armarGesto(() => {
        desarmar = null;
        void (async () => {
          // outra aba (a reserva à vista) já falou: o gesto daqui não repete
          if (cancelado || d.jaFalado?.() || !(await d.som.liberar().catch(() => false))) return;
          const v = await voz;
          if (v && !cancelado && !d.jaFalado?.()) await tocarVoz(v);
          if (!cancelado) d.som.fechar();
        })();
      });
      return;
    }
    const v = await Promise.race([voz, d.esperar(ESPERA_VOZ_MS).then(() => undefined)]);
    if (cancelado) return;
    if (v && (await tocarVoz(v))) { if (!cancelado) d.som.fechar(); return; }
    if (cancelado) return;
    // sem voz (limite do dia, crédito, rede) ou ela ainda não chegou: o som curto
    marcar();
    await d.som.tocarSino().catch(() => false);
    if (v === undefined && !cancelado) {
      // a voz atrasou: se chegar logo, ela ainda fala (com o aviso na tela)
      const tarde = await Promise.race([voz, d.esperar(VOZ_TARDIA_MS).then(() => null)]);
      if (tarde && !cancelado) await tocarVoz(tarde);
    }
    if (!cancelado) d.som.fechar();
  })();

  return () => {
    if (cancelado) return;
    cancelado = true;
    d.som.fechar();
    desarmar?.();
    desarmar = null;
    fecharNotif?.();
    fecharNotif = null;
    d.aoFalar?.(false);
  };
}

/** A notificação do sistema — só com a permissão JÁ dada (nunca pede); clique traz a aba para a frente. */
export function notificarSistema(aviso: AvisoLembrete, silenciosa: boolean): (() => void) | null {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null;
    const n = new Notification('Lembrete', {
      body: textoDoCartao(aviso.texto),
      tag: `atenvo-lembrete-${aviso.id}`,
      silent: silenciosa,
      icon: '/icons/pwa-192.png',
    });
    n.onclick = () => {
      try { window.focus(); } catch { /* o navegador decide */ }
      n.close();
    };
    return () => n.close();
  } catch {
    return null;
  }
}

/** Som travado: o primeiro toque/tecla da pessoa dispara `fn` — fora dos botões do aviso (já resolvem) e do balão
    / cartão de voz (o clique no balão abre a conversa: o lembrete espera ela fechar, não começa a falar junto). */
export function armarGestoNaJanela(fn: () => void): () => void {
  const aoGesto = (e: Event) => {
    const alvo = e.target as Element | null;
    if (alvo && typeof alvo.closest === 'function' && alvo.closest('.lmb-acoes, .ast-raiz')) return;
    sair();
    fn();
  };
  const sair = () => {
    window.removeEventListener('pointerdown', aoGesto, true);
    window.removeEventListener('keydown', aoGesto, true);
  };
  window.addEventListener('pointerdown', aoGesto, true);
  window.addEventListener('keydown', aoGesto, true);
  return sair;
}

/* ================================================================== demo */

export type TipoDemoLembrete = 'um' | 'fila' | 'longo' | 'atrasado';

/** ?lembrete-demo=1 | fila | longo | atrasado */
export function lerDemoLembrete(search: string): TipoDemoLembrete | null {
  const v = new URLSearchParams(search).get('lembrete-demo');
  if (v === null) return null;
  if (v === 'fila' || v === 'longo' || v === 'atrasado') return v;
  return v === '' || v === '1' || v === 'sim' || v === 'true' ? 'um' : null;
}

/** a simulação pedida na URL de ENTRADA (lida ao carregar: a página pode reescrever a busca da URL antes do shell) */
const DEMO_DA_URL: TipoDemoLembrete | null = (() => {
  try {
    return DEMO_PERMITIDA && typeof window !== 'undefined' ? lerDemoLembrete(window.location.search) : null;
  } catch {
    return null;
  }
})();

export function lembretesDemo(tipo: TipoDemoLembrete, agoraMs: number): ItemAgenda[] {
  const iso = (ms: number) => new Date(ms).toISOString();
  // no minuto cheio (como o banco marca): duas abas abertas no mesmo minuto veem a MESMA ocorrência
  const agora = Math.floor(agoraMs / 60_000) * 60_000;
  const joao: ItemAgenda = {
    id: 'demo-lembrete-joao', texto: 'ligar para o João sobre a proposta do empréstimo', quando: iso(agora), status: 'avisado', demo: true,
  };
  if (tipo === 'fila') {
    return [
      joao,
      { id: 'demo-lembrete-maria', texto: 'mandar o contrato da Dona Maria para o administrativo', quando: iso(agora - 35 * 60_000), status: 'avisado', demo: true },
      { id: 'demo-lembrete-sebastiao', texto: 'conferir os documentos do Sebastião', quando: iso(agora - 3 * 3_600_000), status: 'avisado', demo: true },
    ];
  }
  if (tipo === 'longo') {
    return [{
      id: 'demo-lembrete-longo',
      texto: 'retornar para a Dona Terezinha sobre a portabilidade: confirmar se o extrato novo chegou, conferir o valor das parcelas com o administrativo e avisar o filho dela que o contrato sai até sexta',
      quando: iso(agora), status: 'avisado', demo: true,
    }];
  }
  if (tipo === 'atrasado') return [{ ...joao, id: 'demo-lembrete-atrasado', quando: iso(agora - 2 * 3_600_000) }];
  return [joao];
}

/* ================================================================== o hook da tela */

/** navigator.locks (Web Locks) quando existe */
const travasDoNavegador = (): TravasLike | null =>
  (typeof navigator === 'undefined' ? null : ((navigator as Navigator & { locks?: unknown }).locks as TravasLike | undefined)) ?? null;

export interface EstadoLembretes {
  fila: AvisoLembrete[];
  frente: AvisoLembrete | null;
  /** a voz dela está tocando agora (a esfera acende) */
  falando: boolean;
  confirmar: (chave: string) => void;
  adiar: (chave: string) => void;
  /** registra quem recebe o nível da voz a cada quadro (a esfera); null desliga */
  aoNivel: (fn: ((nivel: number) => void) | null) => void;
}

export interface OpcoesLembretes {
  org: string;
  uid: string;
  /** o nome de exibição (a fala usa o primeiro nome) */
  nome: string;
  /** bom dia, cartão de voz ou tela cheia do Radar NESTA aba: o aviso espera (não aparece nem fala) */
  oculto: boolean;
  /** SOM nesta aba (a conversa de voz aberta — o microfone ouve — ou o bom dia falando): a aba que fala, se for
      outra, também espera (a trava de espera). Tela parada (o bom dia esperando o play) não segura ninguém. */
  somNaAba?: boolean;
  /** false = não busca nada (ex.: quem ainda não tem a voz liberada) */
  ativo?: boolean;
}

export function useLembretes(o: OpcoesLembretes): EstadoLembretes {
  const ativo = (o.ativo ?? true) && !!o.org && !!o.uid && (LEMBRETES_REAL || DEMO_PERMITIDA);
  const [fila, setFila] = useState<AvisoLembrete[]>([]);
  const [lider, setLider] = useState(false);
  const [falando, setFalando] = useState(false);
  const agendaRef = useRef<AgendaLembretes | null>(null);
  const nivelRef = useRef<((n: number) => void) | null>(null);
  const liderRef = useRef(false);
  liderRef.current = lider;
  const nomeRef = useRef(o.nome);
  nomeRef.current = o.nome;
  const vozesRef = useRef(new Map<string, { p: Promise<ArrayBuffer | null>; em: number }>());

  /** a voz de uma fala: pedida uma vez (2 min antes) e reaproveitada na hora; falha não fica guardada */
  const obterVoz = useCallback((fala: string): Promise<ArrayBuffer | null> => {
    const mapa = vozesRef.current;
    const agora = Date.now();
    for (const [k, v] of mapa) if (agora - v.em > 20 * 60_000) mapa.delete(k);
    const c = mapa.get(fala);
    if (c) return c.p;
    const p = pedirVozLembrete(fala);
    mapa.set(fala, { p, em: agora });
    void p.then((v) => { if (!v && mapa.get(fala)?.p === p) mapa.delete(fala); });
    return p;
  }, []);

  // a agenda: uma por pessoa e empresa (trocou → recomeça)
  useEffect(() => {
    if (!ativo) { setFila([]); return; }
    const org = o.org;
    const armazenamento = armazenamentoSeguro();
    const ag = criarAgendaLembretes({
      agora: () => Date.now(),
      buscar: () => (LEMBRETES_REAL ? buscarLembretesDevidos(org) : Promise.resolve([])),
      confirmar: confirmarLembrete,
      adiar: adiarLembrete,
      relogio: { definir: (fn, ms) => window.setTimeout(fn, ms), limpar: (h) => window.clearTimeout(h as number) },
      armazenamento,
      aoMudar: (f) => setFila(f),
      aoPreparar: (item) => { if (liderRef.current && !item.demo) void obterVoz(falaDoLembrete(nomeRef.current, item.texto)); },
      aviso: (m) => console.warn(m),
    });
    agendaRef.current = ag;
    ag.iniciar();
    // voltou para a aba (ou para a janela): confere no servidor (no máximo a cada 10 s)
    let ultima = Date.now();
    const aoVoltar = () => {
      if (document.visibilityState !== 'visible') return;
      const t = Date.now();
      if (t - ultima < 10_000) return;
      ultima = t;
      void ag.atualizar();
    };
    // a voz criou/cancelou um lembrete (nesta aba ou em outra): busca de novo agora
    const aoMudarem = () => { void ag.atualizar(); };
    // Ok/adiar em outra aba: o aviso sai desta também; a voz mexeu nos lembretes em outra aba: busca de novo
    const aoGuardar = (e: StorageEvent) => {
      const acao = acaoDoArmazenamento(e.key);
      if (acao === 'buscar') aoMudarem();
      else if (acao === 'refazer') ag.aoArmazenamento(e.key);
    };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    window.addEventListener('storage', aoGuardar);
    window.addEventListener(EVENTO_LEMBRETES_MUDARAM, aoMudarem);
    const demo = DEMO_DA_URL;
    const tDemo = demo ? window.setTimeout(() => ag.injetar(lembretesDemo(demo, Date.now())), 3_000) : 0;
    return () => {
      window.clearTimeout(tDemo);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
      window.removeEventListener('storage', aoGuardar);
      window.removeEventListener(EVENTO_LEMBRETES_MUDARAM, aoMudarem);
      ag.parar();
      if (agendaRef.current === ag) agendaRef.current = null;
      setFila([]);
    };
  }, [ativo, o.org, o.uid, obterVoz]);

  // uma aba só fala: a dona da trava (fechou a aba, a próxima assume)
  useEffect(() => {
    if (!ativo) return;
    return disputarLideranca(travasDoNavegador(), setLider);
  }, [ativo]);

  // som nesta aba (a conversa de voz aberta, o bom dia falando): a trava de espera avisa as outras abas
  const somNaAba = !!o.somNaAba;
  useEffect(() => {
    if (!ativo || !somNaAba) return;
    return segurarEspera(travasDoNavegador());
  }, [ativo, somNaAba]);

  const frente = fila[0] ?? null;
  const frenteRef = useRef(frente);
  frenteRef.current = frente;
  const chaveFrente = frente?.chave ?? null;
  const falandoRef = useRef(falando);
  falandoRef.current = falando;

  // confere se ALGUMA aba tem som (a conversa de voz ou o bom dia falando pode estar em outra aba: a voz do
  // lembrete não pode entrar no microfone da conversa nem tocar por cima do bom dia) — enquanto o da frente não
  // foi falado e até um pouco depois (a dona da trava fala; a aba à vista pode falar de reserva)
  const [esperaFora, setEsperaFora] = useState(false);
  useEffect(() => {
    const travas = travasDoNavegador();
    if (!ativo || !chaveFrente || typeof travas?.query !== 'function') { setEsperaFora(false); return; }
    const armazenamento = armazenamentoSeguro();
    let vivo = true;
    let t = 0;
    const conferir = async () => {
      const ocupada = await esperaEmAlgumaAba(travas);
      if (!vivo) return;
      setEsperaFora(ocupada);
      if (ocupada || precisaConferirEspera(armazenamento, chaveFrente, falandoRef.current)) {
        t = window.setTimeout(() => { void conferir(); }, CONFERE_ESPERA_MS);
      }
    };
    void conferir();
    return () => { vivo = false; window.clearTimeout(t); };
  }, [ativo, chaveFrente]);

  // a frente da fila fala (na aba dona da trava, sem bom dia nem cartão de voz por cima — nesta aba ou em
  // outra —, uma vez só). RESERVA: a dona não falou em 10 s (aba sem nenhum clique desde que abriu — depois de
  // "Atualizar", por exemplo: o navegador não deixa tocar —, congelada ou fechando) → a aba À VISTA, com clique,
  // fala no lugar dela.
  const esperar = o.oculto || esperaFora;
  useEffect(() => {
    if (!chaveFrente) return;
    const armazenamento = armazenamentoSeguro();
    let cancelar: (() => void) | null = null;
    const falar = (aviso: AvisoLembrete) => {
      cancelar = anunciar(aviso, falaDoLembrete(nomeRef.current, aviso.texto), {
        obterVoz: (fala) => (aviso.demo ? Promise.resolve(null) : obterVoz(fala)),
        som: criarSomLembrete(),
        esperar: (ms) => new Promise<void>((r) => { window.setTimeout(r, ms); }),
        emSegundoPlano: () => document.visibilityState === 'hidden' || !document.hasFocus(),
        notificar: notificarSistema,
        armarGesto: armarGestoNaJanela,
        marcarFalado: () => marcarFalado(armazenamento, aviso.chave),
        jaFalado: () => jaFalado(armazenamento, aviso.chave),
        aoFalar: setFalando,
        aoNivel: (n) => nivelRef.current?.(n),
      });
    };
    const daFrente = () => {
      const aviso = frenteRef.current;
      return aviso && aviso.chave === chaveFrente ? aviso : null;
    };
    let tReserva = 0;
    const t = window.setTimeout(() => {
      const aviso = daFrente();
      if (!aviso) return;
      if (podeAnunciar({ lider, oculto: esperar, aviso, armazenamento })) { falar(aviso); return; }
      if (lider || esperar) return;
      tReserva = window.setTimeout(() => {
        const a = daFrente();
        const aVista = document.visibilityState === 'visible' && document.hasFocus();
        if (podeFalarDeReserva({ lider, oculto: esperar, aviso: a, armazenamento, aVista, ativada: abaAtivada() })) falar(a!);
      }, RESERVA_FALA_MS);
    }, ASSENTAR_MS);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(tReserva);
      cancelar?.();
      setFalando(false);
    };
  }, [chaveFrente, lider, esperar, obterVoz]);

  const confirmar = useCallback((chave: string) => { agendaRef.current?.resolver(chave, 'ok'); }, []);
  const adiar = useCallback((chave: string) => { agendaRef.current?.resolver(chave, 'adiar'); }, []);
  const aoNivel = useCallback((fn: ((n: number) => void) | null) => { nivelRef.current = fn; }, []);

  return { fila, frente, falando, confirmar, adiar, aoNivel };
}
