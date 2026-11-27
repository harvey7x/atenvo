-- Reviza — Envios de verdade (pedido do dono 11/09): agendar dia/horário ou enviar
-- agora, escolhendo o canal. Admin envia por qualquer canal; comercial só pelo dele.
-- Motor: cron a cada minuto chama a edge reviza-wa-motor (processa ~10 alvos/min —
-- o ritmo também protege o número novo contra ban).

alter table public.wa_envios add column if not exists agendado_para timestamptz;
create index if not exists wa_envios_due_idx on public.wa_envios(agendado_para) where estado in ('rascunho','enviando');

-- RLS alinhada à privacidade dos canais: envio segue o canal (dono vê/cria; gestor tudo)
drop policy if exists wa_envios_sel on public.wa_envios;
create policy wa_envios_sel on public.wa_envios for select to authenticated
  using (public.wa_pode_ver_canal(canal_id));
drop policy if exists wa_envios_ins on public.wa_envios;
create policy wa_envios_ins on public.wa_envios for insert to authenticated
  with check (criado_por = auth.uid() and (public.is_at_least('gestor')
              or exists (select 1 from public.wa_canais c where c.id = canal_id and c.dono_id = auth.uid())));
drop policy if exists wa_envios_upd on public.wa_envios;
create policy wa_envios_upd on public.wa_envios for update to authenticated
  using (public.is_at_least('gestor') or criado_por = auth.uid())
  with check (public.is_at_least('gestor') or criado_por = auth.uid());

drop policy if exists wa_alvos_sel on public.wa_envio_alvos;
create policy wa_alvos_sel on public.wa_envio_alvos for select to authenticated
  using (exists (select 1 from public.wa_envios e where e.id = envio_id and public.wa_pode_ver_canal(e.canal_id)));
drop policy if exists wa_alvos_ins on public.wa_envio_alvos;
create policy wa_alvos_ins on public.wa_envio_alvos for insert to authenticated
  with check (exists (select 1 from public.wa_envios e where e.id = envio_id
              and (public.is_at_least('gestor') or e.criado_por = auth.uid())));
drop policy if exists wa_alvos_del on public.wa_envio_alvos;
create policy wa_alvos_del on public.wa_envio_alvos for delete to authenticated
  using (status = 'pendente' and exists (select 1 from public.wa_envios e where e.id = envio_id
         and (public.is_at_least('gestor') or e.criado_por = auth.uid())));

-- cron: a cada minuto o motor processa os envios com hora chegada
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin perform cron.unschedule('reviza_wa_motor'); exception when others then null; end $$;
select cron.schedule('reviza_wa_motor', '* * * * *', $$
  select net.http_post(
    url := 'https://ftexrtyswpdcndbkjbtf.supabase.co/functions/v1/reviza-wa-motor',
    headers := '{"Content-Type":"application/json","x-motor-secret":"<MOTOR_SECRET — definido fora do repo; rotacionado em 24/09>"}'::jsonb,
    body := '{}'::jsonb
  );
$$);
