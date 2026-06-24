create table public.script_categorias (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  ordem     integer not null default 0,
  criado_em timestamptz not null default now()
);

create table public.scripts (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null,
  categoria_id      uuid references public.script_categorias(id) on delete set null,
  conteudo          text not null,
  canais_permitidos public.canal_tipo[] not null default '{}',
  favorito          boolean not null default false,
  autor_id          uuid references public.usuarios(id) on delete set null,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);
create trigger trg_scripts_upd before update on public.scripts
  for each row execute function public.set_atualizado_em();
create index idx_scripts_categoria on public.scripts (categoria_id);

create table public.script_anexos (
  id            uuid primary key default gen_random_uuid(),
  script_id     uuid not null references public.scripts(id) on delete cascade,
  tipo          public.anexo_tipo not null,
  nome_arquivo  text,
  mime_type     text,
  tamanho_bytes bigint,
  storage_path  text not null,
  criado_em     timestamptz not null default now()
);
create index idx_script_anexos_script on public.script_anexos (script_id);
