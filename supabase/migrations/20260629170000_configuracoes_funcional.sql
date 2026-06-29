-- Página Configurações funcional: perfil (telefone/cargo), preferências por usuário e RPCs administrativas.
-- Aditivo. RLS por dono/organização. Sem service_role. search_path explícito, revoke public/anon, grant authenticated.

-- ===== Perfil: campos faltantes =====
alter table public.usuarios
  add column if not exists telefone text,
  add column if not exists cargo text;

-- ===== Preferências por usuário (notificações + UI) =====
create table if not exists public.usuario_preferencias (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);
alter table public.usuario_preferencias enable row level security;
drop policy if exists up_sel on public.usuario_preferencias;
drop policy if exists up_ins on public.usuario_preferencias;
drop policy if exists up_upd on public.usuario_preferencias;
create policy up_sel on public.usuario_preferencias for select using (usuario_id = auth.uid());
create policy up_ins on public.usuario_preferencias for insert with check (usuario_id = auth.uid());
create policy up_upd on public.usuario_preferencias for update using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
revoke all on public.usuario_preferencias from anon;
grant select, insert, update on public.usuario_preferencias to authenticated;

-- ===== Perfil próprio (não altera papel) =====
create or replace function public.atualizar_perfil(p_nome text, p_telefone text, p_cargo text, p_avatar_url text)
  returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  update public.usuarios set
    nome = coalesce(nullif(btrim(p_nome), ''), nome),
    telefone = nullif(btrim(p_telefone), ''),
    cargo = nullif(btrim(p_cargo), ''),
    avatar_url = nullif(btrim(p_avatar_url), ''),
    atualizado_em = now()
  where id = uid;
end $$;
revoke all on function public.atualizar_perfil(text,text,text,text) from public, anon;
grant execute on function public.atualizar_perfil(text,text,text,text) to authenticated;

-- ===== Preferências (upsert do próprio usuário) =====
create or replace function public.salvar_preferencias(p_prefs jsonb)
  returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  insert into public.usuario_preferencias(usuario_id, prefs, atualizado_em) values (uid, coalesce(p_prefs, '{}'::jsonb), now())
  on conflict (usuario_id) do update set prefs = excluded.prefs, atualizado_em = now();
end $$;
revoke all on function public.salvar_preferencias(jsonb) from public, anon;
grant execute on function public.salvar_preferencias(jsonb) to authenticated;

-- ===== Organização (admin/supervisor da própria org) =====
create or replace function public.atualizar_organizacao(
  p_org uuid, p_nome text, p_nome_fantasia text, p_documento text, p_telefone text, p_email text, p_timezone text, p_moeda text)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not coalesce(public.is_platform_admin() or (public.is_member(p_org) and public.papel_na_org(p_org) = any (array['admin','supervisor']::user_role[])), false) then
    raise exception 'sem_permissao';
  end if;
  update public.organizacoes set
    nome = coalesce(nullif(btrim(p_nome), ''), nome),
    nome_fantasia = nullif(btrim(p_nome_fantasia), ''),
    documento = nullif(btrim(p_documento), ''),
    telefone = nullif(btrim(p_telefone), ''),
    email = nullif(btrim(p_email), ''),
    timezone = coalesce(nullif(btrim(p_timezone), ''), timezone),
    moeda = coalesce(nullif(btrim(p_moeda), ''), moeda),
    atualizado_em = now()
  where id = p_org;
