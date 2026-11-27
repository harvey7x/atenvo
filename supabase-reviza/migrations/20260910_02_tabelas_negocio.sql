-- Reviza — tabelas de negocio (senhas ficam FORA daqui, em schema private)
-- Aplicada 2026-09-10 via MCP como "reviza_02_tabelas_negocio".
create table public.competencias (
  comp text primary key check (comp ~ '^[0-9]{4}-[0-9]{2}$'),
  ordem int generated always as ((substr(comp,1,4)||substr(comp,6,2))::int) stored,
  rotulo text,
  created_at timestamptz not null default now()
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  comercial text,
  dia smallint check (dia between 1 and 31),
  banco text,
  nb text,
  cpf text,
  reclame_login text,
  valor numeric(12,2) not null default 0,
  ultimo_pgto text,
  fechamento text,
  recebe text,
  telefone text,
  situacao public.situacao_debito not null default 'ativo',
  data_reclamacao text,
  data_parou text,
  parou text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_dia_idx on public.leads(dia);
create index leads_situacao_idx on public.leads(situacao);
create index leads_nome_idx on public.leads(lower(nome));
create trigger leads_updated_at before update on public.leads for each row execute function public.tg_set_updated_at();

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  comp text not null references public.competencias(comp) on delete restrict,
  status public.status_pagamento not null default 'fora',
  valor numeric(12,2),
  comprovante_path text,
  pago_em timestamptz,
  confirmado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, comp),
  constraint pagamentos_valor_coerente check (status <> 'pago' or valor is not null)
);
create index pagamentos_comp_status_idx on public.pagamentos(comp, status);
create trigger pagamentos_updated_at before update on public.pagamentos for each row execute function public.tg_set_updated_at();

create table public.entradas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  lead_nome text,
  comp text not null references public.competencias(comp) on delete restrict,
  valor numeric(12,2) not null,
  por_id uuid references public.profiles(id) on delete set null,
  por_nome text,
  estado public.estado_entrada not null default 'pendente',
  comprovante_path text,
  quando timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index entradas_pendentes_idx on public.entradas(quando) where estado='pendente';
create index entradas_lead_idx on public.entradas(lead_id);

create table public.mov_fin (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  lead_nome text,
  comercial_nome text,
  comp text not null references public.competencias(comp) on delete restrict,
  valor numeric(12,2) not null,
  status public.status_mov not null,
  comprovante_path text,
  origem_entrada_id uuid,
  decidido_por uuid references public.profiles(id) on delete set null,
  quando timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index mov_fin_comp_idx on public.mov_fin(comp);
create index mov_fin_quando_idx on public.mov_fin(quando desc);

create table public.ciclos_datas (
  dia smallint not null check (dia between 1 and 31),
  comp text not null references public.competencias(comp) on delete cascade,
  inicio date,
  fim date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (dia, comp),
  constraint ciclos_datas_janela check (fim is null or inicio is null or fim >= inicio)
);
create trigger ciclos_datas_updated_at before update on public.ciclos_datas for each row execute function public.tg_set_updated_at();

insert into storage.buckets (id, name, public) values ('comprovantes','comprovantes', false) on conflict (id) do nothing;

alter table public.competencias enable row level security;
alter table public.leads enable row level security;
alter table public.pagamentos enable row level security;
alter table public.entradas enable row level security;
alter table public.mov_fin enable row level security;
alter table public.ciclos_datas enable row level security;
