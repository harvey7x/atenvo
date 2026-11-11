/* Prévia (só no build de prévia): o lado ATENDIMENTO (o código do Atenvo) enxerga o "banco" como o
   modo demonstração do próprio Atenvo — sem cliente, com os dados de exemplo dele (seeds do WhatsApp,
   Kanban, Dashboard, Presenciais, Scripts, Configurações). O lado COBRANÇAS segue no cliente falso da
   prévia (supabasePrevia.ts). Quem recebe este módulo no lugar de '@/lib/supabase' é decidido pelo
   arquivo que importa — ver o plugin `previaAtendimentoDemo` em vite.config.previa.ts.
   Fora isso, tudo igual ao módulo de verdade (isRevizaMode, normalizações, etc.). */
export * from '../supabase';
export const supabase = null;
export const isSupabaseConfigured = false;
export const isDemoModeEnabled = true;
export const isDemoMode = true;
export const isMisconfigured = false;
