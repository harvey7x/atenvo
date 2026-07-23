// Bloco 3 — DISPATCHER DE TRANSPORTE.
//
// O caminho de saída passa a olhar canais.transporte e falar com a Evolution (QR/Baileys) OU
// com a WhatsApp Cloud API oficial. Quem chama NÃO sabe qual é: o adaptador devolve sempre a
// mesma forma `{ key: { id } }` que o resto do evolution-send já espera — por isso o diff no
// index.ts é mínimo e as barreiras (canal restrito, autoenvio, idempotência, persistência,
// retry) continuam idênticas para os dois transportes.
//
// TOKEN só em secret (META_WHATSAPP_TOKEN). Nunca no banco, nunca em query string, nunca logado.
import { evolution } from './evolution.ts';

const GRAPH_V = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const TOKEN = () => Deno.env.get('META_WHATSAPP_TOKEN') ?? '';
// Kill switch: se algo der errado com a Cloud API, `nao` derruba só ela sem tocar na Evolution.
const CLOUD_ATIVO = () => (Deno.env.get('CLOUD_API_ATIVO') ?? 'sim').toLowerCase() === 'sim';

export interface CanalEnvio {
  transporte?: string | null;
  instancia_externa?: string | null;
  cloud_phone_number_id?: string | null;
}
export interface Enviado { key?: { id?: string } }
export interface Enviador {
  ehCloud: boolean;
  sendText(numero: string, texto: string, quoted?: unknown): Promise<Enviado>;
  sendMedia(numero: string, mediatype: string, mimetype: string, media: string, fileName?: string, caption?: string, quoted?: unknown): Promise<Enviado>;
  sendWhatsAppAudio(numero: string, audio: string, quoted?: unknown): Promise<Enviado>;
}

export function ehCloudApi(canal: CanalEnvio): boolean {
  return (canal.transporte ?? 'evolution') === 'cloud_api';
}

// O `quoted` interno é no formato da Evolution ({ key: { id } }). Na Cloud API a citação é
// `context: { message_id }` — e o id tem que ser um wamid, que é exatamente o que guardamos
// em mensagens.id_externo para este transporte.
function contextoDe(quoted?: unknown): Record<string, unknown> {
  const id = (quoted as { key?: { id?: string } } | undefined)?.key?.id;
  return id ? { context: { message_id: id } } : {};
}

function erroGraph(j: Record<string, any>, status: number): string {
  const e = j?.error ?? {};
  const partes = [e.message, e.error_user_msg, e.error_data?.details].filter(Boolean);
  return (partes.length ? partes.join(' — ') : `HTTP ${status}`).toString().slice(0, 300);
}

async function graph(path: string, body: unknown): Promise<Record<string, any>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);   // a Evolution não tem timeout; aqui tem.
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_V()}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}` },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    const txt = await res.text();
    let j: Record<string, any> = {};
    try { j = txt ? JSON.parse(txt) : {}; } catch { j = { raw: txt }; }
    if (!res.ok) throw new Error(erroGraph(j, res.status));
    return j;
  } finally { clearTimeout(t); }
}

/** Sobe um base64 para a Cloud API e devolve o media id (para áudio gravado no painel). */
async function uploadMedia(phoneNumberId: string, b64: string, mime: string, nome: string): Promise<string> {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const fd = new FormData();
  fd.append('messaging_product', 'whatsapp');
  fd.append('type', mime);
  fd.append('file', new Blob([bin], { type: mime }), nome);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_V()}/${phoneNumberId}/media`, {
      method: 'POST', headers: { Authorization: `Bearer ${TOKEN()}` }, body: fd, signal: ctrl.signal,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j?.id) throw new Error(erroGraph(j, res.status));
    return String(j.id);
  } finally { clearTimeout(t); }
}

// A Cloud API responde { messages: [{ id: 'wamid...' }] }. Normalizamos para a forma da Evolution
// para que o critério de aceite do index.ts (sem id => falha) valha igual nos dois transportes.
const comoEvolution = (j: Record<string, any>): Enviado => ({ key: { id: j?.messages?.[0]?.id ?? undefined } });

function enviadorCloud(phoneNumberId: string): Enviador {
  const guard = () => {
    if (!CLOUD_ATIVO()) throw new Error('Envio pela Cloud API está desligado (CLOUD_API_ATIVO).');
    if (!TOKEN()) throw new Error('Token da Cloud API não configurado no servidor.');
  };
  return {
    ehCloud: true,
    async sendText(numero, texto, quoted) {
      guard();
      return comoEvolution(await graph(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: numero,
        type: 'text', text: { preview_url: false, body: texto }, ...contextoDe(quoted),
      }));
    },
    async sendMedia(numero, mediatype, mimetype, media, fileName, caption, quoted) {
      guard();
      // URL assinada (imagem/vídeo/documento) -> a Meta baixa sozinha, igual a Evolution faz.
      // base64 -> precisa subir antes (a Cloud API não aceita base64 inline).
      const ehUrl = /^https?:\/\//i.test(media);
      const fonte = ehUrl ? { link: media } : { id: await uploadMedia(phoneNumberId, media, mimetype, fileName || 'arquivo') };
      const obj: Record<string, unknown> = { ...fonte };
      if (mediatype !== 'audio' && caption) obj.caption = caption;      // áudio não tem legenda
      if (mediatype === 'document' && fileName) obj.filename = fileName;
      return comoEvolution(await graph(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: numero,
        type: mediatype, [mediatype]: obj, ...contextoDe(quoted),
      }));
    },
    async sendWhatsAppAudio(numero, audio, quoted) {
      guard();
      // Nota de voz: a Cloud API não tem endpoint de PTT — ela renderiza como voz quando o
      // arquivo é ogg/opus, que é exatamente o que o painel grava no Chrome.
      const ehUrl = /^https?:\/\//i.test(audio);
      const fonte = ehUrl ? { link: audio } : { id: await uploadMedia(phoneNumberId, audio, 'audio/ogg', 'voz.ogg') };
      return comoEvolution(await graph(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: numero,
        type: 'audio', audio: fonte, ...contextoDe(quoted),
      }));
    },
  };
}

function enviadorEvolution(instancia: string): Enviador {
  return {
    ehCloud: false,
    sendText: (numero, texto, quoted) => evolution.sendText(instancia, numero, texto, quoted),
    sendMedia: (numero, mediatype, mimetype, media, fileName, caption, quoted) =>
      evolution.sendMedia(instancia, numero, mediatype, mimetype, media, fileName ?? '', caption, quoted),
    sendWhatsAppAudio: (numero, audio, quoted) => evolution.sendWhatsAppAudio(instancia, numero, audio, quoted),
  };
}

/** Escolhe o transporte pelo canal. Quem chama não precisa saber qual é. */
export function enviadorDe(canal: CanalEnvio): Enviador {
  return ehCloudApi(canal)
    ? enviadorCloud(String(canal.cloud_phone_number_id))
    : enviadorEvolution(String(canal.instancia_externa));
}
