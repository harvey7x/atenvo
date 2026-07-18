-- Reaper/lease no claim de mensagens agendadas (achado da revisão adversarial da Fase 1).
--
-- Problema: se o processador morre (timeout/OOM/deploy) entre reivindicar (status→'processando',
-- commitado) e o UPDATE final da linha, ela fica 'processando' PARA SEMPRE — nunca reenviada,
-- nunca marcada como falha, "Enviando…" eterno. Não havia caminho de recuperação.
--
-- Correção: `atualizado_em` (setado no claim) vira um LEASE de 5 min. O claim passa a recuperar
-- também 'processando' vencidas. A idempotência por agendamento_id (evolution-send) garante que
-- uma órfã que JÁ havia enviado não duplica ao ser reprocessada.
--
-- Atomicidade preservada: a guarda do UPDATE reavalia status+lease na linha travada, então dois
-- crons concorrentes nunca reivindicam a mesma órfã (o 2º vê atualizado_em recém-tocado → 0 linhas).
create or replace function public.mensagens_agendadas_reivindicar(p_limite int default 30)
returns setof public.mensagens_agendadas
language plpgsql security definer set search_path = public as $fn$
begin
  return query
  with cand as (
    select distinct on (canal_id) id
    from public.mensagens_agendadas
    where (status = 'agendada'   and executar_em <= now())
       or (status = 'processando' and atualizado_em < now() - interval '5 minutes')  -- lease vencido = órfã
    order by canal_id, executar_em
    limit greatest(1, p_limite)
  )
  update public.mensagens_agendadas m
     set status = 'processando', tentativas = tentativas + 1, atualizado_em = now()
    from cand
   where m.id = cand.id
     and (
       (m.status = 'agendada'    and m.executar_em <= now())
       or (m.status = 'processando' and m.atualizado_em < now() - interval '5 minutes')
     )
  returning m.*;
end $fn$;

revoke execute on function public.mensagens_agendadas_reivindicar(int) from public, anon, authenticated;
grant  execute on function public.mensagens_agendadas_reivindicar(int) to service_role;

-- índice para o ramo de reaper (buscar 'processando' por atualizado_em) não varrer a tabela toda
create index if not exists mag_lease_idx on public.mensagens_agendadas (atualizado_em)
  where status = 'processando';
