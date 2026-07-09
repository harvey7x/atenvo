-- WhatsApp health check por canal (E2 + E2.1). Só ESTRUTURA + RPCs auditadas; agendamento/edge à parte.
-- Não toca em Kanban/Relatórios/Ficha/Cobranças/distribuição. Não altera outros canais.

-- ===== E2: colunas de health check em canais =====
alter table public.canais
  add column if not exists health_check_enabled boolean not null default false,
  add column if not exists health_check_target_phone text,
  add column if not exists health_check_frequency_per_day integer not null default 0,
  add column if not exists health_check_last_run_at timestamptz,
  add column if not exists health_check_last_success_at timestamptz,
  add column if not exists health_check_fail_count integer not null default 0,
  add column if not exists health_check_status text not null default 'desabilitado',
  add column if not exists health_check_last_error text,
  add column if not exists auto_restrict_on_failure boolean not null default false;
comment on column public.canais.health_check_status is 'desabilitado | saudavel | atencao | falha | restrito';

-- ===== E2: histórico de execuções =====
create table if not exists public.canal_health_runs (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  canal_id uuid not null references public.canais(id) on delete cascade,
  executado_em timestamptz not null default now(),
  tipo text not null,                 -- manual | automatico
  sucesso boolean not null,
  status_resultado text,
  erro text,
  erro_tipo text,                     -- infra | conta | permissao | desconhecido
  message_id text,
  instancia_externa text,
  target_phone text,
  latencia_ms integer,
  dados jsonb,
  criado_por uuid,
  criado_em timestamptz not null default now()
);
create index if not exists idx_chr_org on public.canal_health_runs (organizacao_id);
create index if not exists idx_chr_canal_exec on public.canal_health_runs (canal_id, executado_em desc);
create index if not exists idx_chr_exec on public.canal_health_runs (executado_em desc);
create index if not exists idx_chr_sucesso on public.canal_health_runs (sucesso);

alter table public.canal_health_runs enable row level security;
-- Leitura: membro ativo da org. Escrita: só service_role (edge function) — bypassa RLS; sem policy de write.
drop policy if exists chr_sel on public.canal_health_runs;
create policy chr_sel on public.canal_health_runs for select to authenticated
  using (public.is_member(organizacao_id) or public.is_platform_admin());
grant select on public.canal_health_runs to authenticated;

-- ===== E2.1: RPCs auditadas (admin/supervisor) =====
create or replace function public.wa_canal_liberar_envio(p_canal uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_antes jsonb; v_num text;
begin
  select organizacao_id, numero_conectado into v_org, v_num from canais where id = p_canal;
  if v_org is null then raise exception 'canal_nao_encontrado'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[]))) then
    raise exception 'sem_permissao';
  end if;
  select jsonb_build_object('envio_restrito', envio_restrito, 'envio_restrito_motivo', envio_restrito_motivo, 'numero', numero_conectado) into v_antes from canais where id = p_canal;
  -- Libera; PRESERVA envio_restrito_em/_por/_motivo antigos (histórico da restrição).
  update canais set envio_restrito = false where id = p_canal;
  insert into audit_log (usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois, organizacao_id)
  values (auth.uid(), 'liberar_envio_canal', 'canais', p_canal, v_antes,
          jsonb_build_object('envio_restrito', false, 'numero', v_num, 'motivo_liberacao', p_motivo), v_org);
  return jsonb_build_object('ok', true, 'canal', p_canal);
end $$;

create or replace function public.wa_canal_restringir_envio(p_canal uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_antes jsonb;
begin
  select organizacao_id into v_org from canais where id = p_canal;
  if v_org is null then raise exception 'canal_nao_encontrado'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[]))) then
    raise exception 'sem_permissao';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then raise exception 'motivo_obrigatorio'; end if;
  select jsonb_build_object('envio_restrito', envio_restrito) into v_antes from canais where id = p_canal;
  update canais set envio_restrito = true, envio_restrito_em = now(), envio_restrito_por = auth.uid(), envio_restrito_motivo = p_motivo where id = p_canal;
  insert into audit_log (usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois, organizacao_id)
  values (auth.uid(), 'restringir_envio_canal', 'canais', p_canal, v_antes,
          jsonb_build_object('envio_restrito', true, 'motivo', p_motivo), v_org);
  return jsonb_build_object('ok', true, 'canal', p_canal);
