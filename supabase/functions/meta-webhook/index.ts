// meta-webhook — webhook do Facebook Messenger. PÚBLICO (verify_jwt=false).
// GET: verificação. POST: valida assinatura -> registra evento idempotente -> persiste
// texto -> responde 200 -> enriquece perfil em background (waitUntil). Sem Graph no
// caminho crítico. Nunca registra verify_token, App Secret, tokens nem payload bruto.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GV = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Ev = Record<string, any>;

function tipoDe(m: Ev): string {
  if (m.message) return m.message.is_echo ? 'message_echoes' : 'messages';
  if (m.delivery) return 'message_deliveries';
  if (m.read) return 'message_reads';
  if (m.postback) return 'messaging_postbacks';
  return 'outro';
}
// Chave determinística: mesma reentrega -> mesma event_key. Sem token/corpo.
function eventKey(pageId: string, tipo: string, m: Ev): string {
  if (tipo === 'messages' || tipo === 'message_echoes') return `meta:${pageId}:${tipo}:${m.message?.mid}`;
  if (tipo === 'message_deliveries') {
    const mids = (m.delivery?.mids ?? []).slice().sort().join('|');
    return `meta:${pageId}:delivery:${m.recipient?.id}:${m.delivery?.watermark}:${mids}`;
  }
  if (tipo === 'message_reads') return `meta:${pageId}:read:${m.sender?.id}:${m.read?.watermark}`;
  if (tipo === 'messaging_postbacks') return `meta:${pageId}:postback:${m.sender?.id}:${m.timestamp}:${m.postback?.payload ?? ''}`;
  return `meta:${pageId}:outro:${m.timestamp ?? ''}`;
}

async function pageToken(db: any, metaPaginaId: string): Promise<string | null> {
  const { data } = await db.from('meta_pagina_credenciais').select('vault_secret_id,token_status').eq('meta_pagina_id', metaPaginaId).maybeSingle();
  if (!data?.vault_secret_id || data.token_status !== 'valido') return null;
  const { data: tok } = await db.rpc('meta_get_secret', { p_vault_id: data.vault_secret_id });
  return (tok as string) ?? null;
}

async function achaOuCriaContato(db: any, org: string, metaPaginaId: string, psid: string): Promise<{ id: string; novo: boolean }> {
  const { data: assoc } = await db.from('meta_contato_identidades').select('contato_id').eq('meta_pagina_id', metaPaginaId).eq('psid', psid).maybeSingle();
  if (assoc) return { id: assoc.contato_id, novo: false };
  const { data: novo } = await db.from('contatos').insert({ nome: 'Cliente Facebook', origem: 'Facebook', organizacao_id: org }).select('id').single();
  // associação por Página (idempotente: se corrida criar 2, o unique resolve)
  const ins = await db.from('meta_contato_identidades').insert({ meta_pagina_id: metaPaginaId, organizacao_id: org, contato_id: novo.id, psid });
  if (ins.error) {
    const { data: a2 } = await db.from('meta_contato_identidades').select('contato_id').eq('meta_pagina_id', metaPaginaId).eq('psid', psid).maybeSingle();
    if (a2) { await db.from('contatos').delete().eq('id', novo.id); return { id: a2.contato_id, novo: false }; }
  }
  return { id: novo.id, novo: true };
}

