import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