end $$;

create or replace function public.wa_canal_configurar_health_check(
  p_canal uuid, p_enabled boolean, p_target_phone text, p_frequency integer, p_auto_restrict boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_restrito boolean; v_antes jsonb; v_target text;
begin
  select organizacao_id, envio_restrito into v_org, v_restrito from canais where id = p_canal;
  if v_org is null then raise exception 'canal_nao_encontrado'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[]))) then
    raise exception 'sem_permissao';
  end if;
  v_target := nullif(btrim(coalesce(p_target_phone, '')), '');
  if p_enabled and v_target is null then raise exception 'target_phone_obrigatorio'; end if;
  -- Regra: não habilitar health check automático em canal RESTRITO (restrito exige teste manual autorizado).
  if p_enabled and v_restrito then raise exception 'canal_restrito_nao_pode_health_automatico'; end if;
  select jsonb_build_object('enabled', health_check_enabled, 'target', health_check_target_phone, 'freq', health_check_frequency_per_day, 'auto_restrict', auto_restrict_on_failure, 'status', health_check_status) into v_antes from canais where id = p_canal;
  update canais set
    health_check_enabled = p_enabled,
    health_check_target_phone = v_target,
    health_check_frequency_per_day = greatest(coalesce(p_frequency, 0), 0),
    auto_restrict_on_failure = coalesce(p_auto_restrict, false),
    health_check_status = case when p_enabled then 'saudavel' else 'desabilitado' end,
    health_check_fail_count = 0, health_check_last_error = null
  where id = p_canal;
  insert into audit_log (usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois, organizacao_id)
  values (auth.uid(), 'configurar_health_check', 'canais', p_canal, v_antes,
          jsonb_build_object('enabled', p_enabled, 'target', v_target, 'freq', p_frequency, 'auto_restrict', p_auto_restrict), v_org);
  return jsonb_build_object('ok', true, 'canal', p_canal);
end $$;

-- Dispara um teste MANUAL (admin/supervisor). Chama a edge wa-health-check via pg_net com o secret do
-- webhook_config (chave='health_check'). O resultado é gravado async em canal_health_runs pela função.
create or replace function public.wa_canal_executar_health_check_manual(p_canal uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp, extensions as $$
declare v_org uuid; v_secret text; v_req bigint;
begin
  select organizacao_id into v_org from canais where id = p_canal;
  if v_org is null then raise exception 'canal_nao_encontrado'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[]))) then
    raise exception 'sem_permissao';
  end if;
  select secret into v_secret from webhook_config where chave = 'health_check';
  if v_secret is null then raise exception 'health_secret_ausente'; end if;
  select extensions.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/wa-health-check',
    headers := jsonb_build_object('Content-Type','application/json','x-health-secret', v_secret),
    body := jsonb_build_object('canal_id', p_canal, 'tipo', 'manual', 'criado_por', auth.uid())
  ) into v_req;
  insert into audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(), 'health_check_manual', 'canais', p_canal, jsonb_build_object('request_id', v_req), v_org);
  return jsonb_build_object('ok', true, 'request_id', v_req);
end $$;

revoke all on function public.wa_canal_liberar_envio(uuid, text) from public, anon;
revoke all on function public.wa_canal_restringir_envio(uuid, text) from public, anon;
revoke all on function public.wa_canal_configurar_health_check(uuid, boolean, text, integer, boolean) from public, anon;
revoke all on function public.wa_canal_executar_health_check_manual(uuid) from public, anon;
grant execute on function public.wa_canal_liberar_envio(uuid, text) to authenticated;
grant execute on function public.wa_canal_restringir_envio(uuid, text) to authenticated;
grant execute on function public.wa_canal_configurar_health_check(uuid, boolean, text, integer, boolean) to authenticated;
grant execute on function public.wa_canal_executar_health_check_manual(uuid) to authenticated;
notify pgrst, 'reload schema';
