-- ============================================================================
-- Fluxos personalizáveis — Fase 1 (IA configurável)
--
-- O cliente MONTA o fluxo do bot no painel (lista de passos em jsonb) e liga
-- num canal. O bot-runner ganha um interpretador que executa fluxos do banco;
-- canal SEM fluxo custom fica byte-idêntico ao comportamento atual.
--
-- Forma de `passos` (array ordenado; o motor valida em runtime com fallback):
--   { tipo:'mensagem', baloes:[text,...] }                       → envia e segue
--   { tipo:'pergunta', baloes:[...], opcoes:[{rotulo,valor}...],
--     salvarEm:'chave', reprompt:'texto' }                       → espera resposta
--   { tipo:'coletar', baloes:[...], dado:'nome'|'cpf'|'telefone'|'email'|'texto',
--     salvarEm:'chave', reprompt:'texto' }                       → espera + valida
--   { tipo:'acao', etiqueta?:'nome', chamarHumano?:bool, entregarIa?:bool }
--   { tipo:'fim', baloes?:[...] }                                → encerra o fluxo
-- ============================================================================

create table if not exists public.ia_fluxos (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  nome            text not null default 'Novo fluxo',
  descricao       text not null default '',
  passos          jsonb not null default '[]'::jsonb,
  ativo           boolean not null default false,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists ia_fluxos_org_idx on public.ia_fluxos (organizacao_id);

alter table public.ia_fluxos enable row level security;

drop policy if exists ia_fluxos_sel on public.ia_fluxos;
create policy ia_fluxos_sel on public.ia_fluxos for select
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));

drop policy if exists ia_fluxos_ins on public.ia_fluxos;
create policy ia_fluxos_ins on public.ia_fluxos for insert
  with check (is_platform_admin()
    or (papel_na_org(organizacao_id) = any (array['admin'::user_role,'supervisor'::user_role])
        and org_operacional(organizacao_id)));

drop policy if exists ia_fluxos_upd on public.ia_fluxos;
create policy ia_fluxos_upd on public.ia_fluxos for update
  using (is_platform_admin()
    or (papel_na_org(organizacao_id) = any (array['admin'::user_role,'supervisor'::user_role])
        and org_operacional(organizacao_id)));

drop policy if exists ia_fluxos_del on public.ia_fluxos;
create policy ia_fluxos_del on public.ia_fluxos for delete
  using (is_platform_admin()
    or (papel_na_org(organizacao_id) = any (array['admin'::user_role,'supervisor'::user_role])
        and org_operacional(organizacao_id)));

grant select, insert, update, delete on public.ia_fluxos to authenticated;
grant all on public.ia_fluxos to service_role;

-- atualizado_em + org imutável (mesmo padrão dos agentes)
create or replace function public.fn_ia_fluxos_before_upd()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.organizacao_id := old.organizacao_id;
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists trg_ia_fluxos_before_upd on public.ia_fluxos;
create trigger trg_ia_fluxos_before_upd
  before update on public.ia_fluxos
  for each row execute function public.fn_ia_fluxos_before_upd();

-- vínculo fluxo → canal
alter table public.bot_canal_config
  add column if not exists ia_fluxo_id uuid references public.ia_fluxos(id) on delete set null;

create index if not exists bot_canal_config_ia_fluxo_idx
  on public.bot_canal_config (ia_fluxo_id) where ia_fluxo_id is not null;

-- excluir fluxo = BOT desligado nos canais que o usavam (nunca voltar pro trilho
-- de fábrica em silêncio — mesma lição do delete de agente)
create or replace function public.fn_ia_fluxos_before_del()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.bot_canal_config
     set bot_enabled = false, atualizado_em = now()
   where ia_fluxo_id = old.id;
  return old;
end $$;

drop trigger if exists trg_ia_fluxos_before_del on public.ia_fluxos;
create trigger trg_ia_fluxos_before_del
  before delete on public.ia_fluxos
  for each row execute function public.fn_ia_fluxos_before_del();

-- RPC: apontar o canal pra um fluxo (ou null = voltar ao comportamento de fábrica)
create or replace function public.ia_fluxo_vincular_canal(p_canal uuid, p_fluxo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_org_fluxo uuid;
begin
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then
    raise exception 'Canal não encontrado';
  end if;
  if not (is_platform_admin()
          or papel_na_org(v_org) = any (array['admin'::user_role,'supervisor'::user_role])) then
    raise exception 'Sem permissão para vincular fluxo';
  end if;
  if p_fluxo is not null then
    select organizacao_id into v_org_fluxo from public.ia_fluxos where id = p_fluxo;
    if v_org_fluxo is null or v_org_fluxo <> v_org then
      raise exception 'Fluxo não encontrado nesta organização';
    end if;
  end if;

  insert into public.bot_canal_config (organizacao_id, canal_id, ia_fluxo_id)
  values (v_org, p_canal, p_fluxo)
  on conflict (canal_id) do update
    set ia_fluxo_id = excluded.ia_fluxo_id, atualizado_em = now();
end $$;

revoke all on function public.ia_fluxo_vincular_canal(uuid, uuid) from public, anon;
grant execute on function public.ia_fluxo_vincular_canal(uuid, uuid) to authenticated, service_role;