// UM atendimento ativo por CONTATO (mesma regra do evolution-webhook v27). A conversa NÃO é chaveada
// por canal: se o contato já tem atendimento ativo (mesmo que por WhatsApp), REUSA e só move o CANAL
// ATUAL para cá. Sem isso, o unique index "1 conversa ativa por contato" faria este insert FALHAR e a
// mensagem do Facebook se perderia. canal_origem_id preserva a aquisição.
async function achaOuCriaConversa(db: any, org: string, contatoId: string, canalId: string): Promise<string> {
  const agora = new Date().toISOString();
  const { data: conv } = await db.from('conversas').select('id')
    .eq('organizacao_id', org).eq('contato_id', contatoId)
    .not('status', 'in', '(resolvida,fechada)')
    .order('arquivada_em', { ascending: true, nullsFirst: true })   // não-arquivada primeiro
    .order('ultima_interacao_em', { ascending: false, nullsFirst: false })
    .limit(1).maybeSingle();
  if (conv) {
    // canal ATUAL passa a ser este (o cliente está falando por aqui agora)
    await db.from('conversas').update({
      canal_id: canalId, ultimo_canal_id: canalId, ultimo_provider: 'meta', ultima_msg_canal_em: agora,
    }).eq('id', conv.id);
    return conv.id;
  }
  const { data: nova } = await db.from('conversas').insert({ organizacao_id: org, contato_id: contatoId, canal_id: canalId, canal_origem_id: canalId, status: 'aberta', ultimo_canal_id: canalId, ultimo_provider: 'meta', ultima_interacao_em: agora, ultima_msg_canal_em: agora }).select('id').single();
  return nova.id;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const expected = (Deno.env.get('META_VERIFY_TOKEN') ?? '').trim();
    const received = (url.searchParams.get('hub.verify_token') ?? '').trim();
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    if (mode === 'subscribe' && expected.length > 0 && received.length > 0 && safeEqual(received, expected)) {
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    const appSecret = Deno.env.get('META_APP_SECRET') ?? '';
    const sigHeader = req.headers.get('x-hub-signature-256') ?? '';
    const raw = await req.text();
    if (appSecret.length === 0 || !sigHeader.startsWith('sha256=')) return new Response('Invalid signature', { status: 403 });
    const expectedSig = 'sha256=' + await hmacSha256Hex(appSecret, raw);
    if (!safeEqual(sigHeader, expectedSig)) return new Response('Invalid signature', { status: 403 });

    let body: Ev;
    try { body = JSON.parse(raw); } catch { return new Response('EVENT_RECEIVED', { status: 200 }); }
    if (body.object !== 'page') return new Response('EVENT_RECEIVED', { status: 200 });

    const db = admin();
    const enrich: Array<{ org: string; metaPaginaId: string; contatoId: string; psid: string }> = [];

    for (const entry of body.entry ?? []) {
      const pageId = String(entry.id);
      const { data: pg } = await db.from('meta_paginas').select('id,canal_id,organizacao_id,estado').eq('pagina_id', pageId).maybeSingle();
      if (!pg || pg.estado !== 'conectado') continue;

      for (const m of (entry.messaging ?? []) as Ev[]) {
        const tipo = tipoDe(m);
        const isEcho = tipo === 'message_echoes';
        const key = eventKey(pageId, tipo, m);
        const psid = isEcho ? m.recipient?.id : m.sender?.id;

        const reg = await db.from('meta_webhook_events').insert({
          event_key: key, organizacao_id: pg.organizacao_id, canal_id: pg.canal_id, pagina_id: pageId,
          tipo_evento: tipo, provider_message_id: m.message?.mid ?? null, sender_psid: m.sender?.id ?? null,
          recipient_id: m.recipient?.id ?? null, is_echo: isEcho, status_processamento: 'recebido',
        }).select('id');
        if (reg.error || !reg.data?.length) continue; // duplicado (unique event_key) -> idempotente

        try {
          if ((tipo === 'messages' || tipo === 'message_echoes') && typeof m.message?.text === 'string' && psid) {
            const { id: contatoId, novo } = await achaOuCriaContato(db, pg.organizacao_id, pg.id, psid);
            const conversaId = await achaOuCriaConversa(db, pg.organizacao_id, contatoId, pg.canal_id);
            const idExterno = `meta:${pageId}:${m.message.mid}`;
            await db.from('mensagens').upsert({
              conversa_id: conversaId, organizacao_id: pg.organizacao_id,
              direcao: isEcho ? 'saida' : 'entrada', tipo: 'texto', conteudo: m.message.text,
              status: isEcho ? 'enviada' : 'entregue', origem: isEcho ? 'pagina' : 'messenger',
              id_externo: idExterno, recebida_em: new Date().toISOString(),
              metadados: { mid: m.message.mid, psid },
            }, { onConflict: 'id_externo', ignoreDuplicates: true });
            const patch: Record<string, unknown> = { ultima_interacao_em: new Date().toISOString(), ultima_msg_canal_em: new Date().toISOString(), ultimo_canal_id: pg.canal_id, ultimo_provider: 'meta' };
            if (!isEcho) {
              const { data: c } = await db.from('conversas').select('nao_lidas').eq('id', conversaId).maybeSingle();
              patch.nao_lidas = (c?.nao_lidas ?? 0) + 1;
            }
            await db.from('conversas').update(patch).eq('id', conversaId);
            await db.from('meta_webhook_events').update({ status_processamento: 'processado', processado_em: new Date().toISOString() }).eq('event_key', key);
            // Auto-entrada no Kanban: todo inbound (não echo) garante LEAD NOVO — inclusive contato
            // Facebook que já existia e volta a falar. RPC central resolve o funil, é idempotente e
            // não reentra opp fechada (decisão do dono). Best-effort: nunca afeta a mensagem/resposta.
            if (!isEcho && contatoId) {
              try {
                await db.rpc('garantir_oportunidade_lead_novo', { p_contato: contatoId, p_conversa: conversaId, p_canal: pg.canal_id, p_origem: 'Facebook' });
              } catch (_k) { /* best-effort: erro no Kanban não interrompe o webhook */ }
            }
            if (novo) enrich.push({ org: pg.organizacao_id, metaPaginaId: pg.id, contatoId, psid });
          } else if (tipo === 'messages' && psid && !m.message?.text) {
            await db.from('meta_webhook_events').update({ status_processamento: 'ignorado', ignorado_motivo: 'sem_texto', processado_em: new Date().toISOString() }).eq('event_key', key);
          } else {
            await db.from('meta_webhook_events').update({ status_processamento: 'processado', processado_em: new Date().toISOString() }).eq('event_key', key);
          }
        } catch (_e) {
          await db.from('meta_webhook_events').update({ status_processamento: 'erro', erro: 'falha_persistencia' }).eq('event_key', key);
        }
      }
    }

    // Enriquecimento de nome em BACKGROUND — falha aqui não afeta as mensagens já persistidas.
    if (enrich.length > 0) {
      const task = (async () => {
        for (const e of enrich) {
          try {
            const tok = await pageToken(db, e.metaPaginaId);
            if (!tok) continue;
            const u = new URL(`https://graph.facebook.com/${GV()}/${e.psid}`);
            u.searchParams.set('fields', 'name'); u.searchParams.set('access_token', tok);
            const r = await fetch(u); const j = await r.json();
            if (r.ok && j.name) await db.from('contatos').update({ nome: j.name }).eq('id', e.contatoId).eq('nome', 'Cliente Facebook');
          } catch (_) { /* ignora */ }
        }
      })();
      try { (globalThis as any).EdgeRuntime?.waitUntil?.(task); } catch (_) { /* fallback */ }
    }

    return new Response('EVENT_RECEIVED', { status: 200 });
  }

  return new Response('Method Not Allowed', { status: 405 });
});
