-- 96 · ANÚNCIOS DO FACEBOOK no Atendimento (dono 25/11: "conectar o Facebook para ver qual campanha tá rodando melhor",
-- como no sistema que a Reviza usava antes). Três peças que se encontram pelo ID do anúncio:
--   atd_meta_conta      a conta de anúncios conectada (o código de acesso da Meta mora AQUI e só o servidor lê)
--   atd_meta_gasto      o que a Meta cobrou, por dia × anúncio (com conjunto e campanha), lido pela função meta-anuncios
--   atd_anuncio_origem  a conversa que começou pelo botão do anúncio: o WhatsApp manda junto o ID do anúncio
--                       (externalAdReply), gravado pelo evolution-webhook na primeira mensagem
-- A tela lê tudo por UMA rotina, dash_anuncios, só para o administrador (o Dashboard é só dele).
-- Nada aqui muda as Cobranças nem o resto do Atendimento.

-- 1) a conta conectada (uma por empresa) e a "sessão" curta entre colar o código e escolher a conta
create table if not exists public.atd_meta_conta (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  conta_id       text not null check (conta_id ~ '^act_[0-9]+$'),
  nome           text,
  moeda          text,
  fuso           text,
  token          text not null,
  conectado_por  uuid,
  conectado_em   timestamptz not null default now(),
  sincronizado_em timestamptz,
  erro_sync      text,
  atualizado_em  timestamptz not null default now()
);
create table if not exists public.atd_meta_sessao (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  usuario_id     uuid,
  token          text not null,
  contas         jsonb not null default '[]'::jsonb,
  criado_em      timestamptz not null default now()
);

-- 2) o gasto por dia e por anúncio (o dia é o da conta de anúncios; a da Reviza é no horário de Brasília)
create table if not exists public.atd_meta_gasto (
  organizacao_id    uuid not null references public.organizacoes(id) on delete cascade,
  dia               date not null,
  anuncio_id        text not null,
  anuncio_nome      text,
  conjunto_id       text,
  conjunto_nome     text,
  campanha_id       text,
  campanha_nome     text,
  campanha_situacao text,
  investido         numeric(14,2) not null default 0,
  impressoes        bigint not null default 0,
  cliques           bigint not null default 0,
  atualizado_em     timestamptz not null default now(),
  primary key (organizacao_id, dia, anuncio_id)
);
create index if not exists atd_meta_gasto_campanha on public.atd_meta_gasto (organizacao_id, campanha_id, dia);

