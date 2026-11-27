-- Reviza — endurecimento dos grants das funções da mensageria (advisor 0028/0029).
-- wa_after_msg é função de TRIGGER: nunca deve ser chamável via RPC (revoga de todos;
-- o trigger dispara independente de EXECUTE). wa_marcar_lida: só usuário logado, não anon.
-- Aplicada 2026-09-10 via MCP como "reviza_12_wa_grants_hardening".
revoke all on function public.wa_after_msg() from public, anon, authenticated;
revoke all on function public.wa_marcar_lida(uuid) from anon, public;
grant execute on function public.wa_marcar_lida(uuid) to authenticated;
