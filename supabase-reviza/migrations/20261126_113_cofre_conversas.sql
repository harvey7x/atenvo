-- 113 · COFRE DE CONVERSAS (26/11, "igual" ao sistema que a Reviza usava antes: "uma senha única esconde o conteúdo das
-- conversas trancadas; só quem tem a senha abre". Como lá, a senha protege a VISUALIZAÇÃO no sistema: não impede que as
-- mensagens cheguem nem que a IA responda).
--   atd_cofre                 a senha do cofre, guardada só como hash (bcrypt) — ninguém lê a tabela, nem o administrador
--   atd_conversas_trancadas   quais conversas estão trancadas (todos da empresa leem: a tela esconde o conteúdo delas)
--   atd_cofre_tentativas      as tentativas de senha (no máx. 5 erradas a cada 15 minutos por pessoa)
--   rotinas: atd_cofre_estado · atd_cofre_definir (administrador; trocar pede a senha atual) · atd_cofre_conferir ·
--            atd_cofre_trancar (trancar não pede senha; destrancar pede) · atd_cofre_desligar (administrador + senha:
--            destranca tudo)
-- ADITIVA. Depende da 93 (atd_vejo_conversa) e do pgcrypto (schema extensions). DESFAZER no fim.

create table if not exists public.atd_cofre (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  senha_hash     text not null,
  definido_em    timestamptz not null default now(),
  definido_por   uuid
);
alter table public.atd_cofre enable row level security;
revoke all on public.atd_cofre from public, anon, authenticated;
grant all on public.atd_cofre to service_role;
-- sem política para authenticated: só as rotinas abaixo (security definer) tocam no hash

create table if not exists public.atd_conversas_trancadas (
  conversa_id    uuid primary key references public.conversas(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  trancada_por   uuid,
  trancada_em    timestamptz not null default now()
);
create index if not exists atd_conv_tranc_org on public.atd_conversas_trancadas (organizacao_id);
alter table public.atd_conversas_trancadas enable row level security;
revoke all on public.atd_conversas_trancadas from public, anon, authenticated;
grant select on public.atd_conversas_trancadas to authenticated;
grant all on public.atd_conversas_trancadas to service_role;
drop policy if exists atd_conv_tranc_ler on public.atd_conversas_trancadas;
create policy atd_conv_tranc_ler on public.atd_conversas_trancadas for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));

create table if not exists public.atd_cofre_tentativas (
  id         bigint generated always as identity primary key,
  usuario_id uuid not null,
  certa      boolean not null,
  em         timestamptz not null default now()
);
create index if not exists atd_cofre_tent_quem on public.atd_cofre_tentativas (usuario_id, em desc);
alter table public.atd_cofre_tentativas enable row level security;
revoke all on public.atd_cofre_tentativas from public, anon, authenticated;
grant all on public.atd_cofre_tentativas to service_role;

-- confere a senha guardando a tentativa; mais de 5 erradas em 15 minutos trava a pessoa por 15 minutos
create or replace function private.atd_cofre_confere(p_org uuid, p_senha text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_hash text; v_ok boolean;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '42501'; end if;
  if (select count(*) from public.atd_cofre_tentativas where usuario_id = v_uid and not certa and em > now() - interval '15 minutes') >= 5 then
    raise exception 'muitas_tentativas';
  end if;
  select senha_hash into v_hash from public.atd_cofre where organizacao_id = p_org;
  if v_hash is null then raise exception 'cofre_desligado'; end if;
  v_ok := extensions.crypt(coalesce(p_senha, ''), v_hash) = v_hash;
  insert into public.atd_cofre_tentativas (usuario_id, certa) values (v_uid, v_ok);
  delete from public.atd_cofre_tentativas where em < now() - interval '2 days';
  return v_ok;
end $$;
revoke all on function private.atd_cofre_confere(uuid, text) from public, anon, authenticated;

create or replace function public.atd_cofre_estado()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if not (public.is_member(v_org) or public.is_platform_admin()) then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'ligado', exists (select 1 from public.atd_cofre where organizacao_id = v_org),
    'definido_em', (select definido_em from public.atd_cofre where organizacao_id = v_org),
    'definido_por', (select nullif(btrim(u.nome), '') from public.atd_cofre c left join public.usuarios u on u.id = c.definido_por where c.organizacao_id = v_org),
    'trancadas', (select count(*) from public.atd_conversas_trancadas where organizacao_id = v_org));
