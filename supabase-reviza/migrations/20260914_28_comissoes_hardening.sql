-- Reviza — endurecimento das comissões (revisão adversarial 14/09).
-- (1) BRECHA: o comercial podia renomear o PRÓPRIO profile (guard antigo não
--     protegia `nome`) para "EDUARDO" e ler a % de outro via comissoes_sel.
--     O nome é a identidade da carteira/comissão → só gestor/admin altera.
-- (2) comissoes_sel agora compara com trim (espaço no cadastro não derruba a
--     própria % do comercial pro default).
-- (3) updated_by passa a refletir QUEM mexeu por último (upsert via PostgREST
--     só preenchia no INSERT; trigger corrige no UPDATE).
-- Aplicada 2026-09-14 via MCP como "reviza_28_comissoes_hardening".

create or replace function public.guard_profile_update() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then new.updated_at := now(); return new; end if; -- backend confiável
  if new.id <> old.id then raise exception 'id do profile e imutavel'; end if;
  if new.nome is distinct from old.nome and not public.is_at_least('gestor') then
    raise exception 'somente gestor/admin altera o nome (identidade da carteira e da comissao)'; end if;
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

drop policy comissoes_sel on public.comissoes;
create policy comissoes_sel on public.comissoes for select to authenticated
  using (public.is_at_least('financeiro') or upper(trim(comercial)) = upper(trim(coalesce(public.meu_nome(), ''))));

create or replace function public.comissoes_set_updated_by() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;
revoke all on function public.comissoes_set_updated_by() from public, anon, authenticated;
create trigger comissoes_updated_by before update on public.comissoes
  for each row execute function public.comissoes_set_updated_by();
