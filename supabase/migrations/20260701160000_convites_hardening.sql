-- Hardening do fluxo de convite: reserva ATÔMICA de vaga (lock), idempotência (request_id),
-- aceitação blindada (auth.uid + e-mail), e helpers de compensação (saga Auth<->banco).

alter table public.convites add column if not exists request_id uuid;
create unique index if not exists convites_request_id_uq on public.convites (request_id) where request_id is not null;

-- ---------- RESERVA ATÔMICA (limite sem corrida) ----------
-- Chamada SÓ pela Edge Function (service_role). Bloqueia a linha de limite da org, revalida
-- dedup + limite (ativos + convites pendentes) e insere o convite na MESMA transação.
-- auth_user_id fica nulo aqui; é preenchido por convite_vincular após o Auth confirmar.
create or replace function public.convite_reservar(
  p_org uuid, p_email text, p_nome text, p_papel text, p_convidado_por uuid, p_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(p_email)); v_lim int; v_ativos int; v_pend int; v_id uuid; v_conv public.convites; v_reativavel boolean;
begin
  if p_papel not in ('admin','supervisor','atendente') then return jsonb_build_object('status','papel_invalido'); end if;

  -- idempotência: mesma requisição não cria dois convites
  if p_request_id is not null then
    select * into v_conv from public.convites where request_id = p_request_id;
    if v_conv.id is not null then return jsonb_build_object('status','ja_processado','convite_id',v_conv.id,'auth_user_id',v_conv.auth_user_id); end if;
  end if;

  -- já é membro (ativo/inativo)?
  select (ou.status='inativo') into v_reativavel
    from public.organizacao_usuarios ou join public.usuarios u on u.id=ou.usuario_id
    where ou.organizacao_id=p_org and lower(u.email)=v_email and ou.status in ('ativo','inativo') limit 1;
  if found then
    return jsonb_build_object('status', case when v_reativavel then 'membro_inativo' else 'ja_membro' end);
  end if;

  -- convite pendente já existe?
  if exists(select 1 from public.convites where organizacao_id=p_org and lower(email)=v_email and status='pendente' and expira_em>now()) then
    return jsonb_build_object('status','convite_pendente');
  end if;

  -- LOCK da vaga: serializa convites concorrentes da mesma org
  perform 1 from public.organizacao_limites where organizacao_id=p_org for update;
  select limite_usuarios into v_lim from public.organizacao_limites where organizacao_id=p_org;
  if v_lim is not null then
    select count(*)::int into v_ativos from public.organizacao_usuarios where organizacao_id=p_org and status='ativo';
    select count(*)::int into v_pend from public.convites where organizacao_id=p_org and status='pendente' and expira_em>now();
    if v_ativos + v_pend >= v_lim then
      return jsonb_build_object('status','limite_plano','vagas',jsonb_build_object('limite',v_lim,'ativos',v_ativos,'pendentes',v_pend));
    end if;
  end if;

  insert into public.convites(organizacao_id,email,nome,papel,status,convidado_por,request_id)
    values (p_org,v_email,nullif(p_nome,''),p_papel::user_role,'pendente',p_convidado_por,p_request_id)
    returning id into v_id;
  insert into public.audit_log(organizacao_id,usuario_id,acao,entidade,entidade_id,dados_depois)
    values (p_org,p_convidado_por,'convite_criado','convite',v_id,jsonb_build_object('email',v_email,'papel',p_papel));
  return jsonb_build_object('status','criado','convite_id',v_id);
