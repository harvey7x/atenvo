// cloud-webhook — WhatsApp Cloud API (Meta). PÚBLICO (verify_jwt=false).
//
// GET  : verificação (hub.mode / hub.verify_token / hub.challenge) com META_WA_VERIFY_TOKEN.
// POST : valida X-Hub-Signature-256 (HMAC do corpo CRU com META_WA_APP_SECRET) -> roteia pelo
//        phone_number_id -> separa `messages` (inbound) de `statuses` (entrega/leitura).
//
// SECRETS SEPARADOS de propósito: META_WA_* e NÃO META_* — o meta-webhook (Messenger/anúncios)
// está NO AR e usa META_APP_SECRET/META_VERIFY_TOKEN. Nome compartilhado criaria chance de
// derrubar o webhook que traz os leads. Defensivo ganha.
//
// v2 (Blocos 1 e 4 do descongelamento):
//  * MÍDIA: media_id -> GET /{media_id} (Bearer) -> url temporária -> download (Bearer) -> bucket
//    privado, MESMO caminho da Evolution. Áudio inbound dentro do teto vira base64 p/ transcrição.
//  * BOT: dispatch fire-and-forget ao bot-runner com dry_run:true FIXO, na MESMA ordem do
//    evolution-webhook (bot_remarketing_inbound AWAITED antes do dispatch). Toggle CLOUD_BOT_DISPATCH.
//  * inboundNovo por .select() no upsert — sem isso a reentrega da Meta incrementava não-lidas de novo.
//
// INVARIANTES:
//  * `statuses` NUNCA vira mensagem, NUNCA cria contato/conversa/lead e NUNCA chama o bot.
//  * idempotência por `wamid` em mensagens.id_externo (unique uq_mensagens_id_externo).
//  * contato resolvido pela CHAVE CANÔNICA (Bloco 0) — Evolution e Meta caem no MESMO contato.
//  * phone_number_id desconhecido => 200 + evento ignorado. NUNCA 4xx: a Meta reenfileira e,
//    com falha repetida, DESATIVA a assinatura do webhook.
//  * sempre 200 no fim; erro de persistência vira evento 'erro' reprocessável, não 500.
//  * mídia que não baixa NUNCA descarta a mensagem: vira status_midia='falhou' + midia_pendente.
//  * todo inbound registra o relógio da janela em canal_janela (canal, contato) — a janela de 24h
//    é contada contra o NÚMERO REMETENTE, não contra a conversa (que é única por contato).
//  * change.field='user_preferences' (stop/resume de marketing) vira wa_optout — NÃO é mensagem.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { enviadorDe } from '../evolution-send/transporte.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
// Toggle do dispatch ao bot. O CÓDIGO existe (v2); o default 'nao' mantém o canal oficial mudo até
// o dono ligar conscientemente. Mesmo ligado, o dry_run abaixo decide se o runner simula ou envia.
const BOT_DISPATCH = (Deno.env.get('CLOUD_BOT_DISPATCH') ?? 'nao').toLowerCase() === 'sim';
// dry_run do dispatch ao bot, LIDO DE FLAG (liga/desliga o envio real SEM redeploy). Default SEGURO
// = simular: só o valor explícito 'nao' manda de verdade; unset ou qualquer outra coisa mantém a
// simulação. Duas travas independentes: BOT_DISPATCH decide se CHAMA o bot; BOT_DRY_RUN decide se
// o bot ENVIA. Para o cliente receber, as duas + os gates do runner (master/canal/humano) têm que ceder.
const BOT_DRY_RUN = (Deno.env.get('CLOUD_BOT_DRY_RUN') ?? 'sim').toLowerCase() !== 'nao';
const FUNCTIONS_BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '') + '/functions/v1';

// ---- RESPOSTA A DISPARO (fluxo à parte do atendimento inicial) ----
// Quem RECEBEU o disparo de remarketing e responde (≠ SAIR) NÃO entra no botoes_v1: recebe uma
// mensagem de transição + o vCard do chip HUMANO (5329, sem API) e o alvo vira 'respondido'.
// INERTE por default (DISPARO_RESP_ATIVO != 'sim' → o responder cai no atendimento normal), para
// que só o deploy nunca mude o comportamento do disparo — o dono liga conscientemente por env, sem
// redeploy. Texto/nome/número do cartão são afináveis por env. Cloud-only (o disparo é sempre Cloud API).
const DISPARO_RESP_ATIVO = (Deno.env.get('DISPARO_RESP_ATIVO') ?? 'nao').toLowerCase() === 'sim';
const DISPARO_RESP_TEXTO = Deno.env.get('DISPARO_RESP_TEXTO') ??
  'Que bom que você respondeu! 🙌\n\nPara dar continuidade ao seu atendimento, é só falar com a gente no contato abaixo 👇\n\nToque no cartão e envie uma mensagem: um dos nossos *especialistas de continuidade* vai te atender pessoalmente por lá e acompanhar o seu caso do começo ao fim.\n\nJá estamos te esperando! 💚';
