// meta-pages — lista as Páginas autorizadas buscando AO VIVO na Graph com o token
// atual da sessão (não depende da lista salva). PRIVADA (JWT). Verifica dono+org.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const GV = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const APP_ID = () => Deno.env.get('META_APP_ID') ?? '';
const APP_SECRET = () => Deno.env.get('META_APP_SECRET') ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
async function sha256hex(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
async function graphGet(path: string, params: Record<string, string>) {
  const u = new URL(`https://graph.facebook.com/${GV()}/${path}`); for (const k in params) u.searchParams.set(k, params[k]);
  const r = await fetch(u); const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || `Graph ${r.status}`); return j;
}

/** Reúne Páginas de todas as fontes possíveis (token atual), dedup por id. Sem tokens no retorno. */
async function listarPaginas(token: string): Promise<{ id: string; nome: string }[]> {
  const mapa = new Map<string, { id: string; nome: string }>();
  const add = (p: any) => { if (p?.id) mapa.set(String(p.id), { id: String(p.id), nome: p.name ?? String(p.id) }); };

  // 1) Páginas diretas
  try { const a = await graphGet('me/accounts', { fields: 'id,name', access_token: token }); (a.data ?? []).forEach(add); } catch (_) { /* ignora */ }

  // 2) granular_scopes do token (Páginas concedidas individualmente — inclusive de Business)
  try {
    const dbg = await graphGet('debug_token', { input_token: token, access_token: `${APP_ID()}|${APP_SECRET()}` });
    const gs = dbg?.data?.granular_scopes ?? [];
    const ids = new Set<string>();
    for (const s of gs) if (['pages_show_list', 'pages_messaging', 'pages_manage_metadata'].includes(s.scope)) for (const t of (s.target_ids ?? [])) ids.add(String(t));
    for (const id of ids) if (!mapa.has(id)) { try { add(await graphGet(id, { fields: 'id,name', access_token: token })); } catch (_) { /* ignora */ } }
  } catch (_) { /* ignora */ }

  // 3) Páginas de Portfólios Empresariais (requer business_management)
  try {
    const bz = await graphGet('me/businesses', { fields: 'id', access_token: token });
    for (const b of (bz.data ?? [])) {
      for (const edge of ['owned_pages', 'client_pages']) {
        try { const r = await graphGet(`${b.id}/${edge}`, { fields: 'id,name', access_token: token }); (r.data ?? []).forEach(add); } catch (_) { /* ignora */ }
      }
    }
  } catch (_) { /* ignora */ }

  return [...mapa.values()];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  const uc = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: ud } = await uc.auth.getUser();
  if (!ud.user) return json({ error: 'forbidden' }, 403);

  const { codigo } = await req.json().catch(() => ({}));
  if (!codigo) return json({ error: 'codigo' }, 400);

  const db = admin();
  const { data: s } = await db.from('meta_sessao_continuacao').select('organizacao_id,usuario_id,user_token_vault_id,consumido,expira_em')
    .eq('codigo_hash', await sha256hex(codigo)).maybeSingle();
  if (!s || s.consumido || new Date(s.expira_em) < new Date() || s.usuario_id !== ud.user.id) return json({ error: 'sessao_invalida' }, 400);

  const { data: m } = await db.from('organizacao_usuarios').select('papel').eq('usuario_id', ud.user.id).eq('organizacao_id', s.organizacao_id).eq('status', 'ativo').maybeSingle();
  if (!m) return json({ error: 'forbidden' }, 403);

  if (!s.user_token_vault_id) return json({ paginas: [] });
  const token = (await db.rpc('meta_get_secret', { p_vault_id: s.user_token_vault_id })).data as string;
  if (!token) return json({ paginas: [] });

  const paginas = await listarPaginas(token);
  return json({ paginas });
});
