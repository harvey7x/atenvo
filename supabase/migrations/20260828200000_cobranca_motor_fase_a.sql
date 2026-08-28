-- ============================================================
-- MODO COBRANÇA — Motor dedicado, Fase A (fundação/schema)
-- Motor NOVO, isolado (decisão do dono 28/08): fila/régua/templates/
-- números próprios. Reusa APENAS o transporte (evolution-send, modo
-- service) e a segurança COMPARTILHADA (wa_optout, wa_dentro_janela) —
-- não forka essas, senão o "SAIR" de um cliente não valeria entre módulos.
-- Fundação que já existe e é reaproveitada: ciclos_vencimento +
-- cobrancas.responsavel_id (o atendente do cliente).
-- Aditiva, reversível (drop table). RLS espelha o padrão da cobrança:
-- SELECT = membro ativo de org operacional; escrita de config = gestor;
-- a fila é escrita pelo engine (service_role) + enfileiramento manual do gestor.
-- Nomes com prefixo cobranca_* distintos dos reservados (recon).
-- ============================================================

-- touch genérico de atualizado_em (fn_ciclo_venc_touch já faz isso; reuso)

-- 1) NÚMEROS: liga um ATENDENTE a um NÚMERO conectado (canal/QR).
--    O vínculo atendente→número não existia no schema — é fundado aqui.
create table if not exists public.cobranca_numeros (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  atendente_id uuid not null references public.usuarios(id) on delete cascade,
  canal_id uuid references public.canais(id) on delete set null,
  rotulo text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (organizacao_id, atendente_id)                    -- um número de cobrança por atendente
);
-- um canal (número físico) não serve a dois atendentes ao mesmo tempo
create unique index if not exists uq_cobranca_numeros_canal
  on public.cobranca_numeros (organizacao_id, canal_id) where canal_id is not null;
create index if not exists idx_cobranca_numeros_org on public.cobranca_numeros (organizacao_id);

-- 2) MENSAGENS (templates): antes / cobrança / depois / remarketing.
create table if not exists public.cobranca_mensagens (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  tipo text not null check (tipo in ('antes', 'cobranca', 'depois', 'remarketing')),
  nome text not null,
  corpo text not null,                                     -- placeholders {nome} {valor} {vencimento} {atendente}
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_cobranca_mensagens_org on public.cobranca_mensagens (organizacao_id, tipo);

-- 3) RÉGUA (cadência) + PASSOS: quando cada texto sai, relativo ao vencimento.
--    ciclo_vencimento_id nulo = régua vale para TODOS os ciclos (offset relativo).
create table if not exists public.cobranca_regua (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome text not null,
  ciclo_vencimento_id uuid references public.ciclos_vencimento(id) on delete cascade,
  ativa boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_cobranca_regua_org on public.cobranca_regua (organizacao_id);

create table if not exists public.cobranca_regua_passos (
  id uuid primary key default gen_random_uuid(),
  cobranca_regua_id uuid not null references public.cobranca_regua(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  ordem int not null default 0,
  mensagem_id uuid not null references public.cobranca_mensagens(id) on delete restrict,
  -- offset em dias relativo ao vencimento: negativo = antes, 0 = no dia, positivo = depois
  offset_dias int not null default 0,
  hora time not null default '09:00',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_cobranca_regua_passos_regua on public.cobranca_regua_passos (cobranca_regua_id);

-- 4) FILA de envios: 1 linha por disparo planejado. Nasce dry_run=true (simula).
create table if not exists public.cobranca_fila (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  cobranca_id uuid not null references public.cobrancas(id) on delete cascade,
  pagamento_id uuid references public.cobranca_pagamentos(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  conversa_id uuid,                                        -- resolvido no enfileiramento/envio
  canal_id uuid references public.canais(id) on delete set null,  -- número do atendente do cliente
  mensagem_id uuid references public.cobranca_mensagens(id) on delete set null,
  passo_id uuid references public.cobranca_regua_passos(id) on delete set null,
  tipo text check (tipo in ('antes', 'cobranca', 'depois', 'remarketing')),
  executar_em timestamptz not null default now(),
  status text not null default 'pendente'
    check (status in ('pendente', 'processando', 'simulada', 'enviada', 'falhou', 'bloqueada_optout', 'bloqueada_janela', 'cancelada')),
  dry_run boolean not null default true,                   -- default SEGURO: simula; envio real só com dry_run=false
  tentativas int not null default 0,
  ultimo_erro text,
  corpo_final text,                                        -- snapshot do texto renderizado (auditoria)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_cobranca_fila_org_status on public.cobranca_fila (organizacao_id, status);
create index if not exists idx_cobranca_fila_executar on public.cobranca_fila (executar_em) where status = 'pendente';
create index if not exists idx_cobranca_fila_cobranca on public.cobranca_fila (cobranca_id);

-- touch de atualizado_em (reusa a função genérica da M1)
do $$
declare t text;
begin
  foreach t in array array['cobranca_numeros','cobranca_mensagens','cobranca_regua','cobranca_regua_passos','cobranca_fila']
  loop
    execute format('drop trigger if exists trg_%s_touch on public.%s', t, t);
    execute format('create trigger trg_%s_touch before update on public.%s for each row execute function public.fn_ciclo_venc_touch()', t, t);
  end loop;
end $$;

-- RLS: leitura = membro ativo de org operacional; config (ins/upd) = cobranca_gestor;
-- DELETE sem policy + revogado (só service/platform). A fila também é escrita pelo
-- engine via service_role (bypassa RLS) e enfileirada manualmente pelo gestor.
do $$
declare t text;
begin
  foreach t in array array['cobranca_numeros','cobranca_mensagens','cobranca_regua','cobranca_regua_passos','cobranca_fila']
  loop
    execute format('alter table public.%s enable row level security', t);
    execute format($p$create policy %1$s_sel on public.%1$s for select
      using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)))$p$, t);
    execute format($p$create policy %1$s_ins on public.%1$s for insert
      with check (public.cobranca_gestor(organizacao_id))$p$, t);
    execute format($p$create policy %1$s_upd on public.%1$s for update
      using (public.cobranca_gestor(organizacao_id)) with check (public.cobranca_gestor(organizacao_id))$p$, t);
    execute format('grant select, insert, update on public.%s to authenticated', t);
    execute format('revoke delete on public.%s from authenticated', t);
  end loop;
end $$;
