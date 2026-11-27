-- Reviza — observações no cadastro do cliente (pedido do dono 11/09).
-- (excluir lançamento do histórico já era permitido pro admin: policy mov_del da mig 04)
alter table public.leads add column if not exists obs text;