end $$;
revoke all on function public.convite_reservar(uuid,text,text,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.convite_reservar(uuid,text,text,text,uuid,uuid) to service_role;

-- ---------- VINCULAR (após Auth confirmar) ----------
create or replace function public.convite_vincular(p_convite_id uuid, p_auth_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.convites;
begin
  select * into v from public.convites where id=p_convite_id for update;
  if v.id is null then raise exception 'convite_inexistente'; end if;
  update public.convites set auth_user_id=p_auth_user_id, atualizado_em=now() where id=p_convite_id;
  insert into public.usuarios(id,nome,email) values (p_auth_user_id, coalesce(nullif(v.nome,''), split_part(v.email,'@',1)), v.email)
    on conflict (id) do update set email=excluded.email;
  if not exists(select 1 from public.organizacao_usuarios where organizacao_id=v.organizacao_id and usuario_id=p_auth_user_id) then
    insert into public.organizacao_usuarios(organizacao_id,usuario_id,papel,status) values (v.organizacao_id,p_auth_user_id,v.papel,'convidado');
  end if;
end $$;
revoke all on function public.convite_vincular(uuid,uuid) from public, anon, authenticated;
grant execute on function public.convite_vincular(uuid,uuid) to service_role;

-- ---------- COMPENSAÇÃO (rollback quando o Auth falhar) ----------
create or replace function public.convite_remover(p_convite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v public.convites;
begin
  select * into v from public.convites where id=p_convite_id for update;
  if v.id is null then return; end if;
  if v.auth_user_id is not null then
    delete from public.organizacao_usuarios where organizacao_id=v.organizacao_id and usuario_id=v.auth_user_id and status='convidado';
  end if;
  delete from public.convites where id=p_convite_id;  -- reserva liberada; auditoria (convite_criado) preservada
end $$;
revoke all on function public.convite_remover(uuid) from public, anon, authenticated;
grant execute on function public.convite_remover(uuid) to service_role;

-- ---------- ACEITAÇÃO BLINDADA ----------
-- Deriva o usuário de auth.uid(); NÃO aceita user_id do frontend. Transação única com lock.
create or replace function public.convite_aceitar()
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); v_email text; v_conv public.convites; v_lim int; v_ativos int; v_ja boolean; v_membro text;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select email into v_email from auth.users where id=uid;
  if v_email is null then raise exception 'email_indisponivel'; end if;
  v_email := lower(btrim(v_email));

  -- convite deste auth user, bloqueado para a transação
  select * into v_conv from public.convites where auth_user_id = uid and status='pendente' order by criado_em desc limit 1 for update;
  if v_conv.id is null then raise exception 'convite_inexistente'; end if;                 -- cancelado/aceito/usuário errado
  if lower(btrim(v_conv.email)) <> v_email then raise exception 'convite_email_divergente'; end if;
  if v_conv.expira_em < now() then
    update public.convites set status='expirado', atualizado_em=now() where id=v_conv.id;
    raise exception 'convite_expirado';
  end if;

  -- vínculo precisa existir como 'convidado' na MESMA org
  select status::text into v_membro from public.organizacao_usuarios where organizacao_id=v_conv.organizacao_id and usuario_id=uid;
  if v_membro is null or v_membro not in ('convidado','ativo') then raise exception 'vinculo_invalido'; end if;

  -- limite (defesa em profundidade)
  select limite_usuarios into v_lim from public.organizacao_limites where organizacao_id=v_conv.organizacao_id;
  select exists(select 1 from public.organizacao_usuarios where organizacao_id=v_conv.organizacao_id and usuario_id=uid and status='ativo') into v_ja;
  if v_lim is not null and not v_ja then
    select count(*)::int into v_ativos from public.organizacao_usuarios where organizacao_id=v_conv.organizacao_id and status='ativo';
    if v_ativos + 1 > v_lim then raise exception 'limite_plano'; end if;
  end if;

  insert into public.usuarios(id,nome,email) values (uid, coalesce(nullif(v_conv.nome,''), split_part(v_email,'@',1)), v_email)
    on conflict (id) do update set nome = coalesce(nullif(public.usuarios.nome,''), excluded.nome);
  update public.organizacao_usuarios set status='ativo', papel=v_conv.papel, atualizado_em=now()
    where organizacao_id=v_conv.organizacao_id and usuario_id=uid;
  update public.convites set status='aceito', aceito_em=now(), atualizado_em=now() where id=v_conv.id;
  insert into public.audit_log(organizacao_id,usuario_id,acao,entidade,entidade_id,dados_depois)
    values (v_conv.organizacao_id, uid, 'convite_aceito', 'convite', v_conv.id, jsonb_build_object('email',v_email,'papel',v_conv.papel));
  return jsonb_build_object('ok',true,'organizacao_id',v_conv.organizacao_id);
end $$;
revoke all on function public.convite_aceitar() from public, anon;
grant execute on function public.convite_aceitar() to authenticated;

notify pgrst, 'reload schema';
