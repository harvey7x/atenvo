-- ============================================================================
-- ETIQUETAS — FASE 1: fundação de dados (100% ADITIVA, reversível)
--
-- O vínculo de etiqueta migra de "array de NOMES (text[])" para "relação por ID"
-- via tabelas de junção. O array de texto existente (conversas.etiquetas /
-- contatos.etiquetas) é MANTIDO como CACHE DENORMALIZADO, sincronizado por
-- RPC (aplicar/remover) e por triggers em `etiquetas` (rename/delete). Assim
-- NENHUMA leitura atual quebra: o front continua lendo o array; a verdade passa
-- a ser a junção; o cache é sempre derivado dela.
--
-- ESCOPO: conversa + contato apenas. `oportunidades.etiquetas` fica INTOCADO
-- (migra em fase futura) — por isso os triggers de rename/delete NÃO tocam o
-- cache de oportunidades (nenhuma regressão: hoje já não há sync algum).
--
-- NÃO altera/dropa nenhuma coluna existente. Reversão = dropar as 2 tabelas,
-- as 2 funções RPC e os 2 triggers+funções de sync (ver rodapé).
--
-- RLS: espelha EXATAMENTE o predicado org-scoped de `conversas`/`contatos`:
--   SELECT  -> organizacao_id in (select orgs_visiveis())
--   INSERT  -> is_platform_admin() or (is_member(org) and org_operacional(org))
--   UPDATE  -> idem INSERT (using + with check)
--   DELETE  -> is_platform_admin() or (papel_na_org(org) in (admin,supervisor) and org_operacional(org))
-- ============================================================================

-- ============ 1a. TABELAS DE JUNÇÃO ============
create table if not exists public.conversa_etiquetas (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  conversa_id    uuid not null references public.conversas(id)    on delete cascade,
  etiqueta_id    uuid not null references public.etiquetas(id)     on delete cascade,
  aplicada_por   uuid,                                  -- nullable, sem FK rígida (convenção conversa_atividades.usuario_id)
  aplicada_em    timestamptz not null default now(),
  unique (conversa_id, etiqueta_id)
);

create table if not exists public.contato_etiquetas (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  contato_id     uuid not null references public.contatos(id)     on delete cascade,
  etiqueta_id    uuid not null references public.etiquetas(id)     on delete cascade,
  aplicada_por   uuid,
  aplicada_em    timestamptz not null default now(),
  unique (contato_id, etiqueta_id)
);

-- Índices. (conversa_id)/(contato_id) NÃO ganham índice próprio: são a coluna
-- LÍDER do índice do UNIQUE(conversa_id, etiqueta_id) / UNIQUE(contato_id,
-- etiqueta_id), então lookups por eles já estão cobertos. Criamos só os que
-- não têm cobertura: (etiqueta_id) e (organizacao_id).
create index if not exists conversa_etiquetas_etiqueta_idx on public.conversa_etiquetas (etiqueta_id);
create index if not exists conversa_etiquetas_org_idx      on public.conversa_etiquetas (organizacao_id);
create index if not exists contato_etiquetas_etiqueta_idx  on public.contato_etiquetas  (etiqueta_id);
create index if not exists contato_etiquetas_org_idx       on public.contato_etiquetas  (organizacao_id);

-- ============ 1b. RLS (espelha conversas/contatos) ============
alter table public.conversa_etiquetas enable row level security;
create policy ce_sel on public.conversa_etiquetas for select
  using (organizacao_id in (select orgs_visiveis()));
