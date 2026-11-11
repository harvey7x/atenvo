// Cliente Evolution v2 (Reviza) — texto, mídia, áudio PTT, presença, download
// de mídia recebida, validação de número e estado da conexão. Espelha as formas
// do CAF que rodam em produção. A apikey NUNCA sai do backend.
// (arquivo IGUAL em reviza-wa-motor, reviza-wa-enviar e reviza-wa-webhook)
const BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';

export function evolutionConfigured(): boolean { return BASE.length > 0 && KEY.length > 0; }

/** número BR completo: 10-11 dígitos = DDD+número → prefixa 55 (Evolution exige o país) */
export function braNumero(n: string): string {
  let d = (n || '').replace(/\D/g, '').replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return d;
}

async function call(path: string, body: unknown, method = 'POST'): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'apikey': KEY },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(25_000),
  });
  const txt = await res.text();
  let data: unknown = null;
  try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
  if (!res.ok) {
    const o = data as { message?: unknown; error?: unknown; response?: { message?: unknown } } | null;
    const inner = o?.response?.message;
    const msg = (typeof o?.message === 'string' && o.message) || (typeof o?.error === 'string' && o.error)
      || (Array.isArray(inner) ? JSON.stringify(inner).slice(0, 200) : typeof inner === 'string' ? inner : '') || `Evolution HTTP ${res.status}`;
    throw new Error(`${msg}${/HTTP \d/.test(msg) ? '' : ` (HTTP ${res.status})`}`);
  }
  return (data ?? {}) as Record<string, unknown>;
}
/** id da mensagem + número REAL do WhatsApp (JID sem @…) — a conversa fica nesse formato */
const retorno = (d: Record<string, unknown>): { id: string | null; jid: string | null } => {
  const k = (d as { key?: { id?: string; remoteJid?: string } })?.key;
  const jid = k?.remoteJid && k.remoteJid.endsWith('@s.whatsapp.net') ? k.remoteJid.split('@')[0].replace(/\D/g, '') : null;
  return { id: k?.id ?? null, jid };
};

/** citação (responder mensagem): a Evolution usa este contexto pra citar a original */
export type QuotedWA = { key: { id: string; remoteJid: string; fromMe: boolean }; message: { conversation: string } };
export const quotedDe = (numero: string, waId: string, fromMe: boolean, previa: string): QuotedWA =>
  ({ key: { id: waId, remoteJid: `${braNumero(numero)}@s.whatsapp.net`, fromMe }, message: { conversation: previa.slice(0, 300) } });

export async function sendText(instanceName: string, number: string, text: string, quoted?: QuotedWA) {
  return retorno(await call(`/message/sendText/${instanceName}`, { number: braNumero(number), text, ...(quoted ? { quoted } : {}) }));
}

/** imagem/vídeo/documento — `media` é URL (a Evolution baixa) ou base64. Áudio NÃO passa aqui. */
export async function sendMedia(instanceName: string, number: string, mediatype: 'image' | 'video' | 'document', mimetype: string, media: string, fileName: string, caption?: string, quoted?: QuotedWA) {
  return retorno(await call(`/message/sendMedia/${instanceName}`, { number: braNumero(number), mediatype, mimetype, media, fileName, ...(caption ? { caption } : {}), ...(quoted ? { quoted } : {}) }));
}

/** nota de voz (PTT). `audio` = URL temporária; encoding:true converte p/ ogg/opus. */
export async function sendWhatsAppAudio(instanceName: string, number: string, audio: string, quoted?: QuotedWA) {
  return retorno(await call(`/message/sendWhatsAppAudio/${instanceName}`, { number: braNumero(number), audio, encoding: true, ...(quoted ? { quoted } : {}) }));
}

/** o número tem WhatsApp? Devolve o JID real (com/sem o 9 — quem decide é o WhatsApp).
    Lista de candidatos (ex.: com e sem o nono dígito); null = nenhum existe. */
export async function resolverNumero(instanceName: string, candidatos: string[]): Promise<string | null> {
  if (!candidatos.length) return null;
  const r = await call(`/chat/whatsappNumbers/${instanceName}`, { numbers: candidatos }) as unknown;
  const arr = (Array.isArray(r) ? r : []) as { exists?: boolean; jid?: string }[];
  const hit = arr.find((h) => h?.exists === true && typeof h.jid === 'string' && h.jid.endsWith('@s.whatsapp.net'));
  return hit ? hit.jid!.split('@')[0].replace(/\D/g, '') : null;
}

/** estado real da sessão na Evolution: 'open' | 'connecting' | 'close' */
export async function connectionState(instanceName: string): Promise<string> {
  const r = await call(`/instance/connectionState/${instanceName}`, null, 'GET') as { instance?: { state?: string } };
  return String(r?.instance?.state ?? '');
}

/** visto azul DE VERDADE no celular do cliente: marca as mensagens dele como lidas */
export async function markMessagesAsRead(instanceName: string, itens: { remoteJid: string; fromMe: boolean; id: string }[]): Promise<void> {
  if (!itens.length) return;
  await call(`/chat/markMessageAsRead/${instanceName}`, { readMessages: itens });
}

/** apaga a mensagem PRA TODOS (só as nossas, fromMe) */
export async function deleteMessageForEveryone(instanceName: string, number: string, waId: string): Promise<void> {
  await call(`/chat/deleteMessageForEveryone/${instanceName}`, { id: waId, remoteJid: `${braNumero(number)}@s.whatsapp.net`, fromMe: true }, 'DELETE');
}

/** presença "digitando"/"gravando" por delayMs (anti-ban: parecer humano) */
export async function sendPresence(instanceName: string, number: string, presence: 'composing' | 'recording', delayMs: number): Promise<void> {
  await call(`/chat/sendPresence/${instanceName}`, { number: braNumero(number), presence, delay: delayMs });
}

/** baixa a mídia descriptografada de uma mensagem recebida (base64 + mime) */
export async function getBase64FromMediaMessage(instanceName: string, dataMsg: Record<string, unknown>): Promise<{ bytes: Uint8Array; mime: string }> {
  const j = await call(`/chat/getBase64FromMediaMessage/${instanceName}`, { message: dataMsg, convertToMp4: false }) as { base64?: string; media?: string; mimetype?: string };
  const b64 = j.base64 ?? j.media ?? '';
  if (!b64) throw new Error('sem base64');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (!bytes.length) throw new Error('mídia vazia');
  if (bytes.length > 16 * 1024 * 1024) throw new Error('mídia acima de 16MB');
  return { bytes, mime: (j.mimetype ?? '').split(';')[0].trim() || 'application/octet-stream' };
}
