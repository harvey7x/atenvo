-- Relatório SEMANAL de tráfego — camada de dados.
--
-- Semana "de sexta para sexta": a semana ENCERRA na sexta (dia inteiro, inclusive).
-- p_sexta = a sexta que fecha a semana; janela = [p_sexta-6, p_sexta+1) em
-- America/Sao_Paulo — sáb→sex, 7 dias completos. Default: a sexta mais recente já
-- encerrada quando visto do sábado (o cron roda sáb 00:45 e pega a sexta de ontem).
--
-- Baseline = a semana anterior inteira ([p_sexta-13, p_sexta-6)), não média de dias:
-- semana contra semana absorve o ciclo completo de uma vez.
--
-- Mesmo modelo de segurança da diária: SECURITY DEFINER (fichas_judiciais não tem
-- grant p/ service_role de propósito — CPF/RG lá dentro) e execute só pro service_role.

create or replace function public.relatorio_trafego_semanal(
  p_sexta date default null,
  p_org uuid default null
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
  v_bini  timestamptz;  -- semana anterior (baseline)
  v_bfim  timestamptz;
  v_out   jsonb;
begin
  -- sexta mais recente: dow da sexta é 5; (dow+2)%7 dias atrás cai na sexta.
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
  bancos as (
    select f.banco_nome as banco, count(*)::int as total
    from fichas_judiciais f
    where f.organizacao_id = v_org
      and f.criado_em >= v_ini and f.criado_em < v_fim
      and f.banco_nome is not null
    group by f.banco_nome
  ),
  -- série por dia (vira o gráfico de barras da semana)
  dias as (
    select gs::date as dia,
           (gs::date)::timestamp at time zone 'America/Sao_Paulo'       as ini,
           ((gs::date) + 1)::timestamp at time zone 'America/Sao_Paulo' as fim
    from generate_series(v_sexta - 6, v_sexta, interval '1 day') gs
  ),
  por_dia as (
    select d.dia,
      (select count(*)::int from conversas c
        where c.organizacao_id = v_org and c.criado_em >= d.ini and c.criado_em < d.fim) as novas,
      (select count(*)::int from mensagens m
        where m.organizacao_id = v_org and m.direcao = 'entrada'
          and m.criado_em >= d.ini and m.criado_em < d.fim) as msgs
    from dias d
  ),
  -- baseline: a semana ANTERIOR inteira
  anterior as (
    select
      (select count(*)::int from conversas c
        where c.organizacao_id = v_org
          and c.criado_em >= v_bini and c.criado_em < v_bfim) as novas,
      (select count(*)::int from conversas c
        where c.organizacao_id = v_org
          and exists (select 1 from mensagens m
                      where m.conversa_id = c.id
                        and m.criado_em >= v_bini and m.criado_em < v_bfim)) as ativas,
      (select count(*)::int from oportunidades o
        join funil_colunas fc on fc.id = o.coluna_id
        where o.organizacao_id = v_org and fc.resultado = 'ganho'
          and o.fechado_em >= v_bini and o.fechado_em < v_bfim) as ganhos
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

comment on function public.relatorio_trafego_semanal(date, uuid) is
  'Agrega a semana sáb→sex (encerra na sexta inteira, America/Sao_Paulo) para o relatório semanal. Determinística, sem IA.';

revoke all on function public.relatorio_trafego_semanal(date, uuid) from public, authenticated;
grant execute on function public.relatorio_trafego_semanal(date, uuid) to service_role;

-- Agendamento: sábado 00:45 BRT = 03:45 UTC sábado (dow 6). 15 min depois do diário
-- de sábado (que cobre a sexta) — o grupo recebe o dia e a semana em sequência.
select cron.unschedule('relatorio-semanal-trafego')
where exists (select 1 from cron.job where jobname = 'relatorio-semanal-trafego');

select cron.schedule(
  'relatorio-semanal-trafego',
  '45 3 * * 6',
  $job$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/relatorio-diario-trafego',
    body := '{"tipo":"semanal"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-relatorio-secret', (select secret from public.webhook_config where chave = 'relatorio_trafego')
    )
  );
  $job$
);
