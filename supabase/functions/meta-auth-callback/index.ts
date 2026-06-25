// meta-auth-callback — retorno do OAuth da Meta. PÚBLICA (verify_jwt=false): a Meta
// redireciona o navegador sem JWT. Consome o state (uso único), troca o code por token
// long-lived (guardado no Vault), lista Páginas (sem tokens) e gera um CÓDIGO DE
// CONTINUAÇÃO opaco (só hash) para o frontend. Nunca expõe tokens na URL.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GV = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

function b64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function sha256hex(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
async function graphGet(path: string, params: Record<string, string>) {
  const u = new URL(`https://graph.facebook.com/${GV()}/${path}`);
  for (const k in params) u.searchParams.set(k, params[k]);
  const r = await fetch(u); const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || `Graph ${r.status}`);
  return j;
}

Deno.serve(async (req) => {
  const FRONT = (Deno.env.get('META_FRONTEND_URL') || 'https://homologacao.atenvo.pages.dev').replace(/\/+$/, '');
  const back = (q: string) => Response.redirect(`${FRONT}/integracoes?tab=facebook&${q}`, 302);
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (url.searchParams.get('error') || !code || !state) return back('fb=error&motivo=login');

  const db = admin();
  try {
    // consumo atômico do state (uso único, não expirado)
    const { data: st } = await db.from('meta_oauth_estados').update({ code_consumido: true })
      .eq('state_hash', await sha256hex(state)).eq('code_consumido', false).gt('expira_em', new Date().toISOString())
      .select('organizacao_id,usuario_id').maybeSingle();
    if (!st) return back('fb=error&motivo=state');

    const APP_ID = Deno.env.get('META_APP_ID') ?? '';
    const APP_SECRET = Deno.env.get('META_APP_SECRET') ?? '';
    const REDIRECT = Deno.env.get('META_OAUTH_REDIRECT') ?? '';
    if (!APP_ID || !APP_SECRET || !REDIRECT) return back('fb=error&motivo=config');

    // code -> token curto -> token long-lived
    const curto = await graphGet('oauth/access_token', { client_id: APP_ID, client_secret: APP_SECRET, redirect_uri: REDIRECT, code });
    const longo = await graphGet('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: APP_ID, client_secret: APP_SECRET, fb_exchange_token: curto.access_token });
    const userToken = longo.access_token as string;

    // Páginas permitidas (sem expor tokens ao frontend)
    const contas = await graphGet('me/accounts', { fields: 'id,name', access_token: userToken });
    const paginas = (contas.data ?? []).map((p: any) => ({ id: String(p.id), nome: p.name }));

    // user token long-lived no Vault (temporário, até concluir/cancelar)
    const { data: vid, error: ev } = await db.rpc('meta_set_secret', { p_nome: `meta_user_${st.usuario_id}_${Date.now()}`, p_valor: userToken });
    if (ev) return back('fb=error&motivo=vault');

    const codigo = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const { error: ec } = await db.from('meta_sessao_continuacao').insert({
      codigo_hash: await sha256hex(codigo), organizacao_id: st.organizacao_id, usuario_id: st.usuario_id,
      user_token_vault_id: vid, paginas,
    });
    if (ec) { await db.rpc('meta_delete_secret', { p_vault_id: vid }); return back('fb=error&motivo=sessao'); }

    await db.from('meta_oauth_estados').delete().eq('state_hash', await sha256hex(state));
    return back(`fb=connect&code=${encodeURIComponent(codigo)}`);
  } catch (_e) {
    return back('fb=error&motivo=meta');
  }
});
