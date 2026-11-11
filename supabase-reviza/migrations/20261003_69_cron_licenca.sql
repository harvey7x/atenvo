-- Reviza · mig 69 — cron da licença da plataforma: chama reviza-licenca?acao=cron
-- de hora em hora (minuto 7). No dia 1º a rodada cria a fatura + Pix do mês; nas
-- demais, dá baixa oportunista (webhook perdido) e regera Pix expirado/cancelado.
-- O header x-motor-secret é clonado do cron do motor (o segredo nunca sai do banco).
do $$
declare v_sec text;
begin
  select substring(command from 'x-motor-secret"\s*:\s*"([^"]+)"') into v_sec
    from cron.job where jobname = 'reviza_wa_motor';
  if v_sec is null then raise exception 'não achei o x-motor-secret no cron do motor'; end if;
  perform cron.unschedule('reviza_licenca') where exists (select 1 from cron.job where jobname='reviza_licenca');
  perform cron.schedule('reviza_licenca', '7 * * * *', format($cmd$
  select net.http_post(
    url := 'https://ftexrtyswpdcndbkjbtf.supabase.co/functions/v1/reviza-licenca?acao=cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-motor-secret', %L),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );$cmd$, v_sec));
end $$;
