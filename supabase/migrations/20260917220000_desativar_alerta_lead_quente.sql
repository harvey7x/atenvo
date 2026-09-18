-- 17/09, decisão do dono: a distribuição de leads agora é automática
-- (distribuir_leads_sem_dono + bot_rotear_consultor no cron de 5min), então o
-- alerta de lead quente (modal "assumir cliente" com som na aba WhatsApp) não
-- deve mais notificar a equipe. Ele tinha voltado a disparar em 17/09 quando o
-- bug do ON CONFLICT foi corrigido (20260917214000) — a correção fica, a função
-- é DESLIGADA por decisão de produto.
--
-- Desativação REVERSÍVEL, nada é dropado. Para reativar:
--   select cron.alter_job(jobid, active := true) from cron.job where jobname='alerta-lead-quente';
--   alter table public.bot_conversa_estado enable trigger trg_alerta_lq_fluxo_concluido;
--   alter table public.mensagens enable trigger trg_alerta_lq_inbound_cancela;
--   alter table public.mensagens enable trigger trg_alerta_lq_humano_cancela;

-- 1) para de criar alertas de abandono (cron 1min, seg–sex 8–18 SP)
select cron.alter_job(jobid, active := false)
  from cron.job where jobname = 'alerta-lead-quente';

-- 2) para de criar alertas de "concluído" (trigger na conclusão do fluxo do bot)
alter table public.bot_conversa_estado disable trigger trg_alerta_lq_fluxo_concluido;

-- 3) sem alertas novos, os triggers de cancelamento são só custo por mensagem — desliga
alter table public.mensagens disable trigger trg_alerta_lq_inbound_cancela;
alter table public.mensagens disable trigger trg_alerta_lq_humano_cancela;

-- 4) defesa: nenhum alerta pendente fica tocando no painel
update public.alertas_lead_quente
   set status = 'cancelado', cancelado_motivo = 'funcao_desativada', cancelado_em = now()
 where status = 'pendente';
