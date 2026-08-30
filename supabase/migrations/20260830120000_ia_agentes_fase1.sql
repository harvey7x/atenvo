-- ============================================================================
-- IA configurável — Fase 1: atendentes de IA por organização
--
-- O cliente cria o próprio atendente de IA dentro do painel: nome, provedor
-- (gemini/openai/anthropic), modelo, prompt (persona) e comportamentos, com a
-- CHAVE DE API dele guardada no Vault (nunca legível pelo front — gravação por
-- RPC, leitura exclusiva do service_role via ia_agente_chave).
--
-- O motor ia-sdr mescla a config do agente POR CIMA de bot_canal_config.ia_config
-- (vínculo via bot_canal_config.ia_agente_id). Sem agente vinculado, o motor se
-- comporta EXATAMENTE como hoje — fallback total, risco zero pra operação.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Entidade
-- ---------------------------------------------------------------------------
create table if not exists public.ia_agentes (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid not null references public.organizacoes(id) on delete cascade,
  nome             text not null default 'Atendente de IA',
  provedor         text not null default 'gemini'
                     constraint ia_agentes_provedor_chk check (provedor in ('gemini','openai','anthropic')),
  modelo           text not null default 'gemini-3.6-flash',
  persona_prompt   text not null default '',
  -- comportamentos (todos opcionais; ausente = default do motor):
  --   horario:        { ativo bool, inicio '09:00', fim '19:00', dias int[] (1=seg..7=dom) }
  --   janela:         { inicio '07:30', fim '21:30' }  (contato proativo/nudge)
  --   nudges_ativos:  bool (escada de follow-up)
  --   max_chamadas_dia: int
  comportamentos   jsonb not null default '{}'::jsonb,
  ativo            boolean not null default false,
  -- chave no Vault: aqui só a REFERÊNCIA + carimbo (nunca o valor)
  chave_secret_id  uuid,
  chave_definida_em timestamptz,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create index if not exists ia_agentes_org_idx on public.ia_agentes (organizacao_id);

alter table public.ia_agentes enable row level security;

drop policy if exists ia_agentes_sel on public.ia_agentes;
create policy ia_agentes_sel on public.ia_agentes for select
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));

drop policy if exists ia_agentes_ins on public.ia_agentes;
create policy ia_agentes_ins on public.ia_agentes for insert
  with check (is_platform_admin()
    or (papel_na_org(organizacao_id) = any (array['admin'::user_role,'supervisor'::user_role])
        and org_operacional(organizacao_id)));

drop policy if exists ia_agentes_upd on public.ia_agentes;
create policy ia_agentes_upd on public.ia_agentes for update
  using (is_platform_admin()
    or (papel_na_org(organizacao_id) = any (array['admin'::user_role,'supervisor'::user_role])
        and org_operacional(organizacao_id)));

drop policy if exists ia_agentes_del on public.ia_agentes;
create policy ia_agentes_del on public.ia_agentes for delete
  using (is_platform_admin()
    or (papel_na_org(organizacao_id) = any (array['admin'::user_role,'supervisor'::user_role])
        and org_operacional(organizacao_id)));

grant select, insert, update, delete on public.ia_agentes to authenticated;
grant all on public.ia_agentes to service_role;

-- ---------------------------------------------------------------------------
-- Vínculo agente → canal (o ia-sdr já lê bot_canal_config por canal)
-- ---------------------------------------------------------------------------
alter table public.bot_canal_config
  add column if not exists ia_agente_id uuid references public.ia_agentes(id) on delete set null;

create index if not exists bot_canal_config_ia_agente_idx
  on public.bot_canal_config (ia_agente_id) where ia_agente_id is not null;

-- ---------------------------------------------------------------------------
-- Proteções: cliente não escreve os campos de chave (só a RPC, via GUC bypass —
-- mesmo padrão de atenvo.sync_resp) e atualizado_em sempre carimba
-- ---------------------------------------------------------------------------
create or replace function public.fn_ia_agentes_before_upd()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('atenvo.ia_chave', true), '') <> '1' then
    new.chave_secret_id   := old.chave_secret_id;
    new.chave_definida_em := old.chave_definida_em;
  end if;
  new.organizacao_id := old.organizacao_id;  -- org nunca muda por update
  new.atualizado_em  := now();
  return new;
end $$;

drop trigger if exists trg_ia_agentes_before_upd on public.ia_agentes;
create trigger trg_ia_agentes_before_upd
  before update on public.ia_agentes
  for each row execute function public.fn_ia_agentes_before_upd();

-- Apagou o agente → apaga o secret do Vault (não deixar chave órfã)
create or replace function public.fn_ia_agentes_after_del()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.chave_secret_id is not null then
    delete from vault.secrets where id = old.chave_secret_id;
  end if;
  return old;
