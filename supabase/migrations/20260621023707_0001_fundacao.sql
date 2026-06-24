-- ============================================================
-- Atenvo — Fundacao (0001)
-- Schema canonico: uma tabela por conceito. Sem prefixos de canal.
-- ============================================================

-- Funcao utilitaria: manter atualizado_em
create or replace function public.set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

-- ENUMS
create type public.user_role        as enum ('admin','supervisor','atendente');
create type public.canal_tipo       as enum ('whatsapp','facebook');
create type public.canal_origem     as enum ('trafego_1','trafego_2','sistema_ura','outro');
create type public.integracao_status as enum ('conectado','sincronizando','atencao','desconectado','erro');
create type public.conversa_status  as enum ('aberta','em_atendimento','pendente','resolvida','fechada');
create type public.etapa_funil      as enum ('novo_lead','em_processo','contratacao','fechado');
create type public.mensagem_direcao as enum ('entrada','saida');
create type public.mensagem_tipo    as enum ('texto','imagem','video','audio','documento','sistema','nota_interna');

-- USUARIOS (equipe/atendentes) — atrelado ao auth do Supabase
create table public.usuarios (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null,
  email         text,
  papel         public.user_role not null default 'atendente',
  avatar_url    text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- CANAIS (chips de WhatsApp + paginas de Facebook) — FONTE UNICA
create table public.canais (
  id                   uuid primary key default gen_random_uuid(),
  tipo                 public.canal_tipo not null,
  nome_interno         text not null,
  identificador        text,
  origem               public.canal_origem not null default 'outro',
  campanha             text,
  status_integracao    public.integracao_status not null default 'desconectado',
  ultima_sincronizacao timestamptz,
  ativo                boolean not null default true,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

-- CONTATOS (a pessoa) — FONTE UNICA
create table public.contatos (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  cpf            text,
  telefone       text,
  email          text,
  origem         text,
  responsavel_id uuid references public.usuarios(id) on delete set null,
  etiquetas      text[] not null default '{}',
  observacoes    text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- CONVERSAS — FONTE UNICA
create table public.conversas (
  id                  uuid primary key default gen_random_uuid(),
  contato_id          uuid not null references public.contatos(id) on delete cascade,
  canal_id            uuid references public.canais(id) on delete set null,
  atendente_id        uuid references public.usuarios(id) on delete set null,
  status              public.conversa_status not null default 'aberta',
  etapa               public.etapa_funil not null default 'novo_lead',
  etiquetas           text[] not null default '{}',
  nao_lidas           integer not null default 0,
  ultima_interacao_em timestamptz default now(),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

-- MENSAGENS — FONTE UNICA
create table public.mensagens (
  id         uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  direcao    public.mensagem_direcao not null,
  tipo       public.mensagem_tipo not null default 'texto',
  conteudo   text,
  midia_url  text,
  autor_id   uuid references public.usuarios(id) on delete set null,
  enviada_em timestamptz not null default now(),
  criado_em  timestamptz not null default now()
);

-- INDICES
create index idx_contatos_telefone        on public.contatos (telefone);
create index idx_contatos_cpf             on public.contatos (cpf);
create index idx_contatos_responsavel     on public.contatos (responsavel_id);
create index idx_conversas_contato        on public.conversas (contato_id);
create index idx_conversas_canal          on public.conversas (canal_id);
create index idx_conversas_atendente      on public.conversas (atendente_id);
create index idx_conversas_etapa          on public.conversas (etapa);
create index idx_conversas_status         on public.conversas (status);
create index idx_conversas_ultima_inter   on public.conversas (ultima_interacao_em desc);
create index idx_mensagens_conversa       on public.mensagens (conversa_id, enviada_em desc);

-- TRIGGERS atualizado_em
create trigger trg_usuarios_upd  before update on public.usuarios  for each row execute function public.set_atualizado_em();
create trigger trg_canais_upd    before update on public.canais    for each row execute function public.set_atualizado_em();
create trigger trg_contatos_upd  before update on public.contatos  for each row execute function public.set_atualizado_em();
create trigger trg_conversas_upd before update on public.conversas for each row execute function public.set_atualizado_em();

-- RLS: liga em tudo. Base: usuario autenticado tem acesso (refinar por papel depois).
alter table public.usuarios  enable row level security;
alter table public.canais    enable row level security;
alter table public.contatos  enable row level security;
alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;

create policy "auth_full" on public.usuarios  for all to authenticated using (true) with check (true);
create policy "auth_full" on public.canais    for all to authenticated using (true) with check (true);
create policy "auth_full" on public.contatos  for all to authenticated using (true) with check (true);
create policy "auth_full" on public.conversas for all to authenticated using (true) with check (true);
create policy "auth_full" on public.mensagens for all to authenticated using (true) with check (true);
