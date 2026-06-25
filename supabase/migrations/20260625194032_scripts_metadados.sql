-- Metadados adicionais para a biblioteca de scripts (aditivo, idempotente).
-- Não altera dados existentes; apenas acrescenta colunas opcionais.
alter table public.scripts add column if not exists descricao text;
alter table public.scripts add column if not exists ativo boolean not null default true;
alter table public.scripts add column if not exists tags text[] not null default '{}';
