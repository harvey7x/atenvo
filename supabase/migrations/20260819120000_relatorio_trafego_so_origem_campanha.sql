-- Relatório de tráfego — escopo por CANAL DE ORIGEM (pedido do dono 2026-08-19).
--
-- Motivo: terça 18/08 o relatório somou 61 "novos contatos", mas só 15 eram do
-- ANDRIUS TRAFEGO — 46 vieram do chip novo CAMPANHA DE EMPRÉSTIMO. O relatório é
-- do TRÁFEGO do Andrius; misturar campanhas mente pra quem otimiza o anúncio.
--
-- As três funções ganham p_canais uuid[] (null = org inteira, comportamento antigo).
-- A edge function passa a lista via secret RELATORIO_TRAFEGO_ORIGENS (default =
-- ANDRIUS TRAFEGO fc80ec9e-9f8f-4dca-a3f0-e1101d73e117).
--
-- Linhagem (regra da casa, ver memória trafego-pago-linhagem-numeros):
--  * conversa de origem = coalesce(canal_origem_id, canal_id) — canal_id sozinho mente;
--  * "contatos do tráfego" = contatos com ALGUMA conversa originada nos canais-alvo;
--    atendidas/pico/bancos seguem o CONTATO (38% fecham em outro número, e continuam
--    contando);
--  * oportunidade filtra por o.canal_origem_id, com fallback pela linhagem do contato
--    quando o campo é null.
--
-- DROP antes de recriar: CREATE OR REPLACE com assinatura nova criaria OVERLOAD e a
-- versão antiga continuaria viva, deixando a chamada do PostgREST ambígua.

drop function if exists public.relatorio_trafego_diario(date, uuid);
drop function if exists public.relatorio_trafego_semanal(date, uuid);
drop function if exists public.relatorio_trafego_sem_resposta(uuid, date, int);

