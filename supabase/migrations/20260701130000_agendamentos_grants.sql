-- Correção: a tabela agendamentos/agendamento_atividades foram criadas sem GRANTs de tabela
-- para a role `authenticated`, causando "permission denied for table agendamentos" no INSERT
-- (o privilégio de tabela é avaliado ANTES da RLS). Espelha o padrão já usado em `contatos`.
-- RLS continua sendo a camada que filtra as LINHAS (nada muda nas policies).

grant select, insert, update, delete on table public.agendamentos to authenticated;
grant all on table public.agendamentos to service_role;

-- Histórico: authenticated só precisa LER (a escrita é feita pelo trigger SECURITY DEFINER).
grant select on table public.agendamento_atividades to authenticated;
grant all on table public.agendamento_atividades to service_role;

notify pgrst, 'reload schema';
