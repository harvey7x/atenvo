-- 110 · CAMPOS PERSONALIZADOS E MOTIVOS DE FECHAMENTO configuráveis (26/11, "igual" ao sistema que a Reviza usava
-- antes: lá Configurações › Campos personalizados — a Reviza tinha "Nome completo (RG)", que a IA preenche lendo o RG —
-- e Motivos de fechamento com ordem, ativo e histórico).
--   atd_campos          os campos da empresa (texto, número, data, lista, sim/não, telefone, e-mail), na ordem, ativos,
--                       e quais aparecem no cartão do Kanban. Só o administrador cria/muda; todos leem.
--   atd_campo_valores   o valor de cada campo em cada contato (quem pode mexer no contato preenche).
--   atd_motivos_fechamento  a lista do "Fechar conversa" (o motivo escolhido continua indo para conversa_atividades,
--                       como na 105). "Outro motivo" (com detalhe) existe sempre na tela, não fica aqui.
-- ADITIVA: só cria peças novas. Depende da 93 e da 105. DESFAZER no fim.

-- 1) os campos ----------------------------------------------------------------------------------------------------------
create table if not exists public.atd_campos (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome           text not null,
  tipo           text not null default 'texto',
  opcoes         text[] not null default '{}',
  ordem          int  not null default 0,
  ativo          boolean not null default true,
  no_cartao      boolean not null default false,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint atd_campos_nome check (char_length(btrim(nome)) between 1 and 60),
  constraint atd_campos_tipo check (tipo in ('texto', 'numero', 'data', 'lista', 'sim_nao', 'telefone', 'email')),
  constraint atd_campos_opcoes check (cardinality(opcoes) <= 30 and (tipo <> 'lista' or cardinality(opcoes) between 1 and 30))
);
create unique index if not exists atd_campos_nome_uniq on public.atd_campos (organizacao_id, lower(btrim(nome)));

create table if not exists public.atd_campo_valores (
  contato_id     uuid not null references public.contatos(id) on delete cascade,
  campo_id       uuid not null references public.atd_campos(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  valor          text not null,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  primary key (contato_id, campo_id),
  constraint atd_campo_valores_valor check (char_length(valor) between 1 and 500)
);
create index if not exists atd_campo_valores_campo_idx on public.atd_campo_valores (campo_id);

alter table public.atd_campos enable row level security;
alter table public.atd_campo_valores enable row level security;
revoke all on public.atd_campos, public.atd_campo_valores from public, anon, authenticated;
grant select, insert, update, delete on public.atd_campos, public.atd_campo_valores to authenticated;
grant all on public.atd_campos, public.atd_campo_valores to service_role;

drop policy if exists atd_campos_ler on public.atd_campos;
create policy atd_campos_ler on public.atd_campos for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));
drop policy if exists atd_campos_admin on public.atd_campos;
create policy atd_campos_admin on public.atd_campos for all to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));

-- o valor segue a regra do próprio contato: quem vê o contato lê; quem pode mudar o contato preenche
drop policy if exists atd_campo_valores_ler on public.atd_campo_valores;
create policy atd_campo_valores_ler on public.atd_campo_valores for select to authenticated
  using (organizacao_id in (select public.orgs_visiveis()));
drop policy if exists atd_campo_valores_mudar on public.atd_campo_valores;
create policy atd_campo_valores_mudar on public.atd_campo_valores for all to authenticated
  using ((select public.is_platform_admin()) or ((select public.is_member(organizacao_id)) and (select public.org_operacional(organizacao_id))))
  with check ((select public.is_platform_admin()) or ((select public.is_member(organizacao_id)) and (select public.org_operacional(organizacao_id))));

create or replace function private.atd_campo_valor_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_tipo text; v_opc text[];
begin
  select organizacao_id, tipo, opcoes into v_org, v_tipo, v_opc from public.atd_campos where id = new.campo_id;
  if v_org is null then raise exception 'campo_inexistente'; end if;
  -- o valor é do contato da MESMA empresa do campo
  if not exists (select 1 from public.contatos c where c.id = new.contato_id and c.organizacao_id = v_org) then raise exception 'contato_de_outra_empresa'; end if;
  new.organizacao_id := v_org;
  new.valor := btrim(new.valor);
  if v_tipo = 'numero' and new.valor !~ '^-?[0-9]+([.,][0-9]+)?$' then raise exception 'numero_invalido'; end if;
  if v_tipo = 'data' and new.valor !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'data_invalida'; end if;
  if v_tipo = 'sim_nao' and new.valor not in ('sim', 'nao') then raise exception 'sim_nao_invalido'; end if;
  if v_tipo = 'lista' and not (new.valor = any (v_opc)) then raise exception 'opcao_invalida'; end if;
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end $$;
revoke all on function private.atd_campo_valor_carimbo() from public, anon, authenticated;
drop trigger if exists atd_campo_valor_carimbo on public.atd_campo_valores;
create trigger atd_campo_valor_carimbo before insert or update on public.atd_campo_valores
  for each row execute function private.atd_campo_valor_carimbo();

