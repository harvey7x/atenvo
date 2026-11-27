-- =====================================================================
-- 55 — cron do motor: tempo limite de 58s (o padrão do pg_net é 5s, e uma
-- rodada do motor leva até ~55s com envio real). Troca SÓ o parâmetro dentro
-- do comando que já existe — o segredo do motor não aparece neste arquivo.
-- =====================================================================
do $$
declare j record;
begin
  for j in select jobid, command from cron.job where jobname = 'reviza_wa_motor' loop
    if position('timeout_milliseconds' in j.command) = 0 then
      perform cron.alter_job(j.jobid, command := replace(j.command, 'body := ''{}''::jsonb', 'body := ''{}''::jsonb, timeout_milliseconds := 58000'));
    end if;
  end loop;
end $$;
