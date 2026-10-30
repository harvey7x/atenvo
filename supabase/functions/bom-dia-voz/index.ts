// bom-dia-voz — a voz do "Bom dia do Atenvo" (pedido do dono 30/10/2026: às 8h o sistema recebe o
// atendente pelo nome e uma IA com voz feminina fala os números do dia).
//
// Contrato: POST { texto, voz? } com o JWT do atendente → { url } (link assinado de 10 min de um WAV
// 24 kHz mono). O texto é montado na tela (src/v2/lib/bomDia.ts) com os números da RPC
// bom_dia_resumo; aqui só se fala.
//   · cache por texto: o mesmo texto no mesmo dia não é gerado de novo (abrir de novo, outra aba, a
//     pré-carga das 7h58) — bucket PRIVADO bom-dia-voz/<usuário>/<dia>/<hash>.wav, criado no 1º uso;
//   · teto de gerações por pessoa por dia: o crédito do Gemini é o MESMO da IA de vendas (ia-sdr) —
//     um laço na tela não pode esvaziar a IA que atende cliente;
//   · crédito esgotado ou erro → a tela fala com a voz do navegador (nunca fica muda);
//   · com a service key (sem usuário) gera na pasta "servico" — prévias e pré-geração no servidor.
import { encodeHex } from 'jsr:@std/encoding@1/hex';
import { decodeBase64 } from 'jsr:@std/encoding@1/base64';
import { decodeBase64Url } from 'jsr:@std/encoding@1/base64url';
import { corsHeaders, json } from './cors.ts';
import { adminClient, getUser } from './client.ts';

const BUCKET = 'bom-dia-voz';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODELO = Deno.env.get('BOM_DIA_MODELO') || 'gemini-3.8-flash-tts';
const VOZ_PADRAO = Deno.env.get('BOM_DIA_VOZ') || 'Despina'; // escolhida pelo dono 30/10
// timbres femininos do catálogo do Gemini — a tela só pede estes
const VOZES = new Set(['Kore', 'Despina', 'Sulafat', 'Aoede', 'Leda', 'Zephyr', 'Erinome', 'Callirrhoe',
  'Autonoe', 'Achernar', 'Gacrux', 'Pulcherrima', 'Vindemiatrix', 'Laomedeia']);
// dono 30/10: "voz boa, profissional, que fuja da forma IAzona" — locução de gente, nunca de robô.
// A doc do Gemini pede o estilo em inglês e SEM idade/gênero/sotaque (isso é da voz escolhida).
const ESTILO = 'natural and professional, like an experienced presenter giving a short morning update to a colleague; '
  + 'warm and confident, relaxed conversational pace, clear diction, never robotic, never exaggerated';
const TETO_DIA = 12;
const TETO_DIA_SERVICO = 40;
// o do administrador (Murilo, 30/10) é mais longo: campanhas, empates e vários casos críticos passam de 700
const MAX_CHARS = 1200;
const VALIDADE_URL_S = 600;

class SemCredito extends Error {}

/* papel do JWT (anon/authenticated/service_role). Só lê o payload: a assinatura já foi conferida
   pelo gateway — esta função roda com verify_jwt = true (padrão; NÃO pôr no config.toml como false). */
function papelDoToken(req: Request): string | null {
  const meio = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').split('.')[1];
  if (!meio) return null;
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(meio))).role ?? null;
  } catch {
    return null;
  }
}

/* o áudio vem em steps[].content[] {type:'audio', data} (Interactions API); a busca é genérica
   para não quebrar se o envelope mudar de lugar */
function acharAudio(j: unknown): string | null {
  let achado: string | null = null;
  const anda = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(anda); return; }
    const o = n as Record<string, unknown>;
    const mime = String(o.mime_type ?? o.mimeType ?? '');
    if (typeof o.data === 'string' && (o.type === 'audio' || mime.startsWith('audio/'))) achado = o.data;
    for (const v of Object.values(o)) anda(v);
  };
  anda(j);
  return achado;
}

const ehWav = (b: Uint8Array) => b.length > 44 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46; // "RIFF"

