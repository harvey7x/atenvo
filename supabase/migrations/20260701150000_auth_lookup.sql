-- Lookup de usuário no Auth por e-mail (só service_role usa; protege contra enumeração de e-mail).
create or replace function public._auth_lookup(p_email text)
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select case when u.id is null then null
    else jsonb_build_object('id', u.id, 'confirmado', u.email_confirmed_at is not null) end
  from (select id, email_confirmed_at from auth.users where lower(email) = lower(btrim(p_email)) limit 1) u;
$$;
revoke all on function public._auth_lookup(text) from public, anon, authenticated;
grant execute on function public._auth_lookup(text) to service_role;
