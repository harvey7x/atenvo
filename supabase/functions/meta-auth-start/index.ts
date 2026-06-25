// meta-auth-start — inicia OAuth do Facebook. PRIVADA (verify_jwt=true).
// Gera state de uso único (guardado só como hash) e devolve a URL de login da Meta.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const GV = () => Deno.env.get('META_GRAPH_VERSION') || 'v21.0';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

function b64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function sha256hex(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }

async function userOrg(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const c = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await c.auth.getUser();
  const user = data.user; if (!user) return null;
  const { data: m } = await admin().from('organizacao_usuarios').select('organizacao_id,papel').eq('usuario_id', user.id).eq('status', 'ativo').in('papel', ['admin', 'supervisor']).limit(1).maybeSingle();
  if (!m) return null;
  return { userId: user.id, org: m.organizacao_id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const ctx = await userOrg(req);
  if (!ctx) return json({ error: 'forbidden', message: 'Sem permissão (admin/supervisor).' }, 403);

  const APP_ID = Deno.env.get('META_APP_ID') ?? '';
  const REDIRECT = Deno.env.get('META_OAUTH_REDIRECT') ?? '';
  const faltando = [['META_APP_ID', APP_ID], ['META_OAUTH_REDIRECT', REDIRECT]].filter(([, v]) => !v).map(([n]) => n);
  if (faltando.length) return json({ error: 'config_ausente', secrets: faltando }, 503);

  const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const { error } = await admin().from('meta_oauth_estados').insert({ state_hash: await sha256hex(state), organizacao_id: ctx.org, usuario_id: ctx.userId });
  if (error) return json({ error: 'estado' }, 500);

  // business_management: necessário para enumerar Páginas pertencentes a um Portfólio
  // Empresarial (Business), que não aparecem em /me/accounts.
  const scope = 'pages_show_list,pages_messaging,pages_manage_metadata,business_management';
  const u = new URL(`https://www.facebook.com/${GV()}/dialog/oauth`);
  u.searchParams.set('client_id', APP_ID);
  u.searchParams.set('redirect_uri', REDIRECT);
  u.searchParams.set('state', state);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', scope);
  // re-apresenta o diálogo de consentimento (inclui a seleção de Páginas) mesmo se o
  // usuário já autorizou antes sem escolher uma Página / tendo recusado algo (#8).
  u.searchParams.set('auth_type', 'rerequest');
  return json({ url: u.toString() });
});
