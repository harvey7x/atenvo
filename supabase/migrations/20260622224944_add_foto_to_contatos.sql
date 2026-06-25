alter table public.contatos
  add column if not exists foto_url text,
  add column if not exists foto_sync_em timestamptz;
