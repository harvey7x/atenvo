-- Ficha judicial: marca (NÃO altera) o banco pagador suspeito de ter vindo de cartão/contrato.
-- O parser corrigido impede novos casos; aqui apenas SINALIZAMOS os registros existentes p/ revisão manual,
-- sem tocar em banco_codigo/banco_nome (não alterar automaticamente sem evidência humana).
alter table public.fichas_judiciais
  add column if not exists banco_pagador_revisar boolean not null default false;
comment on column public.fichas_judiciais.banco_pagador_revisar is
  'true = banco pagador possivelmente veio de cartão/contrato (FACTA/PAN/AGIBANK ou igual a um banco RMC/RCC da mesma ficha). Requer revisão humana; o valor NÃO foi alterado.';

-- fichas_judiciais tem trigger BEFORE UPDATE (fn_ficha_before) que exige auth.uid(); esta é uma
-- correção de sistema (só marca a flag). Desliga triggers apenas para esta transação de migration.
set local session_replication_role = 'replica';

update public.fichas_judiciais f
set banco_pagador_revisar = true
where
  -- (a) banco pagador é um banco tipicamente de cartão/contrato
  (f.banco_codigo in ('935','623','121') or f.banco_nome ~* 'facta|banco pan|agibank')
  -- (b) OU banco pagador é idêntico a um banco de RMC/RCC da própria ficha
  or exists (
    select 1 from jsonb_array_elements(coalesce(f.revisoes,'[]'::jsonb)) rv
    where rv->>'tipo' in ('rmc','rcc') and (
      (rv->>'bancoCodigo' is not null and rv->>'bancoCodigo' = f.banco_codigo) or
      (rv->>'bancoNome' is not null and f.banco_nome is not null and lower(rv->>'bancoNome') = lower(f.banco_nome))
    )
  );

set local session_replication_role = 'origin';
