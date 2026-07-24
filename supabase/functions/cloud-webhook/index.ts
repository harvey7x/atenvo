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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
// Toggle do dispatch ao bot. O CÓDIGO existe (v2); o default 'nao' mantém o canal oficial mudo até
// o dono ligar conscientemente. Mesmo ligado, o runner recebe dry_run:true — nada chega a cliente.
const BOT_DISPATCH = (Deno.env.get('CLOUD_BOT_DISPATCH') ?? 'nao').toLowerCase() === 'sim';
const FUNCTIONS_BASE = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '') + '/functions/v1';

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
  return s.replace(/[/\\]+/g, '_').replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || null; // anti path-traversal
}
/** bytes -> base64 em blocos. String.fromCharCode(...bytes) estoura a pilha em arquivo de MBs. */
function paraBase64(bytes: Uint8Array): string {
  let bin = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode(...bytes.subarray(i, i + passo));
  return btoa(bin);
}
async function graphGet(path: string, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(/^https?:\/\//i.test(path) ? path : `https://graph.facebook.com/${GRAPH_V()}/${path}`, {
      headers: { Authorization: `Bearer ${META_TOKEN()}` }, signal: ctrl.signal,
    });
  } finally { clearTimeout(t); }
}
/** media_id -> metadados (url temporária) -> download. A URL da Meta expira em ~5 min E exige o
 *  MESMO Bearer para baixar — por isso ela nunca é persistida; o que guardamos é o media_id. */
async function baixarMidiaCloud(mediaId: string): Promise<{ bytes: Uint8Array; mime: string; b64: string }> {
  if (!META_TOKEN()) throw new Error('token_meta_ausente');
  const metaRes = await graphGet(mediaId, 15000);
  if (!metaRes.ok) throw new Error(`meta HTTP ${metaRes.status}`);
  const info = await metaRes.json().catch(() => ({})) as { url?: string; mime_type?: string; file_size?: number };
  if (!info.url) throw new Error('sem_url');
  // corta antes de baixar quando a Meta já informa o tamanho (evita puxar 100MB para descartar).
  if (typeof info.file_size === 'number' && info.file_size > MAX_MEDIA) throw new Error('arquivo_excede_limite');
  const binRes = await graphGet(info.url, 45000);
  if (!binRes.ok) throw new Error(`download HTTP ${binRes.status}`);
  const bytes = new Uint8Array(await binRes.arrayBuffer());
  if (bytes.length === 0) throw new Error('midia_vazia');
  if (bytes.length > MAX_MEDIA) throw new Error('arquivo_excede_limite');
  const mime = (binRes.headers.get('content-type') ?? info.mime_type ?? '').split(';')[0].trim();
  return { bytes, mime, b64: paraBase64(bytes) };
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
      if (change.field !== 'messages') continue;
      const value = (change.value ?? {}) as Ev;
      const phoneNumberId = String(value.metadata?.phone_number_id ?? '');
      const inst = `cloud:${phoneNumberId}`;

      const { data: canal } = await db.from('canais')
        .select('id, organizacao_id, numero_conectado, ativo')
        .eq('cloud_phone_number_id', phoneNumberId).eq('transporte', 'cloud_api').maybeSingle();

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
              if (tipo === 'audio' && dl.bytes.length <= MAX_AUDIO_TRANSC) { audioB64 = dl.b64; audioMime = mime; }
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
          const { data: insArr } = await db.from('mensagens').upsert({
            conversa_id: conversaId, organizacao_id: orgId, direcao: 'entrada', tipo,
            conteudo: texto, status: 'entregue', origem: 'whatsapp_cloud', id_externo: wamid,
            recebida_em: agora,
            // metadados é NOT NULL — nunca passar null aqui (P0 de 07/2026).
            metadados: { ...metaMidia, wamid, wa_id: waId, phone_number_id: phoneNumberId,
                         ...(referral ? { referral } : {}), ...(m.context?.id ? { resposta_a_wamid: m.context.id } : {}) },
          }, { onConflict: 'id_externo', ignoreDuplicates: true }).select('id');
          const inboundNovo = Array.isArray(insArr) && insArr.length > 0;
          const inboundMsgId = (insArr?.[0]?.id as string | undefined) ?? null;

          // --- conversa: sobe no inbox; só a PRIMEIRA entrega reabre arquivada e conta não lida ---
          if (inboundNovo) {
            const { data: cv } = await db.from('conversas').select('nao_lidas').eq('id', conversaId).maybeSingle();
            await db.from('conversas').update({
              ultima_interacao_em: agora, ultima_msg_canal_em: agora, ultimo_canal_id: canal.id,
              canal_id: canal.id, ultimo_provider: 'meta_cloud', arquivada_em: null,
              nao_lidas: ((cv?.nao_lidas as number) ?? 0) + 1,
            }).eq('id', conversaId);
          } else {
            await db.from('conversas').update({
              ultima_interacao_em: agora, ultima_msg_canal_em: agora, ultimo_canal_id: canal.id,
              canal_id: canal.id, ultimo_provider: 'meta_cloud',
            }).eq('id', conversaId);
          }

          // --- Kanban: todo inbound garante LEAD NOVO (não só contato novo). RPC central resolve
          //     o funil principal, é idempotente e não reentra opp fechada. Best-effort. ---
          try {
            await db.rpc('garantir_oportunidade_lead_novo', { p_contato: contatoId, p_conversa: conversaId, p_canal: canal.id, p_origem: 'WhatsApp' });
          } catch (_k) { /* Kanban nunca interrompe a ingestão */ }

          // ---- REMARKETING: se o lead estava numa cadência, re-roteia a opp ANTES do dispatch.
          //      Respondeu → opp volta pra LEAD NOVO (entrada), senão bot_pode_atuar bloquearia
          //      justamente o lead que respondeu; opt-out → PERDIDO e NÃO dispara o bot.
          //      AWAITED de propósito: o move de coluna precisa commitar antes do fire-and-forget.
          //      Best-effort — erro/timeout aqui nunca afeta a ingestão. Idêntico ao evolution-webhook. ----
          let rmktDesfecho: string | null = null;
          if (BOT_DISPATCH && inboundNovo && inboundMsgId) {
            try {
              const { data: r } = await db.rpc('bot_remarketing_inbound', { p_conversa: conversaId, p_texto: texto ?? '' });
              rmktDesfecho = (r as string) ?? null;
            } catch { /* best-effort: remarketing nunca quebra o webhook */ }
          }

          // ---- BLOCO 1: dispatch fire-and-forget ao bot-runner (só inbound NOVO, texto/áudio) ----
          // dry_run:true FIXO → o runner só simula/loga; jamais envia a cliente. Os gates de negócio
          // (master, bot_pode_atuar, humano/responsável, precisa_humano, idempotência, lock, saúde do
          // canal) são do RUNNER, que é agnóstico de transporte — por isso este bloco é o mesmo da
          // Evolution, palavra por palavra, trocando só a origem do áudio.
          if (BOT_DISPATCH && inboundNovo && inboundMsgId && rmktDesfecho !== 'optout' && (tipo === 'texto' || tipo === 'audio')) {
            const dispatch = (async () => {
              try {
                const { data: bs } = await db.from('webhook_config').select('secret').eq('chave', 'bot_runner').maybeSingle();
                if (!bs?.secret) return;
                await fetch(`${FUNCTIONS_BASE}/bot-runner`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-bot-secret': bs.secret as string },
                  body: JSON.stringify({
                    conversa_id: conversaId, inbound_msg_id: inboundMsgId, inbound_text: texto ?? '',
                    inbound_tipo: tipo, dry_run: true,
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