create policy ce_ins on public.conversa_etiquetas for insert
  with check (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy ce_upd on public.conversa_etiquetas for update
  using      (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)))
  with check (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy ce_del on public.conversa_etiquetas for delete
  using (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin','supervisor']::user_role[]) and org_operacional(organizacao_id)));

alter table public.contato_etiquetas enable row level security;
create policy cte_sel on public.contato_etiquetas for select
  using (organizacao_id in (select orgs_visiveis()));
create policy cte_ins on public.contato_etiquetas for insert
  with check (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy cte_upd on public.contato_etiquetas for update
  using      (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)))
  with check (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy cte_del on public.contato_etiquetas for delete
  using (is_platform_admin() or (papel_na_org(organizacao_id) = any(array['admin','supervisor']::user_role[]) and org_operacional(organizacao_id)));

-- ============ GRANTs (RLS é a autoridade; sem GRANT o PostgREST/RPC dá 403) ============
grant select, insert, update, delete on table public.conversa_etiquetas to authenticated;
grant select, insert, update, delete on table public.contato_etiquetas  to authenticated;
grant all on table public.conversa_etiquetas to service_role;
grant all on table public.contato_etiquetas  to service_role;

-- ============ 1c. BACKFILL a partir do cache atual (só INSERT na junção) ============
-- Match: MESMA org + etiqueta ATIVA + case-insensitive + trim (regra do corDaEtiqueta).
-- O UNIQUE(organizacao_id, lower(nome)) em `etiquetas` garante no máx. 1 match por nome.
-- NÃO re-materializamos o cache aqui: nomes órfãos (sem etiqueta correspondente,
-- ex.: "Teste") DEVEM permanecer no array como estão (não criamos etiqueta, não
-- inserimos junção, não removemos do cache). Órfãos são reportados na verificação.
insert into public.conversa_etiquetas (organizacao_id, conversa_id, etiqueta_id)
select e.organizacao_id, c.id, e.id
from public.conversas c
cross join lateral unnest(c.etiquetas) as t(nome)
join public.etiquetas e
  on e.organizacao_id = c.organizacao_id
 and e.ativo = true
 and lower(btrim(e.nome)) = lower(btrim(t.nome))
where c.etiquetas is not null and array_length(c.etiquetas, 1) > 0
on conflict (conversa_id, etiqueta_id) do nothing;

insert into public.contato_etiquetas (organizacao_id, contato_id, etiqueta_id)
select e.organizacao_id, ct.id, e.id
from public.contatos ct
cross join lateral unnest(ct.etiquetas) as t(nome)
join public.etiquetas e
  on e.organizacao_id = ct.organizacao_id
 and e.ativo = true
 and lower(btrim(e.nome)) = lower(btrim(t.nome))
where ct.etiquetas is not null and array_length(ct.etiquetas, 1) > 0
on conflict (contato_id, etiqueta_id) do nothing;

-- ============ 1d. RPCs (SECURITY INVOKER — a RLS do chamador vale) ============
-- Padrão do cache: após cada mutação, o array é RE-MATERIALIZADO como o conjunto
-- DISTINCT dos nomes das etiquetas presentes na junção daquele alvo. O cache
-- nunca diverge da verdade (a junção).
create or replace function public.aplicar_etiqueta(
  p_alvo_tipo  text,
  p_alvo_id    uuid,
  p_etiqueta_id uuid,
  p_espelhar   boolean default true,
  p_usuario_id uuid default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org     uuid;
  v_contato uuid;
begin
  select organizacao_id into v_org from public.etiquetas where id = p_etiqueta_id;
  if v_org is null then
    raise exception 'Etiqueta % inexistente', p_etiqueta_id using errcode = 'no_data_found';
  end if;

  if p_alvo_tipo = 'conversa' then
    insert into public.conversa_etiquetas (organizacao_id, conversa_id, etiqueta_id, aplicada_por)
    values (v_org, p_alvo_id, p_etiqueta_id, p_usuario_id)
    on conflict (conversa_id, etiqueta_id) do nothing;

    update public.conversas set etiquetas = coalesce((
      select array_agg(distinct et.nome order by et.nome)
      from public.conversa_etiquetas ce
      join public.etiquetas et on et.id = ce.etiqueta_id
      where ce.conversa_id = p_alvo_id), array[]::text[])
    where id = p_alvo_id;

    if p_espelhar then
      select contato_id into v_contato from public.conversas where id = p_alvo_id;
      if v_contato is not null then
        insert into public.contato_etiquetas (organizacao_id, contato_id, etiqueta_id, aplicada_por)
        values (v_org, v_contato, p_etiqueta_id, p_usuario_id)
        on conflict (contato_id, etiqueta_id) do nothing;

        update public.contatos set etiquetas = coalesce((
          select array_agg(distinct et.nome order by et.nome)
          from public.contato_etiquetas cte
          join public.etiquetas et on et.id = cte.etiqueta_id
          where cte.contato_id = v_contato), array[]::text[])
        where id = v_contato;
      end if;
    end if;

  elsif p_alvo_tipo = 'contato' then
    insert into public.contato_etiquetas (organizacao_id, contato_id, etiqueta_id, aplicada_por)
    values (v_org, p_alvo_id, p_etiqueta_id, p_usuario_id)
    on conflict (contato_id, etiqueta_id) do nothing;

    update public.contatos set etiquetas = coalesce((
      select array_agg(distinct et.nome order by et.nome)
      from public.contato_etiquetas cte
      join public.etiquetas et on et.id = cte.etiqueta_id
      where cte.contato_id = p_alvo_id), array[]::text[])
    where id = p_alvo_id;

  else
    raise exception 'alvo_tipo invalido: % (use conversa|contato)', p_alvo_tipo using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

create or replace function public.remover_etiqueta(
  p_alvo_tipo  text,
  p_alvo_id    uuid,
  p_etiqueta_id uuid,
  p_espelhar   boolean default true,
  p_usuario_id uuid default null   -- mantido por simetria de assinatura; não usado no delete
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org     uuid;
  v_contato uuid;
begin
  select organizacao_id into v_org from public.etiquetas where id = p_etiqueta_id;
  if v_org is null then
    raise exception 'Etiqueta % inexistente', p_etiqueta_id using errcode = 'no_data_found';
  end if;

  if p_alvo_tipo = 'conversa' then
    delete from public.conversa_etiquetas
    where conversa_id = p_alvo_id and etiqueta_id = p_etiqueta_id;

    update public.conversas set etiquetas = coalesce((
      select array_agg(distinct et.nome order by et.nome)
      from public.conversa_etiquetas ce
      join public.etiquetas et on et.id = ce.etiqueta_id
      where ce.conversa_id = p_alvo_id), array[]::text[])
    where id = p_alvo_id;

    if p_espelhar then
      select contato_id into v_contato from public.conversas where id = p_alvo_id;
      if v_contato is not null then
        delete from public.contato_etiquetas
        where contato_id = v_contato and etiqueta_id = p_etiqueta_id;

        update public.contatos set etiquetas = coalesce((
          select array_agg(distinct et.nome order by et.nome)
          from public.contato_etiquetas cte
          join public.etiquetas et on et.id = cte.etiqueta_id
          where cte.contato_id = v_contato), array[]::text[])
        where id = v_contato;
      end if;
    end if;

  elsif p_alvo_tipo = 'contato' then
    delete from public.contato_etiquetas
    where contato_id = p_alvo_id and etiqueta_id = p_etiqueta_id;

    update public.contatos set etiquetas = coalesce((
      select array_agg(distinct et.nome order by et.nome)
      from public.contato_etiquetas cte
      join public.etiquetas et on et.id = cte.etiqueta_id
      where cte.contato_id = p_alvo_id), array[]::text[])
    where id = p_alvo_id;

  else
    raise exception 'alvo_tipo invalido: % (use conversa|contato)', p_alvo_tipo using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

-- RPCs acessíveis a authenticated (RLS filtra) e service_role; anon fora.
revoke all on function public.aplicar_etiqueta(text, uuid, uuid, boolean, uuid) from public;
revoke all on function public.remover_etiqueta(text, uuid, uuid, boolean, uuid) from public;
grant execute on function public.aplicar_etiqueta(text, uuid, uuid, boolean, uuid) to authenticated, service_role;
grant execute on function public.remover_etiqueta(text, uuid, uuid, boolean, uuid) to authenticated, service_role;

-- ============ 1e. TRIGGERS em `etiquetas` (rename-safe / delete-safe do cache) ============
-- A junção é por ID, então NÃO muda no rename/delete — só o TEXTO do cache precisa
-- acompanhar. SECURITY DEFINER (mesma convenção de seed_status_conversa_padrao):
-- manutenção de cache org-wide, disparada por admin/supervisor.
-- Escopo conversa+contato; oportunidades intocado (fase futura).
create or replace function public.tg_etiqueta_rename_sync_cache()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversas
     set etiquetas = array_replace(etiquetas, old.nome, new.nome)
   where organizacao_id = new.organizacao_id and etiquetas @> array[old.nome];
  update public.contatos
     set etiquetas = array_replace(etiquetas, old.nome, new.nome)
   where organizacao_id = new.organizacao_id and etiquetas @> array[old.nome];
  return new;
end;
$$;

create or replace function public.tg_etiqueta_delete_sync_cache()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- linhas de junção já saem por ON DELETE CASCADE; aqui só limpamos o cache textual.
  update public.conversas
     set etiquetas = array_remove(etiquetas, old.nome)
   where organizacao_id = old.organizacao_id and etiquetas @> array[old.nome];
  update public.contatos
     set etiquetas = array_remove(etiquetas, old.nome)
   where organizacao_id = old.organizacao_id and etiquetas @> array[old.nome];
  return old;
end;
$$;

drop trigger if exists trg_etiqueta_rename_sync on public.etiquetas;
create trigger trg_etiqueta_rename_sync
  after update on public.etiquetas
  for each row when (old.nome is distinct from new.nome)
  execute function public.tg_etiqueta_rename_sync_cache();

drop trigger if exists trg_etiqueta_delete_sync on public.etiquetas;
create trigger trg_etiqueta_delete_sync
  after delete on public.etiquetas
  for each row execute function public.tg_etiqueta_delete_sync_cache();

-- ============================================================================
-- ROLLBACK (reversão total):
--   drop trigger if exists trg_etiqueta_rename_sync on public.etiquetas;
--   drop trigger if exists trg_etiqueta_delete_sync on public.etiquetas;
--   drop function if exists public.tg_etiqueta_rename_sync_cache();
--   drop function if exists public.tg_etiqueta_delete_sync_cache();
--   drop function if exists public.aplicar_etiqueta(text, uuid, uuid, boolean, uuid);
--   drop function if exists public.remover_etiqueta(text, uuid, uuid, boolean, uuid);
--   drop table if exists public.conversa_etiquetas;
--   drop table if exists public.contato_etiquetas;
-- (O cache text[] em conversas/contatos permanece intacto — nunca foi alterado
--  pelo backfill; só é tocado dali em diante por RPC/trigger.)
-- ============================================================================
