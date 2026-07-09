-- Agendamento do health check automático (RMKT 3x/dia). pg_cron chama a edge wa-health-check via pg_net,
-- em modo AUTOMÁTICO (body vazio => testa só canais health_check_enabled=true E envio_restrito=false).
-- Horários: 12:00 / 16:00 / 20:00 UTC = 09:00 / 13:00 / 17:00 America/Sao_Paulo.
create extension if not exists pg_cron;

-- cron.schedule com nome é idempotente (substitui o job de mesmo nome).
select cron.schedule(
  'wa-health-check-diario',
  '0 12,16,20 * * *',
  $cron$
    select net.http_post(
      url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/wa-health-check',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-health-secret', (select secret from public.webhook_config where chave='health_check'))
    );
  $cron$
);
