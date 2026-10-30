-- Permissões das tabelas novas de 29-30/10 (fechado pelo administrativo, placar do CAF,
-- Kanban × CAF e Presenciais). Criadas pela migration, ficaram SEM os grants padrão
-- (a pegadinha do service_role, ver maturação): as edge fns adm-fechados e
-- presenciais-avisos leem e escrevem algumas delas direto. As telas leem por RPC; o
-- select de authenticated fica atrás das policies is_member.

grant select, update on public.presenciais_avisos to service_role;
grant select on public.presenciais to service_role;
grant select on public.presenciais, public.presenciais_avisos to authenticated;

grant select, insert on public.adm_sync_log to service_role;
grant usage, select on sequence public.adm_sync_log_id_seq to service_role;
grant select on public.adm_config, public.adm_fechados, public.adm_movimentos,
                public.adm_casos, public.adm_placar, public.adm_pendentes to service_role;
grant select on public.adm_config, public.adm_fechados, public.adm_movimentos,
                public.adm_casos, public.adm_placar, public.adm_pendentes to authenticated;
