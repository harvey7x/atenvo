import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
}
export async function getUser(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/** O token é a service_role DE VERDADE? Pergunta ao próprio banco: assistente_uso só a service_role lê (RLS ligada,
    sem policy, revoke de anon/authenticated) — assinatura forjada dá 401 e outro papel dá 401/403. */
export async function confirmarServico(token: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/assistente_uso?select=dia&limit=1`, {
    headers: { apikey: token, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  await r.body?.cancel();
  return r.ok;
}
