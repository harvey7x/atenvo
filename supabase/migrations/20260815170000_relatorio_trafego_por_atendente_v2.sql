-- Relatório diário de tráfego — bloco "por atendente" v2 (pedido do dono 2026-08-15).
--
-- Sai: atendidas e respostas por atendente. Entra: leads novos (conversas criadas no dia
-- já atribuídas ao atendente) e fechados (oportunidades GANHAS no dia — coluna com
-- resultado='ganho' e fechado_em no intervalo; crédito por responsavel_no_fechamento_id
-- com fallback fechado_por_id, o mesmo critério do placar).
--
-- O total "conversas atendidas" do bloco Movimento continua (o baseline/alerta usa ele);
-- só o detalhamento por pessoa mudou.

create or replace function public.relatorio_trafego_diario(
  p_dia date default null,
  p_org uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dia  date;
  v_org  uuid;
  v_ini  timestamptz;
  v_fim  timestamptz;
  v_out  jsonb;
begin
  v_dia := coalesce(p_dia, ((now() at time zone 'America/Sao_Paulo')::date - 1));
  v_org := coalesce(
    p_org,
    (select c.organizacao_id from conversas c group by 1 order by count(*) desc, 1 limit 1)
  );

  v_ini := (v_dia)::timestamp at time zone 'America/Sao_Paulo';
  v_fim := (v_dia + 1)::timestamp at time zone 'America/Sao_Paulo';

  with
  ativas as (
    select c.id, c.atendente_id
    from conversas c
    where c.organizacao_id = v_org
      and exists (
        select 1 from mensagens m
        where m.conversa_id = c.id
          and m.criado_em >= v_ini and m.criado_em < v_fim
      )
  ),
  novas_conversas as (
    select count(*)::int as n
    from conversas c
    where c.organizacao_id = v_org
      and c.criado_em >= v_ini and c.criado_em < v_fim
  ),
  novas_att as (
    select c.atendente_id as uid, count(*)::int as novas
    from conversas c
    where c.organizacao_id = v_org
      and c.atendente_id is not null
      and c.criado_em >= v_ini and c.criado_em < v_fim
    group by 1
  ),
  ganhos_att as (
    select coalesce(o.responsavel_no_fechamento_id, o.fechado_por_id) as uid, count(*)::int as ganhos
    from oportunidades o
    join funil_colunas fc on fc.id = o.coluna_id
    where o.organizacao_id = v_org
      and fc.resultado = 'ganho'
      and o.fechado_em >= v_ini and o.fechado_em < v_fim
    group by 1
  ),
  por_atendente as (
    select u.nome,
           coalesce(n.novas, 0)  as novas,
           coalesce(g.ganhos, 0) as ganhos
    from (select uid from novas_att union select uid from ganhos_att) ids
    join usuarios u on u.id = ids.uid
    left join novas_att  n on n.uid = ids.uid
    left join ganhos_att g on g.uid = ids.uid
    where ids.uid is not null
  ),
  kb_novas as (
    select fc.nome, fc.ordem, count(*)::int as total
    from oportunidades o
    join funil_colunas fc on fc.id = o.coluna_id
    where o.organizacao_id = v_org
      and o.criado_em >= v_ini and o.criado_em < v_fim
    group by fc.nome, fc.ordem
  ),
  kb_movidas as (
    select fc.nome, fc.ordem, count(*)::int as total
    from oportunidades o
    join funil_colunas fc on fc.id = o.coluna_id
    where o.organizacao_id = v_org
      and o.movimentado_em >= v_ini and o.movimentado_em < v_fim
      and o.criado_em < v_ini
    group by fc.nome, fc.ordem
  ),
  horas as (
    select h::int as hora,
           coalesce((
             select count(*)::int from mensagens m
             where m.organizacao_id = v_org
               and m.direcao = 'entrada'
               and m.criado_em >= v_ini and m.criado_em < v_fim
               and extract(hour from m.criado_em at time zone 'America/Sao_Paulo')::int = h
           ), 0) as total
    from generate_series(0, 23) h
  ),
  bancos as (
    select f.banco_nome as banco, count(*)::int as total
    from fichas_judiciais f
    where f.organizacao_id = v_org
      and f.criado_em >= v_ini and f.criado_em < v_fim
      and f.banco_nome is not null
    group by f.banco_nome
  ),
  dias_base as (
    select gs::date as dia,
           (gs::date)::timestamp at time zone 'America/Sao_Paulo'       as ini,
           ((gs::date) + 1)::timestamp at time zone 'America/Sao_Paulo' as fim
    from generate_series(v_dia - 7, v_dia - 1, interval '1 day') gs
  ),
  base as (
    select
      (select count(*) from conversas c
        where c.organizacao_id = v_org
          and c.criado_em >= d.ini and c.criado_em < d.fim)::int as novas,
      (select count(*) from conversas c
        where c.organizacao_id = v_org
          and exists (select 1 from mensagens m
                      where m.conversa_id = c.id
                        and m.criado_em >= d.ini and m.criado_em < d.fim))::int as ativas
    from dias_base d
  ),
  base_media as (
    select round(avg(novas)::numeric, 1) as novas, round(avg(ativas)::numeric, 1) as ativas
    from base
  )
  select jsonb_build_object(
    'dia',            to_char(v_dia, 'YYYY-MM-DD'),
    'organizacao_id', v_org,
    'gerado_em',      to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'),
    'novos', jsonb_build_object(
      'conversas', (select n from novas_conversas)
    ),
    'atendimento', jsonb_build_object(
      'ativas',         (select count(*)::int from ativas),
      'nao_atribuidas', (select count(*)::int from ativas where atendente_id is null),
      'por_atendente',  coalesce((
        select jsonb_agg(jsonb_build_object('nome', p.nome, 'novas', p.novas, 'ganhos', p.ganhos)
                         order by p.ganhos desc, p.novas desc, p.nome)
        from por_atendente p), '[]'::jsonb)
    ),
    'kanban', jsonb_build_object(
      'novas', coalesce((
        select jsonb_agg(jsonb_build_object('coluna', k.nome, 'total', k.total) order by k.ordem)
        from kb_novas k), '[]'::jsonb),
      'movidas', coalesce((
        select jsonb_agg(jsonb_build_object('coluna', k.nome, 'total', k.total) order by k.ordem)
        from kb_movidas k), '[]'::jsonb)
    ),
    'horas', coalesce((
      select jsonb_agg(jsonb_build_object('hora', h.hora, 'total', h.total) order by h.hora)
      from horas h), '[]'::jsonb),
    'bancos', coalesce((
      select jsonb_agg(jsonb_build_object('banco', b.banco, 'total', b.total) order by b.total desc, b.banco)
      from bancos b), '[]'::jsonb),
    'baseline', jsonb_build_object(
      'dias',         7,
      'novas_media',  (select novas  from base_media),
      'ativas_media', (select ativas from base_media)
    )
  ) into v_out;

  return v_out;
end;
$$;

-- create or replace preserva grants/owner, mas reafirmar não custa (definer ⇒ só service_role).
revoke all on function public.relatorio_trafego_diario(date, uuid) from public, authenticated;
grant execute on function public.relatorio_trafego_diario(date, uuid) to service_role;
