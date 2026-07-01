-- Gestão de usuários — Etapa 1: convites por e-mail (Supabase Auth oficial).
-- Reusa organizacao_usuarios, organizacao_limites, audit_log, _eh_admin_org, is_member, papel_na_org.
-- NÃO guarda token (o Supabase Auth guarda). Vaga do plano = ativos + convites pendentes não expirados.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'convite_status') then
    create type public.convite_status as enum ('pendente', 'aceito', 'expirado', 'cancelado');
  end if;
end $$;

create table if not exists public.convites (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  email text not null,
  nome text,
  papel public.user_role not null default 'atendente',
  status public.convite_status not null default 'pendente',
  auth_user_id uuid,                                   -- usuário Auth (novo ou existente); sem token
  convidado_por uuid references public.usuarios(id),
  expira_em timestamptz not null default now() + interval '7 days',
  aceito_em timestamptz,
  cancelado_em timestamptz,
  reenviado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- no máximo 1 convite PENDENTE por (org, email)
create unique index if not exists convites_org_email_pendente
  on public.convites (organizacao_id, lower(email)) where status = 'pendente';
create index if not exists convites_org_idx on public.convites (organizacao_id);

alter table public.convites enable row level security;
drop policy if exists convites_select on public.convites;
create policy convites_select on public.convites for select to authenticated
  using (public._eh_admin_org(organizacao_id));
-- escrita apenas via service_role (edge) e funções SECURITY DEFINER (sem policy de write p/ authenticated)
revoke all on public.convites from anon;
grant select on public.convites to authenticated;
grant all on public.convites to service_role;

-- Vagas do plano: ativos + convites pendentes não expirados (ambos consomem vaga).
create or replace function public._vagas_usuarios(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'limite',    (select limite_usuarios from public.organizacao_limites where organizacao_id = p_org),
    'ativos',    (select count(*)::int from public.organizacao_usuarios where organizacao_id = p_org and status = 'ativo'),
    'pendentes', (select count(*)::int from public.convites where organizacao_id = p_org and status = 'pendente' and expira_em > now())
  );
$$;
revoke all on function public._vagas_usuarios(uuid) from public, anon;
grant execute on function public._vagas_usuarios(uuid) to authenticated, service_role;

-- Aceitação: chamada pelo usuário LOGADO após definir a senha (via link do convite).
-- Ativa o vínculo, marca o convite como aceito e registra auditoria. Rejeita expirado/cancelado.
create or replace function public.convite_aceitar()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); v_email text; v_conv public.convites; v_lim int; v_ativos int; v_ja boolean;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select email into v_email from public.usuarios where id = uid;
  if v_email is null then select email into v_email from auth.users where id = uid; end if;
  if v_email is null then raise exception 'email_indisponivel'; end if;

  select * into v_conv from public.convites
    where lower(email) = lower(v_email) and status = 'pendente'
    order by criado_em desc limit 1;
  if v_conv.id is null then raise exception 'convite_inexistente'; end if;
  if v_conv.expira_em < now() then
    update public.convites set status = 'expirado', atualizado_em = now() where id = v_conv.id;
    raise exception 'convite_expirado';
  end if;

  -- revalida limite na aceitação (defesa em profundidade; o trigger também protege)
  select limite_usuarios into v_lim from public.organizacao_limites where organizacao_id = v_conv.organizacao_id;
  select exists(select 1 from public.organizacao_usuarios where organizacao_id = v_conv.organizacao_id and usuario_id = uid and status = 'ativo') into v_ja;
  if v_lim is not null and not v_ja then
    select count(*)::int into v_ativos from public.organizacao_usuarios where organizacao_id = v_conv.organizacao_id and status = 'ativo';
    if v_ativos + 1 > v_lim then raise exception 'limite_plano'; end if;
  end if;

  -- garante usuarios + ativa vínculo (preserva nome existente)
  insert into public.usuarios (id, nome, email, papel)
    values (uid, coalesce(nullif(v_conv.nome, ''), split_part(v_email, '@', 1)), v_email, v_conv.papel)
    on conflict (id) do update set nome = coalesce(nullif(public.usuarios.nome, ''), excluded.nome);
  if exists (select 1 from public.organizacao_usuarios where organizacao_id = v_conv.organizacao_id and usuario_id = uid) then
    update public.organizacao_usuarios set status = 'ativo', papel = v_conv.papel, atualizado_em = now()
      where organizacao_id = v_conv.organizacao_id and usuario_id = uid;
  else
    insert into public.organizacao_usuarios (organizacao_id, usuario_id, papel, status)
      values (v_conv.organizacao_id, uid, v_conv.papel, 'ativo');
  end if;

  update public.convites set status = 'aceito', aceito_em = now(), auth_user_id = uid, atualizado_em = now() where id = v_conv.id;
  insert into public.audit_log (organizacao_id, usuario_id, acao, entidade, entidade_id, dados_depois)
    values (v_conv.organizacao_id, uid, 'convite_aceito', 'convite', v_conv.id, jsonb_build_object('email', v_email, 'papel', v_conv.papel));
  return jsonb_build_object('ok', true, 'organizacao_id', v_conv.organizacao_id);
end $$;
revoke all on function public.convite_aceitar() from public, anon;
grant execute on function public.convite_aceitar() to authenticated;

-- Listagem unificada da equipe (membros ativos/inativos + convites pendentes/expirados) com último acesso.
create or replace function public.equipe_listar(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_member(p_org) then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'membros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'usuario_id', ou.usuario_id, 'nome', u.nome, 'email', u.email, 'papel', ou.papel::text,
        'status', ou.status::text, 'criado_em', ou.criado_em,
        'ultimo_acesso', (select au.last_sign_in_at from auth.users au where au.id = ou.usuario_id)
      ) order by (ou.papel = 'admin') desc, u.nome)
      from public.organizacao_usuarios ou join public.usuarios u on u.id = ou.usuario_id
      where ou.organizacao_id = p_org and ou.status in ('ativo', 'inativo')), '[]'::jsonb),
    'convites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'email', c.email, 'nome', c.nome, 'papel', c.papel::text,
        'status', case when c.status = 'pendente' and c.expira_em < now() then 'expirado' else c.status::text end,
        'expira_em', c.expira_em, 'criado_em', c.criado_em,
        'convidado_por', (select nome from public.usuarios where id = c.convidado_por)
      ) order by c.criado_em desc)
      from public.convites c where c.organizacao_id = p_org and c.status in ('pendente', 'expirado')), '[]'::jsonb),
    'vagas', public._vagas_usuarios(p_org)
  );
end $$;
revoke all on function public.equipe_listar(uuid) from public, anon;
grant execute on function public.equipe_listar(uuid) to authenticated;

notify pgrst, 'reload schema';
