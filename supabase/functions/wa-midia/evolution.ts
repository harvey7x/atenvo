// Download de mídia descriptografada via Evolution (base64). apikey nunca sai do backend.
const BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
export function evolutionConfigured(): boolean { return BASE.length > 0 && KEY.length > 0; }

const MAX_MEDIA = 20 * 1024 * 1024;
export async function getBase64(instance: string, message: unknown): Promise<{ bytes: Uint8Array; mime: string }> {
  const res = await fetch(`${BASE}/chat/getBase64FromMediaMessage/${instance}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY },
    body: JSON.stringify({ message, convertToMp4: false }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${txt.slice(0, 140)}`);
  let j: { base64?: string; media?: string; mimetype?: string } = {};
  try { j = JSON.parse(txt); } catch { throw new Error('resposta_invalida'); }
  const b64 = j.base64 ?? j.media ?? '';
  if (!b64) throw new Error('sem_base64');
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  if (bytes.length === 0) throw new Error('midia_vazia');
  if (bytes.length > MAX_MEDIA) throw new Error('midia_grande');
  return { bytes, mime: (j.mimetype ?? '').split(';')[0].trim() || 'audio/ogg' };
}
