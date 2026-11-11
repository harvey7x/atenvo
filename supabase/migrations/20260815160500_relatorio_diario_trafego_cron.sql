-- Relatório diário de tráfego — secret + agendamento.
--
-- 00:30 America/Sao_Paulo = 03:30 UTC. O Brasil não tem horário de verão desde 2019,
-- então o offset -03 é fixo e a conversão não escorrega ao longo do ano.
--
-- O secret é gerado AQUI e lido do próprio banco pelos dois lados (o cron no header,
-- a edge function na validação) — não há valor hardcoded pra ficar defasado.
-- on conflict do nothing: reaplicar a migration não rotaciona o secret nem derruba o job.

insert into public.webhook_config (chave, secret)
values (
  'relatorio_trafego',
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
)
on conflict (chave) do nothing;

select cron.unschedule('relatorio-diario-trafego')
where exists (select 1 from cron.job where jobname = 'relatorio-diario-trafego');

select cron.schedule(
  'relatorio-diario-trafego',
  '30 3 * * *',
  $job$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/relatorio-diario-trafego',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-relatorio-secret', (select secret from public.webhook_config where chave = 'relatorio_trafego')
    )
  );
  $job$
);
