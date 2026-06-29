-- Autorização real (não só UI) para edição comercial do canal.
-- 1) RPC dedicada (security definer) que valida org + papel admin/supervisor e altera só os campos comerciais.
-- 2) Endurece canais_upd para admin/supervisor (igual a canais_del). Fluxos técnicos usam service_role (ignoram RLS).

create or replace function public.atualizar_canal_comercial(
  p_canal uuid, p_nome text, p_origem_tipo text, p_gestor_id uuid,
  p_fonte_aquisicao_id uuid, p_campanha text, p_observacao text)
  returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then raise exception 'canal_invalido'; end if;
  if not (public.is_platform_admin() or (public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[]) and public.org_operacional(v_org))) then
    raise exception 'sem_permissao';
  end if;
  if p_origem_tipo is not null and p_origem_tipo not in ('trafego','ura','organico','indicacao','campanha','parceiro','outro') then
    raise exception 'origem_tipo_invalido';
  end if;
  if p_gestor_id is not null and not exists (
      select 1 from public.organizacao_usuarios where organizacao_id = v_org and usuario_id = p_gestor_id and status = 'ativo') then
    raise exception 'gestor_invalido';
  end if;
  update public.canais set
    nome_interno = coalesce(nullif(btrim(p_nome), ''), nome_interno),
    origem_tipo = p_origem_tipo,
    gestor_id = p_gestor_id,
    fonte_aquisicao_id = p_fonte_aquisicao_id,
    campanha = nullif(btrim(p_campanha), ''),
    observacao_comercial = nullif(btrim(p_observacao), '')
  where id = p_canal;
end $$;
revoke all on function public.atualizar_canal_comercial(uuid,text,text,uuid,uuid,text,text) from public, anon;
grant execute on function public.atualizar_canal_comercial(uuid,text,text,uuid,uuid,text,text) to authenticated;

-- Endurece UPDATE direto: somente admin/supervisor (platform admin) da própria org.
drop policy canais_upd on public.canais;
create policy canais_upd on public.canais for update
  using (public.is_platform_admin() or (public.papel_na_org(organizacao_id) = any (array['admin','supervisor']::user_role[]) and public.org_operacional(organizacao_id)))
  with check (public.is_platform_admin() or (public.papel_na_org(organizacao_id) = any (array['admin','supervisor']::user_role[]) and public.org_operacional(organizacao_id)));
