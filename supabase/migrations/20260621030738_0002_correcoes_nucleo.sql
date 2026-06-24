-- Correcao 1: Kanban sai de conversas (vai viver em oportunidades)
alter table public.conversas drop column if exists etapa;

-- Enums de mensagem/anexo
create type public.mensagem_status as enum ('pendente','enviada','entregue','lida','falhou');
create type public.anexo_tipo      as enum ('imagem','video','audio','documento');

-- Correcao 4: mensagens prontas para integracoes reais
alter table public.mensagens
  add column id_externo          text,
  add column conversa_id_externo text,
  add column status              public.mensagem_status not null default 'pendente',
  add column respondida_a_id     uuid references public.mensagens(id) on delete set null,
  add column entregue_em         timestamptz,
  add column lida_em             timestamptz,
  add column recebida_em         timestamptz,
  add column processada_em       timestamptz,
  add column erro_envio          text,
  add column metadados           jsonb not null default '{}',
  drop column if exists midia_url;

-- Idempotencia: nao processar a mesma mensagem do provedor duas vezes
create unique index uq_mensagens_id_externo on public.mensagens (id_externo) where id_externo is not null;
create index idx_mensagens_status on public.mensagens (status);

-- Anexos de mensagem (arquivos no storage, nunca no banco)
create table public.anexos_mensagem (
  id            uuid primary key default gen_random_uuid(),
  mensagem_id   uuid not null references public.mensagens(id) on delete cascade,
  tipo          public.anexo_tipo not null,
  nome_arquivo  text,
  mime_type     text,
  tamanho_bytes bigint,
  storage_path  text not null,
  checksum      text,
  criado_em     timestamptz not null default now()
);
create index idx_anexos_mensagem_msg on public.anexos_mensagem (mensagem_id);
