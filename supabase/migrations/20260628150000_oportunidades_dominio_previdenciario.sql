-- Domínio previdenciário em public.oportunidades
-- text + CHECK (valores operacionais evoluíveis), tudo nullable ou com default
-- (a auto-criação por canal nunca falha por dado incompleto). Sem alterar RLS.

alter table public.oportunidades
  add column tipo_beneficio                text,
  add column tipo_servico                  text not null default 'analise_inicial',
  add column status_cancelamento           text not null default 'nao_se_aplica',
  add column status_ressarcimento          text not null default 'nao_se_aplica',
  add column numero_beneficio              text,
  add column instituicao                   text,
  add column tipo_desconto                 text,
  add column data_inicio_desconto          date,
  add column valor_desconto_mensal         numeric(12,2),
  add column valor_ressarcimento_estimado  numeric(12,2),
  add column valor_ressarcido              numeric(12,2);

-- CHECKs de domínio (text controlado)
alter table public.oportunidades
  add constraint chk_op_tipo_beneficio check (tipo_beneficio is null or tipo_beneficio in
        ('aposentadoria','pensao_por_morte','bpc_loas','outro')),
  add constraint chk_op_tipo_servico check (tipo_servico in
        ('analise_inicial','cancelamento','ressarcimento','cancelamento_ressarcimento','outro')),
  add constraint chk_op_status_cancelamento check (status_cancelamento in
        ('nao_se_aplica','nao_iniciado','em_analise','solicitado','aguardando_retorno','concluido','nao_foi_possivel')),
  add constraint chk_op_status_ressarcimento check (status_ressarcimento in
        ('nao_se_aplica','nao_iniciado','em_analise','solicitado','aguardando_pagamento','pago','nao_foi_possivel'));

-- CHECKs financeiros (não-negativos)
alter table public.oportunidades
  add constraint chk_op_valor_desconto_mensal        check (valor_desconto_mensal is null or valor_desconto_mensal >= 0),
  add constraint chk_op_valor_ressarcimento_estimado check (valor_ressarcimento_estimado is null or valor_ressarcimento_estimado >= 0),
  add constraint chk_op_valor_ressarcido             check (valor_ressarcido is null or valor_ressarcido >= 0);

-- Índices compostos para filtros futuros (apenas os ausentes; não duplica os existentes)
create index if not exists ix_op_org_tipo_beneficio       on public.oportunidades(organizacao_id, tipo_beneficio);
create index if not exists ix_op_org_tipo_servico         on public.oportunidades(organizacao_id, tipo_servico);
create index if not exists ix_op_org_status_cancelamento  on public.oportunidades(organizacao_id, status_cancelamento);
create index if not exists ix_op_org_status_ressarcimento on public.oportunidades(organizacao_id, status_ressarcimento);

comment on column public.oportunidades.valor_desconto_mensal is 'Valor mensal descontado (BRL).';
comment on column public.oportunidades.valor_ressarcimento_estimado is 'Valor total estimado a ressarcir (BRL).';
comment on column public.oportunidades.valor_ressarcido is 'Valor já ressarcido (BRL).';
