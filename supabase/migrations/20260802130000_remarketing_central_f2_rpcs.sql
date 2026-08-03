-- ============================================================================
-- CENTRAL DE REMARKETING — F2: RPCs para o frontend
-- (config admin-gated + dashboard agregado). Motor segue INERTE (sem cron).
-- ============================================================================

-- Salvar config (admin/supervisor). ativo false→true carimba ativo_desde=now()
-- (corte de backlog); true→false preserva o carimbo (religar re-carimba).
create or replace function public.remarketing_config_salvar(
  p_org uuid,
  p_ativo boolean,
  p_fluxo1_min int,
  p_pendencia_dias int,
  p_recuperacao_dias int,
  p_fila uuid[]
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_antes boolean;
begin
  if not public._eh_admin_org(p_org) then raise exception 'sem_permissao'; end if;
  if coalesce(p_fluxo1_min, 0) < 5 or coalesce(p_pendencia_dias, 0) < 1 or coalesce(p_recuperacao_dias, 0) < 1 then
    raise exception 'prazos_invalidos';
  end if;

  select ativo into v_antes from public.remarketing_config where organizacao_id = p_org;

  insert into public.remarketing_config (organizacao_id, ativo, ativo_desde, fluxo1_min, pendencia_dias, recuperacao_dias, fila_recuperacao, atualizado_em)
  values (p_org, p_ativo, case when p_ativo then now() else null end, p_fluxo1_min, p_pendencia_dias, p_recuperacao_dias, coalesce(p_fila, '{}'), now())
  on conflict (organizacao_id) do update set
    ativo = excluded.ativo,
    -- só re-carimba na VIRADA false→true; ligado permanece com o carimbo original
    ativo_desde = case
      when excluded.ativo and coalesce(remarketing_config.ativo, false) = false then now()
      when excluded.ativo then remarketing_config.ativo_desde
      else remarketing_config.ativo_desde end,
    fluxo1_min = excluded.fluxo1_min,
    pendencia_dias = excluded.pendencia_dias,
    recuperacao_dias = excluded.recuperacao_dias,
    fila_recuperacao = excluded.fila_recuperacao,
    atualizado_em = now();

  return (select to_jsonb(rc) from public.remarketing_config rc where rc.organizacao_id = p_org);
end $$;

-- Dashboard agregado (1 chamada; front não fica somando no cliente).
create or replace function public.remarketing_dashboard(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_member(p_org) and not public.is_platform_admin() then null else jsonb_build_object(
    'por_etapa', coalesce((
      select jsonb_object_agg(etapa, n) from (
        select etapa, count(*) as n from public.remarketing_leads
        where organizacao_id = p_org and status = 'ativo' group by etapa
      ) s), '{}'::jsonb),
    'por_atendente', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'n', s.n) order by s.n desc) from (
        select responsavel_id, count(*) as n from public.remarketing_leads
        where organizacao_id = p_org and status = 'ativo' and responsavel_id is not null
        group by responsavel_id
      ) s join public.usuarios u on u.id = s.responsavel_id), '[]'::jsonb),
    'sem_responsavel', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'ativo' and responsavel_id is null),
    'ativos', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'ativo'),
    'recuperados_30d', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'recuperado' and encerrado_em >= now() - interval '30 days'),
    'perdidos_30d', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'perdido' and encerrado_em >= now() - interval '30 days'),
    'taxa_recuperacao', (
      select case when (rec + per) = 0 then null else round(rec::numeric / (rec + per) * 100, 1) end from (
        select
          count(*) filter (where status = 'recuperado' and encerrado_em >= now() - interval '30 days') as rec,
          count(*) filter (where status = 'perdido'    and encerrado_em >= now() - interval '30 days') as per
        from public.remarketing_leads where organizacao_id = p_org
      ) t),
    'tempo_medio_recuperacao_h', (
      select round(avg(extract(epoch from (encerrado_em - criado_em)) / 3600)::numeric, 1)
      from public.remarketing_leads
      where organizacao_id = p_org and status = 'recuperado' and encerrado_em >= now() - interval '30 days'),
    'tempo_medio_sem_resposta_h', (
      select round(avg(extract(epoch from (now() - cv.ultima_entrada_em)) / 3600)::numeric, 1)
      from public.remarketing_leads rl join public.conversas cv on cv.id = rl.conversa_id
      where rl.organizacao_id = p_org and rl.status = 'ativo' and cv.ultima_entrada_em is not null),
    'tarefas_pendentes', (select count(*) from public.remarketing_tarefas where organizacao_id = p_org and status = 'pendente'),
    'tarefas_vencidas', (select count(*) from public.remarketing_tarefas where organizacao_id = p_org and status = 'pendente' and vence_em < now())
  ) end;
$$;

do $g$
declare fn text;
begin
  foreach fn in array array[
    'remarketing_config_salvar(uuid, boolean, int, int, int, uuid[])',
    'remarketing_dashboard(uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated, service_role;', fn);
  end loop;
end $g$;