const DISPARO_VCARD_NOME = Deno.env.get('DISPARO_VCARD_NOME') ?? 'CAF Assessoria';
const DISPARO_VCARD_NUMERO = (Deno.env.get('DISPARO_VCARD_NUMERO') ?? '555191035329').replace(/\D/g, '');
// Recência: só alvos enviados nos últimos N dias re-roteiam — evita que um alvo antigo (campanha de
// meses atrás, nunca respondido) sequestre um lead NOVO do anúncio que por acaso é o mesmo contato.
const DISPARO_RESP_JANELA_DIAS = Number(Deno.env.get('DISPARO_RESP_JANELA_DIAS') ?? '14');

// ---- mídia: mesmos tetos da Evolution (envs compartilhadas de propósito: um número só para afinar) ----
const GRAPH_V = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
// MESMO token do envio (evolution-send/transporte.ts). Só em secret: nunca no banco, nunca logado.
const META_TOKEN = () => Deno.env.get('META_WHATSAPP_TOKEN') ?? '';
const MAX_MEDIA = 20 * 1024 * 1024;
const MAX_AUDIO_TRANSC = Number(Deno.env.get('MAX_AUDIO_TRANSC')) || 8 * 1024 * 1024;
// MAX_AUDIO_SEG existe na Evolution porque o Baileys informa a duração. A Cloud API NÃO manda
// `seconds` em audio — aqui o corte é só por tamanho, exatamente como o ramo `seconds == null`
// da Evolution já se comporta hoje. Não é regra nova; é a mesma regra com um dado a menos.

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0;
}
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Espelho de digits() do evolution-webhook: corta em ':'/'@' ANTES de tirar não-dígitos.
// Sem esse corte, um identificador com sufixo viraria um número errado silenciosamente.
function digits(v?: string | null): string | null {
  if (!v) return null; return v.replace(/[:@].*/, '').replace(/[^0-9]/g, '') || null;
}
// LGPD: nunca persistimos o número cru no log de eventos.
function maskNum(v?: string | null): string | null {
  const d = digits(v); if (!d) return null;
  return d.length >= 8 ? `${d.slice(0, 4)}****${d.slice(-4)}` : '****';
}

type Ev = Record<string, any>;

/* ===================== BLOCO 4 — MÍDIA DA CLOUD API ===================== */

// Espelho de extFromMime/extFor do evolution-webhook. Duplicado de propósito: Edge Functions não
// compartilham módulo entre si sem acoplar deploys, e um webhook não pode quebrar por causa do outro.
function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('ogg')) return 'ogg'; if (m.includes('mpeg')) return 'mp3'; if (m.includes('mp4') || m.includes('m4a')) return 'm4a';
  if (m.includes('aac')) return 'aac'; if (m.includes('wav')) return 'wav'; if (m.includes('webm')) return 'webm'; return 'ogg';
}
function extFor(mime: string, nome: string | null): string {
  if (nome && /\.[a-z0-9]{1,8}$/i.test(nome)) return (nome.split('.').pop() ?? '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const m = (mime || '').toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'; if (m.includes('png')) return 'png'; if (m.includes('webp')) return 'webp'; if (m.includes('gif')) return 'gif';
  if (m.includes('mp4')) return 'mp4'; if (m.includes('quicktime') || m.includes('mov')) return 'mov'; if (m.includes('3gpp')) return '3gp';
  if (m.includes('pdf')) return 'pdf'; if (m.includes('wordprocessingml')) return 'docx'; if (m.includes('msword')) return 'doc';
  if (m.includes('spreadsheetml')) return 'xlsx'; if (m.includes('ms-excel')) return 'xls'; if (m.includes('zip')) return 'zip'; if (m.includes('text')) return 'txt';
  if (m.includes('audio')) return extFromMime(m);
  return 'bin';
}
function sanitizeNome(n: unknown): string | null {
  const s = typeof n === 'string' ? n.trim() : '';
  if (!s) return null;
  return s.replace(/[/\\<>]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || null; // mantem acento/emoji; tira so / \ < >
}
/** bytes -> base64 em blocos. String.fromCharCode(...bytes) estoura a pilha em arquivo de MBs. */
function paraBase64(bytes: Uint8Array): string {
  let bin = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(bin);
}
/** O timeout precisa cobrir a LEITURA DO CORPO, não só os headers: um download que trava no meio
 *  do arquivo devolve a Response na hora e só prende no arrayBuffer(). Por isso quem lê o corpo é
 *  esta função — e o clearTimeout só acontece depois. */
async function graphGet(path: string, timeoutMs: number): Promise<{ ok: boolean; status: number; texto?: string; bytes?: Uint8Array; contentType: string }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(/^https?:\/\//i.test(path) ? path : `https://graph.facebook.com/${GRAPH_V()}/${path}`, {
      headers: { Authorization: `Bearer ${META_TOKEN()}` }, signal: ctrl.signal,
    });
    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!res.ok) return { ok: false, status: res.status, contentType };
    // JSON (metadados) vira texto; binário (o arquivo) vira bytes. Os dois dentro do mesmo timeout.
    if (contentType.includes('json')) return { ok: true, status: res.status, texto: await res.text(), contentType };
    return { ok: true, status: res.status, bytes: new Uint8Array(await res.arrayBuffer()), contentType };
  } finally { clearTimeout(t); }
}
/** media_id -> metadados (url temporária) -> download. A URL da Meta expira em ~5 min E exige o
 *  MESMO Bearer para baixar — por isso ela nunca é persistida; o que guardamos é o media_id. */
