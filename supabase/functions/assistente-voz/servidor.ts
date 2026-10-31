// assistente-voz — o tratamento do pedido HTTP, com as dependências injetadas: o index.ts liga as reais (Supabase
// com a service key, fetch, log); os testes (servidor_test.ts) ligam falsas, sem rede.
//
//   POST {org} com o JWT do usuário (supabase.functions.invoke) →
//     1. quem fala: auth.getUser; no QA, SÓ a própria service key + x-assistente-ator (S2: autenticar() do assistente)
//     2. assistente_contexto (sem vínculo ativo na org → 403)
//     3. teto de SESSÕES por pessoa por dia: assistente_registrar_uso(p_limite 30) (-1 → 429)
//     4. token efêmero do Live API com a configuração TRAVADA (voz.ts: corpoDoToken) → POST v1beta/auth_tokens
//   → 200 {token, modelo, ws_url, expira_em, abrir_ate, limite_s, saudacao, gatilho_inicio}
//
// O navegador conecta DIRETO no Google com o token (nenhum áudio passa pelo Supabase) e executa cada functionCall
// pelo modo ferramenta do `assistente` (JWT + recorte das RPCs). A GEMINI_API_KEY nunca sai do servidor; o token e
// a ws_url nunca vão para o log.
//
// Erros {error, mensagem} no formato do assistente: 400 pergunta_invalida (corpo fora do formato) · 401
// nao_autenticado · 403 sem_acesso · 429 limite_dia · 503 sem_credito · 502 ia_indisponivel.
import { corsHeaders, json } from '../assistente/cors.ts';
import { type ChamarRpc, type CodigoErro, autenticar, ehUuid } from '../assistente/logica.ts';
import { type LinhaLog, ehSemAcesso, erro } from '../assistente/servidor.ts';
import {
  GATILHO_INICIO, LIMITE_S, TETO_SESSOES_DIA, TIMEOUT_TOKEN_MS, URL_TOKEN, VOZ_PADRAO, classificarErroToken,
  contextoValido, corpoDoToken, montarWsUrl, nomeDoModelo, nomeDoToken, saudacao,
} from './voz.ts';

/** O 200 do assistente-voz (o contrato com o cartão de voz). */
export interface RespostaVoz {
  /** o name inteiro do token ("auth_tokens/…"): vale UMA sessão, aberta em até 60 s */
  token: string;
  /** sem o "models/": a tela manda {"setup":{"model":"models/<modelo>"}} (ignorado: o token já trava tudo) */
  modelo: string;
  /** wss://…BidiGenerateContentConstrained?access_token=<token> — carrega o token: nunca registrar */
  ws_url: string;
  /** depois disso o Google rejeita as mensagens (abrir + teto + folga de 30 s) */
  expira_em: string;
  /** prazo para ABRIR o WebSocket (newSessionExpireTime, 60 s) */
  abrir_ate: string;
  /** teto da conversa na tela, em segundos (600) */
  limite_s: number;
  /** "Oi, {primeiro nome}. Pode perguntar." — a legenda de reserva se a voz não vier */
  saudacao: string;
  /** o texto do clientContent que pede a saudação: "[início da conversa]" */
  gatilho_inicio: string;
}

export interface DependenciasVoz {
  /** SUPABASE_SERVICE_ROLE_KEY: só com ela, IGUAL, o atalho de QA (x-assistente-ator) vale (S2). */
  chaveServico: string;
  getUser: (req: Request) => Promise<{ id: string } | null>;
  /** a service key de verdade? (o banco confirma — autenticar(), caminho 2 do atalho de QA) */
  confirmarServico?: (token: string) => Promise<boolean>;
  /** RPC assistente_* com a service key; lança o erro do PostgREST. */
  rpc: ChamarRpc;
  /** GEMINI_API_KEY (a mesma da IA de vendas); vazia = 502 sem gastar o teto. */
  chaveGemini: string;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  gravarLog: (linha: LinhaLog) => void;
  modelo?: string;
  voz?: string;
  tetoDia?: number;
  timeoutMs?: number;
  agora?: () => number;
}

const MSG_INDISPONIVEL = 'Não consegui iniciar a conversa por voz agora.';

