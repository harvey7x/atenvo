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
/** Template aprovado da Cloud API. `variaveis` preenche {{1}},{{2}}… do BODY, na ordem. */
export interface TemplateEnvio { nome: string; idioma: string; variaveis?: string[]; headerImagem?: string | null }
/** Mensagem interativa (Cloud API): botões de resposta e lista. Só existe na API oficial. */
export interface BotaoReply { id: string; titulo: string }
export interface ItemLista { id: string; titulo: string; descricao?: string }
export interface SecaoLista { titulo?: string; itens: ItemLista[] }
export interface Enviador {
  ehCloud: boolean;
  sendText(numero: string, texto: string, quoted?: unknown): Promise<Enviado>;
  sendMedia(numero: string, mediatype: string, mimetype: string, media: string, fileName?: string, caption?: string, quoted?: unknown): Promise<Enviado>;
  sendWhatsAppAudio(numero: string, audio: string, quoted?: unknown, mime?: string): Promise<Enviado>;
  /** Fora da janela de 24h a Meta SÓ aceita template. Na Evolution isso não existe — lá qualquer
   *  texto sai a qualquer hora — então o adaptador Evolution lança em vez de fingir que enviou. */
  sendTemplate(numero: string, tpl: TemplateEnvio): Promise<Enviado>;
  /** Botões de resposta (máx 3) e lista interativa — SÓ Cloud API. O adaptador Evolution lança. */
  sendBotoes(numero: string, corpo: string, botoes: BotaoReply[], quoted?: unknown): Promise<Enviado>;
  sendLista(numero: string, corpo: string, tituloBotao: string, secoes: SecaoLista[], quoted?: unknown): Promise<Enviado>;
  /** Cartão de contato (vCard) — SÓ Cloud API (mensagem `contacts`). O adaptador Evolution lança. */
  sendContato(numero: string, nome: string, telefone: string, quoted?: unknown): Promise<Enviado>;
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

/** Detecta o container REAL de áudio pelos magic bytes — NÃO confia no rótulo do navegador (o
 *  Safari rotula a gravação como audio/mp4, o Chrome varia). Decodifica só o começo (48 bytes
 *  bastam). Devolve token normalizado ('ogg'|'webm'|'m4a'|'mp3'|'wav') ou '' se não reconhecer. */
function sniffAudioContainer(b64: string): string {
  let head: Uint8Array;
  try {
    const bin = atob(b64.slice(0, 64));                       // 64 chars b64 (múltiplo de 4) => 48 bytes
    head = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch { return ''; }
  if (head.length < 4) return '';
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return 'webm'; // EBML (webm/mkv)
  const asc = String.fromCharCode(...head.slice(0, 16));
  if (asc.startsWith('OggS')) return 'ogg';                   // Ogg (opus) => a Cloud renderiza como NOTA DE VOZ
  if (asc.slice(4, 8) === 'ftyp') return 'm4a';               // ISO-BMFF (mp4/m4a — Safari/Mac)
  if (asc.startsWith('RIFF')) return 'wav';
  if (asc.startsWith('ID3')) return 'mp3';
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'mp3'; // frame sync MPEG (mp3 sem ID3)
  return '';
}

const AUDIO_FMT: Record<string, { mime: string; ext: string }> = {
  ogg:  { mime: 'audio/ogg',  ext: 'ogg' },
  webm: { mime: 'audio/webm', ext: 'webm' },
  m4a:  { mime: 'audio/mp4',  ext: 'm4a' },
  mp3:  { mime: 'audio/mpeg', ext: 'mp3' },
  aac:  { mime: 'audio/aac',  ext: 'aac' },
  wav:  { mime: 'audio/wav',  ext: 'wav' },
};

/** Fallback quando não dá pra sniffar (fonte é URL) ou o container não foi reconhecido:
 *  usa o rótulo declarado. Sem pista alguma, assume ogg (gravação típica do Chrome). */
function fmtDoRotulo(mime: string): string {
  const m = (mime || '').toLowerCase();
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('aac')) return 'aac';
  if (m.includes('wav')) return 'wav';
  return 'ogg';
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
    async sendWhatsAppAudio(numero, audio, quoted, mime) {
      guard();
      // FORMATO POR MAGIC BYTES: escolhemos o formato de upload pelos BYTES REAIS, não pelo rótulo do
      // navegador (que mente — Safari grava e rotula como audio/mp4). ogg/opus => a Cloud renderiza
      // NOTA DE VOZ (PTT); demais containers sobem com o mime real e vão como ÁUDIO COMUM.
      // ATENÇÃO: a Cloud NÃO transcodifica. Um mp4 do Safari continua mp4 e pode ser recusado no
      // processamento da Meta ("Media upload error" ASSÍNCRONO, via webhook) — a etiqueta certa evita
      // rótulo trocado, mas não conserta um codec que a Meta não sabe processar. Isso é transcode.
      const ehUrl = /^https?:\/\//i.test(audio);
      const fmt = (!ehUrl && sniffAudioContainer(audio)) || fmtDoRotulo(mime || '');
      const { mime: mimeReal, ext } = AUDIO_FMT[fmt] ?? AUDIO_FMT.ogg;
      const nome = fmt === 'ogg' ? 'voz.ogg' : `audio.${ext}`;   // ogg mantém o nome que já vinha entregando
      const fonte = ehUrl ? { link: audio } : { id: await uploadMedia(phoneNumberId, audio, mimeReal, nome) };
      return comoEvolution(await graph(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: numero,
        type: 'audio', audio: fonte, ...contextoDe(quoted),
      }));
    },
    async sendTemplate(numero, tpl) {
      guard();
      // O `components` só vai quando há variável: template sem {{n}} recebendo um BODY com
      // parameters vazio é recusado pela Meta (132000, "number of parameters does not match").
      const params = (tpl.variaveis ?? []).map((v) => ({ type: 'text', text: String(v ?? '') }));
      const components: Array<Record<string, unknown>> = [];
      // Template com cabeçalho de IMAGEM exige o componente `header` no envio; sem ele a Meta
      // recusa com #132012 ("expected IMAGE, received UNKNOWN"). Só entra quando há imagem.
      if (tpl.headerImagem) components.push({ type: 'header', parameters: [{ type: 'image', image: { link: tpl.headerImagem } }] });
      if (params.length) components.push({ type: 'body', parameters: params });
      return comoEvolution(await graph(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: numero,
        type: 'template',
        template: {
          name: tpl.nome,
          language: { code: tpl.idioma || 'pt_BR' },
          ...(components.length ? { components } : {}),
        },
      }));
    },
    async sendBotoes(numero, corpo, botoes, quoted) {
      guard();
      // Limites da Meta: máx 3 botões, título <=20 chars, id <=256. Cortamos para não ser recusado.
      return comoEvolution(await graph(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: numero,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: corpo },
          action: { buttons: botoes.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: String(b.id).slice(0, 256), title: b.titulo.slice(0, 20) } })) },
        },
        ...contextoDe(quoted),
      }));
    },
    async sendLista(numero, corpo, tituloBotao, secoes, quoted) {
      guard();
      // Limites da Meta: botão <=20; título de seção <=24; linha título <=24, descrição <=72; 10 linhas.
      return comoEvolution(await graph(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: numero,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: corpo },
          action: {
            button: tituloBotao.slice(0, 20),
            sections: secoes.map((s) => ({
              ...(s.titulo ? { title: s.titulo.slice(0, 24) } : {}),
              rows: s.itens.slice(0, 10).map((it) => ({ id: String(it.id).slice(0, 200), title: it.titulo.slice(0, 24), ...(it.descricao ? { description: it.descricao.slice(0, 72) } : {}) })),
            })),
          },
        },
        ...contextoDe(quoted),
      }));
    },
    async sendContato(numero, nome, telefone, quoted) {
      guard();
      // Cartão de contato (vCard) via mensagem `contacts`. `phone` = texto exibido (E.164 legível).
      // `wa_id` = só dígitos, com país 55, SEM + e sem espaços — é o que faz o WhatsApp reconhecer a
      // conta e mostrar "Conversar" (sem ele, aparece "Convidar para o WhatsApp").
      const waId = telefone.replace(/\D/g, '');
      return comoEvolution(await graph(`${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp', recipient_type: 'individual', to: numero,
        type: 'contacts',
        contacts: [{ name: { formatted_name: nome, first_name: nome }, phones: [{ phone: telefone, type: 'WORK', wa_id: waId }] }],
        ...contextoDe(quoted),
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
    sendWhatsAppAudio: (numero, audio, quoted, _mime) => evolution.sendWhatsAppAudio(instancia, numero, audio, quoted),   // Evolution transcodifica (encoding:true) — ignora o mime
    // Não existe template no Baileys. Lançar é melhor que enviar o corpo como texto solto: o
    // template tem cara de mensagem aprovada e mandá-lo cru mudaria o que o cliente lê.
    sendTemplate: () => { throw new Error('Template só existe na API oficial (Cloud API).'); },
    // Botões/lista interativos são recursos da Cloud API — o Baileys não tem equivalente fiel.
    sendBotoes: () => { throw new Error('Botões interativos só existem na API oficial (Cloud API).'); },
    sendLista: () => { throw new Error('Lista interativa só existe na API oficial (Cloud API).'); },
    sendContato: () => { throw new Error('Cartão de contato só existe na API oficial (Cloud API).'); },
  };
}

/** Escolhe o transporte pelo canal. Quem chama não precisa saber qual é. */
export function enviadorDe(canal: CanalEnvio): Enviador {
  return ehCloudApi(canal)
    ? enviadorCloud(String(canal.cloud_phone_number_id))
    : enviadorEvolution(String(canal.instancia_externa));
}
