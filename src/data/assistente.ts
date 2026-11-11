import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/* ------------------------------------------------------------------
   Assistente de IA do Atenvo — MODO DE VOZ (dono 30/10: "eu quero por
   voz mesmo. Por texto não me agrada"). Duas chamadas ao servidor:
   - `assistente-voz` {org} → token efêmero do Live API do Gemini, com a
     configuração TRAVADA no servidor (modelo, voz Despina, prompt com o
     contexto da pessoa, ferramentas do papel dela) → {token, modelo,
     expira_em, limite_s, ws_url?}. O navegador conecta DIRETO no Google
     com esse token; a chave do Gemini nunca sai do servidor.
   - `assistente` {org, ferramenta:{nome, args}} → cada chamada de
     ferramenta que o modelo pede na conversa → {resultado, links}. Mesmo
     recorte por papel do servidor (atendente = a própria carteira; admin
     = a equipe): o navegador só repassa o pedido, quem decide é o banco.
   Erros {error, mensagem?} nos dois: 400 pergunta_invalida · 401
   nao_autenticado · 403 sem_acesso · 429 limite_dia (sessões de voz do
   dia) · 503 sem_credito · 502 ia_indisponivel; aqui ainda existe 'rede'
   (o pedido nem chegou). Na DEMO (sem Supabase) a tela simula a conversa
   (src/v2/lib/assistenteVozDemo.ts) e nada daqui é chamado.
   ------------------------------------------------------------------ */

export const ASSISTENTE_REAL = isSupabaseConfigured && !!supabase;

export interface LinkAssistente { rotulo: string; rota: string }

export type CodigoErroAssistente =
  | 'pergunta_invalida' | 'nao_autenticado' | 'sem_acesso' | 'limite_dia' | 'sem_credito' | 'ia_indisponivel' | 'rede';

const CODIGOS: ReadonlySet<string> = new Set<CodigoErroAssistente>([
  'pergunta_invalida', 'nao_autenticado', 'sem_acesso', 'limite_dia', 'sem_credito', 'ia_indisponivel', 'rede',
]);

/** quando o corpo não traz o código (ex.: o 401 do gateway para JWT vencido), o status decide */
const POR_STATUS: Record<number, CodigoErroAssistente> = {
  400: 'pergunta_invalida',
  401: 'nao_autenticado',
  403: 'sem_acesso',
  429: 'limite_dia',
  502: 'ia_indisponivel',
  503: 'sem_credito',
};

export class ErroAssistente extends Error {
  codigo: CodigoErroAssistente;
  constructor(codigo: CodigoErroAssistente, mensagem?: string) {
    super(mensagem || codigo);
    this.name = 'ErroAssistente';
    this.codigo = codigo;
  }
}

interface RespostaLike { status: number; clone: () => { json: () => Promise<unknown> } }
const ehResposta = (x: unknown): x is RespostaLike =>
  !!x && typeof x === 'object' && typeof (x as RespostaLike).status === 'number' && typeof (x as RespostaLike).clone === 'function';

/** Erro do functions.invoke → código do contrato. O supabase-js não lê o corpo de um non-2xx: ele está no
    Response em `error.context` (FunctionsHttpError). Sem Response (FunctionsFetchError, rede caiu) = 'rede'. */
export async function erroDoInvoke(error: unknown): Promise<ErroAssistente> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ehResposta(ctx)) {
    let corpo: { error?: unknown; mensagem?: unknown } | null = null;
    try { corpo = await ctx.clone().json() as { error?: unknown; mensagem?: unknown }; } catch { /* corpo sem JSON */ }
    const mensagem = typeof corpo?.mensagem === 'string' ? corpo.mensagem : undefined;
    if (typeof corpo?.error === 'string' && CODIGOS.has(corpo.error)) {
      return new ErroAssistente(corpo.error as CodigoErroAssistente, mensagem);
    }
    return new ErroAssistente(POR_STATUS[ctx.status] ?? (ctx.status >= 500 ? 'ia_indisponivel' : 'rede'), mensagem);
  }
  return new ErroAssistente('rede', (error as Error | null)?.message);
}