create or replace function private.atd_campos_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome := btrim(new.nome);
  new.opcoes := coalesce((select array_agg(distinct btrim(o)) from unnest(new.opcoes) o where btrim(o) <> ''), '{}');
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function private.atd_campos_carimbo() from public, anon, authenticated;
drop trigger if exists atd_campos_carimbo on public.atd_campos;
create trigger atd_campos_carimbo before insert or update on public.atd_campos
  for each row execute function private.atd_campos_carimbo();

-- 2) os motivos de fechamento -------------------------------------------------------------------------------------------
create table if not exists public.atd_motivos_fechamento (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome           text not null,
  ordem          int  not null default 0,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  constraint atd_motivos_nome check (char_length(btrim(nome)) between 1 and 80)
);
create unique index if not exists atd_motivos_nome_uniq on public.atd_motivos_fechamento (organizacao_id, lower(btrim(nome)));
alter table public.atd_motivos_fechamento enable row level security;
revoke all on public.atd_motivos_fechamento from public, anon, authenticated;
grant select, insert, update, delete on public.atd_motivos_fechamento to authenticated;
grant all on public.atd_motivos_fechamento to service_role;
drop policy if exists atd_motivos_ler on public.atd_motivos_fechamento;
create policy atd_motivos_ler on public.atd_motivos_fechamento for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));
drop policy if exists atd_motivos_admin on public.atd_motivos_fechamento;
create policy atd_motivos_admin on public.atd_motivos_fechamento for all to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));

-- o HISTÓRICO (só o administrador): quantas conversas fecharam por cada motivo no período e os últimos fechamentos, com
-- quem fechou. O texto gravado pela 105 é "Motivo — detalhe" (ou só o detalhe, no "Outro motivo"): o motivo é o começo
-- do texto quando ele está na lista; o resto conta como "Outro motivo".
create or replace function public.atd_motivos_historico(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 365);
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - make_interval(days => v_dias - 1);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return (
    with f as (
      select a.id, a.conversa_id, a.usuario_id, a.criado_em, a.motivo,
             coalesce((select m.nome from public.atd_motivos_fechamento m
                        where m.organizacao_id = v_org
                          and (lower(a.motivo) = lower(m.nome) or lower(a.motivo) like lower(m.nome) || ' — %')
                        order by char_length(m.nome) desc limit 1), 'Outro motivo') as base
        from public.conversa_atividades a
       where a.organizacao_id = v_org and a.tipo = 'fechado' and a.criado_em >= v_ini
    )
    select jsonb_build_object(
      'dias', v_dias,
      'total', (select count(*) from f),
      'por_motivo', coalesce((select jsonb_agg(jsonb_build_object('motivo', x.base, 'qtd', x.qtd) order by x.qtd desc, x.base)
                                from (select base, count(*) as qtd from f group by base) x), '[]'::jsonb),
      'por_pessoa', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'qtd', x.qtd) order by x.qtd desc, x.nome)
                                from (select coalesce(nullif(btrim(u.nome), ''), 'Sem nome') as nome, count(*) as qtd
                                        from f left join public.usuarios u on u.id = f.usuario_id group by 1) x), '[]'::jsonb),
      'recentes', coalesce((select jsonb_agg(r.j order by r.criado_em desc) from (
                              select f.criado_em, jsonb_build_object('quando', f.criado_em, 'motivo', f.motivo, 'base', f.base, 'conversa_id', f.conversa_id,
                                       'quem', nullif(btrim(u.nome), ''),
                                       'contato', coalesce(nullif(btrim(ct.nome), ''), ct.telefone, 'Cliente sem nome')) as j
                                from f
                                left join public.usuarios u on u.id = f.usuario_id
                                left join public.conversas c on c.id = f.conversa_id
                                left join public.contatos ct on ct.id = c.contato_id
                               order by f.criado_em desc limit 40) r), '[]'::jsonb)
    ));
end $$;
revoke all on function public.atd_motivos_historico(int) from public, anon;
grant execute on function public.atd_motivos_historico(int) to authenticated, service_role;

-- os de saída: o que a Reviza usava lá ("Cliente descartado") + os que o Reviza já tinha (105)
insert into public.atd_motivos_fechamento (organizacao_id, nome, ordem)
select 'a1fa0000-0000-4000-8000-000000000001', m.nome, m.ordem
  from (values ('Cliente descartado', 0), ('Atendimento concluído', 1), ('Cliente desistiu', 2), ('Sem perfil (não elegível)', 3),
               ('Cliente parou de responder', 4), ('Já é cliente ou contato repetido', 5)) as m(nome, ordem)
 where exists (select 1 from public.organizacoes where id = 'a1fa0000-0000-4000-8000-000000000001')
on conflict do nothing;

-- e o campo que a Reviza tinha lá
insert into public.atd_campos (organizacao_id, nome, tipo, ordem, no_cartao)
select 'a1fa0000-0000-4000-8000-000000000001', 'Nome completo (RG)', 'texto', 0, true
 where exists (select 1 from public.organizacoes where id = 'a1fa0000-0000-4000-8000-000000000001')
on conflict do nothing;

-- DESFAZER:
--   drop table if exists public.atd_campo_valores, public.atd_campos, public.atd_motivos_fechamento;
--   drop function if exists private.atd_campo_valor_carimbo(), private.atd_campos_carimbo(), public.atd_motivos_historico(int);
