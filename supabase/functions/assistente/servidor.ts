// assistente — o tratamento do pedido HTTP, com as dependências injetadas: o index.ts liga as reais (Supabase
// com a service key, Gemini, log); os testes (servidor_test.ts) ligam falsas, sem rede. Dois modos:
//
//   · PERGUNTA (texto): {org, pergunta, historico?} → contexto → teto do dia → laço do Gemini → {resposta, links}
//   · FERRAMENTA (voz, 30/10): {org, ferramenta: {nome, args}} → contexto → UMA ferramenta pela logica.ts, com o
//     mesmo recorte por papel, sem Gemini e sem teto (o teto da voz é por sessão, no assistente-voz) →
//     {resultado: <json da RPC ou erro de ferramenta>, links}. O navegador manda aqui cada functionCall do Live
//     API e devolve o resultado ao modelo como functionResponse.
//
// Erros {error, mensagem} nos dois modos: 400 pergunta_invalida (corpo fora do formato) · 401 nao_autenticado ·
// 403 sem_acesso (sem vínculo ativo na org) · 429 limite_dia · 503 sem_credito · 502 ia_indisponivel.
// Recusa de escopo (atendente pedindo a equipe), ferramenta desconhecida e argumento inválido NÃO são erro HTTP:
// voltam no `resultado` ({erro: ...}) para o modelo explicar.
import { corsHeaders, json } from './cors.ts';
import {
  type ChamarGemini, type ChamarRpc, type CodigoErro, type Contexto, type RegistroFerramenta, ErroAssistente,
  STATUS_DO_ERRO, autenticar, executarFerramenta, extrairLinks, responder, validarEntrada, validarPedidoFerramenta,
} from './logica.ts';

export const MENSAGENS: Record<CodigoErro, string> = {
  pergunta_invalida: 'Pergunta inválida.',
  nao_autenticado: 'Sessão expirada. Entre de novo.',
  sem_acesso: 'Sem acesso a esta organização.',
  limite_dia: 'Limite de perguntas de hoje atingido.',
  sem_credito: 'A IA está sem crédito agora.',
  ia_indisponivel: 'A IA não respondeu agora.',
};

export function erro(codigo: CodigoErro, mensagem?: string): Response {
  return json({ error: codigo, mensagem: mensagem ?? MENSAGENS[codigo] }, STATUS_DO_ERRO[codigo]);
}

export const ehSemAcesso = (e: unknown) => {
  const o = (e ?? {}) as { message?: string; code?: string };
  return o.code === '42501' || /sem_acesso/.test(String(o.message ?? ''));
};

/** Uma linha de assistente_log (a gravação real não segura a resposta: EdgeRuntime.waitUntil no index.ts). */
export interface LinhaLog {
  organizacao_id: string;
  usuario_id: string;
  pergunta: string;
  ms: number;
  resposta?: string | null;
  ferramentas?: RegistroFerramenta[];
  erro?: string | null;
}

export interface Dependencias {
  /** SUPABASE_SERVICE_ROLE_KEY: só com ela, IGUAL, o atalho de QA (x-assistente-ator) vale (S2). */
  chaveServico: string;
  getUser: (req: Request) => Promise<{ id: string } | null>;
  /** a service key de verdade? (o banco confirma — autenticar(), caminho 2 do atalho de QA) */
  confirmarServico?: (token: string) => Promise<boolean>;
  /** RPC assistente_* com a service key; lança o erro do PostgREST. */
  rpc: ChamarRpc;
  /** null = sem GEMINI_API_KEY (o modo pergunta responde ia_indisponivel; o modo ferramenta não usa). */
  gemini: ChamarGemini | null;
  gravarLog: (linha: LinhaLog) => void;
  tetoDia: number;
  agora?: () => number;
}

