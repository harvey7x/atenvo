-- ============================================================
-- MODO COBRANÇA — a CHAVE do envio real (29/08, "deixa tudo pronto
-- pra rodar"). envio_real nasce FALSE; ligar é ato do GESTOR na aba
-- Envios (dupla confirmação). Com a chave ON, os enfileiramentos
-- novos nascem dry_run=false e o motor envia DE VERDADE pela
-- instância do atendente. Pendentes do dia podem ser convertidos
-- explicitamente (acao converter_hoje).
-- ============================================================
create table if not exists public.cobranca_config (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  envio_real boolean not null default false,
  atualizado_em timestamptz not null default now()
);
drop trigger if exists trg_cobranca_config_touch on public.cobranca_config;
create trigger trg_cobranca_config_touch before update on public.cobranca_config
  for each row execute function public.fn_ciclo_venc_touch();

alter table public.cobranca_config enable row level security;
create policy cobranca_config_sel on public.cobranca_config for select
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy cobranca_config_ins on public.cobranca_config for insert
  with check (public.cobranca_gestor(organizacao_id));
create policy cobranca_config_upd on public.cobranca_config for update
  using (public.cobranca_gestor(organizacao_id)) with check (public.cobranca_gestor(organizacao_id));
grant select, insert, update on public.cobranca_config to authenticated;
grant all on public.cobranca_config to service_role;
