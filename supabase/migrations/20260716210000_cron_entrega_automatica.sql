-- ============================================================================
-- Cron do MONITORAMENTO AUTOMÁTICO DE ENTREGA.
--
-- Roda a cada MINUTO e a própria função decide quem está "na vez": cada canal tem um slot
-- determinístico (hash do canal_id % 12) e dispara quando `minuto % 12 == slot` ⇒ exatamente
-- 5 testes/h por canal, espalhados (sem rajada). Ver supabase/functions/wa-health-check/agenda.ts.
--
-- O secret é lido do banco em RUNTIME (webhook_config.health_check) — nada hardcoded aqui, e vai
-- por HEADER (x-health-secret), nunca por query string.
--
-- Se a função não tiver nenhum canal na vez, retorna {resultados: []} — chamada barata.
-- ============================================================================

select cron.unschedule('wa-entrega-automatica')
where exists (select 1 from cron.job where jobname = 'wa-entrega-automatica');

select cron.schedule(
  'wa-entrega-automatica',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/wa-health-check',
    body := '{"tipo":"entrega_automatica"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-health-secret', (select secret from public.webhook_config where chave = 'health_check')
    )
  );
  $$
);
