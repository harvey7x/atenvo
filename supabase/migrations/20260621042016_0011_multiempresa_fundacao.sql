-- ===== Atenvo: fundacao multiempresa =====
create type public.organizacao_status as enum ('ativa','em_implantacao','suspensa','cancelada');
create type public.assinatura_status  as enum ('teste','ativa','em_atraso','suspensa','cancelada','isenta');
create type public.membership_status  as enum ('ativo','inativo','convidado');

-- Organizacoes (tenants)
create table public.organizacoes (
  id                     uuid primary key default gen_random_uuid(),
  nome                   text not null,
  nome_fantasia          text,
  slug                   text not null unique,
  documento              text,
  logo_url               text,
  email                  text,
  telefone               text,
  timezone               text not null default 'America/Sao_Paulo',
  moeda                  text not null default 'BRL',
  status                 public.organizacao_status not null default 'em_implantacao',
  plano                  text,
  assinatura_status      public.assinatura_status not null default 'teste',
  assinatura_inicio      date,
  assinatura_vencimento  date,
  configuracoes          jsonb not null default '{}',
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now()
);
create trigger trg_org_upd before update on public.organizacoes
  for each row execute function public.set_atualizado_em();

-- Vinculo usuario <-> organizacao (papel por organizacao)
create table public.organizacao_usuarios (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  papel          public.user_role not null default 'atendente',
  status         public.membership_status not null default 'ativo',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (organizacao_id, usuario_id)
);
create trigger trg_org_usr_upd before update on public.organizacao_usuarios
  for each row execute function public.set_atualizado_em();
create index idx_org_usr_org on public.organizacao_usuarios (organizacao_id);
create index idx_org_usr_usr on public.organizacao_usuarios (usuario_id);

-- Papel de plataforma (administra a Atenvo, separado do admin de organizacao)
alter table public.usuarios add column platform_admin boolean not null default false;

-- Catalogo de planos (precos configuraveis e versionados — nunca fixos no frontend)
create table public.planos (
  id                                 uuid primary key default gen_random_uuid(),
  nome                               text not null,
  slug                               text not null,
  valor_base_centavos                integer not null,
  preco_usuario_adicional_centavos   integer not null,
  preco_whatsapp_adicional_centavos  integer not null,
  preco_facebook_centavos            integer not null,
  usuarios_incluidos                 integer not null default 2,
  whatsapps_incluidos                integer not null default 1,
  facebook_incluidos                 integer not null default 1,
  ativo                              boolean not null default true,
  versao                             integer not null default 1,
  vigente_desde                      date not null default current_date,
  criado_em                          timestamptz not null default now()
);
create index idx_planos_slug on public.planos (slug);

-- Plano Atenvo: R$ 249,90/mes — 2 usuarios, 1 WhatsApp, 1 Facebook inclusos
insert into public.planos
 (nome, slug, valor_base_centavos, preco_usuario_adicional_centavos, preco_whatsapp_adicional_centavos, preco_facebook_centavos, usuarios_incluidos, whatsapps_incluidos, facebook_incluidos, versao)
values
 ('Plano Atenvo','plano_atenvo', 24990, 1990, 4990, 4990, 2, 1, 1, 1);
