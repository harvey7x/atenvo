-- ============================================================
-- FASE 1 Alfa — M1: ciclos de vencimento
-- Grupo de clientes com calendário próprio de vencimentos,
-- editável mês a mês (competência = dia 01 do mês).
-- Aditiva e reversível (drop table). RLS espelha o padrão das
-- tabelas de cobrança (leitura = membro ativo; escrita = gestor).
-- ============================================================

create table if not exists public.ciclos_vencimento (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  codigo text not null,
  nome text not null,
  grupo text not null check (grupo in ('inicio_mes', 'fim_mes', 'livre')),
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, codigo)
);

create table if not exists public.ciclo_vencimento_competencias (
  id uuid primary key default gen_random_uuid(),
  ciclo_vencimento_id uuid not null references public.ciclos_vencimento(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  -- competência é sempre o dia 01 do mês de referência
  competencia date not null check (extract(day from competencia) = 1),
  vencimento date not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (ciclo_vencimento_id, competencia)
);

create index if not exists idx_ciclos_venc_org on public.ciclos_vencimento (organizacao_id);
create index if not exists idx_cvc_ciclo on public.ciclo_vencimento_competencias (ciclo_vencimento_id);
create index if not exists idx_cvc_org_comp on public.ciclo_vencimento_competencias (organizacao_id, competencia);

-- atualizado_em (mesmo padrão trg_pag_touch)
create or replace function public.fn_ciclo_venc_touch() returns trigger
  language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists trg_ciclos_venc_touch on public.ciclos_vencimento;
create trigger trg_ciclos_venc_touch before update on public.ciclos_vencimento
  for each row execute function public.fn_ciclo_venc_touch();
drop trigger if exists trg_cvc_touch on public.ciclo_vencimento_competencias;
create trigger trg_cvc_touch before update on public.ciclo_vencimento_competencias
  for each row execute function public.fn_ciclo_venc_touch();

-- RLS: mesmo desenho das tabelas de cobrança (20260702230000):
-- SELECT = membro ativo de org operacional; INSERT/UPDATE = cobranca_gestor;
-- DELETE sem policy + revogado (só service/platform paths).
alter table public.ciclos_vencimento enable row level security;
alter table public.ciclo_vencimento_competencias enable row level security;

create policy ciclos_venc_sel on public.ciclos_vencimento for select
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy ciclos_venc_ins on public.ciclos_vencimento for insert
  with check (public.cobranca_gestor(organizacao_id));
create policy ciclos_venc_upd on public.ciclos_vencimento for update
  using (public.cobranca_gestor(organizacao_id))
  with check (public.cobranca_gestor(organizacao_id));

create policy cvc_sel on public.ciclo_vencimento_competencias for select
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy cvc_ins on public.ciclo_vencimento_competencias for insert
  with check (public.cobranca_gestor(organizacao_id));
create policy cvc_upd on public.ciclo_vencimento_competencias for update
  using (public.cobranca_gestor(organizacao_id))
  with check (public.cobranca_gestor(organizacao_id));

grant select, insert, update on public.ciclos_vencimento to authenticated;
grant select, insert, update on public.ciclo_vencimento_competencias to authenticated;
revoke delete on public.ciclos_vencimento from authenticated;
revoke delete on public.ciclo_vencimento_competencias from authenticated;
