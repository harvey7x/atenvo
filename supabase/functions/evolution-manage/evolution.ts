// Cliente da Evolution API v2. A apikey NUNCA sai do backend nem é persistida em tabelas.
const BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';

export function evolutionConfigured(): boolean { return BASE.length > 0 && KEY.length > 0; }

async function call(path: string, method: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', 'apikey': KEY }, body: body ? JSON.stringify(body) : undefined });
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

const WH_EVENTS = ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE'];

// C2: o segredo do webhook vai no HEADER x-webhook-secret (não na URL). Enviado à Evolution v2
// no campo webhook.headers. `secret` é opcional só p/ compatibilidade de assinatura; sempre passado.
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
  getWebhook: (instanceName: string) => call(`/webhook/find/${instanceName}`, 'GET'),
  connect: (instanceName: string) => call(`/instance/connect/${instanceName}`, 'GET'),
  connectionState: (instanceName: string) => call(`/instance/connectionState/${instanceName}`, 'GET') as Promise<{ instance?: { state?: string } }>,
  fetchInstance: (instanceName: string) => call(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, 'GET'),
  logout: (instanceName: string) => call(`/instance/logout/${instanceName}`, 'DELETE'),
  remove: (instanceName: string) => call(`/instance/delete/${instanceName}`, 'DELETE'),
  sendText: (instanceName: string, number: string, text: string) => call(`/message/sendText/${instanceName}`, 'POST', { number, text }) as Promise<{ key?: { id?: string } }>,
};
