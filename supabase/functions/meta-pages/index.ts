// meta-pages — lista as Páginas permitidas de uma sessão de continuação. PRIVADA (JWT).
// Verifica dono da sessão + organização. NÃO consome o código (consumo é no connect).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const admin = () => createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
async function sha256hex(s: string) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }

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
  const { data: s } = await db.from('meta_sessao_continuacao').select('organizacao_id,usuario_id,paginas,consumido,expira_em')
    .eq('codigo_hash', await sha256hex(codigo)).maybeSingle();
  if (!s || s.consumido || new Date(s.expira_em) < new Date() || s.usuario_id !== ud.user.id) return json({ error: 'sessao_invalida' }, 400);

  const { data: m } = await db.from('organizacao_usuarios').select('papel').eq('usuario_id', ud.user.id).eq('organizacao_id', s.organizacao_id).eq('status', 'ativo').maybeSingle();
  if (!m) return json({ error: 'forbidden' }, 403);

  return json({ paginas: s.paginas ?? [] });
});
