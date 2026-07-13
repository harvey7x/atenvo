-- Cron do bot-remarketing: chama a edge a cada 10 min. INERTE por default —
--  * body '{}' → dry_run=true e force=false; edge com REMARKETING_ATIVO=nao só faz o sync (não envia).
--  * secret NUNCA em texto no job: subquery lê webhook_config em runtime (padrão do wa-health-check).
--  * cron.schedule é upsert por jobname (idempotente ao reaplicar).
-- Para desligar: select cron.unschedule('bot-remarketing');
select cron.schedule(
  'bot-remarketing',
  '*/10 * * * *',
  $$
    select net.http_post(
      url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/bot-remarketing',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-bot-secret', (select secret from public.webhook_config where chave = 'bot_remarketing')
      )
    );
  $$
);
