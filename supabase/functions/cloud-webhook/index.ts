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
// INVARIANTES:
//  * `statuses` NUNCA vira mensagem, NUNCA cria contato/conversa/lead e NUNCA chama o bot.
//  * idempotência por `wamid` em mensagens.id_externo (unique uq_mensagens_id_externo).
//  * contato resolvido pela CHAVE CANÔNICA (Bloco 0) — Evolution e Meta caem no MESMO contato.
//  * phone_number_id desconhecido => 200 + evento ignorado. NUNCA 4xx: a Meta reenfileira e,
//    com falha repetida, DESATIVA a assinatura do webhook.
//  * sempre 200 no fim; erro de persistência vira evento 'erro' reprocessável, não 500.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
// Bloco 2 NÃO liga o bot. O dispatch entra depois, com o master ligado conscientemente.
const BOT_DISPATCH = (Deno.env.get('CLOUD_BOT_DISPATCH') ?? 'nao').toLowerCase() === 'sim';

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
          // Click-to-WhatsApp: o anúncio de origem vem aqui. É a aquisição do lead — preservar.
          const referral = m.referral ? {
            ctwa_clid: m.referral.ctwa_clid ?? null, source_id: m.referral.source_id ?? null,
            source_type: m.referral.source_type ?? null, source_url: m.referral.source_url ?? null,
            headline: m.referral.headline ?? null,
          } : null;
          await db.from('mensagens').upsert({
            conversa_id: conversaId, organizacao_id: orgId, direcao: 'entrada', tipo,
            conteudo: texto, status: 'entregue', origem: 'whatsapp_cloud', id_externo: wamid,
            recebida_em: agora,
            // metadados é NOT NULL — nunca passar null aqui (P0 de 07/2026).
            metadados: { ...meta, wamid, wa_id: waId, phone_number_id: phoneNumberId,
                         ...(referral ? { referral } : {}), ...(m.context?.id ? { resposta_a_wamid: m.context.id } : {}) },
          }, { onConflict: 'id_externo', ignoreDuplicates: true });

          // --- conversa: sobe no inbox, reabre se arquivada, incrementa não lidas ---
          const { data: cv } = await db.from('conversas').select('nao_lidas').eq('id', conversaId).maybeSingle();
          await db.from('conversas').update({
            ultima_interacao_em: agora, ultima_msg_canal_em: agora, ultimo_canal_id: canal.id,
            canal_id: canal.id, ultimo_provider: 'meta_cloud', arquivada_em: null,
            nao_lidas: ((cv?.nao_lidas as number) ?? 0) + 1,
          }).eq('id', conversaId);

          // --- Kanban: todo inbound garante LEAD NOVO (não só contato novo). RPC central resolve
          //     o funil principal, é idempotente e não reentra opp fechada. Best-effort. ---
          try {
            await db.rpc('garantir_oportunidade_lead_novo', { p_contato: contatoId, p_conversa: conversaId, p_canal: canal.id, p_origem: 'WhatsApp' });
          } catch (_k) { /* Kanban nunca interrompe a ingestão */ }

          // --- bot: DESLIGADO no Bloco 2 (transporte primeiro). ---
          if (BOT_DISPATCH) { /* dispatch entra num bloco próprio, com master consciente */ }

          await fim('processado');
        } catch (_e) {
          await fim('erro', { erro: 'falha_persistencia' });
        }
      }
    }
  }

  return new Response('EVENT_RECEIVED', { status: 200 });
});