async function baixarMidiaCloud(mediaId: string): Promise<{ bytes: Uint8Array; mime: string }> {
  if (!META_TOKEN()) throw new Error('token_meta_ausente');
  const metaRes = await graphGet(mediaId, 15000);
  if (!metaRes.ok) throw new Error(`meta HTTP ${metaRes.status}`);
  let info: { url?: string; mime_type?: string; file_size?: number } = {};
  try { info = JSON.parse(metaRes.texto ?? '{}'); } catch { throw new Error('resposta_invalida'); }
  if (!info.url) throw new Error('sem_url');
  // corta antes de baixar quando a Meta já informa o tamanho (evita puxar 100MB para descartar).
  if (typeof info.file_size === 'number' && info.file_size > MAX_MEDIA) throw new Error('arquivo_excede_limite');
  const binRes = await graphGet(info.url, 45000);
  if (!binRes.ok) throw new Error(`download HTTP ${binRes.status}`);
  const bytes = binRes.bytes ?? new Uint8Array(0);
  if (bytes.length === 0) throw new Error('midia_vazia');
  if (bytes.length > MAX_MEDIA) throw new Error('arquivo_excede_limite');
  const mime = (binRes.contentType || info.mime_type || '').split(';')[0].trim();
  // o base64 NÃO é calculado aqui: só o áudio dentro do teto de transcrição precisa dele, e
  // converter um vídeo de 20 MB só para descartar são ~27 MB de string à toa na função.
  return { bytes, mime };
}

const TIPO_MIDIA: Record<string, string> = {
  image: 'imagem', audio: 'audio', video: 'video', document: 'documento', sticker: 'imagem',
};
// 'lida' não volta para 'entregue' se um webhook chegar fora de ordem (a Meta não garante ordem).
const RANK: Record<string, number> = { pendente: 0, enviada: 1, entregue: 2, lida: 3, falhou: 4 };
const STATUS_MAP: Record<string, string> = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' };

/** Texto exibível + tipo, a partir da mensagem da Cloud API. */
function conteudoDe(m: Ev): { tipo: string; texto: string | null; meta: Record<string, unknown> } {
  const t = String(m.type ?? '');
  if (t === 'text') return { tipo: 'texto', texto: m.text?.body ?? null, meta: {} };
  if (t in TIPO_MIDIA) {
    const mid = m[t] ?? {};
    return {
      tipo: TIPO_MIDIA[t],
      texto: mid.caption ?? null,
      // Bloco 4 baixa a mídia (GET /{media_id} -> url -> download com Bearer). Aqui só registramos
      // o ponteiro: a mensagem aparece na conversa na hora, com o anexo pendente.
      meta: { media_id: mid.id ?? null, mime: mid.mime_type ?? null, nome: mid.filename ?? null,
              sha256: mid.sha256 ?? null, voz: t === 'audio' ? !!mid.voice : undefined,
              midia_pendente: true, status_midia: 'pendente', via: 'cloud_webhook' },
    };
  }
  // Botão/lista: o cliente respondeu clicando — o texto do botão É a resposta dele.
  if (t === 'button') return { tipo: 'texto', texto: m.button?.text ?? null, meta: { interacao: 'button' } };
  if (t === 'interactive') {
    const i = m.interactive ?? {};
    return { tipo: 'texto', texto: i.button_reply?.title ?? i.list_reply?.title ?? null,
             meta: { interacao: i.type ?? 'interactive', payload_id: i.button_reply?.id ?? i.list_reply?.id ?? null } };
  }
  if (t === 'location') {
    const l = m.location ?? {};
    return { tipo: 'texto', texto: `📍 ${l.name ?? 'Localização'}${l.address ? ` — ${l.address}` : ''}`.trim(),
             meta: { localizacao: { lat: l.latitude, lng: l.longitude } } };
  }
  if (t === 'reaction') return { tipo: 'texto', texto: m.reaction?.emoji ?? null, meta: { reacao_a: m.reaction?.message_id ?? null } };
  return { tipo: 'texto', texto: null, meta: { tipo_original: t } };
}

/** UM atendimento ativo por CONTATO — mesma regra do evolution-webhook v27 e do meta-webhook.
 *  Sem isso o unique index conversas_uma_ativa_por_contato faria o insert FALHAR e a mensagem
 *  do cliente se perderia. canal_origem_id preserva a aquisição. */
