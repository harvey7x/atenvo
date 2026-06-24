create type public.cobranca_status as enum
  ('ativo','proximo_vencimento','vencido','atrasado','encerrando','finalizado','cancelado');

create table public.cobrancas (
  id                        uuid primary key default gen_random_uuid(),
  contato_id                uuid not null references public.contatos(id) on delete restrict,
  oportunidade_id           uuid references public.oportunidades(id) on delete set null,
  servico                   text,
  valor_original_descontado numeric(12,2),
  novo_valor_descontado     numeric(12,2),
  valor_economizado         numeric(12,2),
  percentual_honorarios     numeric(5,2) not null default 50.00,
  valor_mensal              numeric(12,2),
  dia_cobranca              integer check (dia_cobranca between 1 and 31),
  ciclos_totais             integer not null default 6,
  ciclos_pagos              integer not null default 0,
  ciclos_restantes          integer generated always as (greatest(ciclos_totais - ciclos_pagos, 0)) stored,
  proxima_cobranca          date,
  status                    public.cobranca_status not null default 'ativo',
  responsavel_id            uuid references public.usuarios(id) on delete set null,
  observacoes               text,
  data_inicio               date,
  data_encerramento         date,
  criado_em                 timestamptz not null default now(),
  atualizado_em             timestamptz not null default now()
);
create trigger trg_cobrancas_upd before update on public.cobrancas
  for each row execute function public.set_atualizado_em();
create index idx_cobrancas_contato on public.cobrancas (contato_id);
create index idx_cobrancas_status  on public.cobrancas (status);
create index idx_cobrancas_proxima on public.cobrancas (proxima_cobranca);

create table public.cobranca_pagamentos (
  id             uuid primary key default gen_random_uuid(),
  cobranca_id    uuid not null references public.cobrancas(id) on delete cascade,
  ciclo          integer not null,
  valor          numeric(12,2),
  data_prevista  date,
  data_pagamento date,
  status         text not null default 'pendente',
  criado_em      timestamptz not null default now(),
  unique (cobranca_id, ciclo)
);
create index idx_pagamentos_cobranca on public.cobranca_pagamentos (cobranca_id);

create table public.cobranca_eventos (
  id          uuid primary key default gen_random_uuid(),
  cobranca_id uuid not null references public.cobrancas(id) on delete cascade,
  tipo        text not null,
  descricao   text,
  dados       jsonb not null default '{}',
  usuario_id  uuid references public.usuarios(id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index idx_cob_eventos_cobranca on public.cobranca_eventos (cobranca_id);

-- Parametros configuraveis: a regra 50%/6 ciclos NAO fica no frontend
create table public.configuracoes (
  chave         text primary key,
  valor         jsonb not null,
  descricao     text,
  atualizado_em timestamptz not null default now()
);
create trigger trg_config_upd before update on public.configuracoes
  for each row execute function public.set_atualizado_em();
-- (defaults de configuracoes movidos para supabase/seed.sql — sao dados por organizacao)
