-- Sequência ordenada de mensagens de um script (texto e/ou mídia por etapa).
do $$ begin create type public.script_etapa_tipo as enum ('texto','imagem','audio','video','documento'); exception when duplicate_object then null; end $$;

create table if not exists public.script_etapas (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.scripts(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  posicao integer not null default 0,
  tipo public.script_etapa_tipo not null default 'texto',
  conteudo text,                 -- texto da mensagem OU legenda da mídia
  storage_path text,             -- objeto no bucket privado script-midia (quando mídia)
  nome_arquivo text,
  mime_type text,
  tamanho_bytes bigint,
  metadados jsonb not null default '{}',
  criado_em timestamptz not null default now()
);
alter table public.script_etapas enable row level security;
revoke all on public.script_etapas from anon;
grant select, insert, update, delete on public.script_etapas to authenticated;
grant all on public.script_etapas to service_role;

drop policy if exists script_etapas_sel on public.script_etapas;
drop policy if exists script_etapas_ins on public.script_etapas;
drop policy if exists script_etapas_upd on public.script_etapas;
drop policy if exists script_etapas_del on public.script_etapas;
create policy script_etapas_sel on public.script_etapas for select using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy script_etapas_ins on public.script_etapas for insert with check (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy script_etapas_upd on public.script_etapas for update using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy script_etapas_del on public.script_etapas for delete using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));

create index if not exists script_etapas_script_idx on public.script_etapas(script_id, posicao);
