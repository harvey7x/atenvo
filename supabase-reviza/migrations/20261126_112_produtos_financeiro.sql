-- 112 · PRODUTOS E SERVIÇOS + FINANCEIRO DO CLIENTE (26/11, "igual" ao sistema que a Reviza usava antes: lá Configurações ›
-- Produtos e serviços (nome, descrição, valor unitário, ativo), a aba Financeiro no painel do lead (produto/serviço, novo
-- lançamento) e o Dashboard › Financeiro (receita, cobranças fora da receita, por responsável, por produto, top clientes)).
--   atd_produtos        o catálogo (só o administrador muda; todos leem)
--   atd_lancamentos     o que cada cliente comprou ou deve: produto (opcional), quantidade, valor unitário, total, tipo
--                       ('receita' ou 'cobranca' — a cobrança fica fora da receita), data. Liga sozinho ao card do cliente.
--   atd_financeiro_resumo  o Dashboard › Financeiro (só o administrador), com filtro por responsável
-- ADITIVA. Depende da 93. DESFAZER no fim.

create table if not exists public.atd_produtos (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome           text not null,
  descricao      text,
  valor          numeric(12,2) not null default 0,
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint atd_produtos_nome check (char_length(btrim(nome)) between 1 and 80),
  constraint atd_produtos_desc check (descricao is null or char_length(descricao) <= 500),
  constraint atd_produtos_valor check (valor >= 0 and valor <= 9999999999)
);
create unique index if not exists atd_produtos_nome_uniq on public.atd_produtos (organizacao_id, lower(btrim(nome)));
alter table public.atd_produtos enable row level security;
revoke all on public.atd_produtos from public, anon, authenticated;
grant select, insert, update, delete on public.atd_produtos to authenticated;
grant all on public.atd_produtos to service_role;
drop policy if exists atd_produtos_ler on public.atd_produtos;
create policy atd_produtos_ler on public.atd_produtos for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));
drop policy if exists atd_produtos_admin on public.atd_produtos;
create policy atd_produtos_admin on public.atd_produtos for all to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));

create or replace function private.atd_produtos_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome := btrim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function private.atd_produtos_carimbo() from public, anon, authenticated;
drop trigger if exists atd_produtos_carimbo on public.atd_produtos;
create trigger atd_produtos_carimbo before insert or update on public.atd_produtos for each row execute function private.atd_produtos_carimbo();

create table if not exists public.atd_lancamentos (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  contato_id      uuid not null references public.contatos(id) on delete cascade,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  produto_id      uuid references public.atd_produtos(id) on delete set null,
  descricao       text not null,
  quantidade      int not null default 1,
  valor_unitario  numeric(12,2) not null default 0,
  valor_total     numeric(14,2) generated always as (quantidade * valor_unitario) stored,
  tipo            text not null default 'receita',
  data            date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  observacao      text,
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  constraint atd_lanc_desc check (char_length(btrim(descricao)) between 1 and 200),
  constraint atd_lanc_qtd check (quantidade between 1 and 9999),
  constraint atd_lanc_valor check (valor_unitario >= 0 and valor_unitario <= 9999999999),
  constraint atd_lanc_tipo check (tipo in ('receita', 'cobranca')),
  constraint atd_lanc_obs check (observacao is null or char_length(observacao) <= 300)
);
create index if not exists atd_lanc_contato on public.atd_lancamentos (contato_id, data desc);
create index if not exists atd_lanc_org_data on public.atd_lancamentos (organizacao_id, data desc);
create index if not exists atd_lanc_produto on public.atd_lancamentos (produto_id) where produto_id is not null;
create index if not exists atd_lanc_opp on public.atd_lancamentos (oportunidade_id) where oportunidade_id is not null;
alter table public.atd_lancamentos enable row level security;
revoke all on public.atd_lancamentos from public, anon, authenticated;
grant select, insert, update, delete on public.atd_lancamentos to authenticated;
grant all on public.atd_lancamentos to service_role;
-- como o contato: quem vê lê; quem pode mexer no contato lança; apagar é de quem lançou ou de administrador/supervisor
drop policy if exists atd_lanc_ler on public.atd_lancamentos;
create policy atd_lanc_ler on public.atd_lancamentos for select to authenticated
  using (organizacao_id in (select public.orgs_visiveis()));
drop policy if exists atd_lanc_ins on public.atd_lancamentos;
create policy atd_lanc_ins on public.atd_lancamentos for insert to authenticated
  with check ((select public.is_platform_admin()) or ((select public.is_member(organizacao_id)) and (select public.org_operacional(organizacao_id))));
drop policy if exists atd_lanc_upd on public.atd_lancamentos;
create policy atd_lanc_upd on public.atd_lancamentos for update to authenticated
  using ((select public.is_platform_admin()) or ((select public.is_member(organizacao_id)) and (select public.org_operacional(organizacao_id))))
  with check ((select public.is_platform_admin()) or ((select public.is_member(organizacao_id)) and (select public.org_operacional(organizacao_id))));
drop policy if exists atd_lanc_del on public.atd_lancamentos;
create policy atd_lanc_del on public.atd_lancamentos for delete to authenticated
  using ((select public.is_platform_admin()) or criado_por = (select auth.uid())
         or coalesce((select public.org_papel(organizacao_id)), '') in ('admin', 'supervisor'));

