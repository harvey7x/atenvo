-- Correcao 1: oportunidade = processo comercial (fonte canonica do Kanban)
create type public.oportunidade_status as enum ('em_andamento','ganho','perdido','cancelado');

create table public.oportunidades (
  id                 uuid primary key default gen_random_uuid(),
  contato_id         uuid not null references public.contatos(id) on delete cascade,
  conversa_origem_id uuid references public.conversas(id) on delete set null,
  canal_origem_id    uuid references public.canais(id) on delete set null,
  responsavel_id     uuid references public.usuarios(id) on delete set null,
  etapa              public.etapa_funil not null default 'novo_lead',
  status             public.oportunidade_status not null default 'em_andamento',
  -- snapshot historico, congelado na criacao
  fonte_aquisicao    text,
  chip_origem        text,
  metadados          jsonb not null default '{}',
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  fechado_em         timestamptz
);
create trigger trg_oportunidades_upd before update on public.oportunidades
  for each row execute function public.set_atualizado_em();
create index idx_oport_contato     on public.oportunidades (contato_id);
create index idx_oport_responsavel on public.oportunidades (responsavel_id);
create index idx_oport_etapa        on public.oportunidades (etapa);
create index idx_oport_status       on public.oportunidades (status);
