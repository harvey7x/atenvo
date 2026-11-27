-- Reviza — higiene apontada pelo security advisor
-- Aplicada 2026-09-10 via MCP como "reviza_06_hardening_advisor".
alter function public.tg_set_updated_at() set search_path = '';

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.guard_profile_update() from public, anon, authenticated;

revoke execute on function public.current_papel() from anon;
revoke execute on function public.is_at_least(public.papel_usuario) from anon;
revoke execute on function public.tem_papel(public.papel_usuario[]) from anon;
