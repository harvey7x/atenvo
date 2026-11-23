-- =====================================================================================
-- Central de Avisos (ex-"Radar de Atendimento") DESLIGADA — dono 19/11: "preciso que remova essa central de avisos
-- [e] os avisos acima ligados a ela"; escolheu tirar TUDO do Radar da tela e desligar o motor.
-- - PARA os dois relógios que alimentavam a Central: vacuo-guardiao (vacuo_avaliar, todo minuto) e robo-ligar
--   (robo_ligar_avaliar, a cada 2 min). Só para (cron.alter_job active=false): nada é apagado nem desagendado.
-- - NÃO mexe em: vacuo_config.ativo (o "passado para você", o bom dia e o assistente usam vacuo_horario_aberto() e a
--   hora_fim), nas tabelas e funções do Radar (aba antiga ainda aberta chama até recarregar; o Dashboard lê
--   vacuo_estado), em sla_avaliar, no Vigia (guardiao_resposta_*) nem nos outros relógios.
-- - Os avisos que já estavam abertos ficam no banco, sem aparecer (a tela nova não lê nada do Radar).
-- - Religar DO ZERO (recomendado; religar só o cron reavalia 14 dias de uma vez):
--     update public.vacuo_config set ativo_desde = now(), robo_ligar_desde = now(), atualizado_em = now()
--      where organizacao_id = 'de300000-0000-4000-8000-000000000001';
--     select cron.alter_job(jobid, active := true) from cron.job where jobname in ('vacuo-guardiao', 'robo-ligar');
-- =====================================================================================
set lock_timeout = '5s';

do $desliga$
declare v_n integer;
begin
  select count(*) into v_n from cron.job where jobname in ('vacuo-guardiao', 'robo-ligar');
  if v_n <> 2 then
    raise exception 'esperava os 2 relógios da Central (vacuo-guardiao, robo-ligar), achei %', v_n;
  end if;
  perform cron.alter_job(j.jobid, active := false) from cron.job j where j.jobname in ('vacuo-guardiao', 'robo-ligar');
end
$desliga$;
