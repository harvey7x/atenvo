-- ============================================================
-- FASE 1 Alfa — M3: competência + novos status em cobranca_pagamentos
-- status é TEXT: convivem os novos 'nao_pagou', 'nao_aplicavel',
-- 'sem_registro' ao lado de 'prevista'/'paga'/'cancelada'/'nao_paga'
-- (nada é renomeado nem migrado).
-- O chk_pag_coerencia antigo forçava valor_pago = valor na baixa —
-- incompatível com pagamento em dobro após falta (prática comum da
-- Alfa) — e não conhecia os status novos: é substituído por uma
-- versão que exige presença (não igualdade) na 'paga' e nulidade
-- nos demais. Toda linha CAF existente satisfaz a versão nova
-- (paga tinha valor_pago = valor ≠ null; demais tinham null).
-- `valor` vira nullable pelo histórico dos 34 sem mensalidade
-- conhecida (chk_pag_valor_pos > 0 segue valendo para não-nulos).
-- ============================================================

alter table public.cobranca_pagamentos
  add column if not exists competencia date,
  add column if not exists marcado_por uuid references public.usuarios(id) on delete set null,
  add column if not exists marcado_em timestamptz;

create index if not exists idx_pag_competencia on public.cobranca_pagamentos (organizacao_id, competencia);
create index if not exists idx_pag_cob_comp on public.cobranca_pagamentos (cobranca_id, competencia);

alter table public.cobranca_pagamentos alter column valor drop not null;

alter table public.cobranca_pagamentos drop constraint if exists chk_pag_coerencia;
alter table public.cobranca_pagamentos add constraint chk_pag_coerencia check (
  (status = 'paga' and valor_pago is not null and data_pagamento is not null)
  or (status in ('prevista', 'nao_paga', 'cancelada', 'nao_pagou', 'nao_aplicavel', 'sem_registro')
      and valor_pago is null and data_pagamento is null)
);