end $$;
revoke all on function public.atd_cofre_estado() from public, anon;
grant execute on function public.atd_cofre_estado() to authenticated, service_role;

-- liga o cofre (ou troca a senha: aí pede a atual). Só o administrador. A senha tem de 6 a 72 letras.
-- Senha errada NÃO dá erro (devolve false): um erro desfaria a tentativa gravada e o limite de 5 não valeria.
create or replace function public.atd_cofre_definir(p_senha text, p_senha_atual text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if char_length(coalesce(p_senha, '')) < 6 or char_length(p_senha) > 72 then raise exception 'senha_curta'; end if;
  if exists (select 1 from public.atd_cofre where organizacao_id = v_org) and not private.atd_cofre_confere(v_org, p_senha_atual) then
    return false;
  end if;
  insert into public.atd_cofre (organizacao_id, senha_hash, definido_em, definido_por)
  values (v_org, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), now(), auth.uid())
  on conflict (organizacao_id) do update set senha_hash = excluded.senha_hash, definido_em = now(), definido_por = auth.uid();
  return true;
end $$;
revoke all on function public.atd_cofre_definir(text, text) from public, anon;
grant execute on function public.atd_cofre_definir(text, text) to authenticated, service_role;

create or replace function public.atd_cofre_conferir(p_senha text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if not (public.is_member(v_org) or public.is_platform_admin()) then raise exception 'sem_permissao'; end if;
  return private.atd_cofre_confere(v_org, p_senha);
end $$;
revoke all on function public.atd_cofre_conferir(text) from public, anon;
grant execute on function public.atd_cofre_conferir(text) to authenticated, service_role;

-- trancar: quem vê a conversa, com o cofre ligado (não pede senha). Destrancar: com a senha.
-- Devolve 'trancada', 'destrancada' ou 'senha_errada' (sem erro, para a tentativa ficar gravada).
create or replace function public.atd_cofre_trancar(p_conversa uuid, p_trancar boolean, p_senha text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.atd_vejo_conversa(p_conversa))) then raise exception 'sem_permissao'; end if;
  if not exists (select 1 from public.atd_cofre where organizacao_id = v_org) then raise exception 'cofre_desligado'; end if;
  if p_trancar then
    insert into public.atd_conversas_trancadas (conversa_id, organizacao_id, trancada_por) values (p_conversa, v_org, auth.uid()) on conflict do nothing;
    return 'trancada';
  end if;
  if not private.atd_cofre_confere(v_org, p_senha) then return 'senha_errada'; end if;
  delete from public.atd_conversas_trancadas where conversa_id = p_conversa;
  return 'destrancada';
end $$;
revoke all on function public.atd_cofre_trancar(uuid, boolean, text) from public, anon;
grant execute on function public.atd_cofre_trancar(uuid, boolean, text) to authenticated, service_role;

-- desligar: o administrador, com a senha. Destranca todas as conversas.
create or replace function public.atd_cofre_desligar(p_senha text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if not private.atd_cofre_confere(v_org, p_senha) then return false; end if;
  delete from public.atd_conversas_trancadas where organizacao_id = v_org;
  delete from public.atd_cofre where organizacao_id = v_org;
  return true;
end $$;
revoke all on function public.atd_cofre_desligar(text) from public, anon;
grant execute on function public.atd_cofre_desligar(text) to authenticated, service_role;

-- DESFAZER:
--   drop function if exists public.atd_cofre_desligar(text), public.atd_cofre_trancar(uuid, boolean, text), public.atd_cofre_conferir(text),
--     public.atd_cofre_definir(text, text), public.atd_cofre_estado(), private.atd_cofre_confere(uuid, text);
--   drop table if exists public.atd_cofre_tentativas, public.atd_conversas_trancadas, public.atd_cofre;
