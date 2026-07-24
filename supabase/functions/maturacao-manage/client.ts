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

// Maturação é ferramenta de operação: SÓ admin. Diferente de conexões de atendimento,
// onde supervisor também gerencia.
export async function requireOrgAdmin(admin: SupabaseClient, userId: string, orgId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { data, error } = await admin.from('organizacao_usuarios').select('papel, status').eq('organizacao_id', orgId).eq('usuario_id', userId).maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data || data.status !== 'ativo') return { ok: false, reason: 'Usuário não é membro ativo da organização.' };
  if (data.papel !== 'admin') return { ok: false, reason: 'Apenas administradores podem gerenciar maturação de números.' };
  return { ok: true };
}
