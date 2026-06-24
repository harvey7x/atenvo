-- ===== Faturamento da Atenvo (o que a Atenvo cobra das organizacoes) =====
create type public.assinatura_item_tipo as enum
  ('plano_base','usuario_adicional','whatsapp_adicional','facebook_adicional','desconto','credito','ajuste');
create type public.fatura_status    as enum ('aberta','paga','vencida','cancelada');
create type public.pagamento_status as enum ('pendente','confirmado','vencido','estornado','falhou');
create type public.pagamento_metodo as enum ('pix','pix_automatico','cartao','boleto');

-- Limites por organizacao (validados no backend). Facebook segue o MESMO modelo
-- de usuarios/WhatsApp: incluidos + adicionais => limite (coluna gerada).
create table public.organizacao_limites (
  organizacao_id              uuid primary key references public.organizacoes(id) on delete cascade,
  usuarios_incluidos          integer not null default 2,
  usuarios_adicionais         integer not null default 0,
  limite_usuarios             integer generated always as (usuarios_incluidos + usuarios_adicionais) stored,
  whatsapps_incluidos         integer not null default 1,
  whatsapps_adicionais        integer not null default 0,
  limite_whatsapps            integer generated always as (whatsapps_incluidos + whatsapps_adicionais) stored,
  facebook_incluidos          integer not null default 1,
  facebook_adicionais         integer not null default 0,
  limite_facebook_contas      integer generated always as (facebook_incluidos + facebook_adicionais) stored,
  atualizado_em               timestamptz not null default now()
);
create trigger trg_org_lim_upd before update on public.organizacao_limites
  for each row execute function public.set_atualizado_em();

create table public.assinaturas (
  id                  uuid primary key default gen_random_uuid(),
  organizacao_id      uuid not null unique references public.organizacoes(id) on delete cascade,
  plano_id            uuid not null references public.planos(id),
  status              public.assinatura_status not null default 'ativa',
  ciclo_inicio        date,
  ciclo_fim           date,
  proxima_cobranca    date,
  valor_total_centavos integer not null default 0,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create trigger trg_assinatura_upd before update on public.assinaturas
  for each row execute function public.set_atualizado_em();

create table public.assinatura_itens (
  id                   uuid primary key default gen_random_uuid(),
  assinatura_id        uuid not null references public.assinaturas(id) on delete cascade,
  organizacao_id       uuid not null references public.organizacoes(id) on delete cascade,
  tipo                 public.assinatura_item_tipo not null,
  descricao            text,
  quantidade           integer not null default 1,
  valor_unitario_centavos integer not null default 0,
  valor_total_centavos integer not null default 0,
  criado_em            timestamptz not null default now()
);
create index idx_assitem_assinatura on public.assinatura_itens (assinatura_id);
create index idx_assitem_org on public.assinatura_itens (organizacao_id);

create table public.assinatura_eventos (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  assinatura_id  uuid references public.assinaturas(id) on delete set null,
  tipo           text not null,
  descricao      text,
  dados          jsonb not null default '{}',
  usuario_id     uuid references public.usuarios(id) on delete set null,
  criado_em      timestamptz not null default now()
);
create index idx_asseventos_org on public.assinatura_eventos (organizacao_id);

create table public.faturas (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  assinatura_id  uuid references public.assinaturas(id) on delete set null,
  competencia    date not null,
  valor_centavos integer not null,
  status         public.fatura_status not null default 'aberta',
  vencimento     date,
  pago_em        timestamptz,
  provedor_ref   text,
  criado_em      timestamptz not null default now()
);
create index idx_faturas_org on public.faturas (organizacao_id);
create index idx_faturas_status on public.faturas (status);

create table public.pagamentos (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  fatura_id      uuid references public.faturas(id) on delete cascade,
  valor_centavos integer not null,
  metodo         public.pagamento_metodo,
  status         public.pagamento_status not null default 'pendente',
  provedor_ref   text,
  pago_em        timestamptz,
  criado_em      timestamptz not null default now()
);
create index idx_pagamentos_org on public.pagamentos (organizacao_id);
create index idx_pagamentos_fatura on public.pagamentos (fatura_id);

create table public.pagamento_eventos (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  pagamento_id   uuid references public.pagamentos(id) on delete cascade,
  fatura_id      uuid references public.faturas(id) on delete set null,
  tipo           text not null,
  payload        jsonb not null default '{}',
  criado_em      timestamptz not null default now()
);
create index idx_pageventos_org on public.pagamento_eventos (organizacao_id);

-- ===== Funcao central da assinatura (formula unica, nunca duplicada no frontend) =====
-- valor_total = base + (adicionais de usuario/whatsapp/facebook * preco) + ajustes.
-- Inclusos do plano (2 usuarios, 1 WhatsApp, 1 Facebook) NAO sao cobrados a parte.
create or replace function public.calcular_valor_assinatura(p_org uuid)
returns integer language sql stable security definer set search_path = public as $$
  with pl as (select * from public.planos where ativo order by versao desc limit 1),
       lim as (select * from public.organizacao_limites where organizacao_id = p_org),
       aj as (
         select coalesce(sum(
           case when ai.tipo in ('desconto','credito') then -abs(ai.valor_total_centavos)
                when ai.tipo = 'ajuste' then ai.valor_total_centavos
                else 0 end), 0) as delta
         from public.assinatura_itens ai
         join public.assinaturas a on a.id = ai.assinatura_id
         where a.organizacao_id = p_org
       )
  select (pl.valor_base_centavos
          + (lim.usuarios_adicionais  * pl.preco_usuario_adicional_centavos)
          + (lim.whatsapps_adicionais * pl.preco_whatsapp_adicional_centavos)
          + (lim.facebook_adicionais  * pl.preco_facebook_centavos)
          + aj.delta)::int
  from pl, lim, aj;
$$;