/** só links para conversas do próprio sistema (o servidor manda /whatsapp?conversa=<id>) */
export function linksValidos(x: unknown): LinkAssistente[] {
  if (!Array.isArray(x)) return [];
  const out: LinkAssistente[] = [];
  for (const l of x) {
    const o = (l && typeof l === 'object' ? l : {}) as Record<string, unknown>;
    if (typeof o.rotulo !== 'string' || typeof o.rota !== 'string') continue;
    if (!/^\/whatsapp\?conversa=[\w-]{1,64}$/.test(o.rota)) continue;
    out.push({ rotulo: o.rotulo.trim() || 'Cliente', rota: o.rota });
    if (out.length >= 5) break;
  }
  return out;
}

/* ------------------------------------------------------------------ a sessão de voz (token efêmero) */

export interface SessaoVozServidor {
  /** o `name` inteiro do token ("auth_tokens/…") */
  token: string;
  modelo: string;
  expira_em: string | null;
  /** teto da conversa em segundos (o servidor manda 600) */
  limite_s: number;
  /** a URL do WebSocket já montada pelo servidor (opcional; a tela confere o endereço) */
  ws_url?: string;
  /** "Oi, {primeiro nome}. Pode perguntar." — a legenda de reserva se a voz do cumprimento não vier */
  saudacao?: string;
  /** o texto que pede o cumprimento logo depois do setupComplete ("[início da conversa]") */
  gatilho_inicio?: string;
}

/** Pede uma conversa de voz: o servidor confere quem é, o teto de sessões do dia e cria o token. */
export async function pedirSessaoVoz(org: string): Promise<SessaoVozServidor> {
  if (!ASSISTENTE_REAL) throw new ErroAssistente('ia_indisponivel', 'sem servidor (demo)');
  let resp: { data: unknown; error: unknown };
  try {
    resp = await supabase!.functions.invoke('assistente-voz', { body: { org } });
  } catch (e) {
    throw new ErroAssistente('rede', (e as Error)?.message);
  }
  if (resp.error) throw await erroDoInvoke(resp.error);
  const d = (resp.data && typeof resp.data === 'object' ? resp.data : {}) as Record<string, unknown>;
  if (typeof d.token !== 'string' || !d.token.trim()) throw new ErroAssistente('ia_indisponivel', 'resposta sem token');
  return {
    token: d.token.trim(),
    modelo: typeof d.modelo === 'string' && d.modelo.trim() ? d.modelo.trim() : 'gemini-3.8-live',
    expira_em: typeof d.expira_em === 'string' ? d.expira_em : null,
    limite_s: typeof d.limite_s === 'number' && Number.isFinite(d.limite_s) ? d.limite_s : 600,
    ...(typeof d.ws_url === 'string' ? { ws_url: d.ws_url } : {}),
    ...(typeof d.saudacao === 'string' && d.saudacao.trim() ? { saudacao: d.saudacao.trim().slice(0, 120) } : {}),
    ...(typeof d.gatilho_inicio === 'string' && d.gatilho_inicio.trim() ? { gatilho_inicio: d.gatilho_inicio.trim().slice(0, 60) } : {}),
  };
}

/** Uma chamada de ferramenta do modelo, executada no servidor com o JWT de quem fala (o mesmo recorte do
    sistema). Recusa de escopo e argumento inválido voltam DENTRO do resultado (200), para o modelo explicar. */
export async function executarFerramentaVoz(p: {
  org: string; nome: string; args: Record<string, unknown>; signal?: AbortSignal;
}): Promise<{ resultado: unknown; links: LinkAssistente[] }> {
  if (!ASSISTENTE_REAL) throw new ErroAssistente('ia_indisponivel', 'sem servidor (demo)');
  let resp: { data: unknown; error: unknown };
  try {
    resp = await supabase!.functions.invoke('assistente', {
      body: { org: p.org, ferramenta: { nome: p.nome, args: p.args ?? {} } },
      ...(p.signal ? { signal: p.signal } : {}),
    });
  } catch (e) {
    throw new ErroAssistente('rede', (e as Error)?.message);
  }
  if (resp.error) throw await erroDoInvoke(resp.error);
  const d = (resp.data && typeof resp.data === 'object' ? resp.data : {}) as Record<string, unknown>;
  if (!('resultado' in d)) throw new ErroAssistente('ia_indisponivel', 'resposta sem resultado');
  return { resultado: d.resultado, links: linksValidos(d.links) };
}
