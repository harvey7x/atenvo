-- Fix: o processador (Edge com service_role) precisa de EXECUTE em mensagens_agendadas_reivindicar.
-- Na migration anterior o REVOKE de public tirou o default sem conceder a service_role, e o cron
-- caía em "permission denied for function". Idempotente.
grant execute on function public.mensagens_agendadas_reivindicar(int) to service_role;
