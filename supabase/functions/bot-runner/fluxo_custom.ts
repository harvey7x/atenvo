// ============================================================================
// FLUXO CUSTOM (IA configurável — Fase Fluxos): interpretador PURO dos fluxos
// montados no painel (ia_fluxos.passos, jsonb). Sem Deno/DB aqui — o handler
// tratarComFluxoCustom (index.ts) faz IO/envio/persistência.
//
// CONTRATO ESPELHADO no front (src/data/iaFluxos.ts — simulador): mesma
// validação, mesmo casamento de opção, mesma escada de tentativas. O que o
// cliente vê no "Testar fluxo" é o que o canal executa.
//
// Passos:
//   { tipo:'mensagem', baloes:[...] }
//   { tipo:'pergunta', baloes:[...], opcoes:[{rotulo,valor}...], salvarEm, reprompt }
//   { tipo:'coletar',  baloes:[...], dado:'nome'|'cpf'|'telefone'|'email'|'texto', salvarEm, reprompt }
//   { tipo:'acao',     etiqueta?, chamarHumano?, entregarIa? }
//   { tipo:'fim',      baloes?:[...] }
// ============================================================================
import { extrairCpfDeTexto } from './fluxo_video.ts';

export type DadoColeta = 'nome' | 'cpf' | 'telefone' | 'email' | 'texto';

export type PassoCustom =
  | { tipo: 'mensagem'; baloes?: unknown }
  | { tipo: 'pergunta'; baloes?: unknown; opcoes?: unknown; salvarEm?: unknown; reprompt?: unknown }
  | { tipo: 'coletar'; baloes?: unknown; dado?: unknown; salvarEm?: unknown; reprompt?: unknown }
  | { tipo: 'acao'; etiqueta?: unknown; chamarHumano?: unknown; entregarIa?: unknown }
  | { tipo: 'fim'; baloes?: unknown };

export interface EstadoCf { passo: number; dados: Record<string, string>; tentativas: number; concluido: boolean }

export interface AcaoCf { etiqueta?: string; chamarHumano?: boolean; entregarIa?: boolean }

export interface TurnoCf {
  baloes: string[];
  acoes: AcaoCf[];
  estado: EstadoCf;
  aguardando: boolean;
  /** estourou a escada de tentativas → o handler pausa e chama humano */
  escalarHumano: boolean;
}

const MAX_TENTATIVAS = 2; // 2 reprompts; a 3ª falha escala pro humano (mesma régua do front)
const MAX_BALOES_TURNO = 6; // lease do runner é 30s — teto duro de balões por turno

const semAcento = (s: string): string => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function baloesDe(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).map((b) => String(b ?? '').trim()).filter(Boolean).slice(0, MAX_BALOES_TURNO);
}

interface OpcaoNorm { rotulo: string; valor: string }
function opcoesDe(v: unknown): OpcaoNorm[] {
  return (Array.isArray(v) ? v : [])
    .map((o) => ({ rotulo: String((o as Record<string, unknown>)?.rotulo ?? '').trim(), valor: String((o as Record<string, unknown>)?.valor ?? '').trim() }))
    .filter((o) => o.rotulo)
    .map((o) => ({ ...o, valor: o.valor || semAcento(o.rotulo).replace(/\s+/g, '_') }));
}

/** número da opção, valor exato, rótulo exato ou prefixo do rótulo (sem acento/caixa) */
export function casarOpcao(opcoes: OpcaoNorm[], txt: string): string | null {
  const t = semAcento(String(txt ?? '').trim());
  if (!t) return null;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= opcoes.length) return opcoes[n - 1].valor;
  for (const o of opcoes) {
    const rot = semAcento(o.rotulo);
    // casa exato, ou por prefixo NOS DOIS sentidos: "empre" → "Empréstimo" e
    // "emprestimo consignado" → "Empréstimo" (mínimo 3 chars pra não casar por acidente)
    if (t === o.valor.toLowerCase() || t === rot
        || (t.length >= 3 && rot.startsWith(t))
        || (rot.length >= 3 && t.startsWith(rot))) return o.valor;
  }
  return null;
}

/** MESMAS regras do simulador do painel (parity é contrato) */
export function validarDado(dado: DadoColeta, txt: string): { ok: boolean; valor: string } {
  const t = String(txt ?? '').trim();
  switch (dado) {
    case 'nome':
      return { ok: t.length >= 2 && /\p{L}/u.test(t), valor: t };
    case 'cpf': {
      const r = extrairCpfDeTexto(t);            // acha 11 dígitos no meio do texto + valida DV
      // guarda MASCARADO (paridade com a fábrica: bot_registrar_cpf só grava cpf_mascarado — não
      // deixar CPF cru em dados_qualificacao). Inválido: devolve o que veio pro reprompt.
      return { ok: r.valido, valor: r.valido ? `***.***.***-${r.digits.slice(-2)}` : r.digits };
    }
    case 'telefone': {
      const d = t.replace(/\D/g, '');
      return { ok: d.length >= 10 && d.length <= 13, valor: d };
    }
    case 'email':
      return { ok: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t), valor: t.toLowerCase() };
    default:
      return { ok: t.length > 0, valor: t };
  }
}

