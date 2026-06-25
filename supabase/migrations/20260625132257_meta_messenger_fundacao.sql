-- ============================================================================
-- META / FACEBOOK MESSENGER — fundação (ADITIVA). Revisão de segurança aplicada.
-- Reutiliza canais/contatos/conversas/mensagens/integracoes. NÃO altera enums
-- existentes nem a idempotência do WhatsApp. Nada aqui é destrutivo.
-- ============================================================================

-- ---- Enums controlados (novos) ----
do $$ begin create type public.meta_token_status as enum ('valido','expirado','revogado','desconectado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.meta_proc_status  as enum ('recebido','processado','ignorado','erro'); exception when duplicate_object then null; end $$;
do $$ begin create type public.meta_evento_tipo  as enum ('messages','message_echoes','messaging_postbacks','message_deliveries','message_reads','outro'); exception when duplicate_object then null; end $$;
-- meta_paginas.estado reutiliza public.integracao_status (conectado/desconectado/removido/...).

-- ---- Uniques compostas para FKs cross-org (integridade NO BANCO, não só na Edge Function) ----
do $$ begin alter table public.canais   add constraint canais_id_org_uniq   unique (id, organizacao_id); exception when duplicate_table or duplicate_object then null; end $$;
do $$ begin alter table public.contatos add constraint contatos_id_org_uniq unique (id, organizacao_id); exception when duplicate_table or duplicate_object then null; end $$;

-- ============================ HELPERS DE VAULT (token nunca em tabela do app) ============================
create or replace function public.meta_set_secret(p_nome text, p_valor text)
returns uuid language plpgsql security definer set search_path = public, vault as $$
declare v_id uuid; begin v_id := vault.create_secret(p_valor, p_nome, 'Meta token (Messenger)'); return v_id; end $$;

create or replace function public.meta_get_secret(p_vault_id uuid)
returns text language sql security definer stable set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_vault_id $$;

create or replace function public.meta_delete_secret(p_vault_id uuid)
returns void language plpgsql security definer set search_path = public, vault as $$
begin if p_vault_id is not null then delete from vault.secrets where id = p_vault_id; end if; end $$;

revoke all on function public.meta_set_secret(text,text) from public, anon, authenticated;
revoke all on function public.meta_get_secret(uuid)      from public, anon, authenticated;
revoke all on function public.meta_delete_secret(uuid)   from public, anon, authenticated;
grant execute on function public.meta_set_secret(text,text) to service_role;
grant execute on function public.meta_get_secret(uuid)      to service_role;
grant execute on function public.meta_delete_secret(uuid)   to service_role;

-- ============================ META_PAGINAS (somente metadados) ============================
create table public.meta_paginas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  canal_id uuid not null,
  pagina_id text not null,
  pagina_nome text,
  estado public.integracao_status not null default 'conectado',
  escopos text[] not null default '{}',
  webhook_assinado boolean not null default false,
  conectado_por uuid references public.usuarios(id) on delete set null,
  conectado_em timestamptz not null default now(),
  desconectado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  constraint meta_paginas_pagina_uniq unique (pagina_id),     -- 1 Página -> 1 vínculo
  constraint meta_paginas_canal_uniq  unique (canal_id),      -- 1 canal -> 1 Página
  constraint meta_paginas_id_org_uniq unique (id, organizacao_id),
  constraint meta_paginas_canal_fk foreign key (canal_id, organizacao_id)
    references public.canais (id, organizacao_id) on delete restrict,   -- sem cascade destrutiva
  constraint meta_paginas_org_fk foreign key (organizacao_id)
    references public.organizacoes (id) on delete restrict
);
alter table public.meta_paginas enable row level security;
revoke all on public.meta_paginas from anon;
grant select on public.meta_paginas to authenticated;          -- só leitura de metadados não sensíveis
grant all on public.meta_paginas to service_role;
create policy meta_paginas_sel on public.meta_paginas for select
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));