export function criarTratadorVoz(d: DependenciasVoz): (req: Request) => Promise<Response> {
  const agora = d.agora ?? (() => Date.now());
  const modelo = nomeDoModelo(d.modelo);
  const voz = (d.voz ?? '').trim() || VOZ_PADRAO;
  const teto = Number.isFinite(d.tetoDia) && (d.tetoDia as number) > 0 ? Math.floor(d.tetoDia as number) : TETO_SESSOES_DIA;

  /** POST v1beta/auth_tokens → o name do token, ou o código do contrato + o detalhe para o log (sem segredo). */
  const criarToken = async (corpo: unknown): Promise<{ nome: string } | { codigo: CodigoErro; detalhe: string }> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), d.timeoutMs ?? TIMEOUT_TOKEN_MS);
    try {
      const r = await d.fetch(URL_TOKEN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': d.chaveGemini },
        body: JSON.stringify(corpo),
        signal: ctrl.signal,
      });
      const texto = await r.text();
      if (!r.ok) {
        return { codigo: classificarErroToken(r.status, texto), detalhe: `token HTTP ${r.status}: ${texto.slice(0, 300)}` };
      }
      const nome = nomeDoToken(texto);
      // o corpo de um 200 estranho pode trazer o próprio token: não vai para o log
      if (!nome) return { codigo: 'ia_indisponivel', detalhe: 'token: resposta do Google sem name' };
      return { nome };
    } catch (e) {
      return {
        codigo: 'ia_indisponivel',
        detalhe: ctrl.signal.aborted ? 'token: timeout' : `token: ${String((e as Error)?.message ?? e).slice(0, 200)}`,
      };
    } finally {
      clearTimeout(t);
    }
  };

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return erro('pergunta_invalida', 'Use POST.');
    const t0 = agora();

    // 1. quem fala: o usuário do JWT; no QA, SÓ a própria service key + x-assistente-ator (S2)
    const quem = await autenticar(req, { chaveServico: d.chaveServico, getUser: d.getUser, confirmarServico: d.confirmarServico });
    if ('erro' in quem) return erro('nao_autenticado', quem.mensagem);
    const ator = quem.ator;

    const corpo = await req.json().catch(() => null) as Record<string, unknown> | null;
    const org = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo.org : undefined;
    if (!ehUuid(org)) return erro('pergunta_invalida', 'Informe {org}.');

    // 2. contexto de quem fala (vínculo ativo, papel, hoje, mês do CAF, equipe): sem vínculo → 403
    let ctxBruto: unknown;
    try {
      ctxBruto = await d.rpc('assistente_contexto', { p_org: org, p_ator: ator });
    } catch (e) {
      if (ehSemAcesso(e)) return erro('sem_acesso');
      console.error('assistente-voz contexto', e);
      return erro('ia_indisponivel', 'Não consegui consultar o sistema agora.');
    }
    if (!contextoValido(ctxBruto)) {
      console.error('assistente-voz contexto fora do formato');
      return erro('ia_indisponivel', 'Não consegui consultar o sistema agora.');
    }
    const ctx = ctxBruto;

    const log = (linha: Pick<LinhaLog, 'erro'>) => d.gravarLog({
      organizacao_id: org, usuario_id: ator, pergunta: `voz: nova sessão (${modelo}, ${voz})`, ms: agora() - t0,
      resposta: null, ...linha,
    });

    // sem a chave do Gemini não adianta gastar uma sessão do dia
    if (!d.chaveGemini) {
      log({ erro: 'GEMINI_API_KEY ausente' });
      return erro('ia_indisponivel', MSG_INDISPONIVEL);
    }

    // 3. teto de sessões do dia (o crédito do Gemini é o MESMO da IA que atende cliente)
    try {
      const n = await d.rpc('assistente_registrar_uso', { p_org: org, p_usuario: ator, p_limite: teto });
      if (n === -1) return erro('limite_dia', `Você chegou ao limite de ${teto} conversas por voz de hoje.`);
    } catch (e) {
      if (ehSemAcesso(e)) return erro('sem_acesso');
      console.error('assistente-voz uso', e);
      return erro('ia_indisponivel', 'Não consegui consultar o sistema agora.');
    }

    // 4. o token com a configuração travada (modelo, voz, prompt de voz com o contexto, ferramentas do papel…)
    const instante = agora();
    let corpoToken;
    try {
      corpoToken = corpoDoToken(ctx, { agora: instante, modelo, voz });
    } catch (e) {
      const detalhe = `montar o token: ${String((e as Error)?.message ?? e).slice(0, 200)}`;
      console.error('assistente-voz', detalhe);
      log({ erro: detalhe });
      return erro('ia_indisponivel', MSG_INDISPONIVEL);
    }
    const r = await criarToken(corpoToken);
    if ('codigo' in r) {
      console.error('assistente-voz', r.detalhe);
      log({ erro: r.detalhe });
      return erro(r.codigo, r.codigo === 'ia_indisponivel' ? MSG_INDISPONIVEL : undefined);
    }
    log({ erro: null });
    const resposta: RespostaVoz = {
      token: r.nome,
      modelo,
      ws_url: montarWsUrl(r.nome),
      expira_em: corpoToken.expireTime,
      abrir_ate: corpoToken.newSessionExpireTime,
      limite_s: LIMITE_S,
      saudacao: saudacao(ctx),
      gatilho_inicio: GATILHO_INICIO,
    };
    return json(resposta);
  };
}
