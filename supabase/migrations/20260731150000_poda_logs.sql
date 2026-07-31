-- Poda de tabelas-log que só crescem.
--
-- whatsapp_webhook_events: log de DIAGNÓSTICO puro — o payload "NUNCA é re-lido por
-- código" (evolution-webhook/index.ts:86); só INSERT + UPDATE de status na mesma
-- request, nunca consultado para idempotência. Logo, apagar linhas antigas é seguro.
-- ~46k das 49k linhas eram >7 dias (backlog de jun/jul). Retenção: 14 dias.
--
-- cron.job_run_details: histórico interno do pg_cron, cresce sem parar. Retenção: 7 dias.
--
-- Função + cron diário para manter o teto. Sem VACUUM aqui (não roda em transação);
-- o VACUUM ANALYZE inicial é rodado fora da migration.

create or replace function public.prune_logs()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.whatsapp_webhook_events
   where recebido_em < now() - interval '14 days';
  delete from cron.job_run_details
   where end_time < now() - interval '7 days';
end;
$$;

revoke all on function public.prune_logs() from public, anon, authenticated;

-- cron diário às 07:00 UTC (04:00 America/Sao_Paulo) — horário calmo.
select cron.schedule('prune-logs', '0 7 * * *', $$select public.prune_logs();$$);
