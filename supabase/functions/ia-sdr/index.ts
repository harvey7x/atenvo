// ia-sdr — worker da IA SDR (Gemini) do canal EMPRÉSTIMO. Cron a cada 15 segundos.
//
// A IA assume DEPOIS que o fluxo determinístico caf_emprestimo_v1 completa (o bot-runner cria a
// ia_sessao no fecho, gated por bot_canal_config.ia_enabled + ia_modo_teste/numeros_teste).
//
// FASE 1.1 — de FLUXO para IA:
//  * A etapa define o OBJETIVO; o MODELO conduz (contexto completo: ~30 mensagens do histórico,
//    dados já coletados — nome/CPF do fluxo NUNCA são pedidos de novo —, checklist do que falta
//    e o resultado das validações de arquivo do turno). Coleta por CHECKLIST DINÂMICO
//    (identidade F/V + comprovante + e-mail, em qualquer ordem), não por etapas rígidas.
//  * FALHA TÉCNICA NUNCA VIRA CONVERSA: retry 2s→8s; persistiu → nada sai ao cliente, reagenda
//    +90s, loga gemini_erro; tentativas_erro (do cliente) NÃO conta. 5 falhas técnicas seguidas →
//    handoff 'falha_tecnica' com nota explicando que foi sistema. Única mensagem não-gerada
//    permitida: MSG_HANDOFF_FINAL (modelo fora do ar).
//  * Modelo: default gemini-3.6-flash + auto-recuperação de 404 com sugestão no corpo (cacheia em
//    ia_config.modelo_efetivo[_docs], evento modelo_atualizado). GEMINI_MODEL_DOCS só p/ a análise
//    do consignado.
//  * Latência alvo 15–35s/turno: cron 15s + debounce 8s + sem delay-base — o único tempo humano é
//    presence composing proporcional (2–6s) + jitter 1.5–3s entre bolhas.
//  * Dedup duro: nenhuma mensagem idêntica a uma saída já existente na conversa (colidiu → pede
//    reescrita ao modelo; persistiu → descarta a bolha).
//  * Proteções do chip intactas: serial por canal, máx 3 bolhas, janela 07:30–21:30 SP, limite
//    diário, guardrail pós-Gemini em tudo que sai.
//
// Auth: x-ia-secret == webhook_config.ia_sdr. Deploy com verify_jwt=false.
// Diag de deploy: POST {"diag":"gemini"} (com o secret) → valida o modelo com uma chamada mínima.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enviadorDe } from '../evolution-send/transporte.ts';
import { inferirGenero } from '../bot-runner/fluxo_botoes.ts';   // gênero p/ tratamento consistente
import { sendPresenceComposing } from './evolution.ts';
import {
  chamarGeminiJson, comRetry, temChaveGemini, ehErro404Modelo, parseSugestaoModelo, ehSobrecarga,
  MODELO_DEFAULT, modeloEnvChat, modeloEnvDocs, modeloEnvPro, type ParteGemini, type ResultadoGemini,
} from './gemini.ts';
import { saidaProibida, perguntaDeValores } from './guardrail.ts';
import {
  PERSONA, INSTRUCAO_ETAPA, EXTRAS_ETAPA, esquemaChat, SCHEMA_REESCRITA,
  SCHEMA_LOTE_COLETA, PROMPT_LOTE_COLETA, notaAcompanhamento, instrucaoNudge,
  SCHEMA_EXTRATO, PROMPT_EXTRATO, SCHEMA_ANALISE_CONSIGNADO, PROMPT_ANALISE_CONSIGNADO,
  MSG_HANDOFF_FINAL, INSTRUCAO_RETORNO_FECHADO, INSTRUCAO_RETORNO_REQUALIFICA,
} from './prompts.ts';
import {
  nomesBatem, cpfsCompativeis, somenteDigitos, mesesComprovante, emailValido, extrairEmail,
  competParaIdx, ultimoMesFechadoIdx, calcularCobertura, formatarFaltas, bancoAlvoDe,
  spWallClock, spParaUtc, type Janela,
} from './validacao.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUCKET_MIDIA = 'script-midia';            // anexo_path dos inbounds (prefixo {org}/wa-midia/)
const MAX_ARQUIVO = 15 * 1024 * 1024;           // >15MB: pedir reenvio menor
const MAX_SESSOES_POR_CANAL = 6;
const ORCAMENTO_MS = 100_000;
const DEBOUNCE_MS = 8_000;                      // espelha o trigger (fase 1.1: 15s → 8s)
const REAGENDA_FALHA_MS = 90_000;
const MAX_FALHAS_TECNICAS = 5;
// follow-up de reengajamento (escada de 3 toques, pesquisa 25/08): 1º = timing por tipo de etapa
// (resposta simples 15min; foto 45min; tarefa pela metade 20min; Meu INSS 60min); 2º = ~3h depois
// mudando o ângulo; 3º = manhã seguinte, porta aberta. Depois: episódio encerrado.
const NUDGE_MAX = 3;
// Cadeia de fallback quando o modelo do turno está sobrecarregado (503) — capacidade diferente.
const FALLBACK_MODELOS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-ia-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function seguroIgual(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// A CAF é marca premium: ZERO emoji nas mensagens ao cliente. O prompt já proíbe, mas o modelo
// pode escorregar — este filtro é a garantia dura, aplicado em TODA bolha antes de enviar.
function removerEmoji(t: string): string {
  return (t ?? '')
    .replace(/[\p{Extended_Pictographic}\u{200D}\u{20E3}\u{FE0F}\u{FE0E}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function paraBase64(bytes: Uint8Array): string {
  let bin = ''; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}

/** Falha de infraestrutura (API/parse/timeout) — NUNCA vira mensagem ao cliente. */
class FalhaTecnica extends Error {}

// deno-lint-ignore no-explicit-any
type Admin = any;

interface Sessao {
  id: string; organizacao_id: string; canal_id: string; conversa_id: string; contato_id: string;
  oportunidade_id: string | null; etapa: string; dados: Record<string, unknown>;
  docs: Record<string, unknown>; cobertura_extratos: Record<string, unknown>;
  tentativas_erro: number; ultima_msg_cliente_em: string | null; processar_apos: string | null;
  status: string; criado_em: string;
}
interface MsgNova { id: string; tipo: string; conteudo: string | null; criado_em: string; metadados: Record<string, unknown> | null }
interface Modelos { chat: string; docs: string; pro: string }

interface Turno {
  bolhas: string[];
  video?: { url: string; caption: string };
  etapaNova?: string;
  statusNovo?: 'encerrada';                     // só o encerramento (não elegível) muda status aqui
  // HANDOFF SUAVE ("a IA só para quando o atendente assume"): chama o humano (precisa_humano +
  // nota) mas a sessão SEGUE ativa em modo acompanhamento — o trigger pausa quando o humano falar.
  chamarHumano?: string;                        // motivo (foto_ilegivel, auxilio_extratos, …)
  retomar?: boolean;                            // progresso real → limpa o acompanhamento/alerta
  notaInterna?: string;
  dadosPatch?: Record<string, unknown>;
  docsPatch?: Record<string, unknown>;
  coberturaNova?: Record<string, unknown>;
  etiquetaOpp?: string;
  incrementaErro?: boolean;                     // "não entendi o cliente" (2x seguidas → chama humano)
  resetErros?: boolean;
  reagendarMs?: number;                         // handler pede outro turno em breve (ex.: abertura que falhou na verificação)
  naoAvancarAlem?: string;                      // watermark não passa deste criado_em (arquivos excedentes ficam pro próximo turno)
  __perguntouValores?: boolean;
}

interface Ctx {
  admin: Admin; sessao: Sessao; canal: Record<string, unknown>; iaConfig: Record<string, unknown>;
  modelos: Modelos; dono: string;
  conversa: Record<string, unknown>; destino: string; transcript: string;
  saidasAnteriores: Set<string>;
  contatoNome: string; contatoCpf: string;
  dados: Record<string, unknown>; docs: Record<string, unknown>; cobertura: Record<string, unknown>;
  novas: MsgNova[]; textos: string[]; arquivos: MsgNova[]; audios: MsgNova[]; pendentes: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const secretHeader = req.headers.get('x-ia-secret') ?? '';
    const { data: wc } = await admin.from('webhook_config').select('secret').eq('chave', 'ia_sdr').maybeSingle();
    if (!wc?.secret || !seguroIgual(secretHeader, wc.secret as string)) return json({ error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({})) as { diag?: string; canal_id?: string; modelo?: string };

    // ---- diag de deploy: valida o modelo efetivo (ou um `modelo` explícito) com uma chamada mínima ----
    if (body.diag === 'gemini') return await diagGemini(admin, body.canal_id ?? null, body.modelo ?? null);
    // ---- diag: lista os modelos que ESTA chave enxerga (ModelService.ListModels) ----
    if (body.diag === 'gemini_modelos') {
      const key = Deno.env.get('GEMINI_API_KEY');
      if (!key) return json({ ok: false, erro: 'sem_api_key' });
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${key}`);
      const data = await res.json().catch(() => ({}));
      const modelos = ((data?.models ?? []) as Array<{ name?: string; supportedGenerationMethods?: string[] }>)
        .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((m) => String(m.name ?? '').replace(/^models\//, ''));
      return json({ ok: res.ok, status: res.status, modelos });
    }
    // diag do CAMINHO DE EXTRAÇÃO (schema do lote + imagem + semPensar) — o que 400ou em 25/08
    if (body.diag === 'extracao') return await diagExtracao(admin, body.canal_id ?? null);

    const inicio = Date.now();
    const dono = crypto.randomUUID();   // identidade desta invocação p/ a lease de canal
    const { data: cfgs } = await admin.from('bot_canal_config')
      .select('canal_id, ia_enabled, ia_modo_teste, ia_config, organizacao_id')
      .eq('ia_enabled', true);
    if (!cfgs?.length) return json({ ok: true, canais: 0 });

    const resultados: Array<Record<string, unknown>> = [];
    for (const cfg of cfgs) {
      if (Date.now() - inicio > ORCAMENTO_MS) break;
      const { data: canal } = await admin.from('canais')
        .select('id, nome_interno, transporte, instancia_externa, cloud_phone_number_id, numero_conectado')
        .eq('id', cfg.canal_id).maybeSingle();
      if (!canal) continue;
      resultados.push(await processarCanal(admin, canal, (cfg.ia_config ?? {}) as Record<string, unknown>, inicio, dono));
    }
    return json({ ok: true, canais: cfgs.length, resultados });
  } catch (e) {
    return json({ error: (e as Error).message ?? 'erro' }, 500);
  }
});

// ======== modelo: resolução + auto-recuperação de 404 (rename do Google) ========
// Precedência: ENV explícito > cache da auto-recuperação > default. O env na frente é o que
// permite ao dono FORÇAR um modelo mesmo depois de um 404 ter cacheado modelo_efetivo.
function resolverModelos(iaConfig: Record<string, unknown>): Modelos {
  const chat = modeloEnvChat() || String(iaConfig.modelo_efetivo ?? '') || MODELO_DEFAULT;
  const docs = modeloEnvDocs() || String(iaConfig.modelo_efetivo_docs ?? '') || chat;
  // modelo FORTE p/ turnos complexos (objeção, dúvida, áudio) — roteador em conversar()
  const pro = modeloEnvPro() || String(iaConfig.modelo_efetivo_pro ?? '') || 'gemini-pro-latest';
  return { chat, docs, pro };
}

async function persistirModeloEfetivo(admin: Admin, canalId: string, chave: 'modelo_efetivo' | 'modelo_efetivo_docs' | 'modelo_efetivo_pro', valor: string): Promise<void> {
  try {
    const { data } = await admin.from('bot_canal_config').select('ia_config').eq('canal_id', canalId).maybeSingle();
    await admin.from('bot_canal_config')
      .update({ ia_config: { ...((data?.ia_config as Record<string, unknown>) ?? {}), [chave]: valor } })
      .eq('canal_id', canalId);
  } catch { /* cache é best-effort; o env/default segue valendo */ }
}

interface ChamadaOk { r: ResultadoGemini; modeloUsado: string; atualizadoDe?: string }

/** Chama o Gemini já com retry/backoff; num 404 de modelo com sugestão, troca na hora e cacheia. */
async function chamarComRecuperacao(admin: Admin, canalId: string, modelos: Modelos, tipo: 'chat' | 'docs' | 'pro', p: {
  system: string; partes: ParteGemini[]; schema: Record<string, unknown>; temperatura?: number; maxTokens?: number; semPensar?: boolean;
}): Promise<ChamadaOk> {
  const modelo = tipo === 'docs' ? modelos.docs : tipo === 'pro' ? modelos.pro : modelos.chat;
  try {
    return { r: await comRetry(() => chamarGeminiJson(modelo, p)), modeloUsado: modelo };
  } catch (e) {
    const msg = String((e as Error)?.message ?? '');
    // SOBRECARGA do modelo (503 "high demand" / 429 / 5xx): tenta a CADEIA DE FALLBACK — modelos
    // de capacidade diferente. Um pico no 3.7-flash não trava a conversa se o 3.6/3.5 respondem.
    // (Foi o que emperrou a Roseli: 3.7-flash 503 a madrugada toda → 5 falhas → handoff.)
    if (ehSobrecarga(msg)) {
      for (const alt of FALLBACK_MODELOS) {
        if (alt === modelo) continue;
        try {
          const rAlt = await chamarGeminiJson(alt, p);   // uma tentativa por fallback já basta
          return { r: rAlt, modeloUsado: alt, atualizadoDe: modelo };
        } catch (e2) { if (!ehSobrecarga(String((e2 as Error)?.message ?? ''))) throw e2; }
      }
      throw new Error(`sobrecarga_transitoria: ${msg.slice(0, 120)}`);   // todos sobrecarregados
    }
    if (!ehErro404Modelo(msg)) throw e;
    const sugestao = parseSugestaoModelo(msg, modelo);
    if (!sugestao) throw e;
    const r2 = await comRetry(() => chamarGeminiJson(sugestao, p));   // funcionou => o rename é real
    if (tipo === 'docs') {
      modelos.docs = sugestao;
      await persistirModeloEfetivo(admin, canalId, 'modelo_efetivo_docs', sugestao);
    } else if (tipo === 'pro') {
      modelos.pro = sugestao;
      await persistirModeloEfetivo(admin, canalId, 'modelo_efetivo_pro', sugestao);
    } else {
      // docs que só herdava do chat acompanha em memória (na próxima run herda do cache)
      if (modelos.docs === modelo) modelos.docs = sugestao;
      modelos.chat = sugestao;
      await persistirModeloEfetivo(admin, canalId, 'modelo_efetivo', sugestao);
    }
    return { r: r2, modeloUsado: sugestao, atualizadoDe: modelo };
  }
}

async function diagGemini(admin: Admin, canalId: string | null, modeloForcado: string | null): Promise<Response> {
  const q = admin.from('bot_canal_config').select('canal_id, ia_config').eq('ia_enabled', true);
  const { data: cfgs } = canalId ? await q.eq('canal_id', canalId) : await q.limit(1);
  const cfg = cfgs?.[0];
  if (!cfg) return json({ ok: false, erro: 'nenhum canal com ia_enabled' });
  const modelos = resolverModelos((cfg.ia_config ?? {}) as Record<string, unknown>);
  if (modeloForcado) { modelos.chat = modeloForcado; modelos.docs = modeloForcado; }
  try {
    const { r, modeloUsado, atualizadoDe } = await chamarComRecuperacao(admin, cfg.canal_id, modelos, 'chat', {
      system: 'Responda exatamente o JSON pedido.',
      partes: [{ text: 'Responda com ok=true.' }],
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      temperatura: 0, maxTokens: 1024,
    });
    return json({ ok: true, modelo: modeloUsado, atualizado_de: atualizadoDe ?? null, tokens: [r.tokensIn, r.tokensOut], resposta: r.json });
  } catch (e) {
    return json({ ok: false, modelo_tentado: modelos.chat, erro: String((e as Error)?.message ?? '').slice(0, 400) });
  }
}

async function diagExtracao(admin: Admin, canalId: string | null): Promise<Response> {
  const q = admin.from('bot_canal_config').select('canal_id, ia_config').eq('ia_enabled', true);
  const { data: cfgs } = canalId ? await q.eq('canal_id', canalId) : await q.limit(1);
  const cfg = cfgs?.[0];
  if (!cfg) return json({ ok: false, erro: 'nenhum canal com ia_enabled' });
  const modelos = resolverModelos((cfg.ia_config ?? {}) as Record<string, unknown>);
  // PNG 1x1 — o teste é do REQUEST (schema+imagem+thinkingConfig), não da leitura em si
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  try {
    const { r, modeloUsado } = await chamarComRecuperacao(admin, cfg.canal_id, modelos, 'chat', {
      system: PROMPT_LOTE_COLETA,
      partes: [{ inline_data: { mime_type: 'image/png', data: png } }, { text: 'É 1 imagem de teste. Extraia no JSON pedido.' }],
      schema: SCHEMA_LOTE_COLETA, temperatura: 0, maxTokens: 4096, semPensar: true,
    });
    return json({ ok: true, modelo: modeloUsado, tokens: [r.tokensIn, r.tokensOut], resposta: r.json });
  } catch (e) {
    return json({ ok: false, modelo_tentado: modelos.chat, erro: String((e as Error)?.message ?? '').slice(0, 500) });
  }
}

// ======== canal: peek → lease serial → janela → limite diário → sessões ========
async function processarCanal(admin: Admin, canal: Record<string, unknown>, iaConfig: Record<string, unknown>, inicio: number, dono: string): Promise<Record<string, unknown>> {
  const canalId = canal.id as string;
  const agoraIso = new Date().toISOString();
  const corteDebounce = new Date(Date.now() - DEBOUNCE_MS).toISOString();

  // peek ANTES do lock: o cron roda a cada 15s — sem sessão devida, nem toca na lease
  const { data: due } = await admin.from('ia_sessoes').select('*')
    .eq('status', 'ativa').eq('canal_id', canalId)
    .not('processar_apos', 'is', null).lte('processar_apos', agoraIso)
    .order('processar_apos', { ascending: true }).limit(MAX_SESSOES_POR_CANAL);
  const sessoes = ((due ?? []) as Sessao[])
    .filter((s) => !s.ultima_msg_cliente_em || s.ultima_msg_cliente_em <= corteDebounce);
  if (!sessoes.length) return { canal: canalId, processadas: 0 };

  const { data: lock } = await admin.rpc('ia_canal_lock', { p_canal: canalId, p_dono: dono, p_ttl_seg: 240 });
  if (!lock) return { canal: canalId, skipped: 'lock_canal' };
  try {
    // A JANELA (07:30–21:30 SP) NÃO é mais bloqueio de canal. Regra do dono: LEAD VIVO que chamou
    // é atendido a QUALQUER HORA (responder é reativo, sem risco de ban). Só o contato PROATIVO
    // (nudge e abertura de RETOMADA) respeita a janela — o gate mora no turno(), por sessão,
    // porque só lá se sabe se há mensagem nova do cliente.

    // ---- sem chave: adia com evento, nunca crash (setar a secret resolve sozinho) ----
    if (!temChaveGemini()) {
      for (const s of sessoes) {
        await admin.from('ia_sessoes').update({ processar_apos: new Date(Date.now() + 30 * 60_000).toISOString() }).eq('id', s.id).eq('status', 'ativa');
        await evento(admin, s, 'sem_api_key', {});
      }
      return { canal: canalId, sem_api_key: sessoes.length };
    }

    // ---- limite diário de chamadas Gemini (por canal, dia de SP) ----
    const max = Number((iaConfig as { max_chamadas_dia?: number }).max_chamadas_dia) || 500;
    const meiaNoiteSp = inicioDoDiaSpUtcIso();
    const { count: chamadasHoje } = await admin.from('ia_eventos')
      .select('id', { count: 'exact', head: true })
      .eq('tipo', 'gemini_call').gte('criado_em', meiaNoiteSp).contains('detalhe', { canal_id: canalId });
    if ((chamadasHoje ?? 0) >= max) {
      const { data: jaLogado } = await admin.from('ia_eventos').select('id')
        .eq('tipo', 'limite_diario').gte('criado_em', meiaNoiteSp).contains('detalhe', { canal_id: canalId }).limit(1);
      for (const s of sessoes) {
        await admin.from('ia_sessoes').update({ processar_apos: new Date(Date.now() + 60 * 60_000).toISOString() }).eq('id', s.id).eq('status', 'ativa');
      }
      if (!jaLogado?.length) await evento(admin, sessoes[0], 'limite_diario', { canal_id: canalId, chamadas: chamadasHoje, max });
      return { canal: canalId, limite_diario: true };
    }

    // ---- processa SERIAL (nunca duas conversas do mesmo chip ao mesmo tempo) ----
    const modelos = resolverModelos(iaConfig);
    let processadas = 0;
    for (const s of sessoes) {
      // admissão com FOLGA: turno no pior caso é longo — não admitir nova sessão perto do teto
      if (Date.now() - inicio > 60_000) break;
      await processarSessao(admin, s, canal, iaConfig, modelos, dono);
      processadas++;
      await admin.rpc('ia_canal_lock', { p_canal: canalId, p_dono: dono, p_ttl_seg: 240 });  // renova (mesmo dono)
    }
    return { canal: canalId, processadas };
  } finally {
    try { await admin.rpc('ia_canal_unlock', { p_canal: canalId, p_dono: dono }); } catch { /* lease expira sozinha */ }
  }
}

// ======== sessão: claim + lock de conversa + turno; FALHA TÉCNICA nunca vira conversa ========
async function processarSessao(admin: Admin, sessao: Sessao, canal: Record<string, unknown>, iaConfig: Record<string, unknown>, modelos: Modelos, dono: string): Promise<void> {
  // claim de 10min: um turno com vários arquivos + retries do Gemini (45s de teto por chamada)
  // pode passar de 5 — o claim tem que sobreviver ao pior turno realista
  const claimAte = new Date(Date.now() + 10 * 60_000).toISOString();
  const { data: claimed } = await admin.from('ia_sessoes')
    .update({ processar_apos: claimAte, atualizado_em: new Date().toISOString() })
    .eq('id', sessao.id).eq('status', 'ativa').lte('processar_apos', new Date().toISOString())
    .select('id');
  if (!claimed?.length) return;

  const { data: lockConv } = await admin.rpc('bot_claim_conversa', { p_conversa: sessao.conversa_id, p_ttl_seg: 600 });
  if (!lockConv) {
    await admin.from('ia_sessoes').update({ processar_apos: new Date(Date.now() + 60_000).toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
    return;
  }
  try {
    await turno(admin, sessao, canal, iaConfig, modelos, claimAte, dono);
  } catch (e) {
    const msg = String((e as Error)?.message ?? 'erro').slice(0, 300);
    if (msg.includes('sem_api_key')) {
      await admin.from('ia_sessoes').update({ processar_apos: new Date(Date.now() + 30 * 60_000).toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
      await evento(admin, sessao, 'sem_api_key', {});
      return;
    }
    // QUOTA do Google esgotada (429 "check your plan and billing"): não é defeito nosso nem do
    // cliente — resolve com o tempo (reset diário) ou upgrade de tier da chave. Espera 10min sem
    // queimar o contador de falhas técnicas.
    // SOBRECARGA transitória (503 "high demand" / 5xx / todos os modelos sobrecarregados / 429):
    // capacidade do Google, resolve em minutos. NUNCA vira falha técnica (foi o que travou a
    // Roseli). Espera curto (2min) e reprocessa; só vira handoff se persistir ~1h (raro).
    if (msg.includes('gemini 429') || msg.includes('sobrecarga_transitoria') || ehSobrecarga(msg)) {
      const ehQuota = msg.includes('gemini 429') && /quota|billing|plan/.test(msg);
      const esperaMs = ehQuota ? 10 * 60_000 : 2 * 60_000;
      await admin.from('ia_sessoes').update({ processar_apos: new Date(Date.now() + esperaMs).toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
      await evento(admin, sessao, ehQuota ? 'quota_gemini' : 'sobrecarga_transitoria', { erro: msg.slice(0, 120) });
      // preso há ~1h não pode ser silêncio eterno: entrega ao humano com o motivo real
      const { count: presos1h } = await admin.from('ia_eventos').select('id', { count: 'exact', head: true })
        .eq('sessao_id', sessao.id).in('tipo', ['quota_gemini', 'sobrecarga_transitoria'])
        .gte('criado_em', new Date(Date.now() - 3_600_000).toISOString());
      if ((presos1h ?? 0) >= 20) {
        await fazerHandoff(admin, sessao, canal, 'falha_tecnica', [MSG_HANDOFF_FINAL],
          '🤖 IA SDR — a API do Gemini ficou sobrecarregada/sem cota por ~1h. NÃO foi o cliente. Atendimento entregue ao humano; ver ia_eventos (quota_gemini/sobrecarga_transitoria).');
      }
      return;
    }
    // FALHA TÉCNICA (modelo/API/interna): NÃO fala com o cliente, NÃO conta tentativas_erro.
    if (!(e instanceof FalhaTecnica)) await evento(admin, sessao, 'erro_turno', { erro: msg });
    // dados FRESCOS: o turno pode ter gravado estado no meio (ex.: analise_concluida) — mesclar
    // por cima da linha stale apagaria essa marca e a retomada refaria trabalho caro.
    const { data: freshRow } = await admin.from('ia_sessoes').select('dados').eq('id', sessao.id).maybeSingle();
    const dadosAtuais = ((freshRow?.dados ?? sessao.dados ?? {}) as Record<string, unknown>);
    const falhas = (Number((dadosAtuais as { falhas_tecnicas?: number }).falhas_tecnicas) || 0) + 1;
    const ehExtracao = /^(extracao|analise_|storage_)/.test(msg);
    if (falhas >= MAX_FALHAS_TECNICAS && ehExtracao) {
      // Só a LEITURA DE ARQUIVO está quebrada — o chat continua falando (foi o caso de 25/08:
      // 400 na extração emudeceu a conversa inteira e o "Por que?" do cliente ficou sem resposta).
      // Handoff SUAVE: alerta o humano, PULA os arquivos envenenados (senão o turno re-falha pra
      // sempre) e a IA segue conversando normalmente.
      const { data: ult } = await admin.from('mensagens').select('id, criado_em')
        .eq('conversa_id', sessao.conversa_id).eq('direcao', 'entrada')
        .order('criado_em', { ascending: false }).limit(1).maybeSingle();
      await criarNotaInterna(admin, sessao,
        `🤖 IA SDR — a LEITURA de arquivos falhou tecnicamente ${MAX_FALHAS_TECNICAS}x seguidas (erro de API — NÃO é culpa do cliente): um colega precisa conferir os documentos que ele mandou. A IA segue conversando normalmente. Detalhe dos erros: ia_eventos (gemini_erro).`);
      try {
        await admin.from('conversas').update({ precisa_humano: true, precisa_humano_motivo: 'falha_leitura_docs', precisa_humano_em: new Date().toISOString() }).eq('id', sessao.conversa_id);
      } catch { /* nota interna já registra */ }
      await admin.from('ia_sessoes').update({
        dados: {
          ...dadosAtuais, falhas_tecnicas: 0, aguardando_humano: 'falha_leitura_docs',
          ...(ult ? { processado_ate: ult.criado_em, msgs_vistas: [ult.id] } : {}),
        },
        processar_apos: null, atualizado_em: new Date().toISOString(),
      }).eq('id', sessao.id).eq('status', 'ativa');
      await evento(admin, sessao, 'chamou_humano', { motivo: 'falha_leitura_docs' });
    } else if (falhas >= MAX_FALHAS_TECNICAS) {
      await fazerHandoff(admin, sessao, canal, 'falha_tecnica', [MSG_HANDOFF_FINAL],
        `🤖 IA SDR — atendimento entregue ao humano por FALHA TÉCNICA repetida do sistema (modelo/API), na etapa ${sessao.etapa}.\nNÃO foi confusão do cliente — ele estava respondendo normalmente. Últimos erros em ia_eventos (tipo gemini_erro/erro_turno).`);
    } else {
      await admin.from('ia_sessoes').update({
        dados: { ...dadosAtuais, falhas_tecnicas: falhas },
        processar_apos: new Date(Date.now() + REAGENDA_FALHA_MS).toISOString(),
        atualizado_em: new Date().toISOString(),
      }).eq('id', sessao.id).eq('status', 'ativa');
    }
  } finally {
    try { await admin.rpc('bot_release_conversa', { p_conversa: sessao.conversa_id }); } catch { /* lease expira */ }
  }
}

// ======== o TURNO ========
async function turno(admin: Admin, sessao: Sessao, canal: Record<string, unknown>, iaConfig: Record<string, unknown>, modelos: Modelos, claimAte: string, dono: string): Promise<void> {
  const { data: conversa } = await admin.from('conversas')
    .select('id, organizacao_id, contato_id, precisa_humano').eq('id', sessao.conversa_id).maybeSingle();
  if (!conversa) { await encerrarSessao(admin, sessao, 'conversa_inexistente'); return; }
  // precisa_humano ligado POR NÓS (handoff suave) não silencia a IA — ela segue atendendo em
  // modo acompanhamento até o humano assumir de fato (aí o trigger pausa). Só um precisa_humano
  // EXTERNO (outro mecanismo do sistema) pausa aqui.
  if (conversa.precisa_humano && !(sessao.dados as Record<string, unknown>)?.aguardando_humano) {
    await admin.from('ia_sessoes').update({ status: 'pausada', atualizado_em: new Date().toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
    await evento(admin, sessao, 'pausada_precisa_humano', {});
    return;
  }
  const { data: opt } = await admin.from('wa_optout').select('contato_id').eq('contato_id', sessao.contato_id).limit(1);
  if (opt?.length) {
    await admin.from('ia_sessoes').update({ status: 'pausada', atualizado_em: new Date().toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
    await evento(admin, sessao, 'optout', {});
    return;
  }

  const { data: contato } = await admin.from('contatos').select('nome, cpf, email').eq('id', sessao.contato_id).maybeSingle();
  const { data: ident } = await admin.from('contato_identidades')
    .select('valor_normalizado').eq('contato_id', sessao.contato_id).eq('tipo', 'whatsapp')
    .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
  const destino = ident?.valor_normalizado ?? null;
  if (!destino) {
    await admin.from('ia_sessoes').update({ processar_apos: new Date(Date.now() + 30 * 60_000).toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
    await evento(admin, sessao, 'sem_destino', {});
    return;
  }

  const dados = (sessao.dados ?? {}) as Record<string, unknown>;
  const processadoAte = (dados.processado_ate as string) ?? sessao.criado_em;
  // JANELA DE SOBREPOSIÇÃO (5s) + ids já vistos: criado_em é o início da transação — com o
  // webhook baixando mídia em paralelo, uma mensagem pode COMMITAR depois de outra de timestamp
  // maior. Watermark seco pularia essa mensagem para sempre; a sobreposição + msgs_vistas não.
  const corteSobrepos = new Date(Date.parse(processadoAte) - 5_000).toISOString();
  const vistas = new Set<string>(Array.isArray(dados.msgs_vistas) ? (dados.msgs_vistas as string[]) : []);
  const { data: novasRaw } = await admin.from('mensagens')
    .select('id, tipo, conteudo, criado_em, metadados')
    .eq('conversa_id', sessao.conversa_id).eq('direcao', 'entrada')
    .gt('criado_em', corteSobrepos).order('criado_em', { ascending: true }).limit(25);
  const fetched = (novasRaw ?? []) as MsgNova[];
  const novas = fetched.filter((m) => !vistas.has(m.id));
  const houveMais = fetched.length >= 25;   // estourou o limit: reagenda já em vez de dormir

  // acordou SEM mensagem nova: transição pendente re-tenta a etapa; senão é hora de NUDGE
  // (lead esfriou) ou volta a dormir
  const transPendente = dados.transicao_pendente === true;
  const nudgeN = Number(dados.nudge_n ?? 0) || 0;
  const ehNudge = !novas.length && dados.abertura_enviada === true && !transPendente
    && !dados.aguardando_humano && sessao.etapa !== 'conclusao' && sessao.etapa !== 'retorno'
    && nudgeN < NUDGE_MAX && dados.nudge_alvo === processadoAte
    // retomada FRIA (o cliente nunca respondeu à retomada) não ganha escada: a abertura JÁ é o toque
    && (dados.retomada !== true || dados.teve_inbound === true);
  if (!novas.length && dados.abertura_enviada && !ehNudge && !transPendente) { await limparAgenda(admin, sessao.id, claimAte); return; }

  // ---- ANTI-BAN / horário do CONTATO PROATIVO: nudge OU abertura de RETOMADA fora da janela
  //      (07:30–21:30 SP) NÃO sai agora — reagenda pra próxima abertura. Lead VIVO (novas.length)
  //      e abertura de lead NOVO (sem retomada) passam a qualquer hora: responder é reativo. ----
  const ehAberturaRetomada = dados.retomada === true && !dados.abertura_enviada && !novas.length;
  // exceção pontual autorizada pelo dono: um lote com abertura_especial pode sair fora da janela
  // (é envio único e aprovado, com espaçamento anti-ban preservado no processar_apos de cada sessão).
  const bypassJanela = typeof dados.abertura_especial === 'string' && !!dados.abertura_especial && !dados.abertura_enviada;
  if ((ehNudge || ehAberturaRetomada) && !bypassJanela && !dentroDaJanela(iaConfig)) {
    const alvo = proximaAbertura(iaConfig);
    await admin.from('ia_sessoes').update({ processar_apos: alvo, atualizado_em: new Date().toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
    await evento(admin, sessao, 'fora_janela', { reagendado_para: alvo, motivo: ehNudge ? 'nudge' : 'abertura_retomada' });
    return;
  }

  // histórico (~30 mensagens, ordem cronológica) + conjunto de saídas p/ o dedup duro
  const { data: histRaw } = await admin.from('mensagens')
    .select('direcao, tipo, conteudo, origem')
    .eq('conversa_id', sessao.conversa_id).order('criado_em', { ascending: false }).limit(30);
  const hist = ((histRaw ?? []) as Array<{ direcao: string; tipo: string; conteudo: string | null; origem: string | null }>).reverse();
  const transcript = hist
    .filter((m) => m.tipo !== 'nota_interna' && m.tipo !== 'sistema')
    .map((m) => {
      const quem = m.direcao === 'entrada' ? '[cliente]' : (m.origem === 'bot' ? '[você]' : '[atendente humano]');
      if (m.tipo === 'texto' && m.conteudo) return `${quem} ${limparLinha(m.conteudo)}`;
      return `${quem} (${m.tipo}${m.conteudo ? `: ${limparLinha(m.conteudo).slice(0, 80)}` : ''})`;
    }).join('\n');
  // só o que o CLIENTE recebeu conta no dedup — nota_interna/sistema aqui vazaria conteúdo
  // interno pro prompt de reescrita e bloquearia frases que nunca foram ditas a ele
  const { data: saidasRaw } = await admin.from('mensagens')
    .select('conteudo').eq('conversa_id', sessao.conversa_id).eq('direcao', 'saida')
    .in('tipo', ['texto', 'video'])
    .not('conteudo', 'is', null).order('criado_em', { ascending: false }).limit(200);
  const saidasAnteriores = new Set(((saidasRaw ?? []) as Array<{ conteudo: string }>).map((m) => normalizarSaida(m.conteudo)));

  const ctx: Ctx = {
    admin, sessao, canal, iaConfig, modelos, dono, conversa, destino, transcript, saidasAnteriores,
    contatoNome: (contato?.nome as string) ?? '', contatoCpf: (contato?.cpf as string) ?? '',
    dados, docs: (sessao.docs ?? {}) as Record<string, unknown>,
    cobertura: (sessao.cobertura_extratos ?? {}) as Record<string, unknown>,
    novas,
    textos: novas.filter((m) => m.tipo === 'texto' && m.conteudo).map((m) => m.conteudo as string),
    arquivos: novas.filter((m) => (m.tipo === 'imagem' || m.tipo === 'documento') && (m.metadados as Record<string, unknown>)?.anexo_path),
    audios: novas.filter((m) => m.tipo === 'audio' && (m.metadados as Record<string, unknown>)?.anexo_path),
    pendentes: novas.filter((m) => (m.metadados as Record<string, unknown>)?.midia_pendente).length,
  };

  // ---- roda a etapa (etapas antigas de coleta viraram o checklist dinâmico) ----
  let t: Turno;
  if (ehNudge) {
    // orçamento de nudge POR CANAL (proteção do chip): máx 6/h — excedeu, reagenda com jitter
    const { count: nudgesHora } = await admin.from('ia_eventos').select('id', { count: 'exact', head: true })
      .eq('tipo', 'nudge_enviado').gte('criado_em', new Date(Date.now() - 3_600_000).toISOString())
      .contains('detalhe', { canal_id: sessao.canal_id });
    if ((nudgesHora ?? 0) >= 6) {
      await agendarProximo(admin, sessao.id, claimAte, new Date(Date.now() + rand(30, 60) * 60_000).toISOString());
      return;
    }
    // TURNO DE RETOMADA: o cliente ficou mudo — puxa de volta com leveza, contextual à etapa
    const mesesN = mesesComprovante();
    const varsNudge: Record<string, string> = (sessao.etapa === 'coleta_docs' || ['docs_pessoais', 'comprovante_residencia', 'declarante'].includes(sessao.etapa))
      ? { CHECKLIST: checklistTexto(checklistDe(ctx.docs, ctx.dados, null), ctx.docs, `do mês atual ou do passado (${mesesN[0].rotulo} ou ${mesesN[1].rotulo})`) }
      : {};
    const r = await conversar(ctx, { vars: varsNudge, instrucaoExtra: instrucaoNudge(nudgeN + 1) });
    t = { bolhas: r.mensagens, dadosPatch: { nudge_n: nudgeN + 1 } };
    await evento(admin, sessao, 'nudge_enviado', { n: nudgeN + 1, etapa: sessao.etapa, canal_id: sessao.canal_id });
  } else switch (sessao.etapa) {
    case 'qualificacao_inss':
      // foto/pdf mandado JÁ na qualificação (antes de a IA pedir): trata como coleta p/ creditar
      t = ctx.arquivos.length ? await etapaColetaDocs(ctx) : await etapaQualificacao(ctx);
      break;
    case 'coleta_docs':
    case 'docs_pessoais':
    case 'comprovante_residencia':
    case 'declarante': t = await etapaColetaDocs(ctx); break;
    case 'triagem_govbr': t = await etapaTriagem(ctx); break;
    case 'video_meuinss':
    case 'extratos': t = await etapaExtratos(ctx); break;
    case 'retorno': t = await etapaRetorno(ctx); break;
    case 'conclusao': {
      // pós-conclusão: o especialista foi alertado; a IA responde com simpatia até ele assumir
      const r = await conversar(ctx, { etapa: 'conclusao' });
      t = { bolhas: r.mensagens, resetErros: true, __perguntouValores: r.perguntouValores };
      break;
    }
    default:
      await evento(admin, sessao, 'etapa_desconhecida', { etapa: sessao.etapa });
      throw new FalhaTecnica(`etapa_desconhecida:${sessao.etapa}`);
  }

  // ---- insistência em valores: 1ª vez o modelo responde com a régua; 2ª => chama o especialista
  //      (a IA segue atendendo — handoff suave) ----
  const perguntouValores = ctx.textos.some((x) => perguntaDeValores(x)) || t.__perguntouValores === true;
  if (perguntouValores && !t.statusNovo) {
    const n = (Number(dados.perguntas_valores ?? 0) || 0) + 1;
    t.dadosPatch = { ...(t.dadosPatch ?? {}), perguntas_valores: n };
    if (n >= 2 && !dados.aguardando_humano) {
      const bolhas = await gerarDespedida(ctx,
        'A pessoa insiste em saber valores/condições. Avise com todo o respeito que você chamou o especialista — quem pode falar de valores — para assumir aqui, e que enquanto isso você segue à disposição para adiantar o restante.');
      t = { ...t, bolhas, video: undefined, etapaNova: undefined, chamarHumano: 'quer_falar_valores', notaInterna: t.notaInterna ?? notaContexto(ctx, 'quer_falar_valores'),
        dadosPatch: { ...(t.dadosPatch ?? {}), ...((t.dadosPatch as Record<string, unknown> | undefined)?.transicao_pendente === null ? { transicao_pendente: true } : {}) } };
    }
  }

  // ---- confusão REAL do cliente acumulada (2ª vez seguida): chama um colega, SEM emudecer ----
  const errosProspectivos = t.incrementaErro ? (sessao.tentativas_erro ?? 0) + 1 : (t.resetErros ? 0 : (sessao.tentativas_erro ?? 0));
  if (!t.statusNovo && !t.chamarHumano && errosProspectivos >= 2 && !dados.aguardando_humano) {
    const bolhasAviso = await gerarDespedida(ctx,
      'Vocês não estão conseguindo se entender por aqui. Sem culpar a pessoa, avise com carinho que você chamou um colega do time para ajudar nesta conversa — e que enquanto isso você continua aqui com ela.');
    t = { ...t, bolhas: bolhasAviso, video: undefined, etapaNova: undefined, chamarHumano: 'nao_entendeu', notaInterna: t.notaInterna ?? notaContexto(ctx, 'nao_entendeu'),
      dadosPatch: { ...(t.dadosPatch ?? {}), ...((t.dadosPatch as Record<string, unknown> | undefined)?.transicao_pendente === null ? { transicao_pendente: true } : {}) } };
  }

  // ---- guardrail pós-Gemini: violou → pede REESCRITA (1x); persistiu → descarta a bolha ----
  let bolhas = [...t.bolhas];
  const violacoes = bolhas.map((b) => saidaProibida(b));
  if (violacoes.some(Boolean)) {
    for (let i = 0; i < bolhas.length; i++) {
      if (violacoes[i]) await evento(admin, sessao, 'guardrail_bloqueou', { violacao: violacoes[i], texto: bolhas[i].slice(0, 180) });
    }
    const reescritas = await reescrever(ctx, bolhas,
      `Sua resposta violou uma regra dura (${violacoes.filter(Boolean).join(', ')}): é PROIBIDO citar valores, taxas, juros, percentuais, margem, prazos, nomes de banco ou "aprovado/reprovado". Reescreva mantendo o sentido, sem nada disso.`);
    bolhas = (reescritas ?? bolhas).filter((b) => !saidaProibida(b));
  }

  // ---- dedup duro: nunca repetir uma saída já existente na conversa ----
  bolhas = await deduplicar(ctx, bolhas);

  // ---- filtro FINAL de segurança: a reescrita do dedup também é geração — nada proibido passa ----
  {
    const finais: string[] = [];
    for (const b of bolhas) {
      const v = saidaProibida(b);
      if (v) { await evento(admin, sessao, 'guardrail_bloqueou', { violacao: v, texto: b.slice(0, 180), pos_dedup: true }); continue; }
      finais.push(b);
    }
    bolhas = finais;
  }

  // ---- a LEGENDA do vídeo é texto do modelo: passa pelas mesmas travas (violou/repetiu → sem legenda) ----
  if (t.video?.caption) {
    const v = saidaProibida(t.video.caption);
    const dup = ctx.saidasAnteriores.has(normalizarSaida(t.video.caption));
    if (v || dup) {
      await evento(admin, sessao, v ? 'guardrail_bloqueou' : 'dedup_descartou', { texto: t.video.caption.slice(0, 120), ...(v ? { violacao: v } : {}), legenda_video: true });
      t.video = { ...t.video, caption: '' };
    }
  }

  if (!bolhas.length && !t.video && t.bolhas.length) {
    // tinha resposta e tudo caiu (guardrail/dedup): melhor silêncio + nova chance que repetição
    await evento(admin, sessao, 'saida_descartada', { motivo: 'guardrail_ou_dedup', originais: t.bolhas.length });
  }

  // ---- humano entrou enquanto processávamos? (o trigger já pausou) => não envia nada ----
  const { data: fresca } = await admin.from('ia_sessoes').select('status').eq('id', sessao.id).maybeSingle();
  if (fresca?.status !== 'ativa') { await evento(admin, sessao, 'abortado_status', { status: fresca?.status ?? null }); return; }

  if (bolhas.length || t.video) await enviarBolhas(admin, ctx, bolhas.slice(0, 3), t.video ?? null);

  // ---- persiste o desfecho do turno (sucesso => zera falhas técnicas consecutivas) ----
  let ultimaNova = novas.length ? novas[novas.length - 1].criado_em : processadoAte;
  if (t.naoAvancarAlem && t.naoAvancarAlem < ultimaNova) ultimaNova = t.naoAvancarAlem;
  const corteVistas = Date.parse(ultimaNova) - 5_000;
  const msgsVistas = fetched.filter((m) => Date.parse(m.criado_em) > corteVistas && m.criado_em <= ultimaNova).map((m) => m.id).slice(-40);
  const patch: Record<string, unknown> = {
    // nudge_alvo/nudge_n: mensagem nova do cliente zera o ciclo de retomada; turno de nudge
    // incrementa via t.dadosPatch (que entra por cima)
    dados: { ...dados, nudge_alvo: ultimaNova, ...(novas.length ? { nudge_n: 0, teve_inbound: true } : {}), ...(t.dadosPatch ?? {}), processado_ate: ultimaNova, msgs_vistas: msgsVistas, abertura_enviada: true, falhas_tecnicas: 0 },
    docs: { ...ctx.docs, ...(t.docsPatch ?? {}) },
    atualizado_em: new Date().toISOString(),
  };
  if (t.coberturaNova) patch.cobertura_extratos = t.coberturaNova;
  if (t.etapaNova) { patch.etapa = t.etapaNova; (patch.dados as Record<string, unknown>).tentativas_etapa = 0; }
  if (t.resetErros) patch.tentativas_erro = 0;
  else if (t.incrementaErro) patch.tentativas_erro = (sessao.tentativas_erro ?? 0) + 1;

  // ---- HANDOFF SUAVE: chama o humano (alerta + nota) mas a IA SEGUE ativa em acompanhamento —
  //      ela só emudece quando o atendente assumir de fato (o trigger pausa na 1ª msg humana) ----
  if (t.chamarHumano && !dados.aguardando_humano) {
    await criarNotaInterna(admin, sessao, t.notaInterna ?? notaContexto(ctx, t.chamarHumano));
    const { error: eConv } = await admin.from('conversas').update({
      precisa_humano: true, precisa_humano_motivo: t.chamarHumano, precisa_humano_em: new Date().toISOString(),
    }).eq('id', sessao.conversa_id);
    if (eConv) await evento(admin, sessao, 'erro_escrita', { onde: 'chamou_humano', erro: String(eConv.message ?? '').slice(0, 200) });
    (patch.dados as Record<string, unknown>).aguardando_humano = t.chamarHumano;
    await evento(admin, sessao, 'chamou_humano', { motivo: t.chamarHumano });
  }
  // ---- retomada: o problema que motivou o chamado se resolveu → IA volta ao normal, alerta sai.
  //      SÓ para motivos que progresso de documento resolve — valores/senha/CPF divergente são
  //      assunto do humano e o alerta NÃO pode ser apagado por uma foto boa ----
  const MOTIVOS_RETOMAVEIS = ['foto_ilegivel', 'comprovante_fora_janela', 'auxilio_extratos', 'sem_acesso_govbr', 'doc_divergente', 'nao_entendeu', 'transicao_falhou'];
  if (t.retomar && dados.aguardando_humano && MOTIVOS_RETOMAVEIS.includes(String(dados.aguardando_humano))) {
    (patch.dados as Record<string, unknown>).aguardando_humano = null;
    try {
      await admin.from('conversas').update({ precisa_humano: false, precisa_humano_motivo: null, precisa_humano_em: null }).eq('id', sessao.conversa_id);
    } catch { /* alerta a mais é melhor que alerta a menos */ }
    await evento(admin, sessao, 'retomou', { motivo_anterior: dados.aguardando_humano });
  }
  if (t.statusNovo === 'encerrada') {
    patch.status = 'encerrada';
    if (t.etiquetaOpp) await etiquetarOportunidade(admin, sessao, t.etiquetaOpp);
    await evento(admin, sessao, 'encerrada', { motivo: t.etiquetaOpp ?? null });
  }

  const { error: ePatch } = await admin.from('ia_sessoes').update(patch).eq('id', sessao.id);
  if (ePatch) {
    // patch perdido = máquina de estados quebrada em silêncio; vira falha técnica VISÍVEL
    await evento(admin, sessao, 'erro_escrita', { onde: 'patch_turno', erro: String(ePatch.message ?? '').slice(0, 200) });
    throw new FalhaTecnica('patch_turno_falhou');
  }
  if (!t.statusNovo) {
    if (houveMais) {
      // estourou o limit de novas: tem mensagem esperando — próximo turno JÁ, sem dormir
      await admin.from('ia_sessoes').update({ processar_apos: new Date().toISOString() }).eq('id', sessao.id).eq('status', 'ativa');
    } else if (t.reagendarMs) {
      // o handler pediu outro turno em breve (ex.: abertura da triagem reprovou na verificação)
      await agendarProximo(admin, sessao.id, claimAte, new Date(Date.now() + t.reagendarMs).toISOString());
    } else {
      // agenda a RETOMADA se o lead esfriar (escada: 1º por tipo de etapa, 2º ~3h, 3º manhã
      // seguinte; depois o episódio encerra). Sem retomada quando: colega já chamado,
      // pós-conclusão, ou teto de toques atingido.
      const dadosFinais = patch.dados as Record<string, unknown>;
      const etapaFinal = (patch.etapa as string) ?? sessao.etapa;
      const nFinal = Number(dadosFinais.nudge_n ?? 0) || 0;
      if (!dadosFinais.aguardando_humano && etapaFinal !== 'conclusao' && etapaFinal !== 'retorno' && nFinal < NUDGE_MAX
          && (dadosFinais.retomada !== true || dadosFinais.teve_inbound === true)) {
        let quando: string;
        if (nFinal === 0) quando = ajustarJanelaNudge(Date.now() + delayNudge1Ms(etapaFinal, patch.docs as Record<string, unknown>) + rand(0, 5 * 60_000));
        else if (nFinal === 1) quando = ajustarJanelaNudge(Date.now() + 3 * 3_600_000 + rand(0, 20 * 60_000));
        else quando = proximaManhaNudge();
        await agendarProximo(admin, sessao.id, claimAte, quando);
      } else {
        if (ehNudge && nFinal >= NUDGE_MAX) await evento(admin, sessao, 'nudges_esgotados', { etapa: etapaFinal });
        await limparAgenda(admin, sessao.id, claimAte);
      }
    }
  }
}

// ======== etapas ========
async function etapaQualificacao(ctx: Ctx): Promise<Turno> {
  const abertura = !ctx.dados.abertura_enviada && !ctx.textos.length && !ctx.audios.length && !ctx.arquivos.length;
  // RETOMADA (backfill de leads parados): a pessoa completou o fluxo há dias e ninguém deu
  // continuidade — a abertura reconhece a demora com leveza e retoma com energia.
  const ehRetomada = ctx.dados.retomada === true;
  const ehAbandono = ctx.dados.retomada_abandono === true;
  const dias = Number(ctx.dados.retomada_dias ?? 0) || 0;
  // ABERTURA ESPECIAL (exceção pontual autorizada pelo dono, por sessão): quando dados.abertura_especial
  // traz um roteiro de abertura, ele SUBSTITUI o texto de retomada/abandono só neste 1º toque. É
  // efêmero — some do dados assim que a abertura é enviada; nenhum lead futuro herda isso.
  const aberturaEspecial = typeof ctx.dados.abertura_especial === 'string' && ctx.dados.abertura_especial.trim()
    ? String(ctx.dados.abertura_especial) : '';
  // o roteiro especial deste lote entra no 1º toque MESMO se o cliente escreveu antes do slot agendado
  // (o dono quer que a desculpa ABRA o atendimento) — a extração de recebe_inss segue no `abertura` estrito.
  const injetarAbertura = abertura || (!!aberturaEspecial && !ctx.dados.abertura_enviada);
  const instrAbertura = aberturaEspecial
    ? aberturaEspecial
    : ehAbandono
    // ABANDONO: começou a conversa (veio de um anúncio) mas não terminou. NÃO presuma "solicitação
    // pronta" — a pessoa não concluiu nada. Abra leve, sem cobrança, retomando de onde parou.
    ? `Esta pessoa começou uma conversa com a CAF sobre empréstimo/análise ${dias <= 1 ? 'há pouco' : `há ${dias} dias`} mas não chegou a terminar. Reabra com muita leveza, SEM cobrar e SEM dizer que ela "solicitou" ou que "está pronto": apenas retome com simpatia, reidentifique-se ("aqui é do atendimento da CAF"), diga que ficou de ajudar a pessoa e faça a pergunta do benefício do INSS para dar continuidade, se ela quiser. Se a pessoa demonstrar que não tem interesse, encerre com educação (dados_extraidos.recebe_inss="nao").`
    : ehRetomada
    ? `Esta é uma RETOMADA: a pessoa fez a solicitação ${dias <= 1 ? 'há pouco tempo' : `há ${dias} dias`} e a nossa equipe demorou a dar continuidade. Abra pedindo desculpa LEVE pela demora (uma meia frase, sem drama), diga que está retomando a solicitação dela para dar continuidade, e faça a pergunta do benefício. Reidentifique-se ("aqui é do atendimento da CAF").`
    : 'Este é o SEU primeiro contato (abertura da etapa): cumprimente de leve e faça a pergunta do benefício.';
  const r = await conversar(ctx, {
    instrucaoExtra: injetarAbertura ? instrAbertura : '',
  });
  const recebe = String(r.dados.recebe_inss ?? (abertura ? 'incerto' : 'incerto'));
  if (!abertura && recebe === 'sim') {
    return { bolhas: r.mensagens, etapaNova: 'coleta_docs', resetErros: true, __perguntouValores: r.perguntouValores };
  }
  if (!abertura && recebe === 'nao') {
    return { bolhas: r.mensagens, statusNovo: 'encerrada', etiquetaOpp: 'nao_elegivel', __perguntouValores: r.perguntouValores };
  }
  return { bolhas: r.mensagens, incrementaErro: !abertura, ...(aberturaEspecial ? { dadosPatch: { abertura_especial: null } } : {}), __perguntouValores: r.perguntouValores };
}

// ---- RETORNO: lead que já conversou antes e voltou a chamar ----
// O trigger fn_ia_sessao_mensagem detecta o retorno e injeta em dados: retorno_fechado (a
// oportunidade já está ganha/perdida/cancelada) e retorno_opp_status. Dois modos:
//  • FECHADO  → avisa (uma vez) que o caso já foi finalizado e passa pro humano dar uma olhada.
//  • ABERTO   → requalifica com firmeza cordial: interesse? → docs em mãos? → Meu INSS? → horário?
//               com as três respostas, entrega ao analista com o resumo.
// Os dois casos são uma ABORDAGEM ÚNICA que já ENTREGA pro atendente (o humano segue a conversa):
//  • FECHADO → avisa que o atendimento já foi finalizado e pergunta com o que pode ajudar.
//  • PENDENTE → lembra que já conversaram e o caso ficou pendente, pede continuidade, e avisa que
//    vai chamar um atendente com PRIORIDADE, contando com a colaboração da pessoa.
async function etapaRetorno(ctx: Ctx): Promise<Turno> {
  const d = ctx.dados;
  const carimbo = { retorno_ts: new Date().toISOString() };   // cooldown: o trigger não reabre <20h
  const fechado = d.retorno_fechado === true;
  const r = await conversar(ctx, {
    vars: { MODO_RETORNO: fechado ? INSTRUCAO_RETORNO_FECHADO : INSTRUCAO_RETORNO_REQUALIFICA },
  });
  return {
    bolhas: r.mensagens,
    chamarHumano: fechado ? 'retorno_caso_fechado' : 'retorno_pendente_prioridade',
    statusNovo: 'encerrada',
    dadosPatch: carimbo,
    __perguntouValores: r.perguntouValores,
    notaInterna: fechado
      ? `🤖 IA SDR — lead com atendimento JÁ FINALIZADO (oportunidade ${String(d.retorno_opp_status ?? '?')}) voltou PELO ANÚNCIO. Avisei que o caso já foi finalizado e perguntei com o que podemos ajudar. Assumir e ver o que a pessoa precisa agora.`
      : `🤖 IA SDR — lead RETOMADO PELO ANÚNCIO (já tínhamos conversado; o caso ficou PENDENTE). Reabri, pedi continuidade e avisei que vamos dar PRIORIDADE. Assumir com prioridade — contamos com a colaboração da pessoa.`,
  };
}

// ---- coleta por CHECKLIST DINÂMICO: identidade FRENTE+VERSO + comprovante + e-mail ----
// VALIDAÇÃO LEVE (regra do dono, fase 1.3): só confirmamos O QUE o documento é — nunca DE QUEM é.
// Nome/CPF extraídos vão pra observação interna; nenhuma comparação bloqueia o cliente.
interface Checklist { identidadeOk: boolean; comprovanteOk: boolean; emailOk: boolean; completo: boolean }
function checklistDe(docs: Record<string, unknown>, dados: Record<string, unknown>, emailNovo: string | null): Checklist {
  const dp = (docs.doc_pessoal ?? {}) as Record<string, unknown>;
  const identidadeOk = dp.frente === true && dp.verso === true;
  const comprovanteOk = !!docs.comprovante;
  const emailOk = !!(dados.email || emailNovo);
  return { identidadeOk, comprovanteOk, emailOk, completo: identidadeOk && comprovanteOk && emailOk };
}
function checklistTexto(c: Checklist, docs: Record<string, unknown>, meses: string): string {
  const dp = (docs.doc_pessoal ?? {}) as Record<string, unknown>;
  let linhaId: string;
  if (c.identidadeOk) linhaId = '✔ já recebido — identidade (frente e verso)';
  else if (dp.frente === true) linhaId = '✖ FALTA só o VERSO da identidade (a frente já chegou ✓)';
  else if (dp.verso === true) linhaId = '✖ FALTA só a FRENTE da identidade (o verso já chegou ✓)';
  else linhaId = '✖ FALTA — documento de identidade (RG ou CNH, frente e verso)';
  const linha = (ok: boolean, sTxt: string) => `${ok ? '✔ já recebido' : '✖ FALTA'} — ${sTxt}`;
  const comp = (docs.comprovante ?? {}) as Record<string, unknown>;
  const linhaComp = comp.pendente_analista === true
    ? '✔ comprovante de residência: o cliente não tem agora — FICA COM O ANALISTA depois (não peça mais)'
    : linha(c.comprovanteOk, `comprovante de residência (${meses})`);
  return [
    linhaId,
    linhaComp,
    linha(c.emailOk, 'e-mail do cliente'),
  ].join('\n');
}

async function etapaColetaDocs(ctx: Ctx): Promise<Turno> {
  // turno de RE-TENTATIVA da transição (a abertura do gov.br reprovou na verificação e nada de
  // novo chegou): só a pergunta importa — nada de novo ack pra não soar repetitivo
  if (ctx.dados.transicao_pendente === true && !ctx.novas.length) {
    const pergunta = await aberturaTriagemVerificada(ctx);
    if (pergunta) return { bolhas: [pergunta], etapaNova: 'triagem_govbr', dadosPatch: { transicao_pendente: null, transicao_tentativas: 0 }, resetErros: true };
    const tt = (Number(ctx.dados.transicao_tentativas ?? 0) || 0) + 1;
    if (tt >= 3) return { bolhas: [MSG_HANDOFF_FINAL], chamarHumano: 'transicao_falhou', dadosPatch: { transicao_pendente: null } };
    return { bolhas: [], reagendarMs: 120_000, dadosPatch: { transicao_pendente: true, transicao_tentativas: tt } };
  }
  const meses = mesesComprovante();
  const mesesTxt = `do mês atual ou do passado (${meses[0].rotulo} ou ${meses[1].rotulo})`;
  const notas: string[] = [];
  const dadosPatch: Record<string, unknown> = {};
  const docsPatch: Record<string, unknown> = {};
  const tent = { ...((ctx.dados.tentativas_item as Record<string, number>) ?? {}) };
  const marcaTentativa = (item: string): number => { tent[item] = (tent[item] ?? 0) + 1; return tent[item]; };
  const aguardando = !!ctx.dados.aguardando_humano;
  let extraTurno: { naoAvancarAlem?: string; reagendarMs?: number } = {};

  // e-mail pode chegar escrito no texto (áudio soletrado fica com o modelo via dados_extraidos)
  let emailNovo: string | null = null;
  for (const txt of ctx.textos) {
    const e = extrairEmail(txt);
    if (e) { emailNovo = e; break; }
  }

  let retomar = false;
  if (ctx.pendentes) notas.push('→ um arquivo do cliente NÃO chegou direito no sistema; peça para reenviar essa foto/arquivo.');
  if (ctx.arquivos.length) {
    const lote = await extrairLoteColeta(ctx);
    if (lote.grandes) notas.push('→ um arquivo veio pesado demais e não abriu; peça como foto normal, tirada da galeria.');
    if (lote.excedeu && lote.corte) { extraTurno = { naoAvancarAlem: lote.corte, reagendarMs: 2_000 }; await evento(ctx.admin, ctx.sessao, 'arquivos_excedentes', { total: ctx.arquivos.length }); }
    for (const ident of lote.identidades) {
      const ehIdentidade = ident.tipo_documento === 'rg' || ident.tipo_documento === 'cnh';
      if (!ehIdentidade) {
        notas.push('→ chegou um arquivo que não parece ser RG/CNH — pergunte com jeitinho o que era e reforce o que precisa agora (SEM falar de qualidade de foto).');
        continue;
      }
      // QUALIDADE NÃO É GATE (regra do dono): veio o documento, está valendo — o analista humano
      // confere a qualidade depois. Aqui só rastreamos frente/verso e o nome quando legível.
      // acumula os LADOS entre turnos: frente agora, verso depois — tudo soma no mesmo item
      const antes = { ...((ctx.docs.doc_pessoal ?? {}) as Record<string, unknown>), ...((docsPatch.doc_pessoal ?? {}) as Record<string, unknown>) };
      const frente = antes.frente === true || ident.frente_presente === true;
      const verso = antes.verso === true || ident.verso_presente === true;
      docsPatch.doc_pessoal = {
        tipo: ident.tipo_documento ?? antes.tipo,
        nome: String(ident.nome_completo ?? antes.nome ?? '') || undefined,
        cpf_mascarado: ident.cpf ? mascararCpf(String(ident.cpf)) : antes.cpf_mascarado,
        frente, verso, atualizado_em: new Date().toISOString(),
      };
      retomar = true;
      const lados = [ident.frente_presente ? 'frente' : null, ident.verso_presente ? 'verso' : null].filter(Boolean).join(' e ') || 'foto';
      if (frente && verso) notas.push(`→ identidade (${String(ident.tipo_documento).toUpperCase()}, ${lados}) confirmada ✓ — item COMPLETO (frente e verso ok).`);
      else notas.push(`→ chegou a ${lados} da identidade ✓ (confirmada). Ainda falta ${frente ? 'o VERSO' : 'a FRENTE'} — peça só esse lado.`);
    }
    const comp = lote.comprovante;
    if (comp?.presente === true) {
      // presente = aceito (qualidade é do analista); só o MÊS claramente antigo pede um mais recente
      const temMes = Number(comp.mes_referencia) >= 1 && Number(comp.mes_referencia) <= 12 && Number(comp.ano) > 2000;
      const mesOk = temMes ? meses.some((m) => Number(comp.mes_referencia) === m.mes && Number(comp.ano) === m.ano) : true; // mês ilegível: aceita
      if (!mesOk) {
        const n = marcaTentativa('comprovante_fora_janela');
        if (n >= 3 && !aguardando) return await chamarHumanoColeta(ctx, 'comprovante_fora_janela', dadosPatch, docsPatch, tent);
        notas.push(`→ o comprovante é válido mas de outra data — só vale conta de ${meses[0].rotulo} ou ${meses[1].rotulo}. Peça uma mais recente.`);
      } else {
        docsPatch.comprovante = { tipo_conta: comp.tipo_conta, mes: temMes ? comp.mes_referencia : null, ano: temMes ? comp.ano : null, validado_em: new Date().toISOString() };
        retomar = true;
        notas.push(`→ comprovante de residência (${String(comp.tipo_conta ?? 'conta')}${temMes ? `, ${comp.mes_referencia}/${comp.ano}` : ', mês não deu para ler — aceito assim mesmo'}) confirmado ✓ registrado.`);
      }
    }
    if (Number(lote.outros ?? 0) > 0) notas.push(`→ ${lote.outros} arquivo(s) não parecem ser identidade nem comprovante — pergunte com jeitinho o que era e reforce o que precisa agora.`);
  }
  if (emailNovo) notas.push(`→ e-mail recebido no texto: ${emailNovo} ✓ (confirme com a pessoa).`);

  // ---- monta o contexto do checklist e conversa ----
  const docsMerged = { ...ctx.docs, ...docsPatch };
  const cl = checklistDe(docsMerged, { ...ctx.dados, ...dadosPatch }, emailNovo);
  const r = await conversar(ctx, {
    etapa: 'coleta_docs',
    vars: {
      CHECKLIST: checklistTexto(cl, docsMerged, mesesTxt),
      RESULTADO_ARQUIVOS: notas.length ? `O QUE ACONTECEU NESTE TURNO (traduza para conversa natural — não copie literalmente):\n${notas.join('\n')}` : '',
      MESES_ACEITOS: mesesTxt,
    },
  });

  // e-mail vindo do modelo (áudio soletrado): valida formato antes de aceitar
  const emailModelo = String(r.dados.email ?? '').trim().toLowerCase();
  const emailFinal = emailNovo ?? (emailValido(emailModelo) ? emailModelo : null);
  if (emailFinal && emailFinal !== ctx.dados.email) {
    dadosPatch.email = emailFinal;
    try { await ctx.admin.from('contatos').update({ email: emailFinal }).eq('id', ctx.sessao.contato_id); } catch { /* best-effort */ }
  }

  // cliente disse que NÃO TEM comprovante: fica registrado pro ANALISTA e o atendimento SEGUE
  if (r.dados.sem_comprovante === true && !(ctx.docs.comprovante ?? docsPatch.comprovante)) {
    docsPatch.comprovante = { pendente_analista: true, motivo: 'cliente_sem_comprovante', em: new Date().toISOString() };
    await evento(ctx.admin, ctx.sessao, 'comprovante_pendente_analista', {});
  }

  const clFinal = checklistDe({ ...ctx.docs, ...docsPatch }, { ...ctx.dados, ...dadosPatch }, emailFinal);
  dadosPatch.tentativas_item = tent;

  // checklist FECHOU: a pergunta do gov.br sai NESTE turno, determinística (2ª chamada) —
  // e agora com verificação de CONTEÚDO: no teste de 25/08 o modelo ignorou a instrução e
  // devolveu "E-mail salvo!" no lugar da pergunta; chamada garantida ≠ pergunta garantida.
  let bolhas = r.mensagens;
  let perguntaOk = false;
  if (clFinal.completo) {
    const pergunta = await aberturaTriagemVerificada(ctx);
    if (pergunta) {
      // a PERGUNTA entra garantida (por último): o agradecimento cede espaço se precisar
      bolhas = [...bolhas.slice(0, 2), pergunta].filter(Boolean);
      perguntaOk = true;
    }
  }
  if (clFinal.completo) dadosPatch.transicao_pendente = perguntaOk ? null : true;
  return {
    bolhas,
    // sem pergunta verificada NÃO transiciona mudo: fica em coleta e tenta de novo em ~60s
    etapaNova: clFinal.completo && perguntaOk ? 'triagem_govbr' : (ctx.sessao.etapa !== 'coleta_docs' ? 'coleta_docs' : undefined),
    reagendarMs: extraTurno.reagendarMs ?? (clFinal.completo && !perguntaOk ? 60_000 : undefined),
    naoAvancarAlem: extraTurno.naoAvancarAlem,
    resetErros: true,
    retomar,
    dadosPatch, docsPatch,
    __perguntouValores: r.perguntouValores,
  };
}

/** Gera a pergunta de abertura do gov.br e VERIFICA que ela é mesmo a pergunta (2 tentativas). */
async function aberturaTriagemVerificada(ctx: Ctx): Promise<string | null> {
  const valida = (s: string) => /gov\.?\s?br|meu\s?inss/i.test(s) && /\?/.test(s);
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const abertura = await conversar(ctx, {
      etapa: 'triagem_govbr',
      instrucaoExtra: tentativa === 1
        ? 'O checklist da documentação acabou de fechar. Este turno é a ABERTURA da etapa: sua resposta deve ser APENAS a pergunta do gov.br, em 1 bolha curta — pergunte se a pessoa TEM a senha do gov.br e costuma usar o aplicativo Meu INSS. Nada de confirmar e-mail ou documento aqui.'
        : 'ATENÇÃO: responda SOMENTE com a pergunta, em uma única bolha, citando "gov.br" e "Meu INSS": pergunte se a pessoa tem a senha do gov.br e usa o aplicativo Meu INSS. Nenhum outro conteúdo.',
    });
    const candidata = abertura.mensagens.find(valida) ?? null;
    if (candidata) return candidata;
    await evento(ctx.admin, ctx.sessao, 'abertura_triagem_invalida', { tentativa, veio: abertura.mensagens[0]?.slice(0, 100) });
  }
  return null;
}

/** Chama um colega (handoff SUAVE) reconhecendo o que já deu certo — a IA segue atendendo. */
async function chamarHumanoColeta(ctx: Ctx, motivo: string, dadosPatch: Record<string, unknown>, docsPatch: Record<string, unknown>, tent: Record<string, number>): Promise<Turno> {
  const bolhas = await gerarDespedida(ctx,
    motivo === 'comprovante_fora_janela'
      ? 'O comprovante segue fora do período aceito. Com carinho: avise que chamou um colega para ajudar a resolver essa parte, e que você continua aqui enquanto ele não chega.'
      : 'As fotos de um documento não estão saindo legíveis mesmo depois de algumas tentativas. Sem culpar ninguém: reconheça o esforço (e o que JÁ deu certo, se houver), avise que você chamou um colega do time para ajudar com essa parte, e diga que enquanto isso você segue aqui — se a pessoa quiser tentar mais uma foto, você confere na hora.');
  return { bolhas, chamarHumano: motivo, dadosPatch: { ...dadosPatch, tentativas_item: tent }, docsPatch };
}

// ---- extração em LOTE da coleta: todas as imagens do turno numa chamada só ----
interface LoteColeta {
  identidades: Array<Record<string, unknown>>;
  comprovante: Record<string, unknown> | null;
  outros: number;
  grandes: boolean;
  excedeu?: boolean;
  corte?: string;
}
async function extrairLoteColeta(ctx: Ctx): Promise<LoteColeta> {
  const partes: ParteGemini[] = [];
  let grandes = false;
  let bytesInline = 0;
  let anexadas = 0;
  const excedeu6 = ctx.arquivos.length > 6;
  for (const m of ctx.arquivos.slice(0, 6)) {
    const meta = (m.metadados ?? {}) as Record<string, unknown>;
    const tamanho = Number(meta.tamanho ?? 0) || 0;
    if (tamanho > MAX_ARQUIVO) { grandes = true; await evento(ctx.admin, ctx.sessao, 'midia_grande', { tamanho, anexo: meta.anexo_path }); continue; }
    const arq = await baixarAnexo(ctx.admin, String(meta.anexo_path), String(meta.mime ?? 'application/octet-stream'));
    if ('erro' in arq) {
      if (arq.erro === 'grande') { grandes = true; await evento(ctx.admin, ctx.sessao, 'midia_grande', { tamanho, anexo: meta.anexo_path }); continue; }
      await evento(ctx.admin, ctx.sessao, 'storage_falhou', { anexo: meta.anexo_path });
      throw new FalhaTecnica(`storage_download:${String(meta.anexo_path ?? '').slice(0, 80)}`);
    }
    const bytes = Math.ceil(arq.b64.length * 3 / 4);
    if (bytesInline + bytes > 10 * 1024 * 1024) { grandes = true; continue; }
    bytesInline += bytes;
    anexadas++;
    partes.push({ inline_data: { mime_type: arq.mime, data: arq.b64 } });
  }
  if (!partes.length) return { identidades: [], comprovante: null, outros: 0, grandes, excedeu: excedeu6, corte: ctx.arquivos[5]?.criado_em };
  partes.push({ text: `São ${anexadas} imagem(ns) do mesmo cliente, enviadas juntas. Extraia no JSON pedido.` });
  const j = await geminiSessao(ctx, 'extracao_lote', {
    system: PROMPT_LOTE_COLETA, partes, schema: SCHEMA_LOTE_COLETA, temperatura: 0, maxTokens: 4096, semPensar: true,
  });
  const identidades = Array.isArray((j as { identidades?: unknown }).identidades) ? (j as { identidades: Array<Record<string, unknown>> }).identidades : [];
  const comprovante = ((j as { comprovante?: unknown }).comprovante && typeof (j as { comprovante?: unknown }).comprovante === 'object')
    ? (j as { comprovante: Record<string, unknown> }).comprovante : null;
  const outros = Number((j as { outros_arquivos?: unknown }).outros_arquivos ?? 0) || 0;
  // observabilidade SEM PII: só flags — foi exatamente a falta disso que escondeu o bug do 1º teste
  await evento(ctx.admin, ctx.sessao, 'extracao_resultado', {
    imagens: anexadas,
    identidades: identidades.map((i) => ({ tipo: i.tipo_documento, ok: i.dados_completos === true, frente: i.frente_presente === true, verso: i.verso_presente === true, problema: i.problema ?? null })),
    comprovante: comprovante ? { presente: comprovante.presente === true, ok: comprovante.dados_completos === true, problema: comprovante.problema ?? null } : null,
    outros,
  });
  return { identidades, comprovante, outros, grandes, excedeu: excedeu6, corte: ctx.arquivos[5]?.criado_em };
}

async function etapaTriagem(ctx: Ctx): Promise<Turno> {
  const r = await conversar(ctx, {});
  const tem = String(r.dados.tem_govbr ?? 'incerto');
  const retomar = tem === 'sim' && ctx.dados.aguardando_humano === 'sem_acesso_govbr';
  if (tem === 'sim') {
    // turno de instruções do Meu INSS (gerado pelo modelo; vídeo entra se configurado)
    const videoPath = String((ctx.iaConfig as { video_meuinss_path?: string }).video_meuinss_path ?? '').trim();
    const temVideo = !!videoPath;
    const inst = await conversar(ctx, {
      etapa: 'video_meuinss',
      vars: {
        TEM_VIDEO: temVideo
          ? '- Um VÍDEO com o passo a passo vai junto da sua resposta: a sua PRIMEIRA bolha vira a legenda dele (curta); use as outras para listar os dois documentos.'
          : '- NÃO há vídeo: o passo a passo vai em texto — no máximo 2 bolhas para ele, mais 1 para os documentos.',
      },
    });
    if (temVideo) {
      const url = /^https?:\/\//i.test(videoPath) ? videoPath
        : `${SUPABASE_URL}/storage/v1/object/public/bot-midia/${videoPath.replace(/^\/+/, '')}`;
      return {
        bolhas: inst.mensagens.slice(1), video: { url, caption: inst.mensagens[0] ?? '' },
        etapaNova: 'extratos', resetErros: true, retomar, __perguntouValores: r.perguntouValores || inst.perguntouValores,
      };
    }
    return { bolhas: inst.mensagens, etapaNova: 'extratos', resetErros: true, retomar, __perguntouValores: r.perguntouValores || inst.perguntouValores };
  }
  if (tem === 'nao' || tem === 'nao_sabe') {
    // suave: chama o colega (que vai baixar os docs junto) mas a IA segue atendendo; se a pessoa
    // aparecer depois com a senha ("achei!"), o tem_govbr='sim' acima RETOMA sozinho
    return { bolhas: r.mensagens, chamarHumano: 'sem_acesso_govbr', __perguntouValores: r.perguntouValores };
  }
  return { bolhas: r.mensagens, incrementaErro: true, __perguntouValores: r.perguntouValores };
}

async function etapaExtratos(ctx: Ctx): Promise<Turno> {
  const cob = ctx.cobertura;
  const janelasRaw: Janela[] = Array.isArray(cob.janelas) ? (cob.janelas as Janela[]) : [];
  const bancosAlvo = new Set<string>(Array.isArray(cob.bancos_alvo) ? (cob.bancos_alvo as string[]) : []);
  let rubrica217 = cob.rubrica_217 === true;
  let cpfExtratos = (cob.cpf as string) ?? '';
  let consignado = (ctx.docs.consignado as Record<string, unknown> | undefined) ?? undefined;
  const alvoFim = ultimoMesFechadoIdx();
  const antes = calcularCobertura(janelasRaw, alvoFim);
  let progresso = false;
  const notas: string[] = [];

  // retomada pós-falha: análise já feita, só faltou a mensagem final
  if (ctx.dados.analise_concluida === true && consignado) {
    return await concluirSessao(ctx, montarCoberturaJson(calcularCobertura(janelasRaw, alvoFim), bancosAlvo, rubrica217, cpfExtratos), consignado);
  }

  if (ctx.pendentes) notas.push('→ um arquivo NÃO chegou direito no sistema; peça para reenviar.');
  if (ctx.arquivos.length) {
    const exts = await extrairDeArquivos(ctx, PROMPT_EXTRATO, SCHEMA_EXTRATO);
    if (exts.grandes) notas.push('→ um arquivo veio pesado demais; peça para baixar de novo no app e mandar o arquivo direto.');
    for (const d of exts.itens) {
      const cpfArq = somenteDigitos(String(d.cpf ?? ''));
      if (cpfArq.length === 11) {
        if ((cpfExtratos && cpfArq !== cpfExtratos) || !cpfsCompativeis(cpfArq, ctx.contatoCpf)) {
          const bolhas = await gerarDespedida(ctx,
            'Você notou uma diferença de dados entre os documentos e, para não ter erro, vai pedir a ajuda de um colega do time, que continua com a pessoa aqui na conversa. Não a constranja.');
          return {
            bolhas, chamarHumano: 'cpf_divergente',
            notaInterna: notaContexto(ctx, `cpf_divergente: extrato ${mascararCpf(cpfArq)} x cadastro ${mascararCpf(ctx.contatoCpf)}`),
          };
        }
        cpfExtratos = cpfExtratos || cpfArq;
      }
      if (d.tipo === 'historico_emprestimo_consignado') {
        if (!consignado) progresso = true;   // REENVIO do mesmo doc não conta como progresso
        consignado = { anexo_path: d.__anexo, mime: d.__mime, nbs: d.nbs ?? [], recebido_em: new Date().toISOString() };
        notas.push('→ chegou o Histórico de Empréstimo Consignado ✓.');
      } else if (d.tipo === 'historico_creditos') {
        const ini = competParaIdx(String(d.compet_inicial ?? ''));
        const fim = competParaIdx(String(d.compet_final ?? ''));
        // progresso de créditos = COBERTURA cresceu (medido depois do loop) — arquivo repetido
        // de janela já coberta não desarma o caminho do auxílio humano
        if (ini != null && fim != null) { janelasRaw.push({ ini, fim }); notas.push('→ chegou um Histórico de Créditos ✓ (período registrado).'); }
        else notas.push('→ chegou um Histórico de Créditos mas não deu para ler o período; peça para baixar e mandar de novo.');
        for (const b of (d.bancos_pagadores ?? []) as string[]) {
          const alvo = bancoAlvoDe(b);
          if (alvo) bancosAlvo.add(alvo);
        }
        if (d.tem_rubrica_217 === true) rubrica217 = true;
      } else {
        notas.push('→ chegou um arquivo que não parece ser dos documentos do Meu INSS; explique com jeitinho qual documento precisa.');
      }
    }
  }

  const depois = calcularCobertura(janelasRaw, alvoFim);
  if (depois.mesesCobertos > antes.mesesCobertos) progresso = true;
  const coberturaNova = montarCoberturaJson(depois, bancosAlvo, rubrica217, cpfExtratos);

  if (depois.completo && consignado?.anexo_path) {
    return await concluirSessao(ctx, coberturaNova, consignado);
  }

  // ---- rodadas sem progresso: caminho ESPERADO da maioria é o humano ajudar ----
  const rodadas = progresso ? 0 : (ctx.arquivos.length ? (Number(ctx.dados.rodadas_sem_progresso ?? 0) || 0) + 1 : (Number(ctx.dados.rodadas_sem_progresso ?? 0) || 0));
  if (rodadas >= 2) {
    const bolhas = await gerarDespedida(ctx,
      'A pessoa está tentando mas os arquivos não estão vindo certos — essa parte do aplicativo dá trabalho mesmo. Acolha (sem culpar ninguém) e diga que um colega do time vai ajudar pessoalmente com esses documentos, aqui na conversa. É o caminho normal.');
    return { bolhas, chamarHumano: 'auxilio_extratos', coberturaNova, dadosPatch: { rodadas_sem_progresso: rodadas } };
  }

  const falta = montarFaltaTexto(depois, !!consignado);
  const r = await conversar(ctx, {
    etapa: 'extratos',
    vars: {
      FALTA: falta.frase,
      RESULTADO_ARQUIVOS: notas.length ? `O QUE ACONTECEU NESTE TURNO (traduza para conversa natural):\n${notas.join('\n')}` : '',
    },
  });
  if (r.dados.ofereceu_senha === true) {
    // nota SEM as mensagens do cliente (a senha não pode parar nem na nota interna)
    return {
      bolhas: r.mensagens, chamarHumano: 'auxilio_senha', coberturaNova,
      dadosPatch: { rodadas_sem_progresso: rodadas },
      notaInterna: `🤖 IA SDR — o cliente quis compartilhar a senha do gov.br (NÃO registramos a senha). Analista: auxiliar com o acesso e baixar os extratos junto com ele. Etapa: extratos.`,
    };
  }
  if (r.dados.prefere_analista === true || r.dados.cliente_com_dificuldade === true || r.acao === 'handoff') {
    return { bolhas: r.mensagens, chamarHumano: 'auxilio_extratos', coberturaNova, dadosPatch: { rodadas_sem_progresso: rodadas } };
  }
  // precisão obrigatória: os períodos citados têm que ser EXATAMENTE os calculados
  let bolhas = r.mensagens;
  if (falta.rotulos.length && ctx.arquivos.length) {
    const contem = (msgs: string[]) => falta.rotulos.every((rot) => msgs.join(' ').toLowerCase().includes(rot));
    if (!contem(bolhas)) {
      const r2 = await reescrever(ctx, bolhas,
        `A resposta PRECISA citar exatamente o que falta, com estes períodos literais: "${falta.frase}". Reescreva incluindo isso, no seu tom natural.`);
      if (r2 && contem(r2)) bolhas = r2;
      else await evento(ctx.admin, ctx.sessao, 'falta_impreciso', { esperado: falta.frase });
    }
  }
  return { bolhas, coberturaNova, resetErros: progresso, retomar: progresso, dadosPatch: { rodadas_sem_progresso: rodadas }, docsPatch: consignado ? { consignado } : undefined, __perguntouValores: r.perguntouValores };
}

function montarCoberturaJson(c: ReturnType<typeof calcularCobertura>, bancosAlvo: Set<string>, rubrica217: boolean, cpf: string): Record<string, unknown> {
  return {
    alvo_ini: c.alvoIni, alvo_fim: c.alvoFim, janelas: c.janelas, faltando: c.faltando,
    meses_cobertos: c.mesesCobertos, completo: c.completo,
    bancos_alvo: [...bancosAlvo], rubrica_217: rubrica217, cpf: cpf || undefined,
    atualizado_em: new Date().toISOString(),
  };
}

function montarFaltaTexto(cob: ReturnType<typeof calcularCobertura>, temConsignado: boolean): { frase: string; rotulos: string[] } {
  const partes: string[] = [];
  const rotulos: string[] = [];
  if (!temConsignado) partes.push('falta o Histórico de Empréstimo Consignado (o arquivo único)');
  if (!cob.completo) {
    if (cob.mesesCobertos === 0) partes.push('faltam os Históricos de Créditos (ano a ano, do mais recente para trás)');
    else {
      const faltas = formatarFaltas(cob.faltando);
      partes.push(`dos Históricos de Créditos falta exatamente o período de ${faltas}`);
      // só os 3 primeiros rótulos entram na verificação de precisão (frase longa não precisa inteira)
      for (const j of cob.faltando.slice(0, 3)) {
        rotulos.push(...formatarFaltas([j]).toLowerCase().split(' a '));
      }
    }
  }
  if (!partes.length) return { frase: 'não falta nada — checklist completo', rotulos: [] };
  return { frase: partes.join('; e '), rotulos: rotulos.slice(0, 3) };
}

// ======== análise final (interna — nada disso vai ao cliente) ========
async function concluirSessao(ctx: Ctx, coberturaNova: Record<string, unknown>, consignado: Record<string, unknown>): Promise<Turno> {
  if (ctx.dados.analise_concluida !== true) {
    const arq = await baixarAnexo(ctx.admin, String(consignado.anexo_path), String(consignado.mime ?? 'application/pdf'));
    if ('erro' in arq && arq.erro === 'download') throw new FalhaTecnica('storage_consignado');
    let analise: Record<string, unknown> = {};
    if (!('erro' in arq)) {
      analise = await geminiSessao(ctx, 'analise_consignado', {
        system: PROMPT_ANALISE_CONSIGNADO,
        partes: [{ inline_data: { mime_type: arq.mime, data: arq.b64 } }, { text: 'Extraia os dados no JSON pedido.' }],
        schema: SCHEMA_ANALISE_CONSIGNADO, temperatura: 0, maxTokens: 8192, semPensar: true,
      }, 'docs');
    }
    const cartoes = Array.isArray(analise.cartoes) ? (analise.cartoes as Array<Record<string, unknown>>) : [];
    const bancosAlvo = (coberturaNova.bancos_alvo as string[]) ?? [];
    const rubrica217 = coberturaNova.rubrica_217 === true;
    // rubrica 217 ("EMPRESTIMO SOBRE A RMC") é rastro direto de RMC — conta pro flag
    const potencial = cartoes.length > 0 || rubrica217 || bancosAlvo.length > 0;

    const analiseCompleta = {
      ...analise,
      bancos_alvo: bancosAlvo, rubrica_217: rubrica217,
      cobertura: { meses: coberturaNova.meses_cobertos, alvo_ini: coberturaNova.alvo_ini, alvo_fim: coberturaNova.alvo_fim },
      nbs_consignado: consignado.nbs ?? [],
      gerado_em: new Date().toISOString(), modelo: ctx.modelos.docs,
    };

    let oppId = ctx.sessao.oportunidade_id;
    if (!oppId) {
      const { data: o } = await ctx.admin.from('oportunidades').select('id')
        .eq('organizacao_id', ctx.sessao.organizacao_id).eq('contato_id', ctx.sessao.contato_id).eq('status', 'em_andamento')
        .order('criado_em', { ascending: false }).limit(1).maybeSingle();
      oppId = o?.id ?? null;
    }
    if (oppId) {
      const { data: opp } = await ctx.admin.from('oportunidades').select('metadados').eq('id', oppId).maybeSingle();
      await ctx.admin.from('oportunidades').update({
        metadados: { ...((opp?.metadados as Record<string, unknown>) ?? {}), analise_extratos: analiseCompleta, potencial_tese_juros: potencial },
      }).eq('id', oppId);
    }
    await criarNotaInterna(ctx.admin, ctx.sessao, notaAnalise(ctx, analiseCompleta, potencial));
    await evento(ctx.admin, ctx.sessao, 'analise_final', { oportunidade_id: oppId, potencial_tese_juros: potencial, bancos_alvo: bancosAlvo, cartoes: cartoes.length });
    // marca ANTES da mensagem final: se a geração falhar, a retomada pula direto pra conclusão
    ctx.dados.analise_concluida = true;
    await ctx.admin.from('ia_sessoes').update({ dados: { ...ctx.dados }, cobertura_extratos: coberturaNova, docs: { ...ctx.docs, consignado } }).eq('id', ctx.sessao.id);
  }

  const r = await conversar(ctx, { etapa: 'conclusao' });
  return {
    // conclusão SUAVE: especialista alertado, mas a IA segue na conversa (etapa 'conclusao')
    // respondendo com simpatia até o humano assumir — aí o trigger pausa.
    bolhas: r.mensagens, etapaNova: 'conclusao', chamarHumano: 'docs_completos_fechar',
    coberturaNova, docsPatch: { consignado },
  };
}

function notaAnalise(ctx: Ctx, a: Record<string, unknown>, potencial: boolean): string {
  const linhas: string[] = ['🤖 IA SDR — documentação completa, resumo da análise dos extratos:'];
  const margens = Array.isArray(a.margens) ? (a.margens as Array<Record<string, unknown>>) : [];
  for (const m of margens) {
    linhas.push(`• Margem ${String(m.modalidade).toUpperCase()}: disponível ${fmtNum(m.disponivel)} | utilizada ${fmtNum(m.utilizada)} | reservada ${fmtNum(m.reservada)}${m.extrapolada ? ` | extrapolada ${fmtNum(m.extrapolada)}` : ''}`);
  }
  const bens = Array.isArray(a.beneficios) ? (a.beneficios as Array<Record<string, unknown>>) : [];
  for (const b of bens) linhas.push(`• NB ${b.nb ?? '?'}: ${b.situacao ?? 's/ situação'}${b.bloqueado ? ' (BLOQUEADO p/ empréstimo)' : (b.elegivel_emprestimo === false ? ' (não elegível)' : '')}`);
  const cts = Array.isArray(a.contratos_ativos) ? (a.contratos_ativos as Array<Record<string, unknown>>) : [];
  if (cts.length) {
    linhas.push(`• Contratos ativos (${cts.length}):`);
    for (const c of cts.slice(0, 12)) linhas.push(`   – ${c.banco ?? '?'} ${c.contrato ? `(${c.contrato})` : ''}: parcela ${fmtNum(c.parcela)}, emprestado ${fmtNum(c.valor_emprestado)}, taxa ${c.taxa_mensal ?? '?'}% a.m.`);
  }
  const cards = Array.isArray(a.cartoes) ? (a.cartoes as Array<Record<string, unknown>>) : [];
  for (const c of cards) linhas.push(`• Cartão ${String(c.tipo).toUpperCase()} ${c.banco ?? '?'}: limite ${fmtNum(c.limite)}, reservado ${fmtNum(c.reservado)}`);
  const bancos = Array.isArray(a.bancos_alvo) ? (a.bancos_alvo as string[]) : [];
  linhas.push(`• Bancos-alvo no histórico de créditos: ${bancos.length ? bancos.join(', ').toUpperCase() : 'nenhum'}${a.rubrica_217 ? ' | rubrica 217 (EMPRÉSTIMO SOBRE A RMC) presente' : ''}`);
  linhas.push(`• Cobertura: ${(a.cobertura as Record<string, unknown>)?.meses ?? '?'} de 120 meses`);
  linhas.push(`➡️ potencial_tese_juros: ${potencial ? 'SIM' : 'não'}`);
  if (ctx.dados.declarante) linhas.push(`• Declarante: ${(ctx.dados.declarante as Record<string, unknown>)?.nome ?? '?'}`);
  if (ctx.dados.email) linhas.push(`• E-mail do cliente: ${ctx.dados.email}`);
  if ((ctx.docs.comprovante as Record<string, unknown> | undefined)?.pendente_analista === true) linhas.push('• ⚠️ Comprovante de residência: o cliente NÃO tinha — resolver com ele.');
  return linhas.join('\n');
}
function fmtNum(v: unknown): string { return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '?'; }

// ======== conversa (persona + objetivo da etapa + contexto completo) ========
interface RespostaChat { mensagens: string[]; acao: string; dados: Record<string, unknown>; perguntouValores: boolean }

async function conversar(ctx: Ctx, opts: { etapa?: string; instrucaoExtra?: string; vars?: Record<string, string> }): Promise<RespostaChat> {
  const etapa = opts.etapa ?? (ctx.sessao.etapa in INSTRUCAO_ETAPA ? ctx.sessao.etapa : 'coleta_docs');
  let instrucao = INSTRUCAO_ETAPA[etapa] ?? '';
  const meses = mesesComprovante();
  const defaults: Record<string, string> = {
    MESES_ACEITOS: `do mês atual ou do passado (${meses[0].rotulo} ou ${meses[1].rotulo})`,
    TITULAR: String(ctx.dados.titular_comprovante ?? 'a pessoa da conta'),
    CHECKLIST: '', RESULTADO_ARQUIVOS: '', FALTA: '', TEM_VIDEO: '',
  };
  for (const [k, v] of Object.entries({ ...defaults, ...(opts.vars ?? {}) })) {
    instrucao = instrucao.replaceAll(`{${k}}`, v);
  }
  const acomp = ctx.dados.aguardando_humano ? `\n\n${notaAcompanhamento(String(ctx.dados.aguardando_humano))}` : '';
  const system = `${PERSONA}\n\n${instrucao}${acomp}${opts.instrucaoExtra ? `\n\nNOTA DESTE TURNO: ${opts.instrucaoExtra}` : ''}`;

  // áudios ANTES do contexto (com teto agregado): o texto do contexto precisa dizer a VERDADE
  // sobre o que está anexado — dizer "ouça o áudio" com o anexo ausente faz o modelo alucinar.
  const audioPartes: ParteGemini[] = [];
  const carregados = new Set<string>();
  const falhados = new Set<string>();
  let bytesInline = 0;
  for (const a of ctx.audios) {
    if (audioPartes.length >= 3) { falhados.add(a.id); continue; }
    const meta = (a.metadados ?? {}) as Record<string, unknown>;
    const arq = await baixarAnexo(ctx.admin, String(meta.anexo_path), String(meta.mime ?? 'audio/ogg'));
    if ('erro' in arq) { falhados.add(a.id); await evento(ctx.admin, ctx.sessao, 'audio_nao_carregou', { anexo: meta.anexo_path, motivo: arq.erro }); continue; }
    const bytes = Math.ceil(arq.b64.length * 3 / 4);
    if (bytesInline + bytes > 10 * 1024 * 1024) { falhados.add(a.id); continue; }   // teto do REQUEST do Gemini
    bytesInline += bytes;
    carregados.add(a.id);
    audioPartes.push({ inline_data: { mime_type: arq.mime, data: arq.b64 } });
  }
  const partes: ParteGemini[] = [{ text: montarContexto(ctx, { carregados, falhados }) }, ...audioPartes];
  partes.push({ text: 'Responda no JSON pedido (bolhas curtas e humanas; uma pergunta por vez; nunca repita frase já usada na conversa).' });

  // ROTEADOR: turno complexo (objeção, dúvida, áudio, cliente confuso) sobe pro modelo forte
  const tier = pareceComplexo(ctx) ? 'pro' : 'chat';
  const j = await geminiSessao(ctx, `chat_${etapa}`, {
    system, partes, schema: esquemaChat(EXTRAS_ETAPA[etapa] ?? {}), temperatura: 0.7, maxTokens: 3072,
  }, tier);
  const jj = j as { mensagens?: unknown; acao?: unknown; dados_extraidos?: unknown; perguntou_valores?: unknown };
  const mensagens = (Array.isArray(jj.mensagens) ? jj.mensagens : []).map((m) => String(m).trim()).filter(Boolean).slice(0, 3);
  if (!mensagens.length) throw new FalhaTecnica('resposta_vazia');
  return {
    mensagens,
    acao: String(jj.acao ?? 'perguntar'),
    dados: (jj.dados_extraidos && typeof jj.dados_extraidos === 'object') ? jj.dados_extraidos as Record<string, unknown> : {},
    perguntouValores: jj.perguntou_valores === true,
  };
}

/** Despedida de handoff GERADA (contextual). Modelo fora do ar → a única estática permitida. */
async function gerarDespedida(ctx: Ctx, direcao: string): Promise<string[]> {
  try {
    const j = await geminiSessao(ctx, 'despedida', {
      system: `${PERSONA}\n\nOBJETIVO DESTE TURNO: encerrar a SUA parte da conversa. ${direcao} No máximo 2 bolhas curtas e calorosas.`,
      partes: [{ text: montarContexto(ctx) }, { text: 'Responda no JSON pedido.' }],
      schema: esquemaChat({}), temperatura: 0.7, maxTokens: 1536,
    });
    const msgs = (Array.isArray((j as { mensagens?: unknown }).mensagens) ? (j as { mensagens: unknown[] }).mensagens : [])
      .map((m) => String(m).trim()).filter(Boolean).slice(0, 2);
    if (msgs.length) return msgs;
  } catch { /* cai na única mensagem estática permitida */ }
  return [MSG_HANDOFF_FINAL];
}

/** Reescrita (guardrail/dedup). Falhou tecnicamente → null (o chamador descarta as bolhas). */
async function reescrever(ctx: Ctx, bolhas: string[], motivo: string): Promise<string[] | null> {
  try {
    const j = await geminiSessao(ctx, 'reescrita', {
      system: `${PERSONA}\n\nTAREFA: reescrever as mensagens abaixo mantendo o sentido e o tom. ${motivo}`,
      partes: [{ text: `MENSAGENS A REESCREVER:\n${bolhas.map((b, i) => `${i + 1}. ${b}`).join('\n')}\n\nFRASES QUE VOCÊ JÁ USOU NESTA CONVERSA (não repita nenhuma):\n${[...ctx.saidasAnteriores].slice(0, 40).map((s) => `- ${s}`).join('\n')}` }],
      schema: SCHEMA_REESCRITA, temperatura: 0.8, maxTokens: 2048,
    });
    const msgs = (Array.isArray((j as { mensagens?: unknown }).mensagens) ? (j as { mensagens: unknown[] }).mensagens : [])
      .map((m) => String(m).trim()).filter(Boolean).slice(0, 3);
    return msgs.length ? msgs : null;
  } catch { return null; }
}

function normalizarSaida(s: string): string { return (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase(); }
// achata quebras de linha do texto do cliente: sem isso, uma mensagem multilinha poderia forjar
// uma linha "[atendente humano] ..." no transcript e enganar o modelo (injection de papéis)
function limparLinha(s: string): string { return (s ?? '').replace(/[\r\n]+/g, ' ⏎ ').replace(/\[(cliente|você|voce|atendente[^\]]*)\]/gi, '($1)'); }

/** Dedup duro: colidiu com saída já existente (ou com bolha deste mesmo turno) → reescreve 1x → persistiu → descarta. */
async function deduplicar(ctx: Ctx, bolhas: string[]): Promise<string[]> {
  const vistas = new Set<string>();
  const colide = (b: string) => ctx.saidasAnteriores.has(normalizarSaida(b)) || vistas.has(normalizarSaida(b));
  let houveColisao = false;
  for (const b of bolhas) { if (colide(b)) { houveColisao = true; } vistas.add(normalizarSaida(b)); }
  if (!houveColisao) return bolhas;
  const reescritas = await reescrever(ctx, bolhas, 'Uma ou mais dessas mensagens são IDÊNTICAS a algo que você já mandou nesta conversa. Reformule com outras palavras — nunca repita frase já usada.');
  const finais: string[] = [];
  const vistas2 = new Set<string>();
  for (const b of (reescritas ?? bolhas)) {
    const n = normalizarSaida(b);
    if (ctx.saidasAnteriores.has(n) || vistas2.has(n)) { await evento(ctx.admin, ctx.sessao, 'dedup_descartou', { texto: b.slice(0, 120) }); continue; }
    vistas2.add(n); finais.push(b);
  }
  return finais;
}

// Turno COMPLEXO merece o modelo forte: objeção/desconfiança, pergunta, mensagem longa, áudio
// (nuance de fala) ou cliente que já tropeçou. Abertura e respostas curtas ("sim") vão no flash.
function pareceComplexo(ctx: Ctx): boolean {
  if (ctx.audios.length) return true;
  const t = ctx.textos.join(' ').toLowerCase();
  if (/golpe|n[ãa]o confio|desconfi|fraude|medo|receio|\bcaro\b|por ?qu[êe]|como assim|processo|reclama|den[úu]nci|cancelar|n[ãa]o quero|garant|verdade|engan|mentira|confi[áa]vel|advogad|meu filho|minha filha|marido|esposa|quanto|valor|receber|\bjuros\b|\btaxa\b|d[úu]vida|n[ãa]o entend|explica/i.test(t)) return true;
  if (t.includes('?')) return true;
  if (t.length > 140) return true;
  if ((Number(ctx.sessao.tentativas_erro) || 0) >= 1) return true;
  return false;
}

function montarContexto(ctx: Ctx, audios?: { carregados: Set<string>; falhados: Set<string> }): string {
  const linhas: string[] = [];
  // TRATAMENTO consistente (bug da Roseli: "dona Roseli" + "o senhor" na mesma conversa). Gênero
  // inferido do nome trava o pronome — o modelo NÃO pode alternar.
  const nomeGen = String(ctx.dados.nome_confirmado ?? '') || ctx.contatoNome || '';
  const gen = inferirGenero(nomeGen);
  const trat = gen === 'mulher' ? 'a pessoa é MULHER — trate SEMPRE por "a senhora" (nunca "o senhor")'
    : gen === 'homem' ? 'a pessoa é HOMEM — trate SEMPRE por "o senhor" (nunca "a senhora")'
    : 'gênero incerto pelo nome — escolha "o senhor" OU "a senhora" e NUNCA alterne durante a conversa';
  linhas.push(`TRATAMENTO: ${trat}.`);
  linhas.push('');
  linhas.push('DADOS JÁ COLETADOS (NUNCA peça de novo o que está aqui):');
  linhas.push(`- Nome: ${nomeGen || '(desconhecido)'}`);
  linhas.push(`- CPF: ${ctx.contatoCpf ? 'já informado no início ✓' : '(não veio)'}`);
  if (ctx.dados.email) linhas.push(`- E-mail: ${ctx.dados.email} ✓`);
  if (ctx.dados.titular_comprovante) linhas.push(`- Titular do comprovante: ${ctx.dados.titular_comprovante}`);
  const docsOk = ['doc_pessoal', 'comprovante', 'declarante_doc', 'consignado'].filter((k) => ctx.docs[k]);
  linhas.push(`- Documentos já validados: ${docsOk.length ? docsOk.join(', ') : 'nenhum ainda'}`);
  linhas.push('');
  linhas.push('HISTÓRICO DA CONVERSA (o que está como [você] foi VOCÊ que mandou — não repita):');
  linhas.push(ctx.transcript || '(vazio)');
  linhas.push('');
  if (ctx.novas.length) {
    linhas.push('NOVAS MENSAGENS DO CLIENTE (responda a elas):');
    for (const m of ctx.novas) {
      if (m.tipo === 'texto' && m.conteudo) linhas.push(`- "${limparLinha(m.conteudo)}"`);
      else if (m.tipo === 'audio') {
        if (audios?.carregados.has(m.id)) linhas.push('- [áudio do cliente — anexado nesta chamada; ouça e responda ao que ele disse]');
        else if (audios?.falhados.has(m.id)) linhas.push('- [áudio do cliente que NÃO carregou no sistema — diga com jeito que não conseguiu ouvir esse áudio e peça para mandar de novo ou escrever]');
        else linhas.push('- [áudio do cliente]');
      } else linhas.push(`- [cliente enviou ${m.tipo}]`);
    }
  } else {
    linhas.push('(não há mensagem nova do cliente — este turno é a SUA abertura da etapa)');
  }
  return linhas.join('\n');
}

// ======== Gemini com evento de custo/auditoria (lança FalhaTecnica; nunca conversa) ========
async function geminiSessao(ctx: Ctx, finalidade: string, p: {
  system: string; partes: ParteGemini[]; schema: Record<string, unknown>; temperatura: number; maxTokens: number; semPensar?: boolean;
}, tipo: 'chat' | 'docs' | 'pro' = 'chat'): Promise<Record<string, unknown>> {
  // turno longo não pode deixar a lease do canal expirar (o serial por chip é sagrado)
  try { await ctx.admin.rpc('ia_canal_lock', { p_canal: ctx.sessao.canal_id, p_dono: ctx.dono, p_ttl_seg: 240 }); } catch { /* melhor esforço */ }
  try {
    const { r, modeloUsado, atualizadoDe } = await chamarComRecuperacao(ctx.admin, ctx.sessao.canal_id, ctx.modelos, tipo, p);
    if (atualizadoDe) await evento(ctx.admin, ctx.sessao, 'modelo_atualizado', { de: atualizadoDe, para: modeloUsado, tipo });
    await evento(ctx.admin, ctx.sessao, 'gemini_call', { canal_id: ctx.sessao.canal_id, finalidade, modelo: modeloUsado }, r.tokensIn, r.tokensOut);
    return r.json;
  } catch (e) {
    const msg = String((e as Error)?.message ?? '');
    if (msg.includes('sem_api_key')) throw e;
    await evento(ctx.admin, ctx.sessao, 'gemini_erro', { canal_id: ctx.sessao.canal_id, finalidade, erro: msg.slice(0, 450) });
    throw new FalhaTecnica(`${finalidade}: ${msg.slice(0, 200)}`);
  }
}

// ======== extração de documentos (visão, temperatura 0) ========
interface ExtracaoDocs { itens: Array<Record<string, unknown> & { __anexo?: string; __mime?: string }>; grandes: boolean }

async function extrairDeArquivos(ctx: Ctx, prompt: string, schema: Record<string, unknown>): Promise<ExtracaoDocs> {
  const itens: ExtracaoDocs['itens'] = [];
  let grandes = false;
  for (const m of ctx.arquivos.slice(0, 8)) {
    const meta = (m.metadados ?? {}) as Record<string, unknown>;
    const tamanho = Number(meta.tamanho ?? 0) || 0;
    if (tamanho > MAX_ARQUIVO) { grandes = true; await evento(ctx.admin, ctx.sessao, 'midia_grande', { tamanho, anexo: meta.anexo_path }); continue; }
    const arq = await baixarAnexo(ctx.admin, String(meta.anexo_path), String(meta.mime ?? 'application/octet-stream'));
    if ('erro' in arq) {
      if (arq.erro === 'grande') { grandes = true; await evento(ctx.admin, ctx.sessao, 'midia_grande', { tamanho, anexo: meta.anexo_path }); continue; }
      // Storage falhou (não é culpa do cliente): NUNCA vira "foto ilegível" — é falha técnica,
      // reagenda e tenta de novo; a tentativa de ilegível do item fica intocada.
      await evento(ctx.admin, ctx.sessao, 'storage_falhou', { anexo: meta.anexo_path });
      throw new FalhaTecnica(`storage_download:${String(meta.anexo_path ?? '').slice(0, 80)}`);
    }
    const j = await geminiSessao(ctx, 'extracao_doc', {
      system: prompt,
      partes: [{ inline_data: { mime_type: arq.mime, data: arq.b64 } }, { text: 'Extraia os dados no JSON pedido.' }],
      schema, temperatura: 0, maxTokens: 4096, semPensar: true,
    });
    itens.push({ ...(j as Record<string, unknown>), __anexo: String(meta.anexo_path ?? ''), __mime: String(meta.mime ?? '') });
  }
  return { itens, grandes };
}

// 'grande' é condição PERMANENTE (pedir reenvio menor); 'download' é transitória (falha técnica).
type Anexo = { b64: string; mime: string } | { erro: 'grande' | 'download' };
async function baixarAnexo(admin: Admin, path: string, mime: string): Promise<Anexo> {
  try {
    if (!path) return { erro: 'download' };
    const { data, error } = await admin.storage.from(BUCKET_MIDIA).download(path);
    if (error || !data) return { erro: 'download' };
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (!bytes.length) return { erro: 'download' };
    if (bytes.length > MAX_ARQUIVO) return { erro: 'grande' };
    return { b64: paraBase64(bytes), mime: mime || 'application/octet-stream' };
  } catch { return { erro: 'download' }; }
}

// ======== envio: fila bot_mensagens_saida + drain em processo (presence 2–6s + jitter 1.5–3s) ========
async function enviarBolhas(admin: Admin, ctx: Ctx, bolhasRaw: string[], videoRaw: { url: string; caption: string } | null): Promise<void> {
  const sessao = ctx.sessao;
  const canal = ctx.canal;
  const tag = `ia_${sessao.etapa}_${Date.now().toString(36)}`;

  // GARANTIA premium: nenhum emoji chega ao cliente (o prompt proíbe; aqui é a trava de código)
  const bolhas = bolhasRaw.map(removerEmoji).filter(Boolean);
  const video = videoRaw ? { ...videoRaw, caption: removerEmoji(videoRaw.caption) } : null;

  // Fase 1.1: SEM delay-base — o tempo humano é o presence proporcional + jitter entre bolhas
  const presenceDur = (texto: string) => Math.min(6_000, Math.max(2_000, texto.length * 50));
  const linhas: Array<{ ordem: number; tipo: string; texto: string; media_url: string | null; media_caption: string | null; enviar_apos: string }> = [];
  let cursor = Date.now();
  let ordem = 0;
  if (video) {
    linhas.push({ ordem: ordem++, tipo: 'video', texto: video.caption || 'Segue o vídeo com o passo a passo.', media_url: video.url, media_caption: video.caption || null, enviar_apos: new Date(cursor).toISOString() });
    cursor += rand(1_500, 3_000);
  }
  for (const b of bolhas) {
    linhas.push({ ordem: ordem++, tipo: 'texto', texto: b, media_url: null, media_caption: null, enviar_apos: new Date(cursor).toISOString() });
    cursor += presenceDur(b) + rand(1_500, 3_000);
  }
  if (!linhas.length) return;

  const { data: rows, error } = await admin.from('bot_mensagens_saida').insert(linhas.map((l) => ({
    organizacao_id: sessao.organizacao_id, conversa_id: sessao.conversa_id, canal_id: sessao.canal_id,
    etapa: tag, ordem: l.ordem, texto: l.texto, tipo: l.tipo, media_url: l.media_url, media_caption: l.media_caption,
    enviar_apos: l.enviar_apos, status: 'pendente',
  }))).select('id, ordem, tipo, texto, media_url, media_caption, enviar_apos');
  if (error || !rows?.length) {
    await evento(admin, sessao, 'enfileirar_falhou', { erro: error?.message?.slice(0, 200) });
    throw new FalhaTecnica('enfileirar_falhou');   // nada saiu: o turno NÃO pode "avançar mudo"
  }

  const tx = enviadorDe(canal as { transporte?: string; instancia_externa?: string; cloud_phone_number_id?: string });
  const instancia = String(canal.instancia_externa ?? '');
  const ordenadas = [...rows].sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem);
  const enviadosWamid: string[] = [];   // p/ reconciliar a corrida com o echo fromMe do webhook
  for (const row of ordenadas) {
    // re-checa a cada bolha: humano pode ter entrado no meio do burst (o trigger pausa a sessão)
    const { data: st } = await admin.from('ia_sessoes').select('status').eq('id', sessao.id).maybeSingle();
    const statusOk = st?.status === 'ativa' || ['handoff', 'concluida', 'encerrada'].includes(st?.status ?? '');
    if (!statusOk) {
      await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'cancelada', p_erro: `sessao_${st?.status ?? 'sumiu'}` });
      continue;
    }
    await sleep(new Date(row.enviar_apos).getTime() - Date.now());
    try {
      if (row.tipo === 'texto') {
        const dur = presenceDur(row.texto);
        await sendPresenceComposing(instancia, ctx.destino, dur);
        await sleep(dur);
      }
      const sent = (row.tipo === 'video' && row.media_url)
        ? await tx.sendMedia(ctx.destino, 'video', 'video/mp4', row.media_url, 'meu-inss.mp4', row.media_caption ?? undefined)
        : await tx.sendText(ctx.destino, row.texto);
      const idExterno = sent?.key?.id ?? null;
      if (!idExterno) throw new Error('sem_id_retorno');
      const { data: msg } = await admin.from('mensagens').insert({
        organizacao_id: sessao.organizacao_id, conversa_id: sessao.conversa_id, direcao: 'saida',
        tipo: row.tipo === 'video' ? 'video' : 'texto', conteudo: row.texto,
        autor_id: null, origem: 'bot', status: 'enviada', id_externo: idExterno,
        metadados: { fluxo: 'ia_sdr', etapa: sessao.etapa, sessao_id: sessao.id, ...(row.media_url ? { media_url: row.media_url } : {}) },
      }).select('id').maybeSingle();
      await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'enviada', p_mensagem: msg?.id ?? null, p_id_externo: idExterno });
      ctx.saidasAnteriores.add(normalizarSaida(row.texto));
      enviadosWamid.push(idExterno);
    } catch (e) {
      // FALHA DE TRANSPORTE (chip caiu, Evolution fora): sequência quebrada não continua pela
      // metade — cancela o resto e vira FALHA TÉCNICA: o turno NÃO persiste (nada de etapa
      // avançando com o cliente sem receber nada); reagenda +90s e o retry REGERA a resposta
      // (o dedup impede repetição literal do que já saiu).
      const erro = String((e as Error)?.message ?? 'falha_envio').slice(0, 300);
      await admin.rpc('bot_registrar_envio', { p_saida: row.id, p_status: 'falhou', p_erro: erro });
      const restantes = ordenadas.slice(ordenadas.indexOf(row) + 1);
      for (const r of restantes) {
        try { await admin.rpc('bot_registrar_envio', { p_saida: r.id, p_status: 'cancelada', p_erro: 'bolha_anterior_falhou' }); } catch { /* best-effort */ }
      }
      await evento(admin, sessao, 'envio_falhou', { ordem: row.ordem, erro });
      throw new FalhaTecnica(`envio_falhou:${erro.slice(0, 120)}`);
    }
  }

  // ---- RECONCILIAÇÃO da corrida com o webhook: o fromMe da PRÓPRIA mensagem da IA pode chegar
  //      antes do nosso insert e o webhook grava origem='telefone', o que faz o trigger PAUSAR a
  //      sessão com a nossa própria bolha. Se a sessão ficou 'pausada' e NÃO há mensagem humana de
  //      verdade (só os nossos echos), despausa. ----
  if (enviadosWamid.length) {
    const { data: st } = await admin.from('ia_sessoes').select('status, dados').eq('id', sessao.id).maybeSingle();
    if (st?.status === 'pausada') {
      const { data: humanas } = await admin.from('mensagens')
        .select('id_externo, autor_id, origem, id').eq('conversa_id', sessao.conversa_id).eq('direcao', 'saida')
        .not('tipo', 'in', '(sistema,nota_interna)').gte('criado_em', new Date(Date.now() - 5 * 60_000).toISOString());
      const humanoReal = (humanas ?? []).some((m: { id_externo: string | null; autor_id: string | null; origem: string | null }) =>
        (m.autor_id != null) || (m.origem === 'telefone' && !enviadosWamid.includes(m.id_externo ?? '')));
      if (!humanoReal) {
        await admin.from('ia_sessoes').update({ status: 'ativa', atualizado_em: new Date().toISOString() }).eq('id', sessao.id).eq('status', 'pausada');
        await evento(admin, sessao, 'despausa_echo_fromme', { wamids: enviadosWamid.length });
      }
    }
  }
}

// ======== desfechos ========
async function fazerHandoff(admin: Admin, sessao: Sessao, canal: Record<string, unknown>, motivo: string, bolhasFallback: string[], nota: string, patchExtra?: Record<string, unknown>): Promise<void> {
  // balão direto SÓ no caminho de falha técnica (modelo fora do ar → MSG_HANDOFF_FINAL)
  if (bolhasFallback.length) {
    try {
      const { data: ident } = await admin.from('contato_identidades')
        .select('valor_normalizado').eq('contato_id', sessao.contato_id).eq('tipo', 'whatsapp')
        .not('valor_normalizado', 'is', null).order('principal', { ascending: false }).limit(1).maybeSingle();
      const destino = ident?.valor_normalizado ?? null;
      if (destino) {
        const tx = enviadorDe(canal as { transporte?: string; instancia_externa?: string });
        const sent = await tx.sendText(destino, removerEmoji(bolhasFallback[0]));
        if (sent?.key?.id) {
          await admin.from('mensagens').insert({
            organizacao_id: sessao.organizacao_id, conversa_id: sessao.conversa_id, direcao: 'saida', tipo: 'texto',
            conteudo: bolhasFallback[0], autor_id: null, origem: 'bot', status: 'enviada', id_externo: sent.key.id,
            metadados: { fluxo: 'ia_sdr', etapa: sessao.etapa, sessao_id: sessao.id, handoff: motivo },
          });
        }
      }
    } catch { /* handoff nunca falha por causa do balão */ }
  }
  await criarNotaInterna(admin, sessao, nota);
  const { error: eConv } = await admin.from('conversas').update({
    precisa_humano: true, precisa_humano_motivo: motivo, precisa_humano_em: new Date().toISOString(),
  }).eq('id', sessao.conversa_id);
  if (eConv) await evento(admin, sessao, 'erro_escrita', { onde: 'handoff_precisa_humano', erro: String(eConv.message ?? '').slice(0, 200) });
  const { error: eSess } = await admin.from('ia_sessoes')
    .update({ ...(patchExtra ?? {}), status: 'handoff', atualizado_em: new Date().toISOString() }).eq('id', sessao.id);
  if (eSess) {
    // status perdido deixaria a sessão 'ativa' repetindo handoffs — reagenda e tenta de novo
    await evento(admin, sessao, 'erro_escrita', { onde: 'handoff_status', erro: String(eSess.message ?? '').slice(0, 200) });
    try {
      await admin.from('ia_sessoes').update({ processar_apos: new Date(Date.now() + REAGENDA_FALHA_MS).toISOString() })
        .eq('id', sessao.id).eq('status', 'ativa');
    } catch { /* melhor esforço */ }
    return;
  }
  await evento(admin, sessao, 'handoff', { motivo });
}

async function encerrarSessao(admin: Admin, sessao: Sessao, motivo: string): Promise<void> {
  await admin.from('ia_sessoes').update({ status: 'encerrada', atualizado_em: new Date().toISOString() }).eq('id', sessao.id);
  await evento(admin, sessao, 'encerrada', { motivo });
}

async function criarNotaInterna(admin: Admin, sessao: Sessao, texto: string): Promise<void> {
  try {
    await admin.from('mensagens').insert({
      organizacao_id: sessao.organizacao_id, conversa_id: sessao.conversa_id, direcao: 'saida',
      tipo: 'nota_interna', conteudo: texto, autor_id: null, origem: 'bot', status: 'enviada',
      metadados: { fluxo: 'ia_sdr', sessao_id: sessao.id },
    });
  } catch { /* nota é best-effort */ }
}

async function etiquetarOportunidade(admin: Admin, sessao: Sessao, etiqueta: string): Promise<void> {
  try {
    let oppId = sessao.oportunidade_id;
    if (!oppId) {
      const { data: o } = await admin.from('oportunidades').select('id')
        .eq('organizacao_id', sessao.organizacao_id).eq('contato_id', sessao.contato_id).eq('status', 'em_andamento')
        .order('criado_em', { ascending: false }).limit(1).maybeSingle();
      oppId = o?.id ?? null;
    }
    if (!oppId) return;
    const { data: opp } = await admin.from('oportunidades').select('etiquetas').eq('id', oppId).maybeSingle();
    const atuais = (opp?.etiquetas ?? []) as string[];
    if (!atuais.includes(etiqueta)) await admin.from('oportunidades').update({ etiquetas: [...atuais, etiqueta] }).eq('id', oppId);
  } catch { /* best-effort */ }
}

// texto do cliente pode CONTER a senha do gov.br (ele digita achando que ajuda). NUNCA entra
// numa nota interna — redige qualquer trecho que cheire a senha/credencial.
function pareceSenha(t: string): boolean {
  return /senha|gov\.?\s?br|c[oó]digo|\b\d{4,}\b/i.test(t ?? '');
}
function notaContexto(ctx: Ctx, motivo: string): string {
  const d = ctx.dados;
  const docs = ['doc_pessoal', 'comprovante', 'declarante_doc', 'consignado'].filter((k) => ctx.docs[k]);
  const cob = ctx.cobertura;
  const ultimas = ctx.textos.slice(-2).filter((t) => !pareceSenha(t));
  const linhaUltimas = ultimas.length
    ? `• Últimas mensagens do cliente: ${ultimas.map((t) => `"${t.slice(0, 80)}"`).join(' | ')}`
    : '• Últimas mensagens do cliente: (omitidas — possível dado sensível/senha ou mídia/áudio)';
  return [
    `🤖 IA SDR — atendimento entregue ao humano (motivo: ${motivo}).`,
    `• Etapa: ${ctx.sessao.etapa}`,
    `• Nome: ${d.nome_confirmado ?? ctx.contatoNome ?? '?'}`,
    d.email ? `• E-mail: ${d.email}` : null,
    d.titular_comprovante ? `• Titular do comprovante: ${d.titular_comprovante}` : null,
    d.declarante ? `• Declarante: ${(d.declarante as Record<string, unknown>)?.nome ?? '?'}` : null,
    `• Documentos recebidos: ${docs.length ? docs.join(', ') : 'nenhum'}`,
    (ctx.docs.comprovante as Record<string, unknown> | undefined)?.pendente_analista === true ? '• ⚠️ Comprovante: o cliente NÃO tinha — resolver com ele.' : null,
    cob.meses_cobertos != null ? `• Extratos: ${cob.meses_cobertos} de 120 meses cobertos${cob.completo ? ' (completo)' : ''}` : null,
    linhaUltimas,
  ].filter(Boolean).join('\n');
}

// ======== util ========
async function evento(admin: Admin, sessao: Sessao, tipo: string, detalhe: Record<string, unknown>, tokensIn?: number, tokensOut?: number): Promise<void> {
  try {
    await admin.from('ia_eventos').insert({
      sessao_id: sessao.id, conversa_id: sessao.conversa_id, organizacao_id: sessao.organizacao_id,
      tipo, detalhe, tokens_in: tokensIn ?? null, tokens_out: tokensOut ?? null,
    });
  } catch { /* auditoria é best-effort */ }
}

/** Volta a dormir: só zera processar_apos se NINGUÉM (trigger) mexeu nele durante o processamento. */
async function limparAgenda(admin: Admin, sessaoId: string, claimAte: string): Promise<void> {
  await admin.from('ia_sessoes').update({ processar_apos: null, atualizado_em: new Date().toISOString() })
    .eq('id', sessaoId).eq('processar_apos', claimAte).eq('status', 'ativa');
}

/** Agenda o próximo acorde (retomada) — mesma guarda do limparAgenda contra o trigger. */
async function agendarProximo(admin: Admin, sessaoId: string, claimAte: string, quandoIso: string): Promise<void> {
  await admin.from('ia_sessoes').update({ processar_apos: quandoIso, atualizado_em: new Date().toISOString() })
    .eq('id', sessaoId).eq('processar_apos', claimAte).eq('status', 'ativa');
}

// 1º toque: quanto esperar depende do que foi pedido (tarefa física demora mais que "sim/não")
function delayNudge1Ms(etapa: string, docs: Record<string, unknown>): number {
  if (etapa === 'extratos' || etapa === 'video_meuinss') return 60 * 60_000;
  if (etapa === 'coleta_docs' || etapa === 'docs_pessoais' || etapa === 'comprovante_residencia' || etapa === 'declarante') {
    const dp = (docs.doc_pessoal ?? {}) as Record<string, unknown>;
    const parcial = (dp.frente === true) !== (dp.verso === true);   // metade da tarefa: toque mais cedo
    return (parcial ? 20 : 45) * 60_000;
  }
  return 15 * 60_000;   // qualificação/triagem: resposta simples
}
// janela de TOQUE (mais conservadora que a de atendimento): 09:00–19:30 SP; fora dela → 09h+
function ajustarJanelaNudge(alvoMs: number): string {
  const sp = spWallClock(new Date(alvoMs));
  const min = sp.getUTCHours() * 60 + sp.getUTCMinutes();
  let ano = sp.getUTCFullYear(), mes = sp.getUTCMonth() + 1, dia = sp.getUTCDate();
  if (min >= 9 * 60 && min < 19 * 60 + 30) return new Date(alvoMs).toISOString();
  if (min >= 19 * 60 + 30) {
    const amanha = new Date(Date.UTC(ano, mes - 1, dia) + 86_400_000);
    ano = amanha.getUTCFullYear(); mes = amanha.getUTCMonth() + 1; dia = amanha.getUTCDate();
  }
  const base = spParaUtc(ano, mes, dia, 9, 0);
  return new Date(base.getTime() + rand(0, 30 * 60_000)).toISOString();
}
// 3º toque: manhã seguinte, 09:00–10:30 SP
function proximaManhaNudge(): string {
  const sp = spWallClock();
  const amanha = new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate()) + 86_400_000);
  const base = spParaUtc(amanha.getUTCFullYear(), amanha.getUTCMonth() + 1, amanha.getUTCDate(), 9, 0);
  return new Date(base.getTime() + rand(0, 90 * 60_000)).toISOString();
}

function dentroDaJanela(iaConfig: Record<string, unknown>): boolean {
  const ini = parseHora(String((iaConfig as { janela_inicio?: string }).janela_inicio ?? '07:30'), 7 * 60 + 30);
  const fim = parseHora(String((iaConfig as { janela_fim?: string }).janela_fim ?? '21:30'), 21 * 60 + 30);
  const sp = spWallClock();
  const min = sp.getUTCHours() * 60 + sp.getUTCMinutes();
  return min >= ini && min <= fim;
}
function parseHora(s: string, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return fallback;
  return Number(m[1]) * 60 + Number(m[2]);
}
/** Próxima abertura da janela (hoje se ainda não abriu, senão amanhã) + jitter 0–45 min. */
function proximaAbertura(iaConfig: Record<string, unknown>): string {
  const ini = parseHora(String((iaConfig as { janela_inicio?: string }).janela_inicio ?? '07:30'), 7 * 60 + 30);
  const sp = spWallClock();
  const minAgora = sp.getUTCHours() * 60 + sp.getUTCMinutes();
  let ano = sp.getUTCFullYear(), mes = sp.getUTCMonth() + 1, dia = sp.getUTCDate();
  if (minAgora >= ini) {
    const amanha = new Date(Date.UTC(ano, mes - 1, dia) + 24 * 3600 * 1000);
    ano = amanha.getUTCFullYear(); mes = amanha.getUTCMonth() + 1; dia = amanha.getUTCDate();
  }
  const base = spParaUtc(ano, mes, dia, Math.floor(ini / 60), ini % 60);
  return new Date(base.getTime() + rand(0, 45 * 60_000)).toISOString();
}
function inicioDoDiaSpUtcIso(): string {
  const sp = spWallClock();
  return spParaUtc(sp.getUTCFullYear(), sp.getUTCMonth() + 1, sp.getUTCDate(), 0, 0).toISOString();
}

function mascararCpf(cpf: string): string {
  const d = somenteDigitos(cpf);
  return d.length === 11 ? `***.***.${d.slice(6, 9)}-${d.slice(9)}` : '***';
}