-- 3) de qual anúncio veio cada conversa
create table if not exists public.atd_anuncio_origem (
  conversa_id    uuid primary key references public.conversas(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  contato_id     uuid references public.contatos(id) on delete set null,
  canal_id       uuid references public.canais(id) on delete set null,
  anuncio_id     text,
  titulo         text,
  corpo          text,
  url            text,
  ctwa_clid      text,
  tipo           text,
  recebido_em    timestamptz not null default now()
);
create index if not exists atd_anuncio_origem_org_quando on public.atd_anuncio_origem (organizacao_id, recebido_em desc);
create index if not exists atd_anuncio_origem_anuncio on public.atd_anuncio_origem (organizacao_id, anuncio_id);

-- ninguém lê nem grava direto: só o servidor (funções com a chave de serviço) e a rotina dash_anuncios
alter table public.atd_meta_conta enable row level security;
alter table public.atd_meta_sessao enable row level security;
alter table public.atd_meta_gasto enable row level security;
alter table public.atd_anuncio_origem enable row level security;
revoke all on table public.atd_meta_conta, public.atd_meta_sessao, public.atd_meta_gasto, public.atd_anuncio_origem from public, anon, authenticated;
grant all on table public.atd_meta_conta, public.atd_meta_sessao, public.atd_meta_gasto, public.atd_anuncio_origem to service_role;

-- 4) o webhook registra a origem. Primeiro clique fica; se o cliente voltar por OUTRO anúncio depois de 30 dias,
--    é um novo começo (a campanha nova ganha o lead). Nunca quebra a mensagem: o webhook chama em best-effort.
create or replace function public.atd_anuncio_registrar(p_conversa uuid, p_contato uuid, p_canal uuid, p_anuncio jsonb, p_quando timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_id  text := nullif(left(btrim(coalesce(p_anuncio->>'source_id', '')), 64), '');
  v_tit text := nullif(left(btrim(coalesce(p_anuncio->>'title', '')), 300), '');
begin
  if p_conversa is null or p_anuncio is null then return; end if;
  if v_id is null and v_tit is null then return; end if; -- sem ID e sem título não dá para ligar a nada
  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then return; end if;
  insert into public.atd_anuncio_origem as o (conversa_id, organizacao_id, contato_id, canal_id, anuncio_id, titulo, corpo, url, ctwa_clid, tipo, recebido_em)
  values (p_conversa, v_org, p_contato, p_canal, v_id, v_tit,
          nullif(left(btrim(coalesce(p_anuncio->>'body', '')), 600), ''),
          nullif(left(btrim(coalesce(p_anuncio->>'source_url', '')), 600), ''),
          nullif(left(btrim(coalesce(p_anuncio->>'ctwa_clid', '')), 200), ''),
          nullif(left(btrim(coalesce(p_anuncio->>'source_type', '')), 30), ''),
          coalesce(p_quando, now()))
  on conflict (conversa_id) do update
     set anuncio_id = excluded.anuncio_id, titulo = excluded.titulo, corpo = excluded.corpo, url = excluded.url,
         ctwa_clid = excluded.ctwa_clid, tipo = excluded.tipo, recebido_em = excluded.recebido_em,
         contato_id = coalesce(excluded.contato_id, o.contato_id), canal_id = coalesce(excluded.canal_id, o.canal_id)
   where o.recebido_em < excluded.recebido_em - interval '30 days'
      or (o.anuncio_id is null and excluded.anuncio_id is not null and o.recebido_em > excluded.recebido_em - interval '1 day');
end;
$$;
revoke all on function public.atd_anuncio_registrar(uuid, uuid, uuid, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.atd_anuncio_registrar(uuid, uuid, uuid, jsonb, timestamptz) to service_role;

-- 5) a aba Anúncios do Dashboard. Datas em São Paulo, fim EXCLUSIVO (como os Relatórios). p_serie_ini = início da série
--    dos gráficos (até 7 dias antes, quando o período é curto); os totais são sempre só do período.
create or replace function public.dash_anuncios(p_ini date, p_fim date, p_prev_ini date default null, p_serie_ini date default null, p_org uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := p_org;
  v_serie date := least(coalesce(p_serie_ini, p_ini), p_ini);
  v_conta public.atd_meta_conta%rowtype;
  v_res   jsonb;
begin
  if p_ini is null or p_fim is null or p_fim <= p_ini then raise exception 'periodo_invalido'; end if;
  if p_fim - v_serie > 400 then raise exception 'periodo_longo'; end if;
  if v_org is null then
    select ou.organizacao_id into v_org from public.organizacao_usuarios ou
     where ou.usuario_id = auth.uid() and ou.status = 'ativo' limit 1;
  end if;
  if v_org is null then raise exception 'org_indefinida'; end if;
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;

  select * into v_conta from public.atd_meta_conta where organizacao_id = v_org;

  with
  -- nomes mais recentes de cada anúncio (o gasto traz anúncio → conjunto → campanha)
  nomes as (
    select distinct on (g.anuncio_id) g.anuncio_id, g.anuncio_nome, g.campanha_id, g.campanha_nome, g.campanha_situacao
      from public.atd_meta_gasto g where g.organizacao_id = v_org
     order by g.anuncio_id, g.dia desc
  ),
  -- cada lead de anúncio, com o dia em SP, a campanha (pelo ID; sem conta, pelo título do anúncio) e como está hoje
  leads as (
    select o.conversa_id, o.contato_id, o.recebido_em,
           (o.recebido_em at time zone 'America/Sao_Paulo')::date as dia,
           coalesce(n.campanha_id, 'titulo:' || coalesce(o.titulo, o.anuncio_id, '?')) as campanha_id,
           coalesce(n.campanha_nome, o.titulo, 'Anúncio sem nome') as campanha_nome,
           coalesce(n.campanha_situacao, 'ativa') as campanha_situacao,
           coalesce(o.anuncio_id, 'titulo:' || coalesce(o.titulo, '?')) as anuncio_id,
           coalesce(n.anuncio_nome, o.titulo, 'Anúncio sem nome') as anuncio_nome,
           o.anuncio_id is null as sem_id,
           op.coluna_nome as etapa,
           coalesce(op.ganho, false) as fechado,
           coalesce(u.nome, ur.nome) as responsavel,
           coalesce(nullif(btrim(c.nome), ''), c.telefone, 'Sem nome') as contato,
           c.telefone
      from public.atd_anuncio_origem o
      left join nomes n on n.anuncio_id = o.anuncio_id
      left join public.conversas cv on cv.id = o.conversa_id
      left join public.contatos c on c.id = o.contato_id
      left join public.usuarios u on u.id = cv.atendente_id
      left join lateral (
        select fc.nome as coluna_nome, (op.status = 'ganho' or fc.resultado = 'ganho') as ganho, op.responsavel_id
          from public.oportunidades op
          left join public.funil_colunas fc on fc.id = op.coluna_id
         where op.organizacao_id = v_org and op.contato_id = o.contato_id and op.status <> 'cancelado'
         order by (op.status = 'ganho' or fc.resultado = 'ganho') desc, op.atualizado_em desc
         limit 1
      ) op on true
      left join public.usuarios ur on ur.id = op.responsavel_id
     where o.organizacao_id = v_org
       and o.recebido_em >= (least(v_serie, coalesce(p_prev_ini, p_ini))::timestamp at time zone 'America/Sao_Paulo')
       and o.recebido_em <  (p_fim::timestamp at time zone 'America/Sao_Paulo')
  ),
  gasto as (
    select g.* from public.atd_meta_gasto g
     where g.organizacao_id = v_org and v_conta.organizacao_id is not null
       and g.dia >= least(v_serie, coalesce(p_prev_ini, p_ini)) and g.dia < p_fim
  ),
  tot as (
    select jsonb_build_object(
      'investido', coalesce((select sum(investido) from gasto where dia >= p_ini), 0),
      'impressoes', coalesce((select sum(impressoes) from gasto where dia >= p_ini), 0),
      'cliques', coalesce((select sum(cliques) from gasto where dia >= p_ini), 0),
      'leads', (select count(*) from leads where dia >= p_ini),
      'fechados', (select count(*) from leads where dia >= p_ini and fechado)) as j
  ),
  ant as (
    select case when p_prev_ini is null or p_prev_ini >= p_ini then null else jsonb_build_object(
      'investido', coalesce((select sum(investido) from gasto where dia >= p_prev_ini and dia < p_ini), 0),
      'impressoes', coalesce((select sum(impressoes) from gasto where dia >= p_prev_ini and dia < p_ini), 0),
      'cliques', coalesce((select sum(cliques) from gasto where dia >= p_prev_ini and dia < p_ini), 0),
      'leads', (select count(*) from leads where dia >= p_prev_ini and dia < p_ini),
      'fechados', (select count(*) from leads where dia >= p_prev_ini and dia < p_ini and fechado)) end as j
  ),
  dias as (select d::date as dia from generate_series(v_serie, p_fim - 1, interval '1 day') d),
  por_dia as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'dia', dd.dia,
             'investido', coalesce((select sum(investido) from gasto g where g.dia = dd.dia), 0),
             'cliques', coalesce((select sum(cliques) from gasto g where g.dia = dd.dia), 0),
             'leads', (select count(*) from leads l where l.dia = dd.dia),
             'fechados', (select count(*) from leads l where l.dia = dd.dia and l.fechado),
             'por_campanha', coalesce((select jsonb_object_agg(x.campanha_id, x.n) from (select campanha_id, count(*) n from leads l where l.dia = dd.dia group by campanha_id) x), '{}'::jsonb)
           ) order by dd.dia), '[]'::jsonb) as j
      from dias dd
  ),
  camp_g as (
    select campanha_id, max(campanha_nome) as nome, max(campanha_situacao) as situacao, count(distinct anuncio_id) as anuncios,
           sum(investido) as investido, sum(impressoes) as impressoes, sum(cliques) as cliques
      from gasto where dia >= p_ini group by campanha_id
  ),
  camp_l as (
    select campanha_id, max(campanha_nome) as nome, max(campanha_situacao) as situacao, count(distinct anuncio_id) as anuncios,
           count(*) as leads, count(*) filter (where fechado) as fechados
      from leads where dia >= p_ini group by campanha_id
  ),
  campanhas as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', coalesce(g.campanha_id, l.campanha_id),
             'nome', coalesce(g.nome, l.nome),
             'situacao', case lower(coalesce(g.situacao, l.situacao, 'ativa')) when 'active' then 'ativa' when 'paused' then 'pausada'
                              when 'ativa' then 'ativa' when 'pausada' then 'pausada' else 'encerrada' end,
             'anuncios', greatest(coalesce(g.anuncios, 0), coalesce(l.anuncios, 0)),
             'investido', coalesce(g.investido, 0), 'impressoes', coalesce(g.impressoes, 0), 'cliques', coalesce(g.cliques, 0),
             'leads', coalesce(l.leads, 0), 'fechados', coalesce(l.fechados, 0)
           ) order by coalesce(l.leads, 0) desc, coalesce(g.investido, 0) desc), '[]'::jsonb) as j
      from camp_g g full join camp_l l on l.campanha_id = g.campanha_id
  ),
  an_g as (
    select anuncio_id, max(anuncio_nome) as nome, max(campanha_id) as campanha_id, max(campanha_nome) as campanha,
           sum(investido) as investido, sum(impressoes) as impressoes, sum(cliques) as cliques
      from gasto where dia >= p_ini group by anuncio_id
  ),
  an_l as (
    select anuncio_id, max(anuncio_nome) as nome, max(campanha_id) as campanha_id, max(campanha_nome) as campanha,
           count(*) as leads, count(*) filter (where fechado) as fechados
      from leads where dia >= p_ini group by anuncio_id
  ),
  anuncios as (
    select coalesce(jsonb_agg(x.o order by x.leads desc, x.investido desc), '[]'::jsonb) as j from (
      select jsonb_build_object('id', coalesce(g.anuncio_id, l.anuncio_id), 'nome', coalesce(g.nome, l.nome),
               'campanha_id', coalesce(g.campanha_id, l.campanha_id), 'campanha', coalesce(g.campanha, l.campanha),
               'investido', coalesce(g.investido, 0), 'impressoes', coalesce(g.impressoes, 0), 'cliques', coalesce(g.cliques, 0),
               'leads', coalesce(l.leads, 0), 'fechados', coalesce(l.fechados, 0)) as o,
             coalesce(l.leads, 0) as leads, coalesce(g.investido, 0) as investido
        from an_g g full join an_l l on l.anuncio_id = g.anuncio_id
       order by coalesce(l.leads, 0) desc, coalesce(g.investido, 0) desc
       limit 50) x
  ),
  lista as (
    select coalesce(jsonb_agg(x.o order by x.recebido_em desc), '[]'::jsonb) as j from (
      select jsonb_build_object('conversa_id', l.conversa_id, 'contato', l.contato, 'telefone', l.telefone, 'entrou_em', l.recebido_em,
               'anuncio', l.anuncio_nome, 'campanha', l.campanha_nome, 'campanha_id', l.campanha_id,
               'etapa', l.etapa, 'responsavel', l.responsavel, 'fechado', l.fechado) as o, l.recebido_em
        from leads l where l.dia >= p_ini order by l.recebido_em desc limit 300) x
  )
  select jsonb_build_object(
    'conectado', v_conta.organizacao_id is not null,
    'conta', case when v_conta.organizacao_id is null then null else jsonb_build_object('id', v_conta.conta_id, 'nome', v_conta.nome, 'moeda', coalesce(v_conta.moeda, 'BRL')) end,
    'sincronizado_em', v_conta.sincronizado_em,
    'totais', (select j from tot), 'anterior', (select j from ant),
    'por_dia', (select j from por_dia), 'campanhas', (select j from campanhas), 'anuncios', (select j from anuncios),
    'leads', (select j from lista),
    'sem_id', (select count(*) from leads where dia >= p_ini and sem_id),
    'gerado_em', now()) into v_res;
  return v_res;
end;
$$;
revoke all on function public.dash_anuncios(date, date, date, date, uuid) from public, anon, authenticated;
grant execute on function public.dash_anuncios(date, date, date, date, uuid) to authenticated, service_role;

-- 6) limpeza: sessão de "colar o código" vale 15 minutos
create or replace function public.atd_meta_sessao_limpar() returns void language sql security definer set search_path = public, pg_temp as $$
  delete from public.atd_meta_sessao where criado_em < now() - interval '15 minutes';
$$;
revoke all on function public.atd_meta_sessao_limpar() from public, anon, authenticated;
grant execute on function public.atd_meta_sessao_limpar() to service_role;