create or replace function public.relatorio_trafego_diario(
  p_dia date default null,
  p_org uuid default null,
  p_canais uuid[] default null
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
  cts as (  -- contatos cuja linhagem nasce nos canais-alvo (null = todos)
    select distinct c.contato_id
    from conversas c
    where c.organizacao_id = v_org
      and (p_canais is null or coalesce(c.canal_origem_id, c.canal_id) = any(p_canais))
  ),
  ativas as (
    select c.id, c.atendente_id
    from conversas c
    where c.organizacao_id = v_org
      and c.contato_id in (select contato_id from cts)
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
      and (p_canais is null or coalesce(c.canal_origem_id, c.canal_id) = any(p_canais))
      and c.criado_em >= v_ini and c.criado_em < v_fim
  ),
  novas_att as (
    select c.atendente_id as uid, count(*)::int as novas
    from conversas c
    where c.organizacao_id = v_org
      and (p_canais is null or coalesce(c.canal_origem_id, c.canal_id) = any(p_canais))
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
      and (p_canais is null
           or o.canal_origem_id = any(p_canais)
           or (o.canal_origem_id is null and o.contato_id in (select contato_id from cts)))
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
      and (p_canais is null
           or o.canal_origem_id = any(p_canais)
           or (o.canal_origem_id is null and o.contato_id in (select contato_id from cts)))
    group by fc.nome, fc.ordem
  ),
  kb_movidas as (
    select fc.nome, fc.ordem, count(*)::int as total
    from oportunidades o
    join funil_colunas fc on fc.id = o.coluna_id
    where o.organizacao_id = v_org
      and o.movimentado_em >= v_ini and o.movimentado_em < v_fim
      and o.criado_em < v_ini
      and (p_canais is null
           or o.canal_origem_id = any(p_canais)
           or (o.canal_origem_id is null and o.contato_id in (select contato_id from cts)))
    group by fc.nome, fc.ordem
  ),
  horas as (
    select h::int as hora,
           coalesce((
             select count(*)::int from mensagens m
             join conversas cv on cv.id = m.conversa_id
             where m.organizacao_id = v_org
               and m.direcao = 'entrada'
               and cv.contato_id in (select contato_id from cts)
               and m.criado_em >= v_ini and m.criado_em < v_fim
               and extract(hour from m.criado_em at time zone 'America/Sao_Paulo')::int = h
           ), 0) as total
    from generate_series(0, 23) h
  ),
  bancos as (
    select f.banco_nome as banco, count(*)::int as total
    from fichas_judiciais f
    where f.organizacao_id = v_org
      and f.contato_id in (select contato_id from cts)
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
          and (p_canais is null or coalesce(c.canal_origem_id, c.canal_id) = any(p_canais))
          and c.criado_em >= d.ini and c.criado_em < d.fim)::int as novas,
      (select count(*) from conversas c
        where c.organizacao_id = v_org
          and c.contato_id in (select contato_id from cts)
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

create or replace function public.relatorio_trafego_semanal(
  p_sexta date default null,
  p_org uuid default null,
  p_canais uuid[] default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sexta date;
  v_org   uuid;
  v_ini   timestamptz;
  v_fim   timestamptz;
  v_bini  timestamptz;
  v_bfim  timestamptz;
  v_out   jsonb;
begin
  v_sexta := coalesce(p_sexta,
    (now() at time zone 'America/Sao_Paulo')::date
      - ((extract(dow from (now() at time zone 'America/Sao_Paulo')::date)::int + 2) % 7));
  v_org := coalesce(
    p_org,
    (select c.organizacao_id from conversas c group by 1 order by count(*) desc, 1 limit 1)
  );

  v_ini  := (v_sexta - 6)::timestamp  at time zone 'America/Sao_Paulo';
  v_fim  := (v_sexta + 1)::timestamp  at time zone 'America/Sao_Paulo';
  v_bini := (v_sexta - 13)::timestamp at time zone 'America/Sao_Paulo';
  v_bfim := v_ini;

  with
  cts as (
    select distinct c.contato_id
    from conversas c
    where c.organizacao_id = v_org
      and (p_canais is null or coalesce(c.canal_origem_id, c.canal_id) = any(p_canais))
  ),
  ativas as (
    select c.id, c.atendente_id
    from conversas c
    where c.organizacao_id = v_org
      and c.contato_id in (select contato_id from cts)
      and exists (
        select 1 from mensagens m
        where m.conversa_id = c.id
          and m.criado_em >= v_ini and m.criado_em < v_fim
      )
  ),
  novas_att as (
    select c.atendente_id as uid, count(*)::int as novas
    from conversas c
    where c.organizacao_id = v_org
      and (p_canais is null or coalesce(c.canal_origem_id, c.canal_id) = any(p_canais))
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
      and (p_canais is null
           or o.canal_origem_id = any(p_canais)
           or (o.canal_origem_id is null and o.contato_id in (select contato_id from cts)))
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
      and (p_canais is null
           or o.canal_origem_id = any(p_canais)
           or (o.canal_origem_id is null and o.contato_id in (select contato_id from cts)))
    group by fc.nome, fc.ordem
  ),
  kb_movidas as (
    select fc.nome, fc.ordem, count(*)::int as total
    from oportunidades o
    join funil_colunas fc on fc.id = o.coluna_id
    where o.organizacao_id = v_org
      and o.movimentado_em >= v_ini and o.movimentado_em < v_fim
      and o.criado_em < v_ini
      and (p_canais is null
           or o.canal_origem_id = any(p_canais)
           or (o.canal_origem_id is null and o.contato_id in (select contato_id from cts)))
    group by fc.nome, fc.ordem
  ),
  bancos as (
    select f.banco_nome as banco, count(*)::int as total
    from fichas_judiciais f
    where f.organizacao_id = v_org
      and f.contato_id in (select contato_id from cts)
      and f.criado_em >= v_ini and f.criado_em < v_fim
      and f.banco_nome is not null
    group by f.banco_nome
  ),
  dias as (
    select gs::date as dia,
           (gs::date)::timestamp at time zone 'America/Sao_Paulo'       as ini,
           ((gs::date) + 1)::timestamp at time zone 'America/Sao_Paulo' as fim
    from generate_series(v_sexta - 6, v_sexta, interval '1 day') gs
  ),
  por_dia as (
    select d.dia,
      (select count(*)::int from conversas c
        where c.organizacao_id = v_org
          and (p_canais is null or coalesce(c.canal_origem_id, c.canal_id) = any(p_canais))
          and c.criado_em >= d.ini and c.criado_em < d.fim) as novas,
      (select count(*)::int from mensagens m
        join conversas cv on cv.id = m.conversa_id
        where m.organizacao_id = v_org and m.direcao = 'entrada'
          and cv.contato_id in (select contato_id from cts)
          and m.criado_em >= d.ini and m.criado_em < d.fim) as msgs
    from dias d
  ),
  anterior as (
    select
      (select count(*)::int from conversas c
        where c.organizacao_id = v_org
          and (p_canais is null or coalesce(c.canal_origem_id, c.canal_id) = any(p_canais))
          and c.criado_em >= v_bini and c.criado_em < v_bfim) as novas,
      (select count(*)::int from conversas c
        where c.organizacao_id = v_org
          and c.contato_id in (select contato_id from cts)
          and exists (select 1 from mensagens m
                      where m.conversa_id = c.id
                        and m.criado_em >= v_bini and m.criado_em < v_bfim)) as ativas,
      (select count(*)::int from oportunidades o
        join funil_colunas fc on fc.id = o.coluna_id
        where o.organizacao_id = v_org and fc.resultado = 'ganho'
          and o.fechado_em >= v_bini and o.fechado_em < v_bfim
          and (p_canais is null
               or o.canal_origem_id = any(p_canais)
               or (o.canal_origem_id is null and o.contato_id in (select contato_id from cts)))) as ganhos
  )
  select jsonb_build_object(
    'ini',            to_char(v_sexta - 6, 'YYYY-MM-DD'),
    'fim',            to_char(v_sexta, 'YYYY-MM-DD'),
    'organizacao_id', v_org,
    'gerado_em',      to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'),
    'novos', jsonb_build_object(
      'conversas', (select coalesce(sum(novas), 0)::int from por_dia)
    ),
    'atendimento', jsonb_build_object(
      'ativas',         (select count(*)::int from ativas),
      'nao_atribuidas', (select count(*)::int from ativas where atendente_id is null),
      'por_atendente',  coalesce((
        select jsonb_agg(jsonb_build_object('nome', p.nome, 'novas', p.novas, 'ganhos', p.ganhos)
                         order by p.ganhos desc, p.novas desc, p.nome)
        from por_atendente p), '[]'::jsonb)
    ),
    'fechados_total', (select coalesce(sum(ganhos), 0)::int from ganhos_att),
    'kanban', jsonb_build_object(
      'novas', coalesce((
        select jsonb_agg(jsonb_build_object('coluna', k.nome, 'total', k.total) order by k.ordem)
        from kb_novas k), '[]'::jsonb),
      'movidas', coalesce((
        select jsonb_agg(jsonb_build_object('coluna', k.nome, 'total', k.total) order by k.ordem)
        from kb_movidas k), '[]'::jsonb)
    ),
    'bancos', coalesce((
      select jsonb_agg(jsonb_build_object('banco', b.banco, 'total', b.total) order by b.total desc, b.banco)
      from bancos b), '[]'::jsonb),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', to_char(p.dia, 'YYYY-MM-DD'), 'novas', p.novas, 'msgs', p.msgs)
                       order by p.dia)
      from por_dia p), '[]'::jsonb),
    'anterior', (select jsonb_build_object('novas', novas, 'ativas', ativas, 'ganhos', ganhos) from anterior)
  ) into v_out;

  return v_out;
