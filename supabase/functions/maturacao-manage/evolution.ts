// Cliente da Evolution API v2 para MATURAÇÃO. A apikey NUNCA sai do backend.
//
// Difere do cliente de atendimento em dois pontos:
//   • as instâncias usam prefixo 'aquec_' e apontam para o `maturacao-webhook` (nunca o de atendimento);
//   • expõe sendPresence e markMessageAsRead — que o cliente de atendimento não tem e sem os quais
//     o aquecimento fica com cara de robô (sem "digitando…" e sem confirmação de leitura).
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

// Aquecimento não precisa de SEND_MESSAGE nem de eventos de grupo: só conexão, inbound e ACK.
const WH_EVENTS = ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPSERT', 'MESSAGES_UPDATE'];

const whHeaders = (secret?: string) => (secret ? { 'x-maturacao-secret': secret } : undefined);

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
  connectionState: (instanceName: string) =>
    call(`/instance/connectionState/${instanceName}`, 'GET') as Promise<{ instance?: { state?: string } }>,
  fetchInstance: (instanceName: string) =>
    call(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, 'GET'),
  logout: (instanceName: string) => call(`/instance/logout/${instanceName}`, 'DELETE'),
  remove: (instanceName: string) => call(`/instance/delete/${instanceName}`, 'DELETE'),

  sendText: (instanceName: string, number: string, text: string) =>
    call(`/message/sendText/${instanceName}`, 'POST', { number, text }) as Promise<{ key?: { id?: string } }>,
  sendSticker: (instanceName: string, number: string, sticker: string) =>
    call(`/message/sendSticker/${instanceName}`, 'POST', { number, sticker }) as Promise<{ key?: { id?: string } }>,
  sendMedia: (instanceName: string, number: string, mediatype: string, media: string, mimetype?: string, caption?: string) =>
    call(`/message/sendMedia/${instanceName}`, 'POST', { number, mediatype, media, mimetype, caption }) as Promise<{ key?: { id?: string } }>,
  sendWhatsAppAudio: (instanceName: string, number: string, audio: string) =>
    call(`/message/sendWhatsAppAudio/${instanceName}`, 'POST', { number, audio, encoding: true }) as Promise<{ key?: { id?: string } }>,

  // "digitando…" antes de enviar. Sem isto o envio é instantâneo e não parece humano.
  sendPresence: (instanceName: string, number: string, presence: 'composing' | 'recording' | 'available' | 'paused', delayMs: number) =>
    call(`/chat/sendPresence/${instanceName}`, 'POST', { number, presence, delay: delayMs }),

  // confirmação de leitura (tiquinho azul) do lado de quem recebeu — reciprocidade real
  markMessageAsRead: (instanceName: string, remoteJid: string, id: string, fromMe = false) =>
    call(`/chat/markMessageAsRead/${instanceName}`, 'POST', { readMessages: [{ remoteJid, fromMe, id }] }),
};
