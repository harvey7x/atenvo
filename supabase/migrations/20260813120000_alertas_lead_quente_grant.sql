-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: o painel nunca mostrou o modal de Lead Quente porque a migration
-- 20260812150000 criou a tabela + policy RLS mas ESQUECEU o GRANT de tabela —
-- PostgREST devolvia 403 (privilégio, não RLS) em toda busca do hook, e o
-- Realtime não entregava mudanças pela mesma razão. Evidência: ~1.700 GETs 403
-- em /rest/v1/alertas_lead_quente nas 24h; has_table_privilege('authenticated',
-- 'alertas_lead_quente','select') = false. A RLS (is_member) continua sendo
-- quem decide O QUE cada um vê; o grant só abre a porta da tabela. Sem anon
-- (padrão da auditoria de segurança).
-- ─────────────────────────────────────────────────────────────────────────────

grant select on public.alertas_lead_quente to authenticated, service_role;