-- ============================ CREDENCIAIS (referência ao Vault; só service_role) ============================
create table public.meta_pagina_credenciais (
  id uuid primary key default gen_random_uuid(),
  meta_pagina_id uuid not null,
  organizacao_id uuid not null,
  vault_secret_id uuid,                          -- token via Supabase Vault
  token_status public.meta_token_status not null default 'valido',
  expires_at timestamptz,                        -- NULLABLE; validade real da Meta (debug_token)
  validado_em timestamptz,
  revogado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint meta_cred_pagina_uniq unique (meta_pagina_id),
  -- org da credencial == org da Página (FK composta)
  constraint meta_cred_pagina_fk foreign key (meta_pagina_id, organizacao_id)
    references public.meta_paginas (id, organizacao_id) on delete restrict
);
alter table public.meta_pagina_credenciais enable row level security;
revoke all on public.meta_pagina_credenciais from public, anon, authenticated;  -- inacessível à Data API
grant all on public.meta_pagina_credenciais to service_role;

-- backstop anti-órfão: ao remover a credencial, apaga o secret do Vault ANTES
create or replace function public.meta_cred_before_delete()
returns trigger language plpgsql security definer set search_path = public, vault as $$
begin if old.vault_secret_id is not null then perform public.meta_delete_secret(old.vault_secret_id); end if; return old; end $$;
revoke all on function public.meta_cred_before_delete() from public, anon, authenticated;
create trigger meta_cred_before_delete_trg before delete on public.meta_pagina_credenciais
  for each row execute function public.meta_cred_before_delete();

-- ============================ OAUTH fase 1 — state (sem token) ============================
create table public.meta_oauth_estados (
  state_hash text primary key,                   -- sha256(state); state bruto NUNCA é gravado
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  code_consumido boolean not null default false,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '10 minutes')
);
alter table public.meta_oauth_estados enable row level security;
revoke all on public.meta_oauth_estados from public, anon, authenticated;
grant all on public.meta_oauth_estados to service_role;
create index meta_oauth_expira_idx on public.meta_oauth_estados(expira_em);

-- ============================ OAUTH fase 2 — código de continuação (frontend) ============================
create table public.meta_sessao_continuacao (
  codigo_hash text primary key,                  -- sha256(codigo); código bruto só vai ao frontend
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  user_token_vault_id uuid,                      -- user token long-lived no Vault (temporário)
  paginas jsonb,                                 -- [{id,nome}] SEM tokens
  consumido boolean not null default false,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '5 minutes')
);
alter table public.meta_sessao_continuacao enable row level security;
revoke all on public.meta_sessao_continuacao from public, anon, authenticated;
grant all on public.meta_sessao_continuacao to service_role;
create index meta_cont_expira_idx on public.meta_sessao_continuacao(expira_em);

-- ============================ EVENTOS (idempotência atômica; payload mínimo) ============================
create table public.meta_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,                       -- chave determinística (ver Edge Function)
  organizacao_id uuid, canal_id uuid, pagina_id text,
  tipo_evento public.meta_evento_tipo not null,
  provider_message_id text, sender_psid text, recipient_id text, is_echo boolean,
  status_processamento public.meta_proc_status not null default 'recebido',
  ignorado_motivo text, erro text,               -- 'erro': motivo curto/controlado (sem secrets/PII/headers)
  recebido_em timestamptz not null default now(), processado_em timestamptz,
  constraint meta_wwe_event_key_uniq unique (event_key)
);
alter table public.meta_webhook_events enable row level security;
revoke all on public.meta_webhook_events from public, anon, authenticated;
grant all on public.meta_webhook_events to service_role;
create index meta_wwe_recebido on public.meta_webhook_events(recebido_em desc);

