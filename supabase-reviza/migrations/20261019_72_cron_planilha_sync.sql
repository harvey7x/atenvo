-- ============================================================================
-- Reviza · mig 72 — cron da sincronização da planilha: chama
-- reviza-planilha-sync?acao=cron a cada 15 min.
--
-- Arquivo SEPARADO de propósito: o orquestrador aplica DEPOIS do deploy da
-- edge reviza-planilha-sync. A rodada é INERTE enquanto a sync está desligada
-- (fail-closed: sem credencial/config/teste/automatico a função devolve
-- {ok, inerte} e não toca em nada) — mas agendar antes do deploy encheria o
-- log do cron de 404.
--
-- O header x-motor-secret é clonado do cron do motor (padrão da mig 69: o
-- segredo nunca sai do banco nem entra no repositório). timeout 58s: a rodada
-- lê a planilha inteira no Google e aplica o diff (o intervalo é 15 min, não
-- há sobreposição — e a própria função tem lease em processando_ate).
-- ============================================================================
do $$
declare v_sec text;
begin
  select substring(command from 'x-motor-secret"\s*:\s*"([^"]+)"') into v_sec
    from cron.job where jobname = 'reviza_wa_motor';
  if v_sec is null then raise exception 'não achei o x-motor-secret no cron do motor'; end if;
  perform cron.unschedule('reviza_planilha_sync') where exists (select 1 from cron.job where jobname = 'reviza_planilha_sync');
  perform cron.schedule('reviza_planilha_sync', '*/15 * * * *', format($cmd$
  select net.http_post(
    url := 'https://ftexrtyswpdcndbkjbtf.supabase.co/functions/v1/reviza-planilha-sync?acao=cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-motor-secret', %L),
    body := '{}'::jsonb,
    timeout_milliseconds := 58000
  );$cmd$, v_sec));
end $$;
