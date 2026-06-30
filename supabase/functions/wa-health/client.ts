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
/** Papel do usuário na organização (ou null se não for membro ativo). */
export async function orgRole(admin: SupabaseClient, userId: string, orgId: string): Promise<string | null> {
  const { data } = await admin.from('organizacao_usuarios').select('papel, status').eq('organizacao_id', orgId).eq('usuario_id', userId).maybeSingle();
  if (!data || data.status !== 'ativo') return null;
  return data.papel as string;
}
