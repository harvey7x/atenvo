-- Integracoes guardam config NAO sensivel + referencia ao segredo. Nunca o segredo.
create table public.integracoes (
  id                   uuid primary key default gen_random_uuid(),
  provedor             text not null,
  canal_id             uuid references public.canais(id) on delete set null,
  status               public.integracao_status not null default 'desconectado',
  ultima_sincronizacao timestamptz,
  ultimo_erro          text,
  config               jsonb not null default '{}',
  segredo_ref          text,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);
create trigger trg_integracoes_upd before update on public.integracoes
  for each row execute function public.set_atualizado_em();
create index idx_integracoes_canal on public.integracoes (canal_id);

create table public.integracao_logs (
  id            uuid primary key default gen_random_uuid(),
  integracao_id uuid references public.integracoes(id) on delete cascade,
  nivel         text not null default 'info',
  evento        text,
  detalhe       text,
  criado_em     timestamptz not null default now()
);
create index idx_integracao_logs_int on public.integracao_logs (integracao_id);