async function achaOuCriaConversa(db: any, org: string, contatoId: string, canalId: string): Promise<string> {
  const agora = new Date().toISOString();
  const { data: conv } = await db.from('conversas').select('id')
    .eq('organizacao_id', org).eq('contato_id', contatoId)
    .neq('status', 'fechada')
    .order('arquivada_em', { ascending: true, nullsFirst: true })
    .order('ultima_interacao_em', { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();
  if (conv) return conv.id as string;
  const { data: nova, error } = await db.from('conversas').insert({
    organizacao_id: org, contato_id: contatoId, canal_id: canalId, canal_origem_id: canalId,
    status: 'aberta', ultimo_canal_id: canalId, ultimo_provider: 'meta_cloud',
    ultima_interacao_em: agora, ultima_msg_canal_em: agora,
  }).select('id').single();
  if (error || !nova) throw new Error(`conversas:${error?.code ?? ''}`);
  return nova.id as string;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ---- GET: verificação do webhook no painel da Meta ----
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const expected = (Deno.env.get('META_WA_VERIFY_TOKEN') ?? '').trim();
    const received = (url.searchParams.get('hub.verify_token') ?? '').trim();
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    if (mode === 'subscribe' && expected.length > 0 && received.length > 0 && safeEqual(received, expected)) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  // ---- POST: assinatura obrigatória sobre o corpo CRU ----
  const appSecret = Deno.env.get('META_WA_APP_SECRET') ?? '';
  const sigHeader = req.headers.get('x-hub-signature-256') ?? '';
  const raw = await req.text();
  if (appSecret.length === 0 || !sigHeader.startsWith('sha256=')) return new Response('Invalid signature', { status: 403 });
  const expectedSig = 'sha256=' + await hmacSha256Hex(appSecret, raw);
  if (!safeEqual(sigHeader, expectedSig)) return new Response('Invalid signature', { status: 403 });

  let body: Ev;
  try { body = JSON.parse(raw); } catch { return new Response('EVENT_RECEIVED', { status: 200 }); }
  if (body.object !== 'whatsapp_business_account') return new Response('EVENT_RECEIVED', { status: 200 });

  const db = admin();

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      // ---- user_preferences: a pessoa tocou em "parar promoções" DENTRO do WhatsApp ----
      // Chega antes de qualquer envio nosso, e é o único jeito de saber do 'resume'. Sem isto,
      // só descobriríamos pelo 131050 — depois de já ter tentado disparar.
      if (change.field === 'user_preferences') {
        const v = (change.value ?? {}) as Ev;
        const pnid = String(v.metadata?.phone_number_id ?? '');
        const { data: canalPref } = await db.from('canais').select('id, organizacao_id')
          .eq('cloud_phone_number_id', pnid).eq('transporte', 'cloud_api')
          .neq('status_integracao', 'removido').maybeSingle();
        if (!canalPref) continue;
        for (const pref of (v.user_preferences ?? []) as Ev[]) {
          const num = digits(pref.wa_id);
          if (!num || String(pref.category ?? '') !== 'marketing_messages') continue;
          // A TESTEMUNHA FICA FORA DO TRY. Antes o insert do evento estava dentro do mesmo
          // try/catch da RPC: se a persistência do opt-out estourasse, o registro do evento
          // era pulado junto e um "pare de me mandar promoções" da Meta sumia sem rastro —
          // a testemunha só testemunhava quando não precisava dela.
          let desfecho = 'processado';
          let erroPref: string | null = null;
          try {
            const { data: cid, error: eCid } = await db.rpc('wa_resolver_contato_por_numero', { p_org: canalPref.organizacao_id, p_numero: num });
            if (eCid) throw new Error(`resolver:${eCid.message ?? ''}`);
            if (!cid) {
              desfecho = 'ignorado';
              erroPref = 'contato_nao_encontrado';
            } else if (String(pref.value ?? '') === 'stop') {
              const { error } = await db.rpc('wa_optout_registrar', { p_contato: cid, p_canal: canalPref.id, p_motivo: 'user_preferences', p_detalhe: String(pref.detail ?? '').slice(0, 300) });
              if (error) throw new Error(`optout:${error.message ?? ''}`);
            } else if (String(pref.value ?? '') === 'resume') {
              const { error } = await db.rpc('wa_optout_remover', { p_contato: cid, p_canal: canalPref.id });
              if (error) throw new Error(`resume:${error.message ?? ''}`);
            } else {
              desfecho = 'ignorado';
              erroPref = `valor_desconhecido:${String(pref.value ?? '')}`;
            }
          } catch (e) {
            desfecho = 'erro';
            erroPref = String((e as Error)?.message ?? 'falha').slice(0, 200);
          }
          // fora do try: registra SEMPRE, inclusive (e principalmente) quando deu errado.
          try {
            await db.from('whatsapp_webhook_events').insert({
              organizacao_id: canalPref.organizacao_id, canal_id: canalPref.id,
              instance_name: `cloud:${pnid}`, event: 'cloud.user_preferences',
              remote_jid: maskNum(pref.wa_id), from_me: false,
              payload: { value: pref.value ?? null, category: pref.category ?? null },
              status_processamento: desfecho,
              ...(desfecho === 'erro' ? { erro: erroPref } : {}),
              ...(desfecho === 'ignorado' ? { ignorado_motivo: erroPref } : {}),
              processado_em: new Date().toISOString(),
            });
          } catch { /* último recurso: o webhook nunca cai por causa do log */ }
        }
        continue;
      }

      if (change.field !== 'messages') continue;
      const value = (change.value ?? {}) as Ev;
      const phoneNumberId = String(value.metadata?.phone_number_id ?? '');
      const inst = `cloud:${phoneNumberId}`;

      const { data: canal } = await db.from('canais')
        .select('id, organizacao_id, numero_conectado, ativo, status_integracao')
        .eq('cloud_phone_number_id', phoneNumberId).eq('transporte', 'cloud_api')
        // canal removido pelo painel não volta a ingerir sozinho (mesma decisão do evolution-webhook).
        .neq('status_integracao', 'removido').maybeSingle();

      // phone_number_id desconhecido: registra e segue com 200 (nunca 4xx para a Meta).
      if (!canal) {
        await db.from('whatsapp_webhook_events').insert({
          instance_name: inst, event: 'cloud.messages', status_processamento: 'ignorado',
          ignorado_motivo: 'phone_number_id_nao_mapeado', payload: { phone_number_id: phoneNumberId },
        });
        continue;
      }
      const orgId = canal.organizacao_id as string;

      // número conectado (display_phone_number) — preenche uma vez, sem sobrescrever.
      const display = digits(value.metadata?.display_phone_number);
      if (display && !canal.numero_conectado) {
        await db.from('canais').update({ numero_conectado: display }).eq('id', canal.id).is('numero_conectado', null);
      }

      // ================= STATUSES (entrega/leitura) =================
      // Ramo TOTALMENTE separado: só faz UPDATE em mensagens já existentes. Não cria nada.
      for (const st of (value.statuses ?? []) as Ev[]) {
        const wamid = String(st.id ?? '');
        const novo = STATUS_MAP[String(st.status ?? '')];
        if (!wamid || !novo) continue;
        const { data: track } = await db.from('whatsapp_webhook_events').insert({
          organizacao_id: orgId, canal_id: canal.id, instance_name: inst, event: 'cloud.status',
          provider_message_id: wamid, remote_jid: maskNum(st.recipient_id), from_me: true,
          payload: { status: st.status, errors: st.errors ? st.errors.map((e: Ev) => e.code) : null },
          status_processamento: 'recebido',
        }).select('id').single();
        try {
          const { data: msg } = await db.from('mensagens').select('id, status').eq('id_externo', wamid).maybeSingle();
          if (!msg) {
            await db.from('whatsapp_webhook_events').update({ status_processamento: 'ignorado', ignorado_motivo: 'mensagem_desconhecida', processado_em: new Date().toISOString() }).eq('id', track?.id);
            continue;
          }
          // nunca rebaixa (webhooks da Meta podem chegar fora de ordem)
          if ((RANK[novo] ?? 0) > (RANK[String(msg.status)] ?? 0)) {
            const patch: Record<string, unknown> = { status: novo };
            if (novo === 'entregue') patch.entregue_em = new Date().toISOString();
            if (novo === 'lida') patch.lida_em = new Date().toISOString();
            if (novo === 'falhou') patch.erro_envio = (st.errors?.[0]?.title ?? st.errors?.[0]?.message ?? 'falha_cloud_api').toString().slice(0, 300);
            await db.from('mensagens').update(patch).eq('id', msg.id);
          }
          await db.from('whatsapp_webhook_events').update({ status_processamento: 'processado', processado_em: new Date().toISOString() }).eq('id', track?.id);
        } catch (_e) {
          await db.from('whatsapp_webhook_events').update({ status_processamento: 'erro', erro: 'falha_status' }).eq('id', track?.id);
        }
      }

      // ================= MESSAGES (inbound do cliente) =================
      for (const m of (value.messages ?? []) as Ev[]) {
        const wamid = String(m.id ?? '');
        const waId = String(m.from ?? '');
        const numero = digits(waId);
        const { data: track } = await db.from('whatsapp_webhook_events').insert({
          organizacao_id: orgId, canal_id: canal.id, instance_name: inst, event: 'cloud.message',
          provider_message_id: wamid, remote_jid: maskNum(waId), addressing_mode: 'pn', from_me: false,
          payload: { type: m.type ?? null, tem_referral: !!m.referral, tem_context: !!m.context },
          status_processamento: 'recebido',
        }).select('id').single();
        const fim = async (status: string, extra: Record<string, unknown> = {}) => {
          if (track?.id) await db.from('whatsapp_webhook_events').update({ status_processamento: status, processado_em: new Date().toISOString(), ...extra }).eq('id', track.id);
        };
        if (!wamid || !numero) { await fim('ignorado', { ignorado_motivo: 'sem_identificador' }); continue; }

        try {
          const agora = new Date().toISOString();
          const perfil = (value.contacts ?? []).find((c: Ev) => String(c.wa_id) === waId)?.profile?.name as string | undefined;
          const nome = (typeof perfil === 'string' && perfil.trim()) ? perfil.trim().slice(0, 120) : numero;

          // --- contato: CHAVE CANÔNICA (Bloco 0). É o que faz o mesmo cliente cair no MESMO
          //     contato vindo pela Evolution ou pela Meta, apesar do nono dígito. ---
          let contatoId: string | null = null;
          const { data: cid } = await db.rpc('wa_resolver_contato_por_numero', { p_org: orgId, p_numero: numero });
          if (cid) contatoId = cid as string;
          let contatoNovo = false;
          if (!contatoId) {
            const { data: novo, error: e1 } = await db.from('contatos').insert({
              nome, telefone: numero, origem: 'WhatsApp', organizacao_id: orgId,
              identidade_tipo: 'telefone', identidade_fonte: 'cloud_webhook', identidade_resolvida_em: agora,
            }).select('id').single();
            if (e1 || !novo) { await fim('erro', { erro: `contatos:${e1?.code ?? ''}` }); continue; }
            contatoId = novo.id as string; contatoNovo = true;
          }

          // --- identidade WhatsApp: só insere se o contato ainda não tiver NENHUMA.
          //     uq_identidade_valor é UNIQUE(tipo, valor_normalizado) GLOBAL: inserir a segunda
          //     forma do mesmo número em contato que já tem identidade quebraria/duplicaria. ---
          const { data: jaWa } = await db.from('contato_identidades').select('id').eq('contato_id', contatoId).eq('tipo', 'whatsapp').limit(1);
          if (!jaWa?.length) {
            await db.from('contato_identidades').insert({
              contato_id: contatoId, organizacao_id: orgId, tipo: 'whatsapp', provedor: 'cloud_api',
              valor: waId, valor_normalizado: numero, principal: true, metadados: { origem: 'cloud_webhook' },
            });
          }

          const conversaId = await achaOuCriaConversa(db, orgId, contatoId, canal.id as string);

          // --- mensagem (idempotente por wamid) ---
          const { tipo, texto, meta } = conteudoDe(m);

          // --- BLOCO 4: mídia. Baixa ANTES de gravar para a mensagem já nascer com o anexo.
          //     Falhar aqui NUNCA descarta a mensagem: ela entra pendente e é recuperável. ---
          const metaMidia: Record<string, unknown> = { ...meta };
          let audioB64: string | null = null;
          let audioMime: string | null = null;
          const mediaId = typeof meta.media_id === 'string' ? meta.media_id : null;
          if (mediaId) {
            try {
              const dl = await baixarMidiaCloud(mediaId);
              const mime = dl.mime || String(meta.mime ?? '') || 'application/octet-stream';
              const nome = sanitizeNome(meta.nome);
              const ext = extFor(mime, nome);
              const path = `${orgId}/wa-midia/${wamid.replace(/[^\w-]/g, '')}.${ext}`;
              const up = await db.storage.from('script-midia').upload(path, dl.bytes, { contentType: mime, upsert: true });
              if (up.error) throw new Error(up.error.message);
              metaMidia.mime = mime;
              metaMidia.tamanho = dl.bytes.length;
              metaMidia.nome = nome ?? `${tipo}.${ext}`;
              metaMidia.anexo_path = path;
              metaMidia.status_midia = 'disponivel';
              delete metaMidia.midia_pendente;               // baixou: some o marcador de pendência
              // áudio inbound dentro do teto → base64 p/ o bot-runner transcrever (mesmo Gemini).
              if (tipo === 'audio' && dl.bytes.length <= MAX_AUDIO_TRANSC) { audioB64 = paraBase64(dl.bytes); audioMime = mime; }
            } catch (e) {
              metaMidia.midia_pendente = true;
              metaMidia.status_midia = 'falhou';
              metaMidia.media_erro = String((e as Error).message ?? 'download').slice(0, 120);
            }
          }

          // Click-to-WhatsApp: o anúncio de origem vem aqui. É a aquisição do lead — preservar.
          const referral = m.referral ? {
            ctwa_clid: m.referral.ctwa_clid ?? null, source_id: m.referral.source_id ?? null,
            source_type: m.referral.source_type ?? null, source_url: m.referral.source_url ?? null,
            headline: m.referral.headline ?? null,
          } : null;
          // .select() para saber se o INSERT criou linha NOVA — com ignoreDuplicates a reentrega
          // devolve array vazio. Sem isso, reentrega da Meta incrementava não-lidas de novo e
          // redisparava o bot (mesma lição do evolution-webhook).
          //
          // O `error` TEM que ser lido: o supabase-js não lança em erro do PostgREST, devolve
          // { data: null, error }. Sem checar, uma FALHA de INSERT fica idêntica a uma REENTREGA
          // (ambas dão insArr sem linhas) — e aí a conversa subiria no inbox, o Kanban criaria um
          // LEAD NOVO e o evento seria marcado 'processado', tudo sem a mensagem existir. Como
          // sempre respondemos 200, a Meta não reentrega: a mensagem do cliente sumiria de vez.
          // É exatamente o P0 de 07/2026 (metadados NOT NULL / 23502) esperando para se repetir.
          const { data: insArr, error: msgErr } = await db.from('mensagens').upsert({
            conversa_id: conversaId, organizacao_id: orgId, direcao: 'entrada', tipo,
            conteudo: texto, status: 'entregue', origem: 'whatsapp_cloud', id_externo: wamid,
            recebida_em: agora,
            // metadados é NOT NULL — nunca passar null aqui (P0 de 07/2026).
            metadados: { ...metaMidia, wamid, wa_id: waId, phone_number_id: phoneNumberId,
                         ...(referral ? { referral } : {}), ...(m.context?.id ? { resposta_a_wamid: m.context.id } : {}) },
          }, { onConflict: 'id_externo', ignoreDuplicates: true }).select('id');
          if (msgErr) {
            // 'erro' deixa o evento VISÍVEL e reprocessável, em vez de 'processado' e perdido.
            // O continue vem antes de conversa/Kanban/dispatch: efeito colateral sem mensagem é pior que nada.
            await fim('erro', { erro: `mensagens:${msgErr.code ?? ''}:${(msgErr.message ?? '').slice(0, 180)}` });
            continue;
          }
          const inboundNovo = Array.isArray(insArr) && insArr.length > 0;
          const inboundMsgId = (insArr?.[0]?.id as string | undefined) ?? null;

          // --- conversa: sobe no inbox; só a PRIMEIRA entrega reabre arquivada e conta não lida ---
          if (inboundNovo) {
            const { data: cv } = await db.from('conversas').select('nao_lidas').eq('id', conversaId).maybeSingle();
            await db.from('conversas').update({
              ultima_interacao_em: agora, ultima_msg_canal_em: agora, ultimo_canal_id: canal.id,
              canal_id: canal.id, ultimo_numero: canal.numero_conectado ?? null,
              ultimo_provider: 'meta_cloud', arquivada_em: null,
              nao_lidas: ((cv?.nao_lidas as number) ?? 0) + 1,
            }).eq('id', conversaId);
          } else {
            await db.from('conversas').update({
              ultima_interacao_em: agora, ultima_msg_canal_em: agora, ultimo_canal_id: canal.id,
              canal_id: canal.id, ultimo_numero: canal.numero_conectado ?? null,
              ultimo_provider: 'meta_cloud',
            }).eq('id', conversaId);
          }

          // --- JANELA DE 24H: o relógio é do PAR (canal, contato). A Meta conta a janela contra o
          //     NÚMERO REMETENTE (131047), então quem abre janela aqui é ESTE canal, não a conversa
          //     (que é única por contato e pode ter nascido em outro número). Best-effort. ---
          try {
            await db.rpc('wa_janela_registrar', { p_canal: canal.id, p_contato: contatoId, p_quando: agora });
          } catch (_j) { /* janela nunca interrompe a ingestão */ }

          // --- Kanban: todo inbound garante LEAD NOVO (não só contato novo). RPC central resolve
          //     o funil principal, é idempotente e não reentra opp fechada. Best-effort. ---
          try {
            await db.rpc('garantir_oportunidade_lead_novo', { p_contato: contatoId, p_conversa: conversaId, p_canal: canal.id, p_origem: 'WhatsApp' });
          } catch (_k) { /* Kanban nunca interrompe a ingestão */ }

          // ---- OPT-OUT COMERCIAL: "SAIR"/frase explícita de descadastro grava wa_optout SEMPRE,
          //      mesmo sem cadência de remarketing (bot_remarketing_inbound retorna cedo sem fila e
          //      nunca persistia o pedido). Bloqueia só marketing/disparo — atendimento segue normal. ----
          if (inboundNovo && inboundMsgId && texto) {
            try { await db.rpc('wa_optout_inbound', { p_conversa: conversaId, p_texto: texto }); }
            catch { /* best-effort: opt-out nunca quebra a ingestão */ }
          }

          // ---- REMARKETING: se o lead estava numa cadência, re-roteia a opp ANTES do dispatch.
          //      Respondeu → opp volta pra LEAD NOVO (entrada), senão bot_pode_atuar bloquearia
          //      justamente o lead que respondeu; opt-out → PERDIDO e NÃO dispara o bot.
          //      AWAITED de propósito: o move de coluna precisa commitar antes do fire-and-forget.
          //      Best-effort — erro/timeout aqui nunca afeta a ingestão. Idêntico ao evolution-webhook. ----
          //      NÃO é gated por BOT_DISPATCH: "não quero mais receber" é vontade do CLIENTE, não
          //      função do bot. Se dependesse do toggle, um opt-out pelo número oficial seria
          //      ignorado em silêncio enquanto o remarketing seguisse mandando pela Evolution.
          let rmktDesfecho: string | null = null;
          if (inboundNovo && inboundMsgId) {
            try {
              const { data: r } = await db.rpc('bot_remarketing_inbound', { p_conversa: conversaId, p_texto: texto ?? '' });
              rmktDesfecho = (r as string) ?? null;
            } catch { /* best-effort: remarketing nunca quebra o webhook */ }
          }

          // ---- RESPOSTA A DISPARO: intercepta ANTES do bot. Quem RECEBEU o disparo e respondeu
          //      (≠ SAIR) sai do atendimento inicial e recebe transição + vCard do chip humano.
          //      O CLAIM atômico no alvo (enviado→respondido, com janela de recência) garante que
          //      isso rode uma vez só E distingue do lead novo do anúncio, que NUNCA teve alvo.
          //      INERTE por default (DISPARO_RESP_ATIVO). Best-effort — nunca quebra a ingestão. ----
          let ehRespostaDisparo = false;
          if (DISPARO_RESP_ATIVO && inboundNovo && inboundMsgId && rmktDesfecho !== 'optout' && (tipo === 'texto' || tipo === 'audio')) {
            try {
              // SAIR pode ter sido gravado agora mesmo (wa_optout_inbound acima): quem pediu descadastro NÃO é tratado.
              const { data: optNow } = await db.from('wa_optout').select('contato_id').eq('contato_id', contatoId).limit(1);
              if (!optNow?.length) {
                const desde = new Date(Date.now() - DISPARO_RESP_JANELA_DIAS * 864e5).toISOString();
                const { data: alvo } = await db.from('disparo_alvos')
                  .update({ status: 'respondido' })
                  .eq('contato_id', contatoId).eq('status', 'enviado').gte('enviado_em', desde)
                  .select('id').limit(1);
                ehRespostaDisparo = Array.isArray(alvo) && alvo.length > 0;
              }
            } catch { /* best-effort: detecção nunca quebra a ingestão */ }
          }

          // ---- ENTREGA DA RESPOSTA A DISPARO: transição + vCard do 5329 pelo MESMO 1390 (Cloud API).
          //      Fire-and-forget; cada envio é best-effort e grava outbox no padrão do bot (autor_id
          //      null, origem 'bot') pra o painel refletir o que o cliente viu. O 5329 é só o DESTINO
          //      do cartão (número humano) — nada é enviado programaticamente por ele. ----
          if (ehRespostaDisparo) {
            const entrega = (async () => {
              try {
                const tx = enviadorDe({ transporte: 'cloud_api', cloud_phone_number_id: phoneNumberId });
                try {
                  const r1 = await tx.sendText(numero!, DISPARO_RESP_TEXTO);
                  if (r1?.key?.id) {
                    await db.from('mensagens').insert({
                      organizacao_id: orgId, conversa_id: conversaId, direcao: 'saida', tipo: 'texto',
                      conteudo: DISPARO_RESP_TEXTO, autor_id: null, origem: 'bot', status: 'enviada', id_externo: r1.key.id,
                      metadados: { fluxo: 'resposta_disparo', etapa: 'transicao', transporte: 'cloud_api' },
                    });
                  }
                } catch { /* transição best-effort */ }
                try {
                  const r2 = await tx.sendContato(numero!, DISPARO_VCARD_NOME, DISPARO_VCARD_NUMERO);
                  if (r2?.key?.id) {
                    await db.from('mensagens').insert({
                      organizacao_id: orgId, conversa_id: conversaId, direcao: 'saida', tipo: 'texto',
                      conteudo: `📇 ${DISPARO_VCARD_NOME} (${DISPARO_VCARD_NUMERO})`, autor_id: null, origem: 'bot',
                      status: 'enviada', id_externo: r2.key.id,
                      metadados: { fluxo: 'resposta_disparo', etapa: 'vcard', contato_nome: DISPARO_VCARD_NOME, contato_telefone: DISPARO_VCARD_NUMERO, transporte: 'cloud_api' },
                    });
                  }
                } catch { /* vCard best-effort */ }
                await db.from('conversas').update({ ultima_interacao_em: new Date().toISOString() }).eq('id', conversaId);
              } catch { /* fire-and-forget: entrega nunca afeta o webhook */ }
            })();
            try { (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(entrega); } catch { /* sem waitUntil: segue fire-and-forget */ }
          }

          // ---- BLOCO 1: dispatch fire-and-forget ao bot-runner (só inbound NOVO, texto/áudio) ----
          // dry_run vem da flag BOT_DRY_RUN (default 'sim' = simula/loga, nada chega a cliente). Os
          // gates de negócio (master, bot_pode_atuar, humano/responsável, precisa_humano, idempotência,
          // lock, saúde do canal) são do RUNNER, que é agnóstico de transporte — por isso este bloco é
          // o mesmo da Evolution, palavra por palavra, trocando só a origem do áudio.
          // `!ehRespostaDisparo`: quem foi re-roteado ao chip humano NÃO cai no botoes_v1.
          if (BOT_DISPATCH && !ehRespostaDisparo && inboundNovo && inboundMsgId && rmktDesfecho !== 'optout' && (tipo === 'texto' || tipo === 'audio')) {
            const dispatch = (async () => {
              try {
                const { data: bs } = await db.from('webhook_config').select('secret').eq('chave', 'bot_runner').maybeSingle();
                if (!bs?.secret) return;
                await fetch(`${FUNCTIONS_BASE}/bot-runner`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-bot-secret': bs.secret as string },
                  body: JSON.stringify({
                    conversa_id: conversaId, inbound_msg_id: inboundMsgId, inbound_text: texto ?? '',
                    inbound_tipo: tipo, dry_run: BOT_DRY_RUN,
                    ...(audioB64 ? { inbound_audio_b64: audioB64, inbound_audio_mime: audioMime } : {}),
                  }),
                });
              } catch { /* fire-and-forget: erro do runner nunca afeta o webhook */ }
            })();
            try { (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(dispatch); } catch { /* sem waitUntil: segue fire-and-forget */ }
          }

          await fim('processado');
        } catch (_e) {
          await fim('erro', { erro: 'falha_persistencia' });
        }
      }
    }
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
});
