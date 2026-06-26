-- Auditoria de execucoes de Script (disparo de sequencia de mensagens numa conversa).
-- audit_log nao e inserivel pelo cliente (authenticated so tem SELECT), por isso uma
-- tabela dedicada e operacional para registrar cada disparo.
create table if not exists public.script_execucoes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  script_id uuid references public.scripts(id) on delete set null,
  conversa_id uuid references public.conversas(id) on delete cascade,
  usuario_id uuid default auth.uid(),         -- quem disparou (sem FK p/ tolerar admin de plataforma)
  canal text not null,                        -- 'whatsapp' | 'facebook'
  total_etapas int not null default 0,
  enviadas int not null default 0,
  falhas int not null default 0,
  status text not null default 'concluida',   -- 'concluida' | 'parcial' | 'falha'
  criado_em timestamptz not null default now()
);
alter table public.script_execucoes enable row level security;
revoke all on public.script_execucoes from anon;
grant select, insert on public.script_execucoes to authenticated;
grant all on public.script_execucoes to service_role;

drop policy if exists script_execucoes_sel on public.script_execucoes;
drop policy if exists script_execucoes_ins on public.script_execucoes;
create policy script_execucoes_sel on public.script_execucoes for select using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy script_execucoes_ins on public.script_execucoes for insert with check (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));

create index if not exists script_execucoes_org_idx on public.script_execucoes(organizacao_id, criado_em desc);
create index if not exists script_execucoes_conv_idx on public.script_execucoes(conversa_id);
