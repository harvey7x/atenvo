-- ===== FUNIS =====
create table if not exists public.funis (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome text not null,
  padrao boolean not null default false,
  ordem int not null default 0,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists funis_org_idx on public.funis(organizacao_id);
alter table public.funis enable row level security;

-- ===== COLUNAS (etapas editáveis) =====
create table if not exists public.funil_colunas (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid not null references public.funis(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome text not null,
  cor text not null default '#64748b',
  ordem int not null default 0,
  limite_cards int,
  arquivada boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists fc_funil_idx on public.funil_colunas(funil_id);
create index if not exists fc_org_idx on public.funil_colunas(organizacao_id);
alter table public.funil_colunas enable row level security;

-- ===== OPORTUNIDADES: campos do card + vínculo a coluna =====
alter table public.oportunidades
  alter column contato_id drop not null;
alter table public.oportunidades
  add column if not exists funil_id uuid references public.funis(id) on delete set null,
  add column if not exists coluna_id uuid references public.funil_colunas(id) on delete set null,
  add column if not exists titulo text,
  add column if not exists telefone text,
  add column if not exists origem text,
  add column if not exists valor_estimado numeric(14,2),
  add column if not exists prioridade text,
  add column if not exists proxima_atividade date,
  add column if not exists etiquetas text[] not null default '{}',
  add column if not exists observacoes text,
  add column if not exists ordem int not null default 0;
create index if not exists oportunidades_coluna_idx on public.oportunidades(coluna_id);
create index if not exists oportunidades_funil_idx on public.oportunidades(funil_id);

-- ===== RLS: funis (leitura p/ membros; escrita p/ admin+gestor) =====
create policy funis_sel on public.funis for select
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy funis_ins on public.funis for insert
  with check (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin'::user_role,'supervisor'::user_role]) and org_operacional(organizacao_id)));
create policy funis_upd on public.funis for update
  using (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin'::user_role,'supervisor'::user_role]) and org_operacional(organizacao_id)))
  with check (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin'::user_role,'supervisor'::user_role]) and org_operacional(organizacao_id)));
create policy funis_del on public.funis for delete
  using (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin'::user_role,'supervisor'::user_role]) and org_operacional(organizacao_id)));

-- ===== RLS: funil_colunas (mesma regra) =====
create policy fc_sel on public.funil_colunas for select
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy fc_ins on public.funil_colunas for insert
  with check (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin'::user_role,'supervisor'::user_role]) and org_operacional(organizacao_id)));
create policy fc_upd on public.funil_colunas for update
  using (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin'::user_role,'supervisor'::user_role]) and org_operacional(organizacao_id)))
  with check (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin'::user_role,'supervisor'::user_role]) and org_operacional(organizacao_id)));
create policy fc_del on public.funil_colunas for delete
  using (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin'::user_role,'supervisor'::user_role]) and org_operacional(organizacao_id)));
