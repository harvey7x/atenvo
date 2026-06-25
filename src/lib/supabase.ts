import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Normaliza a URL do projeto Supabase: remove barras finais e um sufixo de endpoint
 *  colado por engano (ex.: ".../rest/v1", ".../auth/v1"). O supabase-js espera apenas a
 *  origin do projeto (https://<ref>.supabase.co); com o sufixo, ele montaria
 *  ".../rest/v1/auth/v1/token" e todo o Auth/REST retornaria 404. */
function normalizeSupabaseUrl(raw: string | undefined): string {
  let u = (raw ?? '').trim().replace(/\/+$/, '');
  u = u.replace(/\/(rest|auth|storage|realtime|functions)\/v1$/i, '').replace(/\/+$/, '');
  return u;
}

const url = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();

/** true quando as variáveis do Supabase estão presentes (backend real disponível). */
export const isSupabaseConfigured = Boolean(url && anonKey);

/** Flag explícita de demonstração. O modo mock NUNCA é ativado automaticamente:
 *  só roda quando VITE_ENABLE_DEMO_MODE=true E não há backend real configurado. */
export const isDemoModeEnabled = String(import.meta.env.VITE_ENABLE_DEMO_MODE) === 'true';
export const isDemoMode = !isSupabaseConfigured && isDemoModeEnabled;

/** Sem backend real e sem demo habilitado => configuração ausente: a app exibe a
 *  tela de erro de configuração e bloqueia o login (ver main.tsx / ConfigError). */
export const isMisconfigured = !isSupabaseConfigured && !isDemoModeEnabled;

/** Quais variáveis estão presentes (para a tela de configuração). */
export const supabaseEnv = { hasUrl: Boolean(url), hasKey: Boolean(anonKey) };

/**
 * Cliente Supabase. É `null` quando não há env real configurado (modo demonstração).
 * Nenhuma credencial é embutida no código.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
