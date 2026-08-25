// Gemini para a IA SDR — SEMPRE com responseSchema (JSON estrito, sem parse de texto livre).
// Modelo via env GEMINI_MODEL (default 'gemini-2.5-flash' — o MESMO identificador que já roda em
// produção no bot-runner desde julho, então o nome é comprovadamente estável nesta conta).
// Sem GEMINI_API_KEY: chamarGeminiJson lança 'sem_api_key' e o worker PAUSA a sessão com evento —
// nunca crash, nunca silêncio.

// deno-lint-ignore no-explicit-any
const env = (k: string): string => ((globalThis as any).Deno?.env?.get(k) ?? '');

export const modeloGemini = (): string => (env('GEMINI_MODEL') || 'gemini-2.5-flash').trim();
export const temChaveGemini = (): boolean => !!env('GEMINI_API_KEY');

export interface ParteGemini { text?: string; inline_data?: { mime_type: string; data: string } }
export interface ResultadoGemini { json: Record<string, unknown>; tokensIn: number; tokensOut: number }

export async function chamarGeminiJson(p: {
  system: string;
  partes: ParteGemini[];
  schema: Record<string, unknown>;
  temperatura?: number;
  maxTokens?: number;
}): Promise<ResultadoGemini> {
  const key = env('GEMINI_API_KEY');
  if (!key) throw new Error('sem_api_key');
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modeloGemini()}:generateContent?key=${key}`,
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
    },
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const txt = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((x: { text?: string }) => x.text).filter(Boolean).join('').trim();
  const usage = data?.usageMetadata ?? {};
  let json: Record<string, unknown>;
  try { json = JSON.parse(txt); } catch { throw new Error('parse_falhou'); }
  if (!json || typeof json !== 'object') throw new Error('parse_falhou');
  return {
    json,
    tokensIn: Number(usage.promptTokenCount ?? 0) || 0,
    tokensOut: Number(usage.candidatesTokenCount ?? 0) || 0,
  };
}

// ---- retry: repete transitório, aborta permanente (espelho do comRetry do bot-runner) ----
function erroRetryavel(e: unknown): boolean {
  const m = ((e as Error)?.message ?? '').toLowerCase();
  if (m.includes('sem_api_key')) return false;
  return /(429|500|502|503|504|timeout|fetch failed|network|econnreset|etimedout|socket|overloaded|unavailable)/.test(m);
}
export async function comRetry<T>(fn: () => Promise<T>, tentativas = 3, esperaBase = 700): Promise<T> {
  let ultimo: unknown;
  for (let i = 0; i < tentativas; i++) {
    try { return await fn(); } catch (e) {
      ultimo = e;
      if (i < tentativas - 1 && erroRetryavel(e)) { await new Promise((r) => setTimeout(r, esperaBase * (i + 1))); continue; }
      throw e;
    }
  }
  throw ultimo;
}
