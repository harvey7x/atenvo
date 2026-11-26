-- 115 · SENHA DE EDIÇÃO DAS IAs (26/11, "igual" ao sistema que a Reviza usava antes: Agentes › Senhas de edição — "só quem
-- souber a senha consegue mudar o roteiro dele; a senha protege só a edição: não substitui o login e não impede a IA de
-- funcionar, só pede a confirmação antes de abrir a configuração").
--   atd_iris_senhas   uma senha por versão da IA (ia_agentes), guardada só como hash (bcrypt); ninguém lê a tabela
--   rotinas: atd_iris_senhas_estado (quais versões têm senha) · atd_iris_senha_definir (administrador; trocar pede a atual)
--            atd_iris_senha_conferir · atd_iris_senha_remover (administrador + a senha)
--   As tentativas erradas usam o mesmo freio do cofre (113): 5 erradas em 15 minutos travam a pessoa por 15 minutos.
--   Senha errada NÃO dá erro (devolve false): um erro desfaria a tentativa gravada.
-- ADITIVA. Depende da 93 (ia_agentes) e da 113 (atd_cofre_tentativas). DESFAZER no fim.

create table if not exists public.atd_iris_senhas (
  agente_id    uuid primary key references public.ia_agentes(id) on delete cascade,
  senha_hash   text not null,
  definida_em  timestamptz not null default now(),
  definida_por uuid
);
alter table public.atd_iris_senhas enable row level security;
revoke all on public.atd_iris_senhas from public, anon, authenticated;
grant all on public.atd_iris_senhas to service_role;

create or replace function private.atd_iris_senha_confere(p_agente uuid, p_senha text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_hash text; v_ok boolean;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '42501'; end if;
  if (select count(*) from public.atd_cofre_tentativas where usuario_id = v_uid and not certa and em > now() - interval '15 minutes') >= 5 then
    raise exception 'muitas_tentativas';
  end if;
  select senha_hash into v_hash from public.atd_iris_senhas where agente_id = p_agente;
  if v_hash is null then return true; end if; -- sem senha: está aberta
  v_ok := extensions.crypt(coalesce(p_senha, ''), v_hash) = v_hash;
  insert into public.atd_cofre_tentativas (usuario_id, certa) values (v_uid, v_ok);
  return v_ok;
end $$;
revoke all on function private.atd_iris_senha_confere(uuid, text) from public, anon, authenticated;

create or replace function public.atd_iris_senhas_estado()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('agente_id', s.agente_id, 'definida_em', s.definida_em, 'definida_por', nullif(btrim(u.nome), '')))
                     from public.atd_iris_senhas s join public.ia_agentes a on a.id = s.agente_id
                     left join public.usuarios u on u.id = s.definida_por
                    where a.organizacao_id = v_org), '[]'::jsonb);
end $$;
revoke all on function public.atd_iris_senhas_estado() from public, anon;
grant execute on function public.atd_iris_senhas_estado() to authenticated, service_role;

create or replace function public.atd_iris_senha_definir(p_agente uuid, p_senha text, p_atual text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if not exists (select 1 from public.ia_agentes where id = p_agente and organizacao_id = v_org) then raise exception 'ia_inexistente'; end if;
  if char_length(coalesce(p_senha, '')) < 6 or char_length(p_senha) > 72 then raise exception 'senha_curta'; end if;
  if exists (select 1 from public.atd_iris_senhas where agente_id = p_agente) and not private.atd_iris_senha_confere(p_agente, p_atual) then return false; end if;
  insert into public.atd_iris_senhas (agente_id, senha_hash, definida_em, definida_por)
  values (p_agente, extensions.crypt(p_senha, extensions.gen_salt('bf', 10)), now(), auth.uid())
  on conflict (agente_id) do update set senha_hash = excluded.senha_hash, definida_em = now(), definida_por = auth.uid();
  return true;
end $$;
revoke all on function public.atd_iris_senha_definir(uuid, text, text) from public, anon;
grant execute on function public.atd_iris_senha_definir(uuid, text, text) to authenticated, service_role;

create or replace function public.atd_iris_senha_conferir(p_agente uuid, p_senha text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return private.atd_iris_senha_confere(p_agente, p_senha);
end $$;
revoke all on function public.atd_iris_senha_conferir(uuid, text) from public, anon;
grant execute on function public.atd_iris_senha_conferir(uuid, text) to authenticated, service_role;

create or replace function public.atd_iris_senha_remover(p_agente uuid, p_senha text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if not private.atd_iris_senha_confere(p_agente, p_senha) then return false; end if;
  delete from public.atd_iris_senhas where agente_id = p_agente;
  return true;
end $$;
revoke all on function public.atd_iris_senha_remover(uuid, text) from public, anon;
grant execute on function public.atd_iris_senha_remover(uuid, text) to authenticated, service_role;

-- DESFAZER:
--   drop function if exists public.atd_iris_senha_remover(uuid, text), public.atd_iris_senha_conferir(uuid, text), public.atd_iris_senha_definir(uuid, text, text),
--     public.atd_iris_senhas_estado(), private.atd_iris_senha_confere(uuid, text);
--   drop table if exists public.atd_iris_senhas;
