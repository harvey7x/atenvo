-- Radar de Atendimento: GRANTs das tabelas vacuo_* (mesmo padrão de sla_alertas).
-- Neste projeto tabela nova NÃO herda privilégios: sem isto o painel /radar dava
-- "permission denied for table vacuo_repasses". A RLS (is_member) continua filtrando
-- as linhas; escrita segue só pelo motor (security definer).
grant select on public.vacuo_config, public.vacuo_estado, public.vacuo_repasses to authenticated;
grant select, insert, update, delete on public.vacuo_config, public.vacuo_estado, public.vacuo_repasses to service_role;
