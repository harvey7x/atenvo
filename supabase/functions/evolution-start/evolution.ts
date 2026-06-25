// Cliente da Evolution API v2 (provider "Conector WhatsApp por QR Code").
// A apikey NUNCA sai do backend nem é persistida em tabelas.
const BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';

export function evolutionConfigured(): boolean {
  return BASE.length > 0 && KEY.length > 0;
}

async function call(path: string, method: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = (data as { message?: string; error?: string })?.message
      ?? (data as { error?: string })?.error ?? `Evolution HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : `Evolution HTTP ${res.status}`);
  }
  return data;
}

/** Extrai o QR (data URL base64) de formatos variados da Evolution. */
export function extractQr(d: unknown): string | null {
  const o = d as Record<string, unknown>;
  const q = (o?.qrcode ?? o) as Record<string, unknown>;
  const b64 = (q?.base64 ?? o?.base64) as string | undefined;
  if (!b64) return null;
  return b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
}

export const evolution = {
  createInstance: (instanceName: string, webhookUrl: string) =>
    call('/instance/create', 'POST', {
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhookByEvents: false,
        events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE'],
      },
    }),
  connect: (instanceName: string) => call(`/instance/connect/${instanceName}`, 'GET'),
  connectionState: (instanceName: string) =>
    call(`/instance/connectionState/${instanceName}`, 'GET') as Promise<{ instance?: { state?: string } }>,
  fetchInstance: (instanceName: string) =>
    call(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, 'GET'),
  logout: (instanceName: string) => call(`/instance/logout/${instanceName}`, 'DELETE'),
  remove: (instanceName: string) => call(`/instance/delete/${instanceName}`, 'DELETE'),
  sendText: (instanceName: string, number: string, text: string) =>
    call(`/message/sendText/${instanceName}`, 'POST', { number, text }) as Promise<{ key?: { id?: string } }>,
};