end $$;
revoke all on function public.atualizar_organizacao(uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.atualizar_organizacao(uuid,text,text,text,text,text,text,text) to authenticated;

-- ===== Equipe: helpers de guarda =====
create or replace function public._eh_admin_org(p_org uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.is_platform_admin() or (public.is_member(p_org) and public.papel_na_org(p_org) = 'admin'), false);
$$;
revoke all on function public._eh_admin_org(uuid) from public, anon; grant execute on function public._eh_admin_org(uuid) to authenticated;

create or replace function public._admins_ativos(p_org uuid) returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.organizacao_usuarios where organizacao_id = p_org and papel = 'admin' and status = 'ativo';
$$;
revoke all on function public._admins_ativos(uuid) from public, anon; grant execute on function public._admins_ativos(uuid) to authenticated;

-- ===== Equipe: alterar papel =====
create or replace function public.equipe_alterar_papel(p_org uuid, p_usuario uuid, p_papel text)
  returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_atual text;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public._eh_admin_org(p_org) then raise exception 'sem_permissao'; end if;
  if p_usuario = uid then raise exception 'nao_pode_alterar_proprio_papel'; end if;
  if p_papel not in ('admin','supervisor','atendente') then raise exception 'papel_invalido'; end if;
  select papel::text into v_atual from public.organizacao_usuarios where organizacao_id = p_org and usuario_id = p_usuario;
  if v_atual is null then raise exception 'membro_invalido'; end if;
  if v_atual = 'admin' and p_papel <> 'admin' and public._admins_ativos(p_org) <= 1 then raise exception 'ultimo_admin'; end if;
  update public.organizacao_usuarios set papel = p_papel::user_role, atualizado_em = now() where organizacao_id = p_org and usuario_id = p_usuario;
end $$;
revoke all on function public.equipe_alterar_papel(uuid,uuid,text) from public, anon; grant execute on function public.equipe_alterar_papel(uuid,uuid,text) to authenticated;

-- ===== Equipe: ativar/desativar =====
create or replace function public.equipe_definir_status(p_org uuid, p_usuario uuid, p_status text)
  returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_papel text; v_status text;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public._eh_admin_org(p_org) then raise exception 'sem_permissao'; end if;
  if p_status not in ('ativo','inativo') then raise exception 'status_invalido'; end if;
  if p_usuario = uid and p_status = 'inativo' then raise exception 'nao_pode_desativar_proprio'; end if;
  select papel::text, status::text into v_papel, v_status from public.organizacao_usuarios where organizacao_id = p_org and usuario_id = p_usuario;
  if v_papel is null then raise exception 'membro_invalido'; end if;
  if v_papel = 'admin' and p_status = 'inativo' and public._admins_ativos(p_org) <= 1 then raise exception 'ultimo_admin'; end if;
  update public.organizacao_usuarios set status = p_status::vinculo_status, atualizado_em = now() where organizacao_id = p_org and usuario_id = p_usuario;
end $$;
revoke all on function public.equipe_definir_status(uuid,uuid,text) from public, anon; grant execute on function public.equipe_definir_status(uuid,uuid,text) to authenticated;

-- ===== Equipe: remover (revoga acesso; preserva usuario/auth e histórico) =====
create or replace function public.equipe_remover_membro(p_org uuid, p_usuario uuid)
  returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_papel text;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public._eh_admin_org(p_org) then raise exception 'sem_permissao'; end if;
  if p_usuario = uid then raise exception 'nao_pode_remover_proprio'; end if;
  select papel::text into v_papel from public.organizacao_usuarios where organizacao_id = p_org and usuario_id = p_usuario;
  if v_papel is null then raise exception 'membro_invalido'; end if;
  if v_papel = 'admin' and public._admins_ativos(p_org) <= 1 then raise exception 'ultimo_admin'; end if;
  delete from public.organizacao_usuarios where organizacao_id = p_org and usuario_id = p_usuario; -- só o vínculo; histórico/autoria preservados
end $$;
revoke all on function public.equipe_remover_membro(uuid,uuid) from public, anon; grant execute on function public.equipe_remover_membro(uuid,uuid) to authenticated;

-- ===== Equipe: convidar (vincula conta Atenvo existente como 'convidado') =====
create or replace function public.convidar_membro(p_org uuid, p_email text, p_nome text, p_papel text)
  returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_alvo uuid; v_existe text;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public._eh_admin_org(p_org) then raise exception 'sem_permissao'; end if;
  if p_papel not in ('admin','supervisor','atendente') then raise exception 'papel_invalido'; end if;
  select id into v_alvo from public.usuarios where lower(email) = lower(btrim(p_email)) limit 1;
  if v_alvo is null then raise exception 'usuario_sem_conta_atenvo'; end if; -- envio de e-mail de convite a novos: infra pendente
  select status::text into v_existe from public.organizacao_usuarios where organizacao_id = p_org and usuario_id = v_alvo;
  if v_existe is not null then raise exception 'ja_membro'; end if;
  insert into public.organizacao_usuarios(organizacao_id, usuario_id, papel, status) values (p_org, v_alvo, p_papel::user_role, 'convidado');
  return 'convidado';
end $$;
revoke all on function public.convidar_membro(uuid,text,text,text) from public, anon; grant execute on function public.convidar_membro(uuid,text,text,text) to authenticated;
