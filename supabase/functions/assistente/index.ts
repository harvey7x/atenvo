// assistente — o balão de IA do Atenvo (pedido do dono 30/10/2026: "perguntar e ela puxar dados e
// responder" — o atendente sobre a própria carteira, o administrativo sobre cada pessoa) e, desde a voz
// (30/10 ~21h50), o executor das ferramentas do modo de voz.
//
// Contrato (servidor.ts tem os detalhes):
//   POST {org, pergunta (1..500), historico?}        → 200 {resposta, links}            (modo pergunta, texto)
//   POST {org, ferramenta: {nome, args}}             → 200 {resultado, links}           (modo ferramenta, voz)
//   erro {error: código, mensagem?}: 400 pergunta_invalida · 401 nao_autenticado · 403 sem_acesso (sem vínculo
//   ativo na org) · 429 limite_dia · 503 sem_credito · 502 ia_indisponivel (erro/timeout do Gemini).
//
// Os dados vêm SÓ das RPCs assistente_* (service_role), que recortam pelo papel de quem pergunta:
// atendente vê a própria carteira; admin vê a equipe. O modelo nunca escolhe quem é o ator.
//
// QA sem senha (S2, revisão 30/10): bearer IGUAL à SUPABASE_SERVICE_ROLE_KEY (tempo constante) +
// x-assistente-ator: <uuid> → age como essa pessoa. verify_jwt = true fixado no config.toml (NÃO desligar).
import { adminClient, confirmarServico, getUser } from './client.ts';
import { MODELO_PADRAO, MODELO_RESERVA, criarGemini } from './logica.ts';
import { type LinhaLog, criarTratador } from './servidor.ts';

const TETO_DIA = Number(Deno.env.get('ASSISTENTE_TETO_DIA') || 60);
const MODELO = (Deno.env.get('ASSISTENTE_MODELO') || '').trim() || MODELO_PADRAO;
const CHAVE_GEMINI = Deno.env.get('GEMINI_API_KEY') ?? '';

// deno-lint-ignore no-explicit-any
const edgeRuntime = (globalThis as any).EdgeRuntime as { waitUntil?: (p: Promise<unknown>) => void } | undefined;

const admin = adminClient();

Deno.serve(criarTratador({
  chaveServico: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  getUser,
  confirmarServico,
  rpc: async (nome, params) => {
    const { data, error } = await admin.rpc(nome, params);
    if (error) throw error;
    return data;
  },
  gemini: CHAVE_GEMINI ? criarGemini({ fetch, chave: CHAVE_GEMINI, modelo: MODELO, reserva: MODELO_RESERVA }) : null,
  tetoDia: TETO_DIA,
  // log sem segurar a resposta
  gravarLog: (linha: LinhaLog) => {
    const p = Promise.resolve(admin.from('assistente_log').insert(linha))
      .then(({ error }) => { if (error) console.error('assistente log', error.message); })
      .catch((e) => console.error('assistente log', e));
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(p);
  },
}));
