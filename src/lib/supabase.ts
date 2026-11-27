import { createClient, type SupabaseClient } from '@supabase/supabase-js';
/* A PRÉVIA de design (HTML único, dados fictícios, sem rede) NÃO é importada aqui: no build da prévia o
   pacote '@supabase/supabase-js' é trocado por lib/previa/supabaseJsPrevia.ts (alias em
   vite.config.previa.ts), que devolve o cliente de mentira. Assim o pacote de produção não leva nada da
   prévia, e `isPrevia` é uma comparação direta que o empacotador resolve para `false` (22/11). */

/** prévia de design (build de HTML único, dados fictícios, sem rede) */
export const isPrevia = import.meta.env.VITE_PREVIA === 'true';

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

/** Instância deste BUILD: 'atenvo' (padrão) ou 'reviza' (cliente Reviza — backend
 *  Supabase dedicado, só o módulo Cobranças). NÃO é demo: grava de verdade.
 *  Definida em build-time via VITE_APP_INSTANCIA (.env.reviza.local / --mode reviza). */
export const appInstancia = String(import.meta.env.VITE_APP_INSTANCIA || 'atenvo');
export const isRevizaMode = appInstancia === 'reviza' && isSupabaseConfigured;

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