end $$;

drop trigger if exists trg_ia_agentes_after_del on public.ia_agentes;
create trigger trg_ia_agentes_after_del
  after delete on public.ia_agentes
  for each row execute function public.fn_ia_agentes_after_del();

-- ---------------------------------------------------------------------------
-- RPC: gravar a chave (write-only; o valor nunca volta pro cliente)
-- ---------------------------------------------------------------------------
create or replace function public.ia_agente_salvar_chave(p_agente uuid, p_chave text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_secret uuid;
begin
  select organizacao_id, chave_secret_id into v_org, v_secret
    from public.ia_agentes where id = p_agente;
  if v_org is null then
    raise exception 'Agente não encontrado';
  end if;
  if not (is_platform_admin()
          or papel_na_org(v_org) = any (array['admin'::user_role,'supervisor'::user_role])) then
    raise exception 'Sem permissão para definir a chave';
  end if;
  if coalesce(btrim(p_chave), '') = '' then
    raise exception 'Chave vazia';
  end if;

  if v_secret is null then
    v_secret := vault.create_secret(p_chave, 'ia_agente_' || p_agente::text,
                                    'Chave de API do atendente de IA');
  else
    perform vault.update_secret(v_secret, p_chave, 'ia_agente_' || p_agente::text,
                                'Chave de API do atendente de IA');
  end if;

  perform set_config('atenvo.ia_chave', '1', true);
  update public.ia_agentes
     set chave_secret_id = v_secret, chave_definida_em = now()
   where id = p_agente;
end $$;

revoke all on function public.ia_agente_salvar_chave(uuid, text) from public, anon;
grant execute on function public.ia_agente_salvar_chave(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: ler a chave — EXCLUSIVA do service_role (motor/edge). Nunca o cliente.
-- ---------------------------------------------------------------------------
create or replace function public.ia_agente_chave(p_agente uuid)
returns text language sql security definer set search_path = public as $$
  select ds.decrypted_secret
    from public.ia_agentes a
    join vault.decrypted_secrets ds on ds.id = a.chave_secret_id
   where a.id = p_agente
$$;

revoke all on function public.ia_agente_chave(uuid) from public, anon, authenticated;
grant execute on function public.ia_agente_chave(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RPC: vincular o agente aos canais da org (lista completa; fora dela desvincula)
-- ---------------------------------------------------------------------------
create or replace function public.ia_agente_vincular_canais(p_agente uuid, p_canais uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select organizacao_id into v_org from public.ia_agentes where id = p_agente;
  if v_org is null then
    raise exception 'Agente não encontrado';
  end if;
  if not (is_platform_admin()
          or papel_na_org(v_org) = any (array['admin'::user_role,'supervisor'::user_role])) then
    raise exception 'Sem permissão para vincular canais';
  end if;

  -- saiu da lista → desvincula (só canais da org do agente)
  update public.bot_canal_config bc
     set ia_agente_id = null, atualizado_em = now()
    from public.canais c
   where c.id = bc.canal_id
     and c.organizacao_id = v_org
     and bc.ia_agente_id = p_agente
     and not (bc.canal_id = any (coalesce(p_canais, '{}'::uuid[])));

  -- entrou na lista → garante linha e vincula (só canais da org do agente)
  insert into public.bot_canal_config (organizacao_id, canal_id, ia_agente_id)
  select c.organizacao_id, c.id, p_agente
    from public.canais c
   where c.organizacao_id = v_org
     and c.id = any (coalesce(p_canais, '{}'::uuid[]))
  on conflict (canal_id) do update
    set ia_agente_id = excluded.ia_agente_id, atualizado_em = now();
end $$;

revoke all on function public.ia_agente_vincular_canais(uuid, uuid[]) from public, anon;
grant execute on function public.ia_agente_vincular_canais(uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPC: ligar/desligar a IA num canal (o interruptor que o cliente usa)
-- ---------------------------------------------------------------------------
create or replace function public.ia_canal_ativar(p_canal uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then
    raise exception 'Canal não encontrado';
  end if;
  if not (is_platform_admin()
          or papel_na_org(v_org) = any (array['admin'::user_role,'supervisor'::user_role])) then
    raise exception 'Sem permissão para ativar a IA neste canal';
  end if;

  insert into public.bot_canal_config (organizacao_id, canal_id, ia_enabled)
  values (v_org, p_canal, p_ativo)
  on conflict (canal_id) do update
    set ia_enabled = excluded.ia_enabled, atualizado_em = now();
end $$;

revoke all on function public.ia_canal_ativar(uuid, boolean) from public, anon;
grant execute on function public.ia_canal_ativar(uuid, boolean) to authenticated, service_role;
