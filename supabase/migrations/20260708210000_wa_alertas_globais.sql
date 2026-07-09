-- Alerta global de canais WhatsApp: silenciamento por canal + RPCs (listar/silenciar/reativar).
-- Não toca em Kanban/Relatórios/Ficha/Cobranças/distribuição nem no health check/cron do RMKT.

-- ===== F1: campos de silenciamento =====
alter table public.canais
  add column if not exists alerta_silenciado boolean not null default false,
  add column if not exists alerta_silenciado_ate timestamptz,        -- null + silenciado=true => "até reconexão"
  add column if not exists alerta_silenciado_motivo text,
  add column if not exists alerta_silenciado_por uuid;

-- ===== RPC: alertas globais (só canais WhatsApp com problema ATIVO e NÃO silenciado) =====
create or replace function public.wa_canais_alertas_globais(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then
    raise exception 'sem_acesso' using errcode='insufficient_privilege';
  end if;
  with base as (
    select c.id, c.nome_interno, c.status_integracao, c.envio_restrito, c.health_check_status,
           c.health_check_fail_count, c.alerta_silenciado, c.alerta_silenciado_ate, c.criado_em,
      -- severidade: 3=critico, 2=alto, 1=medio, 0=sem alerta
      case
        when c.envio_restrito or c.health_check_status = 'restrito' then 3
        when c.health_check_status = 'falha' or coalesce(c.health_check_fail_count,0) >= 2 then 2
        when c.status_integracao = 'desconectado' or c.health_check_status = 'atencao' then 1
        else 0
      end sev
    from canais c
    where c.organizacao_id = p_org and c.provider = 'evolution' and c.status_integracao <> 'removido'
  ),
  ativos as (
    -- descarta sem alerta e silenciados vigentes (silenciado=true e (ate nulo OU ate no futuro))
    select * from base
    where sev > 0
      and not (alerta_silenciado and (alerta_silenciado_ate is null or alerta_silenciado_ate > now()))
  ),
  itens as (
    select id, nome_interno, sev,
      case sev when 3 then 'critico' when 2 then 'alto' else 'medio' end severidade,
      case
        when envio_restrito or health_check_status='restrito' then 'envio_restrito'
        when health_check_status='falha' or coalesce(health_check_fail_count,0)>=2 then 'health_falha'
        when status_integracao='desconectado' then 'desconectado'
        else 'health_atencao'
      end tipo_alerta,
      case
        when health_check_status='restrito' then '🚨 WhatsApp '||nome_interno||' foi restringido automaticamente após falhas consecutivas.'
        when envio_restrito then '⚠️ WhatsApp '||nome_interno||' com envio restrito. O sistema bloqueou envios para proteger o número.'
        when health_check_status='falha' or coalesce(health_check_fail_count,0)>=2 then '⚠️ WhatsApp '||nome_interno||' apresentou falha no último teste de saúde.'
        when status_integracao='desconectado' then '⚠️ WhatsApp '||nome_interno||' está desconectado. Reconecte em Integrações > WhatsApp.'
        else '⚠️ WhatsApp '||nome_interno||' em atenção no teste de saúde.'
      end titulo
    from ativos
  )
  select jsonb_build_object(
    'total', (select count(*) from itens),
    'criticos', (select count(*) from itens where sev=3),
    'altos', (select count(*) from itens where sev=2),
    'medios', (select count(*) from itens where sev=1),
    'severidade_max', coalesce((select max(sev) from itens),0),
    'acao_url', '/integracoes',
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'canal_id', id, 'nome_interno', nome_interno, 'severidade', severidade, 'tipo_alerta', tipo_alerta,
        'titulo', titulo, 'acao_label', 'Ver detalhes', 'acao_url', '/integracoes'
      ) order by sev desc, nome_interno) from itens), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- ===== RPC: silenciar (admin/supervisor) — p_ate null = até reconexão =====
create or replace function public.wa_canal_silenciar_alerta(p_canal uuid, p_ate timestamptz, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from canais where id = p_canal;
  if v_org is null then raise exception 'canal_nao_encontrado'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[]))) then
    raise exception 'sem_permissao';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'motivo_obrigatorio'; end if;
  update canais set alerta_silenciado = true, alerta_silenciado_ate = p_ate, alerta_silenciado_motivo = p_motivo, alerta_silenciado_por = auth.uid()
  where id = p_canal;
  insert into audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(), 'silenciar_alerta_canal', 'canais', p_canal,
          jsonb_build_object('ate', p_ate, 'motivo', p_motivo), v_org);
  return jsonb_build_object('ok', true, 'canal', p_canal);
end $$;

-- ===== RPC: reativar (admin/supervisor) =====
create or replace function public.wa_canal_reativar_alerta(p_canal uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from canais where id = p_canal;
  if v_org is null then raise exception 'canal_nao_encontrado'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[]))) then
    raise exception 'sem_permissao';
  end if;
  update canais set alerta_silenciado = false, alerta_silenciado_ate = null, alerta_silenciado_motivo = null, alerta_silenciado_por = null
  where id = p_canal;
  insert into audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(), 'reativar_alerta_canal', 'canais', p_canal, jsonb_build_object('reativado', true), v_org);
  return jsonb_build_object('ok', true, 'canal', p_canal);
end $$;

revoke all on function public.wa_canais_alertas_globais(uuid) from public, anon;
revoke all on function public.wa_canal_silenciar_alerta(uuid, timestamptz, text) from public, anon;
revoke all on function public.wa_canal_reativar_alerta(uuid) from public, anon;
grant execute on function public.wa_canais_alertas_globais(uuid) to authenticated;
grant execute on function public.wa_canal_silenciar_alerta(uuid, timestamptz, text) to authenticated;
grant execute on function public.wa_canal_reativar_alerta(uuid) to authenticated;
notify pgrst, 'reload schema';
