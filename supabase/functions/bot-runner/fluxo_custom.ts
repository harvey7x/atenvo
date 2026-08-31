// ============================================================================
// FLUXO CUSTOM (IA configurável): interpretador PURO dos fluxos do painel
// (ia_fluxos.passos, jsonb). Sem Deno/DB aqui — o handler tratarComFluxoCustom
// (index.ts) faz IO/envio/persistência.
//
// CONTRATO ESPELHADO no front (src/data/iaFluxos.ts — simulador): mesma
// validação, casamento de opção, escada de tentativas, RAMIFICAÇÃO e coleta.
//
// Passos (cada um tem `id` estável, gerado pelo editor):
//   { id, tipo:'mensagem', baloes:[...] }
//   { id, tipo:'pergunta', baloes:[...], opcoes:[{rotulo,valor,irPara?}...], salvarEm, reprompt }
//   { id, tipo:'coletar',  baloes:[...], dado:'nome'|'cpf'|'telefone'|'email'|'texto', salvarEm, reprompt }
//   { id, tipo:'acao',     etiqueta?, chamarHumano?, entregarIa? }
//   { id, tipo:'fim',      baloes?:[...] }
//
// RAMIFICAÇÃO: cada opção da pergunta pode ter irPara = id de um passo (pula pra ele),
// 'fim' (encerra) ou vazio (segue pro próximo). Referência por ID = estável a reordenação.
// ============================================================================
import { extrairCpfDeTexto } from './fluxo_video.ts';

export type DadoColeta = 'nome' | 'cpf' | 'telefone' | 'email' | 'texto';

export type PassoCustom = {
  id?: unknown; tipo?: unknown; baloes?: unknown; opcoes?: unknown; salvarEm?: unknown;
  reprompt?: unknown; dado?: unknown; etiqueta?: unknown; chamarHumano?: unknown; entregarIa?: unknown;
};

export interface EstadoCf { passo: number; dados: Record<string, string>; tentativas: number; concluido: boolean }
export interface AcaoCf { etiqueta?: string; chamarHumano?: boolean; entregarIa?: boolean }
/** dado coletado NESTE turno (o handler persiste na ficha: nome/cpf via RPC da casa) */
export interface ColetaCf { dado: DadoColeta; chave: string; valor: string; digits?: string }

export interface TurnoCf {
  baloes: string[];
  acoes: AcaoCf[];
  estado: EstadoCf;
  aguardando: boolean;
  escalarHumano: boolean;
  coletou?: ColetaCf;
}

const MAX_TENTATIVAS = 2;
const MAX_BALOES_TURNO = 6;

const semAcento = (s: string): string => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** interpola {chave} nos balões a partir dos dados coletados. {primeiro_nome} = 1ª palavra do nome.
    variável sem valor vira vazio (some da frase). Espelhado no simulador do painel. */
export function interpolar(texto: string, dados: Record<string, string>): string {
  return String(texto ?? '').replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_m, chave: string) => {
    if (chave === 'primeiro_nome') { const n = String(dados['nome'] ?? '').trim(); return n ? n.split(/\s+/)[0] : ''; }
    const v = dados[chave];
    return (v === undefined || v === null) ? '' : String(v);
  });
}

function baloesDe(v: unknown): string[] {
  return (Array.isArray(v) ? v : []).map((b) => String(b ?? '').trim()).filter(Boolean).slice(0, MAX_BALOES_TURNO);
}

interface OpcaoNorm { rotulo: string; valor: string; irPara?: string }
function opcoesDe(v: unknown): OpcaoNorm[] {
  return (Array.isArray(v) ? v : [])
    .map((o) => {
      const r = (o ?? {}) as Record<string, unknown>;
      const rotulo = String(r.rotulo ?? '').trim();
      const valor = String(r.valor ?? '').trim();
      const irPara = String(r.irPara ?? '').trim();
      return { rotulo, valor, ...(irPara ? { irPara } : {}) };
    })
    .filter((o) => o.rotulo)
    .map((o) => ({ ...o, valor: o.valor || semAcento(o.rotulo).replace(/\s+/g, '_') }));
}

/** devolve a OPÇÃO casada (com irPara) — número, valor, rótulo exato ou prefixo (nos dois sentidos) */
export function casarOpcao(opcoes: OpcaoNorm[], txt: string): OpcaoNorm | null {
  const t = semAcento(String(txt ?? '').trim());
  if (!t) return null;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= opcoes.length) return opcoes[n - 1];
  for (const o of opcoes) {
    const rot = semAcento(o.rotulo);
    if (t === o.valor.toLowerCase() || t === rot
        || (t.length >= 3 && rot.startsWith(t))
        || (rot.length >= 3 && t.startsWith(rot))) return o;
  }
  return null;
}

