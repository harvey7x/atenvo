// assistente-voz — o MODO DE VOZ do assistente de IA do Atenvo (pedido do dono 30/10/2026 ~21h50: conversa AO
// VIVO, como o modo de voz do ChatGPT; "por texto não me agrada"). Esta função só entrega o TOKEN EFÊMERO do
// Live API do Gemini com a configuração TRAVADA aqui no servidor; o navegador conecta direto no Google com ele.
//
// Contrato (servidor.ts tem os detalhes):
//   POST {org} com o JWT do usuário → 200 {token, modelo, ws_url, expira_em, abrir_ate, limite_s, saudacao,
//   gatilho_inicio} · erro {error, mensagem}: 400 pergunta_invalida · 401 nao_autenticado · 403 sem_acesso ·
//   429 limite_dia (30 sessões por pessoa por dia) · 503 sem_credito · 502 ia_indisponivel.
//
// Reaproveita do `assistente` (../assistente): a autenticação (S2), as ferramentas do papel e o significado dos
// números (logica.ts), o formato dos erros (servidor.ts), o cliente Supabase e o CORS. Mudou a logica.ts? Faça
// o deploy das DUAS funções.
//
// QA sem senha (S2): bearer IGUAL à SUPABASE_SERVICE_ROLE_KEY (tempo constante) + x-assistente-ator: <uuid> → age
// como essa pessoa (conta no teto dela). verify_jwt = true fixado no config.toml (NÃO desligar).
// Secrets: GEMINI_API_KEY (a mesma da IA de vendas). Opcionais: ASSISTENTE_VOZ_MODELO (padrão gemini-3.8-live —
// o Extended Thinking NÃO serve: exige ferramentas NON_BLOCKING), ASSISTENTE_VOZ_VOZ (padrão Despina),
// ASSISTENTE_VOZ_TETO_DIA (padrão 30).
import { adminClient, confirmarServico, getUser } from '../assistente/client.ts';
import type { LinhaLog } from '../assistente/servidor.ts';
import { criarTratadorVoz } from './servidor.ts';

// deno-lint-ignore no-explicit-any
const edgeRuntime = (globalThis as any).EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void } | undefined;

const admin = adminClient();

Deno.serve(criarTratadorVoz({
  chaveServico: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  getUser,
  confirmarServico,
  rpc: async (nome, params) => {
    const { data, error } = await admin.rpc(nome, params);
    if (error) throw error;
    return data;
  },
  chaveGemini: Deno.env.get('GEMINI_API_KEY') ?? '',
  fetch,
  modelo: Deno.env.get('ASSISTENTE_VOZ_MODELO') ?? undefined,
  voz: Deno.env.get('ASSISTENTE_VOZ_VOZ') ?? undefined,
  tetoDia: Number(Deno.env.get('ASSISTENTE_VOZ_TETO_DIA') || 0) || undefined,
  // log sem segurar a resposta (nunca com o token nem a ws_url)
  gravarLog: (linha: LinhaLog) => {
    const p = Promise.resolve(admin.from('assistente_log').insert(linha))
      .then(({ error }) => { if (error) console.error('assistente-voz log', error.message); })
      .catch((e) => console.error('assistente-voz log', e));
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(p);
  },
}));
