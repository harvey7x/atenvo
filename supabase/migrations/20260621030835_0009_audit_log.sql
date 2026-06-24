create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid references public.usuarios(id) on delete set null,
  acao         text not null,
  entidade     text,
  entidade_id  uuid,
  dados_antes  jsonb,
  dados_depois jsonb,
  ip           text,
  criado_em    timestamptz not null default now()
);
create index idx_audit_entidade on public.audit_log (entidade, entidade_id);
create index idx_audit_usuario  on public.audit_log (usuario_id);
create index idx_audit_criado   on public.audit_log (criado_em desc);