end;
$$;

create or replace function public.relatorio_trafego_sem_resposta(
  p_org uuid,
  p_ini date,
  p_dias int default 1,
  p_canais uuid[] default null
) returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from conversas c
  where c.organizacao_id = p_org
    and (p_canais is null or coalesce(c.canal_origem_id, c.canal_id) = any(p_canais))
    and c.criado_em >= (p_ini)::timestamp at time zone 'America/Sao_Paulo'
    and c.criado_em <  (p_ini + p_dias)::timestamp at time zone 'America/Sao_Paulo'
    and not exists (
      select 1 from mensagens m
      where m.conversa_id = c.id
        and m.direcao = 'saida'
        and m.autor_id is not null
        and m.criado_em >= (p_ini)::timestamp at time zone 'America/Sao_Paulo'
        and m.criado_em <  (p_ini + p_dias)::timestamp at time zone 'America/Sao_Paulo'
    );
$$;

revoke all on function public.relatorio_trafego_diario(date, uuid, uuid[]) from public, authenticated;
grant execute on function public.relatorio_trafego_diario(date, uuid, uuid[]) to service_role;
revoke all on function public.relatorio_trafego_semanal(date, uuid, uuid[]) from public, authenticated;
grant execute on function public.relatorio_trafego_semanal(date, uuid, uuid[]) to service_role;
revoke all on function public.relatorio_trafego_sem_resposta(uuid, date, int, uuid[]) from public, authenticated;
grant execute on function public.relatorio_trafego_sem_resposta(uuid, date, int, uuid[]) to service_role;
