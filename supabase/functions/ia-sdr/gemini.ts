// Gemini para a IA SDR — SEMPRE com responseSchema (JSON estrito, sem parse de texto livre).
//
// MODELO (Fase 1.1): default 'gemini-3.6-flash' — o 2.5 retornou 404 p/ contas novas em 25/08
// ("no longer available to new users… use models/gemini-3.6-flash"). Overrides por env:
// GEMINI_MODEL (conversa) e GEMINI_MODEL_DOCS (só a análise do Histórico de Consignado — porta
// aberta p/ um modelo maior sem tocar na conversa). Auto-recuperação: 404 de modelo com sugestão
// no corpo → parseia "models/<nome>", tenta na hora e o chamador cacheia em ia_config
// (modelo_efetivo / modelo_efetivo_docs) + loga 'modelo_atualizado'. Rename do Google nunca mais
// derruba a IA.
//
// FALHA TÉCNICA (Fase 1.1): retry com backoff 2s → 8s; parse de JSON inválido CONTA como
// transitório (re-sampling resolve). Persistiu → o chamador NÃO fala com o cliente (reagenda).

// deno-lint-ignore no-explicit-any
const env = (k: string): string => ((globalThis as any).Deno?.env?.get(k) ?? '');

export const MODELO_DEFAULT = 'gemini-3.6-flash';
export const modeloEnvChat = (): string => (env('GEMINI_MODEL') || '').trim();
export const modeloEnvDocs = (): string => (env('GEMINI_MODEL_DOCS') || '').trim();
export const temChaveGemini = (): boolean => !!env('GEMINI_API_KEY');

export interface ParteGemini { text?: string; inline_data?: { mime_type: string; data: string } }
export interface ResultadoGemini { json: Record<string, unknown>; tokensIn: number; tokensOut: number }

// teto de parede por chamada: fetch pendurado NUNCA pode segurar o worker além disso —
// sem timeout, um socket morto furava o claim de 5min da sessão e as leases de canal.
const TIMEOUT_MS = 45_000;

export async function chamarGeminiJson(modelo: string, p: {
  system: string;
  partes: ParteGemini[];
  schema: Record<string, unknown>;
  temperatura?: number;
  maxTokens?: number;
}): Promise<ResultadoGemini> {
  const key = env('GEMINI_API_KEY');
  if (!key) throw new Error('sem_api_key');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: p.system }] },
          contents: [{ role: 'user', parts: p.partes }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: p.schema,
            temperature: p.temperatura ?? 0.4,
            maxOutputTokens: p.maxTokens ?? 2048,
          },
        }),
        signal: ctrl.signal,
      },
    );
  } catch (e) {
    throw new Error(ctrl.signal.aborted ? 'timeout_gemini' : `fetch failed: ${String((e as Error)?.message ?? '').slice(0, 120)}`);
  } finally { clearTimeout(t); }
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  // bloqueio/corte explícito NÃO é "JSON inválido": nomeia o motivo (safety, MAX_TOKENS…)
  const block = data?.promptFeedback?.blockReason;
  if (block) throw new Error(`block_${String(block).toLowerCase()}`);
  const finish = data?.candidates?.[0]?.finishReason;
  if (finish && finish !== 'STOP') throw new Error(`finish_${String(finish).toLowerCase()}`);
  const txt = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((x: { text?: string }) => x.text).filter(Boolean).join('').trim();
  const usage = data?.usageMetadata ?? {};
  let json: Record<string, unknown>;
  try { json = JSON.parse(txt); } catch { throw new Error('parse_falhou'); }
  if (!json || typeof json !== 'object') throw new Error('parse_falhou');
  return {
    json,
    tokensIn: Number(usage.promptTokenCount ?? 0) || 0,
    // thoughtsTokenCount é FATURADO como saída nos modelos thinking — sem ele o custo subconta
    tokensOut: (Number(usage.candidatesTokenCount ?? 0) || 0) + (Number(usage.thoughtsTokenCount ?? 0) || 0),
  };
}

/** 404 de modelo? (rename/aposentadoria do Google) */
export function ehErro404Modelo(msg: string): boolean {
  return /gemini 404/.test(msg) && /model/i.test(msg);
}

/** Extrai o modelo SUGERIDO no corpo do 404 ("use models/<nome>") — o primeiro diferente do atual. */
export function parseSugestaoModelo(msg: string, atual: string): string | null {
  const nomes = [...msg.matchAll(/models\/([a-zA-Z0-9._-]+)/g)].map((m) => m[1]);
  for (const n of nomes) if (n && n !== atual) return n;
  return null;
}

// ---- retry: transitório repete com backoff 2s → 8s; permanente aborta na hora ----
// Classificação pelo STATUS do prefixo "gemini NNN:" (nunca por substring do corpo — um 400 cujo
// corpo cite "timeout" não é transitório). Sem status = erro de rede/parse local.
function erroRetryavel(e: unknown): boolean {
  const m = ((e as Error)?.message ?? '').toLowerCase();
  if (m.includes('sem_api_key')) return false;
  if (m.startsWith('block_')) return false;                       // safety: repetir não muda
  const http = /^gemini (\d{3}):/.exec(m);
  if (http) { const s = Number(http[1]); return s === 429 || s >= 500; }
  if (m.startsWith('finish_')) return m === 'finish_max_tokens' ? false : true;
  if (m.includes('parse_falhou')) return true;   // re-sampling costuma resolver JSON inválido
  return /(timeout_gemini|timeout|fetch failed|network|econnreset|etimedout|socket)/.test(m);
}
const BACKOFF_MS = [2_000, 8_000];
export async function comRetry<T>(fn: () => Promise<T>): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i <= BACKOFF_MS.length; i++) {
    try { return await fn(); } catch (e) {
      ultimo = e;
      if (i < BACKOFF_MS.length && erroRetryavel(e)) { await new Promise((r) => setTimeout(r, BACKOFF_MS[i])); continue; }
      throw e;
    }
  }
  throw ultimo;
}