export function criarTratador(d: Dependencias): (req: Request) => Promise<Response> {
  const agora = d.agora ?? (() => Date.now());

  // contexto de quem pergunta (vínculo ativo, papel, hoje, mês do CAF, equipe): sem vínculo → 403
  const carregarContexto = async (org: string, ator: string): Promise<Contexto | Response> => {
    try {
      return await d.rpc('assistente_contexto', { p_org: org, p_ator: ator }) as Contexto;
    } catch (e) {
      if (ehSemAcesso(e)) return erro('sem_acesso');
      console.error('assistente contexto', e);
      return erro('ia_indisponivel', 'Não consegui consultar o sistema agora.');
    }
  };

  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return erro('pergunta_invalida', 'Use POST.');
    const t0 = agora();

    // 1. quem pergunta: o usuário do JWT; no QA, SÓ a própria service key + x-assistente-ator (S2)
    const quem = await autenticar(req, { chaveServico: d.chaveServico, getUser: d.getUser, confirmarServico: d.confirmarServico });
    if ('erro' in quem) return erro('nao_autenticado', quem.mensagem);
    const ator = quem.ator;

    const corpo = await req.json().catch(() => null);

    // 2a. modo FERRAMENTA (a voz): uma ferramenta, mesmo recorte, sem Gemini e sem teto
    if (corpo && typeof corpo === 'object' && !Array.isArray(corpo) && 'ferramenta' in corpo) {
      const pedido = validarPedidoFerramenta(corpo);
      if ('erro' in pedido) return erro('pergunta_invalida', pedido.mensagem);
      const ctx = await carregarContexto(pedido.org, ator);
      if (ctx instanceof Response) return ctx;
      const t1 = agora();
      const r = await executarFerramenta(pedido.nome, pedido.args, ctx, pedido.org, d.rpc);
      const registro: RegistroFerramenta = { nome: pedido.nome, args: pedido.args, ms: agora() - t1, ...(r.erro ? { erro: r.erro } : {}) };
      d.gravarLog({
        organizacao_id: pedido.org, usuario_id: ator, pergunta: `ferramenta: ${pedido.nome}`, ms: agora() - t0,
        resposta: null, ferramentas: [registro], erro: r.erro ?? null,
      });
      return json({ resultado: r.resultado, links: extrairLinks([r.resultado]) });
    }

    // 2b. modo PERGUNTA (texto)
    const entrada = validarEntrada(corpo);
    if ('erro' in entrada) return erro('pergunta_invalida', entrada.mensagem);
    const ctx = await carregarContexto(entrada.org, ator);
    if (ctx instanceof Response) return ctx;

    // 3. teto do dia (60 por pessoa — o crédito do Gemini é o mesmo da IA que atende cliente)
    try {
      const n = await d.rpc('assistente_registrar_uso', { p_org: entrada.org, p_usuario: ator, p_limite: d.tetoDia });
      if (n === -1) return erro('limite_dia', `Você chegou ao limite de ${d.tetoDia} perguntas de hoje.`);
    } catch (e) {
      if (ehSemAcesso(e)) return erro('sem_acesso');
      console.error('assistente uso', e);
      return erro('ia_indisponivel', 'Não consegui consultar o sistema agora.');
    }

    const log = (linha: Omit<LinhaLog, 'organizacao_id' | 'usuario_id' | 'pergunta' | 'ms'>) => d.gravarLog({
      organizacao_id: entrada.org, usuario_id: ator, pergunta: entrada.pergunta, ms: agora() - t0, ...linha,
    });

    // 4. laço do Gemini + ferramentas
    if (!d.gemini) {
      log({ erro: 'GEMINI_API_KEY ausente' });
      return erro('ia_indisponivel');
    }
    try {
      const r = await responder({
        ctx, org: entrada.org, pergunta: entrada.pergunta, historico: entrada.historico, gemini: d.gemini, rpc: d.rpc,
      });
      // 5. log sem segurar a resposta
      log({ resposta: r.resposta, ferramentas: r.ferramentas, erro: null });
      return json({ resposta: r.resposta, links: r.links });
    } catch (e) {
      const codigo: CodigoErro = e instanceof ErroAssistente ? e.codigo : 'ia_indisponivel';
      const detalhe = String((e as Error)?.message ?? e).slice(0, 300);
      console.error('assistente', detalhe);
      log({ erro: detalhe });
      return erro(codigo);
    }
  };
}
