-- ═══════════════════════════════════════════════════════════════════════════
-- SEGURANÇA — bkp_bot_resumo_msgs estava com RLS DESLIGADO (exposta à anon key).
-- Liga RLS SEM policies: service_role segue acessando (bypassa RLS); cliente
-- (anon/authenticated) não deve ler backup. Auditoria 2026-08-15.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.bkp_bot_resumo_msgs enable row level security;
