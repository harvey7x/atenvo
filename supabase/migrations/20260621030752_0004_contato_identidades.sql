-- Correcao 3: um contato pode ter varios identificadores, sem duplicar o contato
create type public.identidade_tipo as enum ('telefone','whatsapp','facebook_psid','email','outro');

create table public.contato_identidades (
  id                uuid primary key default gen_random_uuid(),
  contato_id        uuid not null references public.contatos(id) on delete cascade,
  tipo              public.identidade_tipo not null,
  provedor          text,
  valor             text not null,
  valor_normalizado text,
  principal         boolean not null default false,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create trigger trg_contato_ident_upd before update on public.contato_identidades
  for each row execute function public.set_atualizado_em();

-- Mesmo identificador externo nao pode apontar para dois contatos
create unique index uq_identidade_valor on public.contato_identidades (tipo, valor_normalizado) where valor_normalizado is not null;
-- No maximo um identificador principal por contato
create unique index uq_identidade_principal on public.contato_identidades (contato_id) where principal;
create index idx_identidades_contato on public.contato_identidades (contato_id);
