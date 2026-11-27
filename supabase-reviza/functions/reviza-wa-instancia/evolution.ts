// Cliente da Evolution API v2 (Reviza). A apikey NUNCA sai do backend.
// Espelha o cliente do CAF (evolution-manage/evolution.ts), enxuto pro que a Reviza usa.
const BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';

export function evolutionConfigured(): boolean { return BASE.length > 0 && KEY.length > 0; }

async function call(path: string, method: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'apikey': KEY },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data as { message?: string; error?: string })?.message ?? (data as { error?: string })?.error ?? `Evolution HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : `Evolution HTTP ${res.status}`);
  }
  return data;
}

export function extractQr(d: unknown): string | null {
  const o = d as Record<string, unknown>;
  const q = (o?.qrcode ?? o) as Record<string, unknown>;
  const b64 = (q?.base64 ?? o?.base64) as string | undefined;
  if (!b64) return null;
  return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
}

export const WH_EVENTS = ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'PRESENCE_UPDATE'];
const whHeaders = (secret?: string) => (secret ? { 'x-webhook-secret': secret } : undefined);

export const evolution = {
  createInstance: (instanceName: string, webhookUrl: string, secret?: string) =>
    call('/instance/create', 'POST', {
      instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true,
      webhook: { url: webhookUrl, enabled: true, webhookByEvents: false, events: WH_EVENTS, headers: whHeaders(secret) },
    }),
  setWebhook: (instanceName: string, webhookUrl: string, secret?: string) =>
    call(`/webhook/set/${instanceName}`, 'POST', {
      webhook: { enabled: true, url: webhookUrl, webhookByEvents: false, webhookBase64: false, events: WH_EVENTS, headers: whHeaders(secret) },
    }),
  connect: (instanceName: string) => call(`/instance/connect/${instanceName}`, 'GET'),
  /** configuração do webhook gravada na instância (url, eventos, ligado) */
  webhookFind: (instanceName: string) => call(`/webhook/find/${instanceName}`, 'GET') as Promise<{ url?: string; enabled?: boolean; events?: string[]; headers?: Record<string, string>; webhook?: { url?: string; enabled?: boolean; events?: string[]; headers?: Record<string, string> } } | null>,
  connectionState: (instanceName: string) => call(`/instance/connectionState/${instanceName}`, 'GET') as Promise<{ instance?: { state?: string } }>,
  logout: (instanceName: string) => call(`/instance/logout/${instanceName}`, 'DELETE'),
  remove: (instanceName: string) => call(`/instance/delete/${instanceName}`, 'DELETE'),
};
