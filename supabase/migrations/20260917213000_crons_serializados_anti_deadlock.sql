-- 17/09: no pico de tráfego (webhooks 25x) o sla_avaliar (cron 1min) chegou a 66s
-- e passou a se atropelar (execução seguinte começando antes da anterior acabar),
-- virando carga contínua. Além disso, deadlocks recorrentes sla_avaliar ×
-- distribuir_leads_sem_dono, que disparam no mesmo tick de :00.
-- Serializa os dois no mesmo advisory lock transacional (liberado no fim da
-- transação, sem risco de lock órfão): o SLA PULA o minuto se o lock estiver
-- ocupado; o distribuir ESPERA até 30s e desiste limpo.

create or replace function public.sla_avaliar_tick()
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if not pg_try_advisory_xact_lock(42917001) then
    return jsonb_build_object('pulado', true);
  end if;
  return public.sla_avaliar(null);
end $$;

create or replace function public.distribuir_leads_sem_dono_tick(
  p_carencia_min integer default 20,
  p_janela_horas integer default 24,
  p_max integer default 50
)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform set_config('lock_timeout', '30s', true);
  perform pg_advisory_xact_lock(42917001);
  perform set_config('lock_timeout', '0', true);
  return public.distribuir_leads_sem_dono(p_carencia_min, p_janela_horas, p_max);
exception when lock_not_available then
  return jsonb_build_object('pulado', true, 'motivo', 'lock_timeout');
end $$;

-- só o cron (postgres) chama os ticks
revoke all on function public.sla_avaliar_tick() from public, anon, authenticated;
revoke all on function public.distribuir_leads_sem_dono_tick(integer, integer, integer) from public, anon, authenticated;

-- cron.schedule com jobname existente atualiza o job no lugar (mantém jobid)
select cron.schedule('sla-avaliar', '* * * * *', ' select public.sla_avaliar_tick(); ');
select cron.schedule('distribuir-leads-sem-dono', '*/5 * * * *', ' select public.distribuir_leads_sem_dono_tick(20, 24, 50); ');
