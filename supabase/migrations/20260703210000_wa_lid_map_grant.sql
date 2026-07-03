-- Faltou o GRANT: a policy wa_lid_map_sel existia mas sem SELECT concedido a authenticated,
-- então a leitura por membro era negada (permission denied) — a RLS nunca chegava a ser avaliada.
-- Escrita permanece exclusiva do service_role (webhook / RPCs security definer).
grant select on public.wa_lid_map to authenticated;
