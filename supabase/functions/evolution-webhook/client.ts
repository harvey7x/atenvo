import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!; const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export function adminClient(): SupabaseClient { return createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } }); }
