// REVIZA (23/11): cópia da função do Atenvo que está no ar, adaptada ao Reviza por
// ~/reviza-sist/porte-atendimento/porta-funcoes.py — conexões "revizaatd_", tabela atd_integracoes, pasta atd-midia.
// Cliente da Evolution API v2. A apikey NUNCA sai do backend.
const BASE = (Deno.env.get('EVOLUTION_API_URL') ?? '').replace(/\/+$/, '');
const KEY = Deno.env.get('EVOLUTION_API_KEY') ?? '';
export function evolutionConfigured(): boolean { return BASE.length > 0 && KEY.length > 0; }
// MOTIVO REAL da falha. A Evolution v2 responde { status, error: "Bad Request", response: { message: [...] } }:
// o topo traz só o RÓTULO genérico e o porquê fica em response.message. Ler só o topo gravava
// "HTTP 400: Bad Request" em erro_envio e apagava a única pista útil — ficávamos cegos para depurar
// (incidente 08/09: 2 falhas sem causa apurável). Ordem: response.message > message > error > corpo cru.
function detalheErro(data: unknown, textoCru: string): string {
  const d = data as { message?: unknown; error?: unknown; response?: { message?: unknown } } | null;
  for (const c of [d?.response?.message, d?.message, d?.error]) {
    if (typeof c === 'string' && c.trim()) return c.trim().slice(0, 300);
    if (Array.isArray(c) && c.length) return c.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ').slice(0, 300);
    if (c && typeof c === 'object') return JSON.stringify(c).slice(0, 300);
  }
  // Página HTML = quem respondeu foi o proxy do Square, não a Evolution (app fora do ar). Grava só o
  // <title> ("Square Cloud | Timeout Error"), não 300 caracteres de <!doctype html>.
  if (/^\s*</.test(textoCru || '')) {
    const titulo = /<title>([^<]*)<\/title>/i.exec(textoCru)?.[1]?.trim();
    return `${titulo || 'página HTML'} (o servidor do WhatsApp não respondeu)`;
  }
  return (textoCru || '').trim().slice(0, 300) || 'sem corpo';
}
// TEMPO MÁXIMO por chamada. Sem limite, o fetch esperava o que o servidor quisesse: com o Square fora
// do ar (29/10) a função podia ser cortada ANTES de gravar a falha, e a bolha ficava "Sem confirmação"
// sem linha no banco. Checagens (estado/onWhatsApp) são fail-open: cortar cedo só pula a checagem.
// Texto/contato: 15s (pior caso 5s checagem + 15s envio, abaixo dos 25s em que a tela desiste).
// Mídia: 45s (a Evolution baixa/sobe o arquivo).
const T_CHECAGEM = 5_000, T_ENVIO = 15_000, T_MIDIA = 45_000;
async function call(path: string, method: string, body: unknown, limiteMs: number) {
  let res: Response, text: string;
  try {
    res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', 'apikey': KEY }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(limiteMs) });
    text = await res.text();
  } catch (e) {
    const nome = (e as { name?: string })?.name;
    if (nome === 'TimeoutError' || nome === 'AbortError') throw new Error(`TIMEOUT ${limiteMs / 1000}s: o servidor do WhatsApp não respondeu`);
    throw e;
  }
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${detalheErro(data, text)}`); // status preservado (não mascarar em 502 genérico)
  }
  return data;
}
export const evolution = {
  connect: (instanceName: string) => call(`/instance/connect/${instanceName}`, 'GET', undefined, T_CHECAGEM),
  connectionState: (instanceName: string) => call(`/instance/connectionState/${instanceName}`, 'GET', undefined, T_CHECAGEM) as Promise<{ instance?: { state?: string } }>,
  whatsappNumbers: (instanceName: string, numbers: string[]) => call(`/chat/whatsappNumbers/${instanceName}`, 'POST', { numbers }, T_CHECAGEM) as Promise<Array<{ exists?: boolean; jid?: string; number?: string }>>,
  // `quoted` (opcional) = resposta a uma mensagem específica (reply/citação). Shape Evolution v2:
  // { key: { id, remoteJid, fromMe }, message: { conversation } }. Quando ausente, envio normal.
  sendText: (instanceName: string, number: string, text: string, quoted?: unknown) =>
    call(`/message/sendText/${instanceName}`, 'POST', { number, text, ...(quoted ? { quoted } : {}) }, T_ENVIO) as Promise<{ key?: { id?: string } }>,
  // Envio de mídia (imagem/vídeo/documento). `media` é uma URL temporária (a Evolution baixa o arquivo).
  sendMedia: (instanceName: string, number: string, mediatype: string, mimetype: string, media: string, fileName: string, caption?: string, quoted?: unknown) =>
    call(`/message/sendMedia/${instanceName}`, 'POST', { number, mediatype, mimetype, media, fileName, ...(caption ? { caption } : {}), ...(quoted ? { quoted } : {}) }, T_MIDIA) as Promise<{ key?: { id?: string } }>,
  // Áudio como nota de voz (PTT). `encoding:true` faz a Evolution converter p/ ogg/opus (formato do WhatsApp).
  // `audio` é uma URL temporária (a Evolution baixa o arquivo).
  sendWhatsAppAudio: (instanceName: string, number: string, audio: string, quoted?: unknown) =>
    call(`/message/sendWhatsAppAudio/${instanceName}`, 'POST', { number, audio, encoding: true, ...(quoted ? { quoted } : {}) }, T_MIDIA) as Promise<{ key?: { id?: string } }>,
  // Cartão de contato (vCard). Shape Evolution v2: contact[] com fullName/wuid (dígitos)/phoneNumber (+E164).
  sendContact: (instanceName: string, number: string, contact: Array<{ fullName: string; wuid: string; phoneNumber: string }>) =>
    call(`/message/sendContact/${instanceName}`, 'POST', { number, contact }, T_ENVIO) as Promise<{ key?: { id?: string } }>,
  // REAÇÃO (26/11): emoji numa mensagem. reaction '' tira a reação. key = a mensagem reagida (id externo + de quem é).
  sendReaction: (instanceName: string, remoteJid: string, fromMe: boolean, id: string, reaction: string) =>
    call(`/message/sendReaction/${instanceName}`, 'POST', { key: { remoteJid, fromMe, id }, reaction }, T_ENVIO) as Promise<{ key?: { id?: string } }>,
};
