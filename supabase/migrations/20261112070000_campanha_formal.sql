-- ============================================================================
-- CAMPANHA COMO ENTIDADE FORMAL (12/11/2026) — pré-requisito das abas do Dashboard.
--
-- Problema que esta migration resolve:
--   * o mapeamento canal → campanha vivia hardcoded em dash_v5_trafego (e em mais
--     dois lugares), SEM a linha do ANTONIO 2.0 — que hoje cai em "Outros números";
--   * a versão VIVA de dash_v5_trafego tem a linha do EMPRESTIMO DIEGO (e081dbd4),
--     aplicada direto em produção em 30/10 e nunca commitada: este arquivo grava a
--     versão viva no repo (re-aplicar a migration antiga APAGARIA a linha);
--   * a coluna canais.campanha existia e não era usada.
--
-- O que faz:
--   1) preenche canais.campanha com o slug da campanha ('diego' | 'antonio' |
--      'antonio2' | 'juros') nos 8 números conhecidos; OFICIAL/MURILLO/URA ficam
--      nulos (= fora de campanha). Número novo = UPDATE na tabela, nunca editar função.
--   2) cria dash_v5_campanha(uuid) → slug ('sem_campanha' para canal nulo, 'outros'
--      para canal sem campanha), STABLE, lendo a tabela.
--   3) regrava dash_v5_trafego = VERSÃO VIVA (byte a byte) + a linha do ANTONIO 2.0.
-- Sem remoção de nada; dashboard_v5 continua intacta.
-- ============================================================================

-- 1) backfill (org do CAF; ids conferidos no banco em 12/11)
update public.canais c
   set campanha = v.camp
  from (values
    ('e85ab4e4-931e-4da9-932b-30541f9e007b'::uuid, 'diego'),    -- EMPRESTIMO (25/09→29/10)
    ('e081dbd4-6181-45c1-b8b9-273a81d9e3c2'::uuid, 'diego'),    -- EMPRESTIMO DIEGO (30/10→)
    ('c3e8311c-d574-4283-9bbb-f4adcf050f02'::uuid, 'diego'),    -- EMPRÉSTIMO (17/08)
    ('eaa0b251-1284-4fab-aebf-940bae893da9'::uuid, 'diego'),    -- EMPRESTIMO (DIEGO) (15/09)
    ('c839e143-4aaf-4be1-ac18-a863d0804da2'::uuid, 'antonio'),  -- ANTONIO CAMPANHA
    ('92fc2527-e07d-4897-b71f-f06d32d0455a'::uuid, 'antonio2'), -- ANTONIO 2.0 (09/11→)
    ('fc80ec9e-9f8f-4dca-a3f0-e1101d73e117'::uuid, 'juros'),    -- JUROS ABUSIVO (ANDRIUS)
    ('ae43fc08-36ff-49d3-8272-e4280645223a'::uuid, 'juros')     -- ANDRIUS (29/06)
  ) as v(id, camp)
 where c.id = v.id;

-- 2) slug da campanha (tabela como fonte; STABLE para o planner reusar no período)
create or replace function public.dash_v5_campanha(p_canal uuid)
returns text
language sql stable parallel safe
as $$
  select case
           when p_canal is null then 'sem_campanha'
           else coalesce((select c.campanha from public.canais c where c.id = p_canal), 'outros')
         end
$$;

revoke all on function public.dash_v5_campanha(uuid) from public, anon, authenticated;

-- 3) dash_v5_trafego: versão VIVA (inclui e081dbd4, 30/10) + ANTONIO 2.0
create or replace function public.dash_v5_trafego(p_canal uuid)
returns text
language sql immutable parallel safe
as $$
  select case p_canal
           when 'e85ab4e4-931e-4da9-932b-30541f9e007b' then 'Empréstimo · Diego'
           when 'e081dbd4-6181-45c1-b8b9-273a81d9e3c2' then 'Empréstimo · Diego'   -- 30/10: número novo
           when 'c3e8311c-d574-4283-9bbb-f4adcf050f02' then 'Empréstimo · Diego'
           when 'eaa0b251-1284-4fab-aebf-940bae893da9' then 'Empréstimo · Diego'
           when 'c839e143-4aaf-4be1-ac18-a863d0804da2' then 'Empréstimo · Antônio'
           when '92fc2527-e07d-4897-b71f-f06d32d0455a' then 'Empréstimo · Antônio 2.0' -- 12/11
           when 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117' then 'Juros abusivos · Andrius'
           when 'ae43fc08-36ff-49d3-8272-e4280645223a' then 'Juros abusivos · Andrius'
           else 'Outros números'
         end;
$$;