create or replace function private.atd_lancamento_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_pnome text;
begin
  select organizacao_id into v_org from public.contatos where id = new.contato_id;
  if v_org is null then raise exception 'contato_inexistente'; end if;
  new.organizacao_id := v_org;
  if new.produto_id is not null then
    select nome into v_pnome from public.atd_produtos where id = new.produto_id and organizacao_id = v_org;
    if v_pnome is null then raise exception 'produto_de_outra_empresa'; end if;
  end if;
  new.descricao := coalesce(nullif(btrim(coalesce(new.descricao, '')), ''), v_pnome);
  new.observacao := nullif(btrim(coalesce(new.observacao, '')), '');
  -- liga ao card do cliente (o mais recente) quando não veio dizendo qual
  if new.oportunidade_id is null then
    select o.id into new.oportunidade_id from public.oportunidades o where o.contato_id = new.contato_id and o.organizacao_id = v_org order by o.criado_em desc limit 1;
  elsif not exists (select 1 from public.oportunidades o where o.id = new.oportunidade_id and o.contato_id = new.contato_id) then
    raise exception 'card_de_outro_cliente';
  end if;
  if tg_op = 'INSERT' then new.criado_por := coalesce(auth.uid(), new.criado_por); new.criado_em := now(); end if;
  return new;
end $$;
revoke all on function private.atd_lancamento_carimbo() from public, anon, authenticated;
drop trigger if exists atd_lancamento_carimbo on public.atd_lancamentos;
create trigger atd_lancamento_carimbo before insert or update on public.atd_lancamentos for each row execute function private.atd_lancamento_carimbo();

-- o Dashboard › Financeiro: no período, receita (e em quantos clientes), cobranças (fora da receita), por responsável do
-- card, por produto, os clientes que mais compraram e o catálogo. p_responsavel filtra pelo responsável do card.
create or replace function public.atd_financeiro_resumo(p_dias int default 30, p_responsavel uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 730);
  v_ini date := (now() at time zone 'America/Sao_Paulo')::date - (v_dias - 1);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return (
    with l as (
      select x.*, o.responsavel_id, coalesce(nullif(btrim(u.nome), ''), 'Sem responsável') as resp_nome,
             coalesce(nullif(btrim(ct.nome), ''), ct.telefone, 'Cliente sem nome') as contato
        from public.atd_lancamentos x
        left join public.oportunidades o on o.id = x.oportunidade_id
        left join public.usuarios u on u.id = o.responsavel_id
        left join public.contatos ct on ct.id = x.contato_id
       where x.organizacao_id = v_org and x.data >= v_ini
         and (p_responsavel is null or o.responsavel_id = p_responsavel)
    ), r as (select * from l where tipo = 'receita')
    select jsonb_build_object(
      'dias', v_dias,
      'receita', (select coalesce(sum(valor_total), 0) from r),
      'clientes_receita', (select count(distinct contato_id) from r),
      'lancamentos', (select count(*) from r),
      'cobrancas', (select coalesce(sum(valor_total), 0) from l where tipo = 'cobranca'),
      'clientes_cobranca', (select count(distinct contato_id) from l where tipo = 'cobranca'),
      'ticket_medio', (select case when count(distinct contato_id) > 0 then round(sum(valor_total) / count(distinct contato_id), 2) else 0 end from r),
      'por_responsavel', coalesce((select jsonb_agg(jsonb_build_object('nome', x.resp_nome, 'valor', x.v, 'qtd', x.n) order by x.v desc)
                                     from (select resp_nome, sum(valor_total) as v, count(distinct contato_id) as n from r group by resp_nome) x), '[]'::jsonb),
      'por_produto', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'valor', x.v, 'qtd', x.q) order by x.v desc)
                                 from (select coalesce(p.nome, r.descricao) as nome, sum(r.valor_total) as v, sum(r.quantidade) as q
                                         from r left join public.atd_produtos p on p.id = r.produto_id group by 1 order by 2 desc limit 12) x), '[]'::jsonb),
      'top_clientes', coalesce((select jsonb_agg(jsonb_build_object('contato_id', x.contato_id, 'contato', x.contato, 'valor', x.v, 'responsavel', x.resp,
                                     'conversa_id', (select cv.id from public.conversas cv where cv.contato_id = x.contato_id order by cv.ultima_interacao_em desc nulls last limit 1)) order by x.v desc)
                                  from (select contato_id, min(contato) as contato, sum(valor_total) as v, min(resp_nome) as resp from r group by contato_id order by 3 desc limit 10) x), '[]'::jsonb),
      'por_mes', coalesce((select jsonb_agg(jsonb_build_object('mes', x.mes, 'valor', x.v) order by x.mes)
                             from (select to_char(date_trunc('month', data), 'YYYY-MM') as mes, sum(valor_total) as v from r group by 1) x), '[]'::jsonb),
      'catalogo', (select count(*) from public.atd_produtos where organizacao_id = v_org and ativo),
      'gerado_em', now()
    ));
end $$;
revoke all on function public.atd_financeiro_resumo(int, uuid) from public, anon;
grant execute on function public.atd_financeiro_resumo(int, uuid) to authenticated, service_role;

-- DESFAZER:
--   drop function if exists public.atd_financeiro_resumo(int, uuid), private.atd_lancamento_carimbo(), private.atd_produtos_carimbo();
--   drop table if exists public.atd_lancamentos, public.atd_produtos;
