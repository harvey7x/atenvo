-- Higiene de segurança + correção do erro "permission denied for table wa_audio_diag".
--
-- (1) wa_audio_diag: o evolution-send grava por upsert com o cliente service_role
--     (functions/evolution-send/index.ts:375), mas só o role `postgres` tinha
--     privilégio na tabela — daí o ERROR recorrente "permission denied" nos logs do
--     Postgres. Concede ao service_role (backend) o CRUD e ao authenticated apenas
--     SELECT (a policy wa_audio_diag_admin_select continua restringindo a admins).
--
-- (2) search_path fixo nas 8 funções que o advisor apontou como
--     function_search_path_mutable. Todas são SECURITY INVOKER (risco baixo), mas
--     fixar o search_path é hardening padrão e silencia o lint. `public, pg_temp`
--     preserva as referências não-qualificadas a objetos de `public`; now()/pg_catalog
--     seguem sempre resolvíveis.

-- (1) grants -----------------------------------------------------------------
grant select, insert, update, delete on table public.wa_audio_diag to service_role;
grant select on table public.wa_audio_diag to authenticated;

-- (2) search_path -------------------------------------------------------------
alter function public.set_atualizado_em() set search_path = public, pg_temp;
alter function public.opp_touch_atualizado() set search_path = public, pg_temp;
alter function public.agendamentos_touch() set search_path = public, pg_temp;
alter function public.bot_remarketing_touch_updated() set search_path = public, pg_temp;
alter function public.fn_wa_lid_map_touch() set search_path = public, pg_temp;
alter function public.sla_opp_movimento() set search_path = public, pg_temp;
alter function public.bot_rmkt_snap(timestamptz) set search_path = public, pg_temp;
alter function public.chave_canonica_telefone(text) set search_path = public, pg_temp;