/* modelos antigos devolviam PCM cru (s16le 24 kHz mono): embrulha num WAV */
function wav(pcm: Uint8Array, taxa = 24000): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const v = new DataView(out.buffer);
  const s = (o: number, txt: string) => { for (let i = 0; i < txt.length; i++) out[o + i] = txt.charCodeAt(i); };
  s(0, 'RIFF'); v.setUint32(4, 36 + pcm.length, true); s(8, 'WAVE');
  s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, taxa, true); v.setUint32(28, taxa * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

async function falar(texto: string, voz: string): Promise<Uint8Array> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY ausente');
  const r = await fetch(`${API}/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      model: MODELO,
      input: [{
        type: 'user_input',
        content: [{ type: 'text', text: texto, annotations: [{ type: 'speech_metadata', style: ESTILO }] }],
      }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice: voz }] },
      store: false,
    }),
  });
  const t = await r.text();
  // crédito esgotado vem como 402 desde 24/09 (antes 429) — ver ia-sdr
  if ((r.status === 402 || r.status === 429) && /credit|prepayment|depleted/i.test(t)) throw new SemCredito();
  if (!r.ok) throw new Error(`${MODELO} HTTP ${r.status}: ${t.slice(0, 300)}`);
  const b64 = acharAudio(JSON.parse(t));
  if (!b64) throw new Error(`${MODELO}: resposta sem áudio`);
  const bytes = decodeBase64(b64);
  return ehWav(bytes) ? bytes : wav(bytes);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  try {
    const servico = papelDoToken(req) === 'service_role';
    const user = servico ? null : await getUser(req);
    if (!servico && !user) return json({ error: 'Sessão expirada. Entre de novo.' }, 401);

    const body = await req.json().catch(() => ({}));
    const texto = typeof body.texto === 'string' ? body.texto.replace(/\s+/g, ' ').trim() : '';
    if (texto.length < 8 || texto.length > MAX_CHARS) return json({ error: 'Texto inválido.' }, 400);
    const voz = typeof body.voz === 'string' && VOZES.has(body.voz) ? body.voz : VOZ_PADRAO;

    const admin = adminClient();
    if (user) {
      const { data: mem } = await admin.from('organizacao_usuarios').select('id')
        .eq('usuario_id', user.id).eq('status', 'ativo').limit(1);
      if (!mem?.length) return json({ error: 'Sem permissão.' }, 403);
    }

    const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const pasta = `${user ? user.id : 'servico'}/${dia}`;
    const hash = encodeHex(new Uint8Array(await crypto.subtle.digest('SHA-256',
      new TextEncoder().encode(`${MODELO}|${voz}|${ESTILO}|${texto}`)))).slice(0, 32);
    const caminho = `${pasta}/${hash}.wav`;
    const assinar = async () => {
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(caminho, VALIDADE_URL_S);
      return error ? null : data.signedUrl;
    };

    // a mesma listagem serve de cache e de teto do dia (bucket ainda inexistente = lista vazia)
    const { data: lista } = await admin.storage.from(BUCKET).list(pasta, { limit: 100 });
    if (lista?.some((f) => f.name === `${hash}.wav`)) {
      const url = await assinar();
      if (url) return json({ url, voz, cache: true });
    }
    if ((lista?.length ?? 0) >= (user ? TETO_DIA : TETO_DIA_SERVICO)) return json({ error: 'limite_dia' }, 429);

    let audio: Uint8Array;
    try {
      audio = await falar(texto, voz);
    } catch (e) {
      if (e instanceof SemCredito) return json({ error: 'sem_credito' }, 503);
      throw e;
    }
    let up = await admin.storage.from(BUCKET).upload(caminho, audio, { contentType: 'audio/wav', upsert: true });
    if (up.error && /not.?found/i.test(up.error.message)) {
      await admin.storage.createBucket(BUCKET, { public: false });
      up = await admin.storage.from(BUCKET).upload(caminho, audio, { contentType: 'audio/wav', upsert: true });
    }
    if (up.error) throw new Error(`guardar o áudio: ${up.error.message}`);
    const url = await assinar();
    if (!url) throw new Error('assinar o áudio');
    return json({ url, voz, cache: false });
  } catch (e) {
    console.error('bom-dia-voz', e);
    return json({ error: String((e as Error)?.message ?? e).slice(0, 300) }, 500);
  }
});
