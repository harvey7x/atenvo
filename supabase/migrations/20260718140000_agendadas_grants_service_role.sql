-- Fix (achado no teste de falha segura): o processador (service_role) faz UPDATE direto em
-- mensagens_agendadas para marcar enviada/falhou/bloqueada/expirada. A tabela nova não tinha
-- grant para service_role (só o RPC de claim, que é security definer, funcionava) — o UPDATE
-- falhava por permissão e, como o erro era silencioso, a linha ficava presa em 'processando'.
-- service_role tem bypassrls, mas GRANT de tabela é uma camada à parte e precisa ser explícito.
grant select, insert, update on public.mensagens_agendadas to service_role;
