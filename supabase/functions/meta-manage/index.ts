// meta-manage — conectar / status / desconectar Página. PRIVADA (JWT).
// connect: consome o código de continuação (uso único), valida dono+org, obtém o page
// token (Vault), assina o webhook, cria/reaproveita canal+meta_paginas+credencial.
// disconnect: desconexão LÓGICA (preserva histórico), revoga token e apaga secret.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const GV = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
async function sha256hex(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }

async function graphGet(path: string, params: Record<string, string>) {
  const u = new URL(`https://graph.facebook.com/${GV()}/${path}`); for (const k in params) u.searchParams.set(k, params[k]);
  const r = await fetch(u); const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || `Graph ${r.status}`); return j;
}
async function graphPostQ(path: string, params: Record<string, string>, method = 'POST') {
  const u = new URL(`https://graph.facebook.com/${GV()}/${path}`); for (const k in params) u.searchParams.set(k, params[k]);
  const r = await fetch(u, { method }); const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || `Graph ${r.status}`); return j;
}

async function ctxOrg(req: Request, org?: string) {
  const auth = req.headers.get('Authorization') ?? '';
  const uc = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await uc.auth.getUser(); if (!data.user) return null;
  const q = admin().from('organizacao_usuarios').select('organizacao_id,papel').eq('usuario_id', data.user.id).eq('status', 'ativo').in('papel', ['admin', 'supervisor']);
  const { data: m } = org ? await q.eq('organizacao_id', org).maybeSingle() : await q.limit(1).maybeSingle();
  if (!m) return null;
  return { userId: data.user.id, org: m.organizacao_id as string };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const db = admin();

  // -------- STATUS --------
  if (action === 'status') {
    const ctx = await ctxOrg(req); if (!ctx) return json({ error: 'forbidden' }, 403);
    const { data: pgs } = await db.from('meta_paginas').select('id,pagina_id,pagina_nome,estado,canal_id,webhook_assinado,conectado_em,desconectado_em').eq('organizacao_id', ctx.org).order('conectado_em', { ascending: false });
    const out = [] as any[];
    for (const p of pgs ?? []) {
      const { data: cred } = await db.from('meta_pagina_credenciais').select('token_status,expires_at').eq('meta_pagina_id', p.id).maybeSingle();
      out.push({ ...p, token_status: cred?.token_status ?? null, expires_at: cred?.expires_at ?? null });
    }
    return json({ paginas: out });
  }

  // -------- CONNECT --------
  if (action === 'connect') {
    const { codigo, pagina_id } = body;
    if (!codigo || !pagina_id) return json({ error: 'parametros' }, 400);
    const auth = req.headers.get('Authorization') ?? '';
    const uc = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: ud } = await uc.auth.getUser(); if (!ud.user) return json({ error: 'forbidden' }, 403);

    // consumo atômico do código (uso único, dono, não expirado)
    const { data: s } = await db.from('meta_sessao_continuacao').update({ consumido: true })
      .eq('codigo_hash', await sha256hex(codigo)).eq('consumido', false).eq('usuario_id', ud.user.id).gt('expira_em', new Date().toISOString())
      .select('organizacao_id,user_token_vault_id,paginas').maybeSingle();
    if (!s) return json({ error: 'sessao_invalida' }, 400);
    const org = s.organizacao_id as string;
    const limpar = async () => { if (s.user_token_vault_id) await db.rpc('meta_delete_secret', { p_vault_id: s.user_token_vault_id }); await db.from('meta_sessao_continuacao').delete().eq('codigo_hash', await sha256hex(codigo)); };

    const permitida = (s.paginas ?? []).some((p: any) => String(p.id) === String(pagina_id));
    if (!permitida) { await limpar(); return json({ error: 'pagina_nao_permitida' }, 403); }

    // cross-org: Página já vinculada a OUTRA organização?
    const { data: existente } = await db.from('meta_paginas').select('id,organizacao_id,canal_id').eq('pagina_id', String(pagina_id)).maybeSingle();
    if (existente && existente.organizacao_id !== org) { await limpar(); return json({ error: 'pagina_em_outra_org' }, 409); }

    try {
      const userToken = (await db.rpc('meta_get_secret', { p_vault_id: s.user_token_vault_id })).data as string;
      if (!userToken) { await limpar(); return json({ error: 'token_indisponivel' }, 400); }
      const page = await graphGet(String(pagina_id), { fields: 'name,access_token', access_token: userToken });
      const pageToken = page.access_token as string;
      const pageNome = page.name as string;
      if (!pageToken) { await limpar(); return json({ error: 'sem_page_token' }, 400); }

      await graphPostQ(`${pagina_id}/subscribed_apps`, { subscribed_fields: 'messages,message_echoes,messaging_postbacks,message_deliveries,message_reads', access_token: pageToken });

      let expiresAt: string | null = null;
      try { const dbg = await graphGet('debug_token', { input_token: pageToken, access_token: `${Deno.env.get('META_APP_ID')}|${Deno.env.get('META_APP_SECRET')}` }); const ea = dbg?.data?.expires_at; if (ea && ea > 0) expiresAt = new Date(ea * 1000).toISOString(); } catch (_) { /* page token costuma não expirar */ }

      // canal: reaproveita ou cria
      let canalId = existente?.canal_id as string | undefined;
      if (canalId) {
        await db.from('canais').update({ status_integracao: 'conectado', ativo: true, nome_interno: pageNome, provider: 'meta', conectado_em: new Date().toISOString() }).eq('id', canalId);
      } else {
        const { data: cExist } = await db.from('canais').select('id').eq('organizacao_id', org).eq('tipo', 'facebook').eq('instancia_externa', String(pagina_id)).maybeSingle();
        if (cExist) { canalId = cExist.id; await db.from('canais').update({ status_integracao: 'conectado', ativo: true, nome_interno: pageNome, provider: 'meta', conectado_em: new Date().toISOString() }).eq('id', canalId); }
        else {
          const { data: cNovo, error: ec } = await db.from('canais').insert({ tipo: 'facebook', provider: 'meta', instancia_externa: String(pagina_id), nome_interno: pageNome, status_integracao: 'conectado', ativo: true, organizacao_id: org, conectado_em: new Date().toISOString() }).select('id').single();
          if (ec) throw new Error('canal'); canalId = cNovo.id;
        }
      }

      // meta_paginas: upsert por pagina_id
      const { data: mp, error: emp } = await db.from('meta_paginas').upsert({
        organizacao_id: org, canal_id: canalId, pagina_id: String(pagina_id), pagina_nome: pageNome,
        estado: 'conectado', escopos: ['pages_messaging'], webhook_assinado: true, conectado_por: ud.user.id,
        desconectado_em: null, atualizado_em: new Date().toISOString(),
      }, { onConflict: 'pagina_id' }).select('id').single();
      if (emp) throw new Error('meta_paginas');

      // credencial: rotaciona secret antigo antes
      const { data: credAnt } = await db.from('meta_pagina_credenciais').select('id,vault_secret_id').eq('meta_pagina_id', mp.id).maybeSingle();
      if (credAnt?.vault_secret_id) await db.rpc('meta_delete_secret', { p_vault_id: credAnt.vault_secret_id });
      const { data: novoVid } = await db.rpc('meta_set_secret', { p_nome: `meta_page_${mp.id}_${Date.now()}`, p_valor: pageToken });
      await db.from('meta_pagina_credenciais').upsert({
        meta_pagina_id: mp.id, organizacao_id: org, vault_secret_id: novoVid, token_status: 'valido',
        expires_at: expiresAt, validado_em: new Date().toISOString(), revogado_em: null, atualizado_em: new Date().toISOString(),
      }, { onConflict: 'meta_pagina_id' });

      await limpar();
      return json({ ok: true, pagina_id: String(pagina_id), pagina_nome: pageNome, canal_id: canalId });
    } catch (e) {
      await limpar();
      return json({ error: 'falha_conexao', message: String((e as Error).message).slice(0, 140) }, 400);
    }
  }

  // -------- DISCONNECT (lógica) --------
  if (action === 'disconnect') {
    const { canal_id } = body; if (!canal_id) return json({ error: 'parametros' }, 400);
    const { data: canal } = await db.from('canais').select('id,organizacao_id,instancia_externa').eq('id', canal_id).eq('tipo', 'facebook').maybeSingle();
    if (!canal) return json({ error: 'canal' }, 404);
    const ctx = await ctxOrg(req, canal.organizacao_id); if (!ctx) return json({ error: 'forbidden' }, 403);

    const { data: mp } = await db.from('meta_paginas').select('id,pagina_id').eq('canal_id', canal_id).maybeSingle();
    if (mp) {
      const { data: cred } = await db.from('meta_pagina_credenciais').select('vault_secret_id').eq('meta_pagina_id', mp.id).maybeSingle();
      // best-effort: des-assina o webhook
      try { if (cred?.vault_secret_id) { const tok = (await db.rpc('meta_get_secret', { p_vault_id: cred.vault_secret_id })).data as string; if (tok) await graphPostQ(`${mp.pagina_id}/subscribed_apps`, { access_token: tok }, 'DELETE'); } } catch (_) { /* ignora */ }
      if (cred?.vault_secret_id) await db.rpc('meta_delete_secret', { p_vault_id: cred.vault_secret_id });
      await db.from('meta_pagina_credenciais').update({ token_status: 'revogado', revogado_em: new Date().toISOString(), vault_secret_id: null, atualizado_em: new Date().toISOString() }).eq('meta_pagina_id', mp.id);
      await db.from('meta_paginas').update({ estado: 'desconectado', webhook_assinado: false, desconectado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq('id', mp.id);
    }
    await db.from('canais').update({ status_integracao: 'removido', ativo: false }).eq('id', canal_id);
    return json({ ok: true }); // histórico preservado (contatos/conversas/mensagens)
  }

  return json({ error: 'acao_invalida' }, 400);
});