-- ============================ IDENTIDADE por Página (PSID; só service_role) ============================
create table public.meta_contato_identidades (
  id uuid primary key default gen_random_uuid(),
  meta_pagina_id uuid not null,
  organizacao_id uuid not null,
  contato_id uuid not null,
  psid text not null,
  criado_em timestamptz not null default now(),
  constraint meta_contato_psid_uniq unique (meta_pagina_id, psid),   -- 1 contato por PSID por Página
  constraint meta_contato_pagina_fk  foreign key (meta_pagina_id, organizacao_id)
    references public.meta_paginas (id, organizacao_id) on delete restrict,
  constraint meta_contato_contato_fk foreign key (contato_id, organizacao_id)
    references public.contatos (id, organizacao_id) on delete cascade
);
alter table public.meta_contato_identidades enable row level security;
revoke all on public.meta_contato_identidades from public, anon, authenticated;  -- PSID invisível ao frontend
grant all on public.meta_contato_identidades to service_role;
create index meta_contid_contato_idx on public.meta_contato_identidades(contato_id);

-- ============================ MENSAGENS: correlação local p/ reconciliação envio×echo ============================
alter table public.mensagens add column if not exists client_request_id text;
create unique index if not exists mensagens_client_req_uniq
  on public.mensagens (organizacao_id, client_request_id) where client_request_id is not null;

-- reconciliação ATÔMICA (uma única linha) — nunca toca outra org/canal
create or replace function public.meta_reconciliar_envio(
  p_org uuid, p_client_request_id text, p_id_externo text, p_status public.mensagem_status
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_pend uuid; v_echo uuid;
begin
  select id into v_pend from public.mensagens where organizacao_id = p_org and client_request_id = p_client_request_id limit 1;
  select id into v_echo from public.mensagens where organizacao_id = p_org and id_externo = p_id_externo limit 1;
  if v_pend is not null and v_echo is not null and v_pend <> v_echo then
    delete from public.mensagens where id = v_echo and organizacao_id = p_org;                 -- echo duplicado
    update public.mensagens set id_externo = p_id_externo, status = p_status, origem = 'atenvo' where id = v_pend and organizacao_id = p_org;
    return v_pend;
  elsif v_pend is not null then
    update public.mensagens set id_externo = p_id_externo, status = p_status, origem = 'atenvo' where id = v_pend and organizacao_id = p_org;
    return v_pend;
  elsif v_echo is not null then
    update public.mensagens set origem = 'atenvo', status = p_status where id = v_echo and organizacao_id = p_org;
    return v_echo;
  else
    return null;
  end if;
end $$;
revoke all on function public.meta_reconciliar_envio(uuid,text,text,public.mensagem_status) from public, anon, authenticated;
grant execute on function public.meta_reconciliar_envio(uuid,text,text,public.mensagem_status) to service_role;

-- ============================ LIMPEZA segura (apaga secret do Vault antes da sessão) ============================
create or replace function public.meta_limpar_sessoes_expiradas()
returns integer language plpgsql security definer set search_path = public, vault as $$
declare r record; n int := 0;
begin
  for r in select user_token_vault_id from public.meta_sessao_continuacao where expira_em < now() loop
    if r.user_token_vault_id is not null then perform public.meta_delete_secret(r.user_token_vault_id); end if;
    n := n + 1;
  end loop;
  delete from public.meta_sessao_continuacao where expira_em < now();
  delete from public.meta_oauth_estados where expira_em < now();   -- estados não guardam token
  return n;  -- resultado técnico (sem token)
end $$;
revoke all on function public.meta_limpar_sessoes_expiradas() from public, anon, authenticated;
grant execute on function public.meta_limpar_sessoes_expiradas() to service_role;

-- ============================ RETENÇÃO/limpeza ============================
-- A função meta_limpar_sessoes_expiradas() acima faz a limpeza Vault-safe.
-- Agendamento (pg_cron) NÃO é criado aqui para não arriscar o apply (extensão não
-- instalada / criação de extensão em transação). Follow-up pós-MVP: habilitar
-- pg_cron e agendar `select public.meta_limpar_sessoes_expiradas()` (*/10 min) +
-- retenção de meta_webhook_events (30 dias). Cada sessão também é limpa no fim do
-- fluxo OAuth (conclusão/cancelamento) pelas Edge Functions.