/** validação (paridade com o simulador do painel). cpf: guarda mascarado, expõe digits pra ficha */
export function validarDado(dado: DadoColeta, txt: string): { ok: boolean; valor: string; digits?: string } {
  const t = String(txt ?? '').trim();
  switch (dado) {
    case 'nome':
      return { ok: t.length >= 2 && /\p{L}/u.test(t), valor: t };
    case 'cpf': {
      const r = extrairCpfDeTexto(t);
      return { ok: r.valido, valor: r.valido ? `***.***.***-${r.digits.slice(-2)}` : r.digits, digits: r.valido ? r.digits : undefined };
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

/** índice do passo por id (ramificação); -1 se não achar */
function idxPorId(passos: PassoCustom[], id: string): number {
  if (!id) return -1;
  for (let i = 0; i < passos.length; i++) if (String((passos[i] as { id?: unknown }).id ?? '') === id) return i;
  return -1;
}

/** avança do passo atual até o próximo ponto de espera (ou fim), acumulando balões/ações */
export function avancarCf(passos: PassoCustom[], estadoIn: EstadoCf): TurnoCf {
  const baloes: string[] = [];
  const acoes: AcaoCf[] = [];
  let e: EstadoCf = { ...estadoIn, dados: { ...estadoIn.dados } };
  let guarda = 0;
  while (e.passo < passos.length && guarda++ < 60) {
    const p = passos[e.passo];
    if (!p || typeof p !== 'object') { e.passo++; continue; }
    if (p.tipo === 'mensagem') { baloes.push(...baloesDe(p.baloes)); e.passo++; continue; }
    if (p.tipo === 'acao') {
      const a: AcaoCf = {};
      const et = String(p.etiqueta ?? '').trim();
      if (et) a.etiqueta = et.slice(0, 60);
      if (p.chamarHumano === true) a.chamarHumano = true;
      if (p.entregarIa === true) a.entregarIa = true;
      if (Object.keys(a).length) acoes.push(a);
      e.passo++; continue;
    }
    if (p.tipo === 'pergunta') {
      const ops = opcoesDe(p.opcoes);
      if (ops.length < 2) { e.passo++; continue; }
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

/** processa a resposta do cliente no passo de espera atual e segue o trilho (ramificação/coleta) */
export function responderCf(passos: PassoCustom[], estadoIn: EstadoCf, resposta: string): TurnoCf {
  const p = passos[estadoIn.passo];
  let e: EstadoCf = { ...estadoIn, dados: { ...estadoIn.dados } };
  if (!p || (p.tipo !== 'pergunta' && p.tipo !== 'coletar')) return avancarCf(passos, e);

  if (p.tipo === 'pergunta') {
    const ops = opcoesDe(p.opcoes);
    const op = casarOpcao(ops, resposta);
    if (op === null) {
      e = { ...e, tentativas: e.tentativas + 1 };
      if (e.tentativas > MAX_TENTATIVAS) return { baloes: [], acoes: [], estado: e, aguardando: false, escalarHumano: true };
      const rp = String(p.reprompt ?? '').trim() || 'Não entendi — responda com o número de uma das opções 🙂';
      return { baloes: [rp], acoes: [], estado: e, aguardando: true, escalarHumano: false };
    }
    const chave = String(p.salvarEm ?? '').trim();
    if (chave) e.dados[chave.slice(0, 40)] = op.valor;
    // RAMIFICAÇÃO: 'fim' encerra; id de passo pula pra ele; vazio/inválido segue pro próximo
    if (op.irPara === 'fim') {
      return { baloes: [], acoes: [], estado: { ...e, passo: passos.length, tentativas: 0, concluido: true }, aguardando: false, escalarHumano: false };
    }
    let destino = e.passo + 1;
    if (op.irPara) { const idx = idxPorId(passos, op.irPara); if (idx >= 0) destino = idx; }
    return avancarCf(passos, { ...e, passo: destino, tentativas: 0 });
  }

  const dado = (['nome', 'cpf', 'telefone', 'email', 'texto'].includes(String(p.dado)) ? p.dado : 'texto') as DadoColeta;
  const v = validarDado(dado, resposta);
  if (!v.ok) {
    e = { ...e, tentativas: e.tentativas + 1 };
    if (e.tentativas > MAX_TENTATIVAS) return { baloes: [], acoes: [], estado: e, aguardando: false, escalarHumano: true };
    const rp = String(p.reprompt ?? '').trim() || 'Não consegui validar — pode conferir e mandar de novo?';
    return { baloes: [rp], acoes: [], estado: e, aguardando: true, escalarHumano: false };
  }
  const chave = (String(p.salvarEm ?? '').trim() || dado).slice(0, 40);
  e.dados[chave] = v.valor;
  const seg = avancarCf(passos, { ...e, passo: e.passo + 1, tentativas: 0 });
  return { ...seg, coletou: { dado, chave, valor: v.valor, digits: v.digits } };
}