function menuDaPergunta(baloes: string[], opcoes: OpcaoNorm[]): string[] {
  const menu = opcoes.map((o, i) => `${i + 1}. ${o.rotulo}`).join('\n');
  if (!baloes.length) return [menu];
  return [...baloes.slice(0, -1), `${baloes[baloes.length - 1]}\n\n${menu}`];
}

/** avança do passo atual até o próximo ponto de espera (ou fim), acumulando balões/ações */
export function avancarCf(passos: PassoCustom[], estadoIn: EstadoCf): TurnoCf {
  const baloes: string[] = [];
  const acoes: AcaoCf[] = [];
  let e: EstadoCf = { ...estadoIn, dados: { ...estadoIn.dados } };
  let guarda = 0;
  while (e.passo < passos.length && guarda++ < 50) {
    const p = passos[e.passo];
    if (!p || typeof p !== 'object') { e.passo++; continue; }
    if (p.tipo === 'mensagem') { baloes.push(...baloesDe(p.baloes)); e.passo++; continue; }
    if (p.tipo === 'acao') {
      const a: AcaoCf = {};
      const et = String((p as { etiqueta?: unknown }).etiqueta ?? '').trim();
      if (et) a.etiqueta = et.slice(0, 60);
      if ((p as { chamarHumano?: unknown }).chamarHumano === true) a.chamarHumano = true;
      if ((p as { entregarIa?: unknown }).entregarIa === true) a.entregarIa = true;
      if (Object.keys(a).length) acoes.push(a);
      e.passo++; continue;
    }
    if (p.tipo === 'pergunta') {
      const ops = opcoesDe(p.opcoes);
      if (ops.length < 2) { e.passo++; continue; }   // pergunta torta: pula (o editor avisa)
      baloes.push(...menuDaPergunta(baloesDe(p.baloes), ops));
      return { baloes: baloes.slice(0, MAX_BALOES_TURNO), acoes, estado: e, aguardando: true, escalarHumano: false };
    }
    if (p.tipo === 'coletar') {
      baloes.push(...baloesDe(p.baloes));
      return { baloes: baloes.slice(0, MAX_BALOES_TURNO), acoes, estado: e, aguardando: true, escalarHumano: false };
    }
    if (p.tipo === 'fim') {
      baloes.push(...baloesDe(p.baloes));
      return { baloes: baloes.slice(0, MAX_BALOES_TURNO), acoes, estado: { ...e, concluido: true }, aguardando: false, escalarHumano: false };
    }
    e.passo++;
  }
  return { baloes: baloes.slice(0, MAX_BALOES_TURNO), acoes, estado: { ...e, concluido: true }, aguardando: false, escalarHumano: false };
}

/** processa a resposta do cliente no passo de espera atual e segue o trilho */
export function responderCf(passos: PassoCustom[], estadoIn: EstadoCf, resposta: string): TurnoCf {
  const p = passos[estadoIn.passo];
  let e: EstadoCf = { ...estadoIn, dados: { ...estadoIn.dados } };
  if (!p || (p.tipo !== 'pergunta' && p.tipo !== 'coletar')) return avancarCf(passos, e);

  if (p.tipo === 'pergunta') {
    const ops = opcoesDe(p.opcoes);
    const valor = casarOpcao(ops, resposta);
    if (valor === null) {
      e = { ...e, tentativas: e.tentativas + 1 };
      if (e.tentativas > MAX_TENTATIVAS) {
        return { baloes: [], acoes: [], estado: e, aguardando: false, escalarHumano: true };
      }
      const rp = String((p as { reprompt?: unknown }).reprompt ?? '').trim() || 'Não entendi — responda com o número de uma das opções 🙂';
      return { baloes: [rp], acoes: [], estado: e, aguardando: true, escalarHumano: false };
    }
    const chave = String((p as { salvarEm?: unknown }).salvarEm ?? '').trim();
    if (chave) e.dados[chave.slice(0, 40)] = valor;
    return avancarCf(passos, { ...e, passo: e.passo + 1, tentativas: 0 });
  }

  const dado = (['nome', 'cpf', 'telefone', 'email', 'texto'].includes(String((p as { dado?: unknown }).dado)) ? (p as { dado: DadoColeta }).dado : 'texto');
  const v = validarDado(dado, resposta);
  if (!v.ok) {
    e = { ...e, tentativas: e.tentativas + 1 };
    if (e.tentativas > MAX_TENTATIVAS) {
      return { baloes: [], acoes: [], estado: e, aguardando: false, escalarHumano: true };
    }
    const rp = String((p as { reprompt?: unknown }).reprompt ?? '').trim() || 'Não consegui validar — pode conferir e mandar de novo?';
    return { baloes: [rp], acoes: [], estado: e, aguardando: true, escalarHumano: false };
  }
  const chave = String((p as { salvarEm?: unknown }).salvarEm ?? '').trim() || dado;
  e.dados[chave.slice(0, 40)] = v.valor;
  return avancarCf(passos, { ...e, passo: e.passo + 1, tentativas: 0 });
}
