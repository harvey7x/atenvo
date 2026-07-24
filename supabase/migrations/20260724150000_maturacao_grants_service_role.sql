-- ============================================================================
-- MATURAÇÃO — grants de service_role (correção)
--
-- As tabelas nasceram só com `grant select ... to authenticated`. Como o RLS foi ligado
-- e nenhum grant foi dado ao service_role, TODAS as leituras/escritas das edge functions
-- (planner, runner, webhook, manage) voltavam vazias — e voltavam em SILÊNCIO, porque o
-- PostgREST responde sem linhas em vez de estourar. O planner reportava "orgs: 0" como se
-- não houvesse nada a fazer.
--
-- Mesma pegadinha que já exigiu 20260718140000_agendadas_grants_service_role.sql.
-- Grants por tabela, no mínimo necessário para cada função:
-- ============================================================================

-- manage cria/exclui chips; webhook e runner atualizam status e dia de rampa
grant select, insert, update, delete on public.maturacao_chips    to service_role;

-- planner e runner só leem a configuração (a escrita é via RPC security definer)
grant select                          on public.maturacao_config   to service_role;

-- planner lê o pool externo e a biblioteca para montar o dia
grant select                          on public.maturacao_sementes to service_role;
grant select                          on public.maturacao_conteudo to service_role;

-- planner insere o plano; runner e webhook atualizam status; pausa cancela pendentes
grant select, insert, update, delete on public.maturacao_agenda   to service_role;

-- runner e webhook registram telemetria
grant select, insert                  on public.maturacao_eventos  to service_role;
