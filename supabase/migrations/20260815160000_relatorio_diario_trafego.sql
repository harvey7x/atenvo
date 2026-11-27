-- Relatório diário de tráfego — camada de dados.
--
-- Uma RPC determinística que agrega o dia inteiro (00:00:00–23:59:59 em
-- America/Sao_Paulo) e devolve um jsonb pronto para a edge function
-- relatorio-diario-trafego formatar. ZERO interpretação de texto: só contagem.
--
-- SECURITY INVOKER de propósito: o cron chama com service_role (que ignora RLS)
-- e qualquer chamada logada continua filtrada pelas policies da org.
--
-- Convenções de leitura:
--   "conversa ativa no dia" = conversa com pelo menos uma mensagem criada no dia.
--     (criado_em da conversa só diz quando ela NASCEU; quem trabalhou aparece aqui.)
--   "movimentadas" no kanban EXCLUI as criadas no dia — oportunidades.movimentado_em
--     é NOT NULL e nasce igual ao criado_em, então sem esse filtro toda opp nova
--     contaria como movimentação.

create or replace function public.relatorio_trafego_diario(
  p_dia date default null,
  p_org uuid default null
) returns jsonb
language plpgsql
stable
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
  -- (a)+(b) conversas que tiveram vida no dia
  ativas as (
    select c.id,
           c.atendente_id,
           (c.criado_em >= v_ini and c.criado_em < v_fim) as nova
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
  por_atendente as (
    select u.nome,
           count(*)::int                          as ativas,
           count(*) filter (where a.nova)::int    as novas
    from ativas a
    join usuarios u on u.id = a.atendente_id
    group by u.nome
  ),
  respostas as (
    select m.autor_id, count(*)::int as n
    from mensagens m
    where m.organizacao_id = v_org
      and m.direcao = 'saida'
      and m.autor_id is not null
      and m.criado_em >= v_ini and m.criado_em < v_fim
    group by m.autor_id
  ),
  -- (c) kanban
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
  -- (d) horários de pico (mensagens de ENTRADA), 0..23 com zeros preenchidos
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
  -- (e) bancos das fichas abertas no dia
  bancos as (
    select f.banco_nome as banco, count(*)::int as total
    from fichas_judiciais f
    where f.organizacao_id = v_org
      and f.criado_em >= v_ini and f.criado_em < v_fim
      and f.banco_nome is not null
    group by f.banco_nome
  ),
  -- (f) baseline: os 7 dias ANTERIORES ao dia do relatório
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
        select jsonb_agg(jsonb_build_object('nome', p.nome, 'ativas', p.ativas, 'novas', p.novas)
                         order by p.ativas desc, p.nome)
        from por_atendente p), '[]'::jsonb),
      'respostas', coalesce((
        select jsonb_agg(jsonb_build_object('nome', u.nome, 'total', r.n) order by r.n desc, u.nome)
        from respostas r join usuarios u on u.id = r.autor_id), '[]'::jsonb)
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

comment on function public.relatorio_trafego_diario(date, uuid) is
  'Agrega o dia (America/Sao_Paulo) para o relatório diário de tráfego. Determinística, sem IA.';

revoke all on function public.relatorio_trafego_diario(date, uuid) from public;
grant execute on function public.relatorio_trafego_diario(date, uuid) to authenticated, service_role;
