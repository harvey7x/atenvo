-- _auth_lookup passa a informar se o usuário já tem senha (primeiro acesso concluído),
-- para o backend escolher o tipo de link do convite/reenvio de forma determinística
-- (novo -> invite; existente sem senha -> recovery; existente com senha -> magiclink).
create or replace function public._auth_lookup(p_email text)
returns jsonb language sql stable security definer set search_path = public, auth as $$
  select case when u.id is null then null
    else jsonb_build_object(
      'id', u.id,
      'confirmado', u.email_confirmed_at is not null,
      'tem_senha', (u.encrypted_password is not null and u.encrypted_password <> '')
    ) end
  from (select id, email_confirmed_at, encrypted_password from auth.users where lower(email) = lower(btrim(p_email)) limit 1) u;
$$;
revoke all on function public._auth_lookup(text) from public, anon, authenticated;
grant execute on function public._auth_lookup(text) to service_role;
