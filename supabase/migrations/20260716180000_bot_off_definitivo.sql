-- ============================================================================
-- BOT OFF DEFINITIVO (decisão do dono, 2026-07-16).
--
-- Não basta desligar em runtime: a migration B1 (20260708220000_bot_atendimento_b1.sql) SEMEIA
-- `bot_canal_config.bot_enabled = true` para LUIZA/ANDRIUS. Num db reset / replay das migrations o
-- bot voltaria LIGADO nesses canais. Esta migration roda DEPOIS e garante OFF de forma durável.
--
-- Não apaga NADA: bot_conversa_estado, bot_remarketing, mensagens, contatos, oportunidades e
-- auditoria seguem intactos. Só vira chave.
--
-- Religar exige ação explícita do dono (B3.5): bot_config.ativo=true + bot_canal_config.bot_enabled=true
-- + dispatch dry_run:false + reativar o cron 'bot-remarketing'.
-- ============================================================================

-- 1) kill-switch global de todas as organizações
update public.bot_config set ativo = false;

-- 2) nenhum canal autorizado
update public.bot_canal_config set bot_enabled = false;

-- 3) outbox: nada pendente pode drenar
update public.bot_mensagens_saida set status = 'cancelada' where status in ('pendente', 'enviando');

-- 4) remarketing: 'cancelado' é TERMINAL — bot_remarketing_due() só pega 'ativo' e
--    bot_remarketing_inbound() só pega ('ativo','pausado') => invisível para ambos. Linhas preservadas.
update public.bot_remarketing set status = 'cancelado' where status in ('ativo', 'pausado');

-- 5) cron do remarketing desativado (mantém a definição; reversível via cron.alter_job(..., active := true))
do $$
declare j bigint;
begin
  select jobid into j from cron.job where jobname = 'bot-remarketing';
  if j is not null then perform cron.alter_job(job_id := j, active := false); end if;
exception when others then null;  -- banco novo / sem pg_cron: nada a fazer
end $$;
