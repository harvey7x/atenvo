-- Tabelas novas criadas em migration não herdaram os grants de service_role (a edge usa service_role).
-- Sem isso, INSERT/UPDATE via edge falham silenciosamente. Concede o necessário. RLS segue valendo p/ anon/authenticated.
grant select, insert, update on public.canal_health_runs to service_role;
grant select, insert, update, delete on public.wa_lid_map to service_role;
