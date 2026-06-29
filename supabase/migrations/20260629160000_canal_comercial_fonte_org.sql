-- Segurança: fontes_aquisicao é por organização. Garante que p_fonte_aquisicao_id pertença à
-- mesma organização do canal (impede vincular fonte de outra org). Apenas adiciona essa checagem.
create or replace function public.atualizar_canal_comercial(
  p_canal uuid, p_nome text, p_origem_tipo text, p_gestor_id uuid,
  p_fonte_aquisicao_id uuid, p_campanha text, p_observacao text)
  returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then raise exception 'canal_invalido'; end if;
  if not coalesce(
       public.is_platform_admin()
       or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[])),
     false) then
    raise exception 'sem_permissao';
  end if;
  if p_origem_tipo is not null and p_origem_tipo not in ('trafego','ura','organico','indicacao','campanha','parceiro','outro') then
    raise exception 'origem_tipo_invalido';
  end if;
  if p_gestor_id is not null and not exists (
      select 1 from public.organizacao_usuarios where organizacao_id = v_org and usuario_id = p_gestor_id and status = 'ativo') then
    raise exception 'gestor_invalido';
  end if;
  if p_fonte_aquisicao_id is not null and not exists (
      select 1 from public.fontes_aquisicao where id = p_fonte_aquisicao_id and organizacao_id = v_org) then
    raise exception 'fonte_invalida';
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
