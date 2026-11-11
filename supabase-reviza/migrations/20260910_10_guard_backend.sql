-- Reviza — guard de profiles libera operações de BACKEND (aplicada via MCP "reviza_10_guard_backend").
-- service_role/edge/migration não têm JWT (auth.uid() null) → confiáveis, passam direto;
-- a trava (papel/ativo/último-admin) continua valendo para usuários logados.
create or replace function public.guard_profile_update() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then new.updated_at := now(); return new; end if; -- backend confiável
  if new.id <> old.id then raise exception 'id do profile e imutavel'; end if;
  if new.papel is distinct from old.papel and not public.is_at_least('admin') then
    raise exception 'somente admin altera papel'; end if;
  if new.ativo is distinct from old.ativo then
    if old.papel = 'admin' and not public.is_at_least('admin') then
      raise exception 'somente admin altera o ativo de um admin'; end if;
    if not public.is_at_least('gestor') then
      raise exception 'somente gestor/admin altera ativo'; end if;
  end if;
  if old.papel='admin' and old.ativo and (new.papel is distinct from 'admin' or not new.ativo) then
    if (select count(*) from public.profiles where papel='admin' and ativo) <= 1 then
      raise exception 'nao e permitido remover/desativar o ultimo admin ativo'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
