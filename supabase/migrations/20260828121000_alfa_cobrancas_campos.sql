-- ============================================================
-- FASE 1 Alfa — M2: campos novos em cobrancas (tudo nullable)
-- + dois relaxamentos de METADADO exigidos pela base Alfa
-- (recorrência sem prazo e 34 clientes sem mensalidade conhecida).
-- Nenhuma linha existente da CAF muda; os escritores da CAF
-- (criar_cobranca_com_parcelas) validam valor>0 e 1..60 na entrada.
-- ============================================================

alter table public.cobrancas
  add column if not exists ciclo_vencimento_id uuid references public.ciclos_vencimento(id) on delete set null,
  add column if not exists nb text,
  add column if not exists banco_origem text,
  add column if not exists banco_recebimento text,
  add column if not exists senha_inss_cifrada bytea,
  add column if not exists reclame_aqui_status text,
  add column if not exists parcela_texto_original text,
  add column if not exists flags_importacao jsonb not null default '{}';

create index if not exists idx_cobrancas_ciclo_venc on public.cobrancas (ciclo_vencimento_id);

-- Alfa é recorrência SEM prazo: ciclos_totais passa a aceitar null
-- (o default 6 e o check 1..60 seguem valendo para quem informa).
-- Consequência documentada: a coluna GERADA ciclos_restantes
-- (greatest(ciclos_totais - ciclos_pagos, 0)) devolve 0 quando
-- ciclos_totais é null — leitura de "restantes" para recorrência
-- é assunto da Fase 2 (frontend).
alter table public.cobrancas alter column ciclos_totais drop not null;

-- 34 clientes da base Alfa nunca entraram na fase paga e não têm
-- mensalidade conhecida; ficam null + flags_importacao.mensalidade_ausente.
-- chk_cob_valor_pos (valor_mensal > 0) segue valendo para não-nulos.
alter table public.cobrancas alter column valor_mensal drop not null;
