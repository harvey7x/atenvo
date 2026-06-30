-- Colaboração Etapa 1: timeline de atividade por conversa (assumido/transferido/devolvido/status/etc).
-- Inserção SOMENTE server-side (Edge service_role / RPC SECURITY DEFINER). Leitura por membros da org.
create table if not exists public.conversa_atividades (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  usuario_id uuid references public.usuarios(id),
  tipo text not null,                 -- assumido | transferido | devolvido | status_alterado | nota | arquivada | reaberta | ...
  de jsonb, para jsonb, motivo text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_conv_ativ_conversa on public.conversa_atividades (conversa_id, criado_em desc);
create index if not exists idx_conv_ativ_org on public.conversa_atividades (organizacao_id);

alter table public.conversa_atividades enable row level security;

-- leitura: qualquer membro ATIVO da organização. Sem insert/update/delete por authenticated (só service_role).
drop policy if exists conv_ativ_select on public.conversa_atividades;
create policy conv_ativ_select on public.conversa_atividades for select to authenticated
  using (organizacao_id in (select organizacao_id from public.organizacao_usuarios where usuario_id = auth.uid() and status = 'ativo'));

notify pgrst, 'reload schema';
