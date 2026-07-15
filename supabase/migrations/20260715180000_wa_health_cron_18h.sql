-- Ajuste do horário do health check diário: 09h/13h/17h → 09h/13h/18h SP.
-- 0 12,16,21 UTC = 09:00 / 13:00 / 18:00 America/Sao_Paulo (manhã/tarde/noite).
-- cron.schedule é upsert por nome (substitui o job existente). Secret por subquery, nunca em texto.
select cron.schedule(
  'wa-health-check-diario',
  '0 12,16,21 * * *',
  $$
    select net.http_post(
      url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/wa-health-check',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-health-secret', (select secret from public.webhook_config where chave = 'health_check')
      )
    );
  $$
);
