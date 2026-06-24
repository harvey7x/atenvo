-- Correcao 2: origem do lead vira estrutura configuravel (nao mais enum preso em canais)
create table public.fontes_aquisicao (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  slug          text not null unique,
  descricao     text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create trigger trg_fontes_upd before update on public.fontes_aquisicao
  for each row execute function public.set_atualizado_em();

-- Canal aponta para a fonte atual (mapeamento mutavel)
alter table public.canais add column fonte_aquisicao_id uuid references public.fontes_aquisicao(id) on delete set null;
alter table public.canais drop column if exists origem;
drop type if exists public.canal_origem;
create index idx_canais_fonte on public.canais (fonte_aquisicao_id);
