-- Reviza Cobrancas — fundacao de auth (projeto dedicado ftexrtyswpdcndbkjbtf)
-- Aplicada 2026-09-10 via MCP como "reviza_01_auth_foundation".
-- Seguranca: novo usuario nasce INATIVO; current_papel() so retorna papel se ativo.
create extension if not exists pgcrypto with schema extensions;

do $$ begin create type public.papel_usuario as enum ('admin','gestor','comercial','financeiro'); exception when duplicate_object then null; end $$;
do $$ begin create type public.situacao_debito as enum ('ativo','cancelado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.status_pagamento as enum ('pago','nao_pagou','fora'); exception when duplicate_object then null; end $$;
do $$ begin create type public.estado_entrada as enum ('pendente','confirmada','recusada'); exception when duplicate_object then null; end $$;
do $$ begin create type public.status_mov as enum ('confirmada','recusada'); exception when duplicate_object then null; end $$;

create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text not null default '',
  papel public.papel_usuario not null default 'comercial',
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_papel_idx on public.profiles(papel);
create trigger profiles_updated_at before update on public.profiles for each row execute function public.tg_set_updated_at();

create or replace function public.current_papel() returns public.papel_usuario
  language sql stable security definer set search_path = '' as $$
  select p.papel from public.profiles p where p.id = auth.uid() and p.ativo $$;

create or replace function public.papel_rank(p public.papel_usuario) returns int
  language sql immutable set search_path = '' as $$
  select case p when 'comercial' then 1 when 'financeiro' then 2 when 'gestor' then 3 when 'admin' then 4 else 0 end $$;

create or replace function public.is_at_least(alvo public.papel_usuario) returns boolean
  language sql stable security definer set search_path = '' as $$
  select public.papel_rank(public.current_papel()) >= public.papel_rank(alvo) $$;

create or replace function public.tem_papel(variadic alvos public.papel_usuario[]) returns boolean
  language sql stable security definer set search_path = '' as $$
  select public.current_papel() = any(alvos) $$;

revoke all on function public.current_papel(), public.is_at_least(public.papel_usuario), public.tem_papel(public.papel_usuario[]), public.papel_rank(public.papel_usuario) from public;
grant execute on function public.current_papel(), public.is_at_least(public.papel_usuario), public.tem_papel(public.papel_usuario[]), public.papel_rank(public.papel_usuario) to authenticated, anon;

create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare v_papel public.papel_usuario; v_ativo boolean;
begin
  perform pg_advisory_xact_lock(hashtext('reviza_bootstrap_admin'));
  if exists (select 1 from public.profiles where papel='admin') then
    v_papel := 'comercial'; v_ativo := false;
  else
    v_papel := 'admin'; v_ativo := true;
  end if;
  insert into public.profiles (id, email, nome, papel, ativo)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'nome',''), split_part(new.email,'@',1)), v_papel, v_ativo)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.guard_profile_update() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
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
drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles for each row execute function public.guard_profile_update();

alter table public.profiles enable row level security;
