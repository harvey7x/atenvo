-- Agendamentos (atendimentos presenciais). Etapa 1: tabela + histórico + RLS (isolamento por organização)
-- + trigger de atualizado_em e de atividade. Horários em timestamptz (fuso America/Sao_Paulo no app).
create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  atendente_id uuid references public.usuarios(id),
  tipo text not null default 'Outro',
  titulo text,
  cliente_nome text,                 -- snapshot p/ exibir sem depender do contato
  telefone text,
  inicio_em timestamptz not null,
  fim_em timestamptz not null,
  timezone text not null default 'America/Sao_Paulo',
  status text not null default 'pendente',   -- pendente|confirmado|realizado|cancelado|remarcado|nao_compareceu
  local text,
  endereco text,
  observacoes text,
  motivo_cancelamento text,
  motivo_remarcacao text,
  criado_por uuid references public.usuarios(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint chk_agendamento_periodo check (fim_em > inicio_em)
);
create index if not exists idx_agendamentos_org_inicio on public.agendamentos (organizacao_id, inicio_em);
create index if not exists idx_agendamentos_contato on public.agendamentos (contato_id);
create index if not exists idx_agendamentos_atendente on public.agendamentos (atendente_id);

-- histórico de alterações (mesma ideia de conversa_atividades). Inserção só server-side (trigger/service_role).
create table if not exists public.agendamento_atividades (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  agendamento_id uuid not null references public.agendamentos(id) on delete cascade,
  usuario_id uuid references public.usuarios(id),
  tipo text not null,                -- criado | status_alterado | editado | remarcado | cancelado
  de jsonb, para jsonb, motivo text,
  criado_em timestamptz not null default now()
);
create index if not exists idx_agend_ativ on public.agendamento_atividades (agendamento_id, criado_em desc);

-- atualizado_em automático
create or replace function public.agendamentos_touch() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists trg_agendamentos_touch on public.agendamentos;
create trigger trg_agendamentos_touch before update on public.agendamentos for each row execute function public.agendamentos_touch();

-- atividade automática (criado / status_alterado). SECURITY DEFINER p/ inserir na tabela protegida.
create or replace function public.agendamentos_log() returns trigger language plpgsql security definer set search_path=public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    insert into agendamento_atividades (organizacao_id, agendamento_id, usuario_id, tipo, para)
    values (new.organizacao_id, new.id, auth.uid(), 'criado', jsonb_build_object('status', new.status, 'inicio_em', new.inicio_em));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into agendamento_atividades (organizacao_id, agendamento_id, usuario_id, tipo, de, para, motivo)
    values (new.organizacao_id, new.id, auth.uid(), 'status_alterado', jsonb_build_object('status', old.status), jsonb_build_object('status', new.status),
            coalesce(new.motivo_cancelamento, new.motivo_remarcacao));
  end if;
  return new;
end $$;
drop trigger if exists trg_agendamentos_log on public.agendamentos;
create trigger trg_agendamentos_log after insert or update on public.agendamentos for each row execute function public.agendamentos_log();

-- RLS: isolamento por organização (membro ATIVO). Escrita idem; criado_por deve ser o próprio usuário.
alter table public.agendamentos enable row level security;
alter table public.agendamento_atividades enable row level security;

drop policy if exists agendamentos_select on public.agendamentos;
create policy agendamentos_select on public.agendamentos for select to authenticated
  using (organizacao_id in (select organizacao_id from public.organizacao_usuarios where usuario_id = auth.uid() and status='ativo'));
drop policy if exists agendamentos_insert on public.agendamentos;
create policy agendamentos_insert on public.agendamentos for insert to authenticated
  with check (organizacao_id in (select organizacao_id from public.organizacao_usuarios where usuario_id = auth.uid() and status='ativo') and criado_por = auth.uid());
drop policy if exists agendamentos_update on public.agendamentos;
create policy agendamentos_update on public.agendamentos for update to authenticated
  using (organizacao_id in (select organizacao_id from public.organizacao_usuarios where usuario_id = auth.uid() and status='ativo'))
  with check (organizacao_id in (select organizacao_id from public.organizacao_usuarios where usuario_id = auth.uid() and status='ativo'));
drop policy if exists agendamentos_delete on public.agendamentos;
create policy agendamentos_delete on public.agendamentos for delete to authenticated
  using (organizacao_id in (select organizacao_id from public.organizacao_usuarios where usuario_id = auth.uid() and status='ativo'));

drop policy if exists agend_ativ_select on public.agendamento_atividades;
create policy agend_ativ_select on public.agendamento_atividades for select to authenticated
  using (organizacao_id in (select organizacao_id from public.organizacao_usuarios where usuario_id = auth.uid() and status='ativo'));

notify pgrst, 'reload schema';
