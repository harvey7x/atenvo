-- Corrige "Could not find the function public.atualizar_perfil(p_cargo, p_nome, p_telefone)":
-- a função tinha 4 parâmetros sem default; o frontend chama 3 (sem avatar). Separa responsabilidades:
-- atualizar_perfil(nome/telefone/cargo) e atualizar_avatar(avatar) — sem assinatura ambígua.
drop function if exists public.atualizar_perfil(text, text, text, text);

create or replace function public.atualizar_perfil(p_nome text, p_telefone text, p_cargo text)
  returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if length(coalesce(btrim(p_nome), '')) > 120 or length(coalesce(btrim(p_telefone), '')) > 40 or length(coalesce(btrim(p_cargo), '')) > 80 then
    raise exception 'campo_muito_longo';
  end if;
  update public.usuarios set
    nome = coalesce(nullif(btrim(p_nome), ''), nome),
    telefone = nullif(btrim(p_telefone), ''),
    cargo = nullif(btrim(p_cargo), ''),
    atualizado_em = now()
  where id = uid; -- somente o próprio usuário
end $$;
revoke all on function public.atualizar_perfil(text, text, text) from public, anon;
grant execute on function public.atualizar_perfil(text, text, text) to authenticated;

create or replace function public.atualizar_avatar(p_avatar_url text)
  returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  update public.usuarios set avatar_url = nullif(btrim(p_avatar_url), ''), atualizado_em = now() where id = uid;
end $$;
revoke all on function public.atualizar_avatar(text) from public, anon;
grant execute on function public.atualizar_avatar(text) to authenticated;

notify pgrst, 'reload schema';
