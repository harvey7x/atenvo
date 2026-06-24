// Cliente da Evolution API v2. A apikey NUNCA sai do backend.
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
export const evolution = {
  connect: (instanceName: string) => call(`/instance/connect/${instanceName}`, 'GET'),
  connectionState: (instanceName: string) => call(`/instance/connectionState/${instanceName}`, 'GET') as Promise<{ instance?: { state?: string } }>,
  whatsappNumbers: (instanceName: string, numbers: string[]) => call(`/chat/whatsappNumbers/${instanceName}`, 'POST', { numbers }) as Promise<Array<{ exists?: boolean; jid?: string; number?: string }>>,
  sendText: (instanceName: string, number: string, text: string) => call(`/message/sendText/${instanceName}`, 'POST', { number, text }) as Promise<{ key?: { id?: string } }>,
};
