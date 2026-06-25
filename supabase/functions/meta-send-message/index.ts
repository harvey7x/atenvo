// meta-send-message — envia resposta de TEXTO pela Página. PRIVADA (JWT).
// Cria pendente -> Send API -> reconciliação atômica (envio×echo) -> enviada/falhou.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const GV = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  const uc = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: ud } = await uc.auth.getUser(); if (!ud.user) return json({ error: 'forbidden' }, 403);

  const { conversa_id, texto } = await req.json().catch(() => ({}));
  if (!conversa_id || typeof texto !== 'string' || !texto.trim()) return json({ error: 'parametros' }, 400);
  const db = admin();

  const { data: conv } = await db.from('conversas').select('id,organizacao_id,canal_id,contato_id').eq('id', conversa_id).maybeSingle();
  if (!conv) return json({ error: 'conversa' }, 404);
  const { data: membro } = await db.from('organizacao_usuarios').select('papel').eq('usuario_id', ud.user.id).eq('organizacao_id', conv.organizacao_id).eq('status', 'ativo').maybeSingle();
  if (!membro) return json({ error: 'forbidden' }, 403);

  const { data: canal } = await db.from('canais').select('id,status_integracao,tipo,instancia_externa').eq('id', conv.canal_id).maybeSingle();
  if (!canal || canal.tipo !== 'facebook') return json({ error: 'canal_invalido' }, 400);
  if (canal.status_integracao !== 'conectado') return json({ error: 'canal_desconectado' }, 409);

  const { data: mp } = await db.from('meta_paginas').select('id,pagina_id,estado').eq('canal_id', canal.id).maybeSingle();
  if (!mp || mp.estado !== 'conectado') return json({ error: 'pagina_desconectada' }, 409);
  const { data: cred } = await db.from('meta_pagina_credenciais').select('vault_secret_id,token_status').eq('meta_pagina_id', mp.id).maybeSingle();
  if (!cred?.vault_secret_id || cred.token_status !== 'valido') return json({ error: 'token_invalido' }, 409);
  const pageToken = (await db.rpc('meta_get_secret', { p_vault_id: cred.vault_secret_id })).data as string;
  if (!pageToken) return json({ error: 'token_invalido' }, 409);

  const { data: ident } = await db.from('meta_contato_identidades').select('psid').eq('meta_pagina_id', mp.id).eq('contato_id', conv.contato_id).maybeSingle();
  if (!ident?.psid) return json({ error: 'sem_psid', message: 'Contato sem PSID nesta Página (só é possível responder quem já escreveu).' }, 422);

  const clientReqId = `req:${crypto.randomUUID()}`;
  const { data: pend, error: ep } = await db.from('mensagens').insert({
    conversa_id: conv.id, organizacao_id: conv.organizacao_id, direcao: 'saida', tipo: 'texto',
    conteudo: texto, texto_original: texto, autor_id: ud.user.id, status: 'pendente', origem: 'atenvo',
    client_request_id: clientReqId, enviada_em: new Date().toISOString(),
  }).select('id').single();
  if (ep) return json({ error: 'persistencia' }, 500);

  try {
    const u = new URL(`https://graph.facebook.com/${GV()}/me/messages`); u.searchParams.set('access_token', pageToken);
    const r = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: ident.psid }, messaging_type: 'RESPONSE', message: { text: texto } }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || `Graph ${r.status}`);

    const idExterno = `meta:${mp.pagina_id}:${j.message_id}`;
    const { data: finalId } = await db.rpc('meta_reconciliar_envio', { p_org: conv.organizacao_id, p_client_request_id: clientReqId, p_id_externo: idExterno, p_status: 'enviada' });
    await db.from('conversas').update({ ultima_interacao_em: new Date().toISOString(), ultima_msg_canal_em: new Date().toISOString(), ultimo_canal_id: canal.id, ultimo_provider: 'meta' }).eq('id', conv.id);
    return json({ ok: true, mensagem_id: finalId ?? pend.id, message_id: j.message_id });
  } catch (e) {
    await db.from('mensagens').update({ status: 'falhou', erro_envio: String((e as Error).message).slice(0, 160) }).eq('id', pend.id);
    return json({ error: 'falha_envio', message: String((e as Error).message).slice(0, 160) }, 400);
  }
});
