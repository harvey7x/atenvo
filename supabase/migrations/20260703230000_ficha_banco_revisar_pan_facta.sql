-- Regra final: PAN/FACTA NUNCA são banco pagador. Ajusta o flag de revisão das fichas existentes:
--  (a) banco pagador = PAN/FACTA  => banco_pagador_revisar = true (obrigatório).
--  (b) AGIBANK marcado só pelo NOME (sem contexto suspeito: não igual a banco de RMC/RCC/contrato)
--      => NÃO deve ficar marcado; desmarca. NÃO altera banco_codigo/banco_nome.
-- fichas_judiciais tem trigger BEFORE UPDATE que exige auth.uid(); correção de sistema, triggers off só aqui.
set local session_replication_role = 'replica';

update public.fichas_judiciais
set banco_pagador_revisar = true
where banco_codigo in ('623','935') or banco_nome ~* 'banco pan|panamericano|facta';

update public.fichas_judiciais f
set banco_pagador_revisar = false
where f.banco_pagador_revisar = true
  and (f.banco_codigo = '121' or f.banco_nome ~* 'agibank')
  and coalesce(f.banco_codigo,'') not in ('623','935')
  and coalesce(f.banco_nome,'') !~* 'banco pan|panamericano|facta'
  and not exists (
    select 1 from jsonb_array_elements(coalesce(f.revisoes,'[]'::jsonb)) rv
    where rv->>'tipo' in ('rmc','rcc','emprestimo') and (
      (rv->>'bancoCodigo' is not null and rv->>'bancoCodigo' = f.banco_codigo) or
      (rv->>'bancoNome' is not null and f.banco_nome is not null and lower(rv->>'bancoNome') = lower(f.banco_nome))
    )
  );

set local session_replication_role = 'origin';
