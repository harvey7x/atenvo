// Cliente READ-ONLY da Evolution (+ sendText só para o teste explícito). apikey nunca sai do backend.
const BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
export function evolutionConfigured(): boolean { return BASE.length > 0 && KEY.length > 0; }

async function call(path: string, method: string, body?: unknown) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', apikey: KEY }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let data: unknown = null; try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
    return { ok: res.ok, status: res.status, ms: Date.now() - t0, data };
  } catch (e) { return { ok: false, status: 0, ms: Date.now() - t0, error: (e as Error).message }; }
}

export const evolution = {
  version: () => call('/', 'GET'),
  connectionState: (inst: string) => call(`/instance/connectionState/${inst}`, 'GET'),
  findWebhook: (inst: string) => call(`/webhook/find/${inst}`, 'GET'),
  // sem sendText: diagnóstico é read-only; teste real de envio usa o fluxo da aplicação (evolution-send).
};
