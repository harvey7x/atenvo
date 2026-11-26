-- 111 · BOTÃO DE VENDA, ORIGEM DO LEAD e mais dois TIPOS DE CAMPO (26/11, "igual" ao sistema que a Reviza usava antes:
-- lá Configurações › Botão de venda (nome do botão + histórico de quem marcou), › Origem do lead (o sistema identifica
-- sozinho; sem origem = "Indefinida") e os tipos "Número inteiro" e "Data e hora" dos campos personalizados).
--   atd_config_venda          o nome do botão que marca a venda (até 24 letras; vazio = "Contrato fechado") e o pedido de
--                             mandar a venda para a Meta (fica DESLIGADO até as Conversões da Meta estarem conectadas)
--   atd_vendas_historico      as vendas marcadas no período: cliente, quando, quem marcou, valor (só o administrador)
--   atd_origens_resumo        de onde vieram as conversas novas: anúncio (o próprio sistema identifica), a origem do
--                             número de WhatsApp, ou "Indefinida" (só o administrador)
--   atd_canal_definir_origem  o administrador diz de qual origem é cada número de WhatsApp
--   atd_campos.tipo           + 'inteiro' e 'data_hora'
-- ADITIVA. Depende da 93, 96 e 110. DESFAZER no fim.

-- 1) os dois tipos novos de campo ---------------------------------------------------------------------------------------
alter table public.atd_campos drop constraint if exists atd_campos_tipo;
alter table public.atd_campos add constraint atd_campos_tipo check (tipo in ('texto', 'numero', 'inteiro', 'data', 'data_hora', 'lista', 'sim_nao', 'telefone', 'email'));

create or replace function private.atd_campo_valor_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_tipo text; v_opc text[];
begin
  select organizacao_id, tipo, opcoes into v_org, v_tipo, v_opc from public.atd_campos where id = new.campo_id;
  if v_org is null then raise exception 'campo_inexistente'; end if;
  if not exists (select 1 from public.contatos c where c.id = new.contato_id and c.organizacao_id = v_org) then raise exception 'contato_de_outra_empresa'; end if;
  new.organizacao_id := v_org;
  new.valor := btrim(new.valor);
  if v_tipo = 'numero' and new.valor !~ '^-?[0-9]+([.,][0-9]+)?$' then raise exception 'numero_invalido'; end if;
  if v_tipo = 'inteiro' and new.valor !~ '^-?[0-9]+$' then raise exception 'inteiro_invalido'; end if;
  if v_tipo = 'data' and new.valor !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'data_invalida'; end if;
  if v_tipo = 'data_hora' and new.valor !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'data_hora_invalida'; end if;
  if v_tipo = 'sim_nao' and new.valor not in ('sim', 'nao') then raise exception 'sim_nao_invalido'; end if;
  if v_tipo = 'lista' and not (new.valor = any (v_opc)) then raise exception 'opcao_invalida'; end if;
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end $$;
revoke all on function private.atd_campo_valor_carimbo() from public, anon, authenticated;

-- 2) o botão de venda ---------------------------------------------------------------------------------------------------
create table if not exists public.atd_config_venda (
  organizacao_id     uuid primary key references public.organizacoes(id) on delete cascade,
  nome_botao         text,
  meta_evento_ativo  boolean not null default false,
  meta_evento        text not null default 'Purchase',
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid,
  constraint atd_config_venda_nome check (nome_botao is null or char_length(btrim(nome_botao)) between 1 and 24),
  constraint atd_config_venda_evento check (meta_evento in ('Purchase', 'Lead', 'CompleteRegistration', 'Contact', 'Subscribe'))
);
alter table public.atd_config_venda enable row level security;
revoke all on public.atd_config_venda from public, anon, authenticated;
grant select, insert, update on public.atd_config_venda to authenticated;
grant all on public.atd_config_venda to service_role;
drop policy if exists atd_config_venda_ler on public.atd_config_venda;
create policy atd_config_venda_ler on public.atd_config_venda for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));
drop policy if exists atd_config_venda_admin_ins on public.atd_config_venda;
create policy atd_config_venda_admin_ins on public.atd_config_venda for insert to authenticated
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));
drop policy if exists atd_config_venda_admin_upd on public.atd_config_venda;
create policy atd_config_venda_admin_upd on public.atd_config_venda for update to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));

create or replace function private.atd_config_venda_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome_botao := nullif(btrim(regexp_replace(coalesce(new.nome_botao, ''), '\s+', ' ', 'g')), '');
  -- mandar para a Meta só liga com as Conversões da Meta conectadas (ainda não existem nesta instalação)
  if new.meta_evento_ativo and not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'atd_meta_conversoes') then
    raise exception 'meta_conversoes_nao_conectadas';
  end if;
  new.atualizado_em := now();
  new.atualizado_por := coalesce(auth.uid(), new.atualizado_por);
  return new;
end $$;
revoke all on function private.atd_config_venda_carimbo() from public, anon, authenticated;
drop trigger if exists atd_config_venda_carimbo on public.atd_config_venda;
create trigger atd_config_venda_carimbo before insert or update on public.atd_config_venda
  for each row execute function private.atd_config_venda_carimbo();

