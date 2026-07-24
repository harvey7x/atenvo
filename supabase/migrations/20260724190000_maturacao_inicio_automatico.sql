-- ============================================================================
-- MATURAÇÃO — início automático ao conectar
--
-- Antes: conectar o chip só mudava status_integracao. Alguém ainda precisava clicar
-- "Iniciar", e o planner só rodava às 07h — então um chip pareado às 10h ficava parado
-- até as 07h do dia seguinte.
--
-- Agora: ao conectar, o `maturacao-webhook` coloca o chip em 'aquecendo' e chama o planner
-- na hora. O guarda de perfil CONTINUA valendo (chip sem foto/nome é o padrão mais fácil de
-- detectar) — por isso a tela de conexão pede a confirmação do perfil antes do QR.
-- ============================================================================

alter table public.maturacao_config
  add column if not exists iniciar_automatico boolean not null default true;

comment on column public.maturacao_config.iniciar_automatico is
  'Ao conectar um chip com perfil_ok, entra em aquecimento e planeja o dia imediatamente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Início automático — chamado pelo webhook (service_role), não por usuário.
-- Idempotente: só age em chip 'novo' ou 'pausado' com perfil pronto e sessão aberta.
-- Devolve true quando de fato iniciou (o webhook usa isso para decidir se replaneja).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.maturacao_auto_iniciar(p_chip uuid)
returns boolean
language plpgsql security definer set search_path = public as $fn$
declare
  v_chip public.maturacao_chips%rowtype;
  v_auto boolean;
begin
  select * into v_chip from public.maturacao_chips where id = p_chip;
  if v_chip.id is null then return false; end if;

  select iniciar_automatico into v_auto
    from public.maturacao_config where organizacao_id = v_chip.organizacao_id;
  if not coalesce(v_auto, false) then return false; end if;

  -- guardas iguais aos do início manual: perfil pronto e sessão conectada
  if not v_chip.perfil_ok then return false; end if;
  if v_chip.status_integracao <> 'conectado' then return false; end if;
  if v_chip.status_maturacao not in ('novo', 'pausado') then return false; end if;

  update public.maturacao_chips set
    status_maturacao = 'aquecendo',
    dia_rampa        = case when v_chip.status_maturacao = 'pausado' then greatest(v_chip.dia_rampa, 1) else 0 end,
    iniciado_em      = coalesce(v_chip.iniciado_em, now()),
    pausado_motivo   = null,
    atualizado_em    = now()
  where id = p_chip;

  return true;
end $fn$;

revoke execute on function public.maturacao_auto_iniciar(uuid) from public, anon, authenticated;
grant  execute on function public.maturacao_auto_iniciar(uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- config_salvar passa a aceitar o novo campo (patch parcial, como os demais)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.maturacao_config_salvar(p_org uuid, p_patch jsonb)
returns public.maturacao_config
language plpgsql security definer set search_path = public as $fn$
declare v_row public.maturacao_config;
begin
  if not public._eh_admin_org(p_org) then raise exception 'sem_acesso'; end if;

  perform public.maturacao_config_obter(p_org);

  update public.maturacao_config set
    modo               = coalesce(p_patch->>'modo', modo),
    hora_inicio        = coalesce((p_patch->>'hora_inicio')::int, hora_inicio),
    hora_fim           = coalesce((p_patch->>'hora_fim')::int, hora_fim),
    dias_semana        = coalesce(
                           (select array_agg(value::text::int)
                              from jsonb_array_elements(p_patch->'dias_semana')),
                           dias_semana),
    rampa              = coalesce(p_patch->'rampa', rampa),
    dia_sementes       = coalesce((p_patch->>'dia_sementes')::int, dia_sementes),
    min_sementes       = coalesce((p_patch->>'min_sementes')::int, min_sementes),
    pct_sementes       = coalesce((p_patch->>'pct_sementes')::int, pct_sementes),
    dias_para_maduro   = coalesce((p_patch->>'dias_para_maduro')::int, dias_para_maduro),
    iniciar_automatico = coalesce((p_patch->>'iniciar_automatico')::boolean, iniciar_automatico),
    atualizado_em      = now(),
    atualizado_por     = auth.uid()
  where organizacao_id = p_org
  returning * into v_row;

  return v_row;
end $fn$;

revoke execute on function public.maturacao_config_salvar(uuid, jsonb) from public, anon;
grant  execute on function public.maturacao_config_salvar(uuid, jsonb) to authenticated;