insert into public.atd_config_venda (organizacao_id)
select 'a1fa0000-0000-4000-8000-000000000001' where exists (select 1 from public.organizacoes where id = 'a1fa0000-0000-4000-8000-000000000001')
on conflict do nothing;

-- o histórico: os cards que foram para uma etapa de "ganho" (o Contrato fechado leva para lá), por quem e quando
create or replace function public.atd_vendas_historico(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 365);
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - make_interval(days => v_dias - 1);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return (
    with v as (
      select o.id, o.contato_id, o.conversa_origem_id, o.fechado_em, o.fechado_por_id, o.valor_estimado,
             coalesce(nullif(btrim(ct.nome), ''), nullif(btrim(o.contato_nome), ''), ct.telefone, o.telefone, 'Cliente sem nome') as contato,
             nullif(btrim(u.nome), '') as quem
        from public.oportunidades o
        left join public.contatos ct on ct.id = o.contato_id
        left join public.usuarios u on u.id = o.fechado_por_id
       where o.organizacao_id = v_org and o.status = 'ganho' and o.fechado_em >= v_ini
    )
    select jsonb_build_object(
      'dias', v_dias,
      'total', (select count(*) from v),
      'valor', (select coalesce(sum(valor_estimado), 0) from v),
      'por_pessoa', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'qtd', x.qtd) order by x.qtd desc, x.nome)
                                from (select coalesce(quem, 'Sem nome') as nome, count(*) as qtd from v group by 1) x), '[]'::jsonb),
      'vendas', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'contato', v.contato, 'quando', v.fechado_em, 'quem', v.quem,
                                   'valor', v.valor_estimado, 'conversa_id', v.conversa_origem_id) order by v.fechado_em desc)
                            from (select * from v order by fechado_em desc limit 200) v), '[]'::jsonb)
    ));
end $$;
revoke all on function public.atd_vendas_historico(int) from public, anon;
grant execute on function public.atd_vendas_historico(int) to authenticated, service_role;

-- 3) origem do lead -----------------------------------------------------------------------------------------------------
create unique index if not exists fontes_aquisicao_nome_uniq on public.fontes_aquisicao (organizacao_id, lower(btrim(nome)));

-- de onde vieram as conversas novas do período. A ordem de quem decide: o anúncio (o webhook guarda), depois a origem do
-- número de WhatsApp em que o cliente chegou, e sem nada é "Indefinida".
create or replace function public.atd_origens_resumo(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 365);
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - make_interval(days => v_dias - 1);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return (
    with c as (
      select cv.id,
             case when ao.conversa_id is not null then 'Anúncio'
                  when f.nome is not null then f.nome
                  else 'Indefinida' end as origem,
             case when ao.conversa_id is not null then 'anuncio' when f.nome is not null then 'numero' else 'nenhuma' end as como,
             nullif(btrim(ao.titulo), '') as anuncio
        from public.conversas cv
        left join public.atd_anuncio_origem ao on ao.conversa_id = cv.id
        left join public.canais ca on ca.id = coalesce(cv.canal_origem_id, cv.canal_id)
        left join public.fontes_aquisicao f on f.id = ca.fonte_aquisicao_id
       where cv.organizacao_id = v_org and cv.criado_em >= v_ini
    )
    select jsonb_build_object(
      'dias', v_dias,
      'total', (select count(*) from c),
      'por_origem', coalesce((select jsonb_agg(jsonb_build_object('origem', x.origem, 'como', x.como, 'qtd', x.qtd) order by x.qtd desc, x.origem)
                                from (select origem, min(como) as como, count(*) as qtd from c group by origem) x), '[]'::jsonb),
      'anuncios', coalesce((select jsonb_agg(jsonb_build_object('anuncio', x.anuncio, 'qtd', x.qtd) order by x.qtd desc)
                              from (select coalesce(anuncio, 'Anúncio sem título') as anuncio, count(*) as qtd from c where como = 'anuncio' group by 1 order by 2 desc limit 10) x), '[]'::jsonb)
    ));
end $$;
revoke all on function public.atd_origens_resumo(int) from public, anon;
grant execute on function public.atd_origens_resumo(int) to authenticated, service_role;

create or replace function public.atd_canal_definir_origem(p_canal uuid, p_fonte uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if not exists (select 1 from public.canais where id = p_canal and organizacao_id = v_org) then raise exception 'numero_inexistente'; end if;
  if p_fonte is not null and not exists (select 1 from public.fontes_aquisicao where id = p_fonte and organizacao_id = v_org) then raise exception 'origem_inexistente'; end if;
  update public.canais set fonte_aquisicao_id = p_fonte, atualizado_em = now() where id = p_canal;
end $$;
revoke all on function public.atd_canal_definir_origem(uuid, uuid) from public, anon;
grant execute on function public.atd_canal_definir_origem(uuid, uuid) to authenticated, service_role;

-- DESFAZER:
--   drop function if exists public.atd_vendas_historico(int), public.atd_origens_resumo(int), public.atd_canal_definir_origem(uuid, uuid), private.atd_config_venda_carimbo();
--   drop table if exists public.atd_config_venda; drop index if exists public.fontes_aquisicao_nome_uniq;
--   (os tipos: refazer o check e o carimbo da 110)
