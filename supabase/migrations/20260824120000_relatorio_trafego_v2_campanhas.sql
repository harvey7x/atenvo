-- Relatório de tráfego v2 — POR CAMPANHA, sem dados de atendente (pedido do dono 2026-08-24).
--
-- O relatório passa a responder só três perguntas, por canal de campanha:
--   * quantos leads NOVOS chegaram (contato criado no dia, origem no canal);
--   * quantos leads ANTIGOS voltaram a falar (retornos: contato criado antes do dia,
--     com mensagem de entrada no dia, atribuído ao canal de AQUISIÇÃO — origem congelada);
--   * o ritmo (série por hora no diário, por dia no semanal) — vira o gráfico.
--
-- E o MONITOR: pg_cron de hora em hora detecta canal que PAROU de receber (0 chegadas em
-- 3h quando a média histórica do mesmo horário indica movimento) ou com QUEDA forte
-- (dia corrente < 40% da média até a mesma hora). Estado anti-spam em trafego_alertas
-- (cooldown por canal+tipo). A função SQL DECIDE e registra; a edge function só formata
-- e envia — determinismo no banco, zero interpretação.

-- ————————————————————————————————————————————————— diário

create or replace function public.relatorio_trafego_campanhas(
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
  v_dia date;
  v_org uuid;
  v_ini timestamptz;
  v_fim timestamptz;
  v_out jsonb;
begin
  if p_canais is null or array_length(p_canais, 1) is null then
    raise exception 'p_canais é obrigatório';
  end if;
  v_dia := coalesce(p_dia, ((now() at time zone 'America/Sao_Paulo')::date - 1));
  v_org := coalesce(
    p_org,
    (select c.organizacao_id from conversas c group by 1 order by count(*) desc, 1 limit 1)
  );
  v_ini := (v_dia)::timestamp at time zone 'America/Sao_Paulo';
  v_fim := (v_dia + 1)::timestamp at time zone 'America/Sao_Paulo';

  with alvo as (
    select k.id, k.nome_interno from canais k where k.id = any(p_canais)
  ),
  novos as (  -- contato NOVO no dia, chegando pelo canal
    select coalesce(c.canal_origem_id, c.canal_id) as cid, count(*)::int as n
    from conversas c
    join contatos ct on ct.id = c.contato_id
    where c.organizacao_id = v_org
      and coalesce(c.canal_origem_id, c.canal_id) = any(p_canais)
      and c.criado_em >= v_ini and c.criado_em < v_fim
      and ct.criado_em >= v_ini and ct.criado_em < v_fim
    group by 1
  ),
  retornos as (  -- contato ANTIGO que mandou mensagem no dia; conta no canal de aquisição
    select coalesce(c.canal_origem_id, c.canal_id) as cid, count(distinct c.contato_id)::int as n
    from conversas c
    join contatos ct on ct.id = c.contato_id
    where c.organizacao_id = v_org
      and coalesce(c.canal_origem_id, c.canal_id) = any(p_canais)
      and ct.criado_em < v_ini
      and exists (select 1 from mensagens m
                  where m.conversa_id = c.id and m.direcao = 'entrada'
                    and m.criado_em >= v_ini and m.criado_em < v_fim)
    group by 1
  ),
  base7 as (  -- novos por canal nos 7 dias anteriores (média + nº de dias com movimento)
    select x.cid, round(avg(x.n)::numeric, 1) as media, count(*) filter (where x.n > 0)::int as dias_ativos
    from (
      select coalesce(c.canal_origem_id, c.canal_id) as cid,
             (c.criado_em at time zone 'America/Sao_Paulo')::date as d,
             count(*) as n
      from conversas c
      join contatos ct on ct.id = c.contato_id
      where c.organizacao_id = v_org
        and coalesce(c.canal_origem_id, c.canal_id) = any(p_canais)
        and c.criado_em >= (v_dia - 7)::timestamp at time zone 'America/Sao_Paulo'
        and c.criado_em <  v_ini
        and ct.criado_em >= (v_dia - 7)::timestamp at time zone 'America/Sao_Paulo'
      group by 1, 2
    ) x
    group by x.cid
  ),
  horas as (  -- chegadas de leads novos por hora, por canal (gráfico)
    select a.id as cid, h.h as hora,
      (select count(*)::int from conversas c
        join contatos ct on ct.id = c.contato_id
        where c.organizacao_id = v_org
          and coalesce(c.canal_origem_id, c.canal_id) = a.id
          and c.criado_em >= v_ini and c.criado_em < v_fim
          and ct.criado_em >= v_ini
          and extract(hour from c.criado_em at time zone 'America/Sao_Paulo')::int = h.h) as total
    from alvo a cross join generate_series(0, 23) as h(h)
  )
  select jsonb_build_object(
    'dia', to_char(v_dia, 'YYYY-MM-DD'),
    'organizacao_id', v_org,
    'gerado_em', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'),
    'campanhas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'canal_id', a.id,
        'nome', a.nome_interno,
        'novos', coalesce(n.n, 0),
        'retornos', coalesce(r.n, 0),
        'media7_novos', b.media,
        'dias_ativos_7d', coalesce(b.dias_ativos, 0),
        'horas', (select jsonb_agg(jsonb_build_object('hora', h.hora, 'total', h.total) order by h.hora)
                  from horas h where h.cid = a.id)
      ) order by a.nome_interno)
      from alvo a
      left join novos n on n.cid = a.id
      left join retornos r on r.cid = a.id
      left join base7 b on b.cid = a.id), '[]'::jsonb),
    'totais', jsonb_build_object(
      'novos',    coalesce((select sum(n) from novos), 0),
      'retornos', coalesce((select sum(n) from retornos), 0)
    )
  ) into v_out;

  return v_out;
end $$;

-- ————————————————————————————————————————————————— semanal (semana encerra na sexta inteira)

create or replace function public.relatorio_trafego_campanhas_semana(
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
  v_org uuid;
  v_ini timestamptz;
  v_fim timestamptz;
  v_bini timestamptz;
  v_out jsonb;
begin
  if p_canais is null or array_length(p_canais, 1) is null then
    raise exception 'p_canais é obrigatório';
  end if;
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

  with alvo as (
    select k.id, k.nome_interno from canais k where k.id = any(p_canais)
  ),
  por_dia as (  -- novos por canal × dia da semana
    select a.id as cid, d.dia,
      (select count(*)::int from conversas c
        join contatos ct on ct.id = c.contato_id
        where c.organizacao_id = v_org
          and coalesce(c.canal_origem_id, c.canal_id) = a.id
          and c.criado_em >= d.ini and c.criado_em < d.fim
          and ct.criado_em >= d.ini) as novos
    from alvo a
    cross join (
      select gs::date as dia,
             (gs::date)::timestamp at time zone 'America/Sao_Paulo' as ini,
             ((gs::date) + 1)::timestamp at time zone 'America/Sao_Paulo' as fim
      from generate_series(v_sexta - 6, v_sexta, interval '1 day') gs
    ) d
  ),
  retornos as (
    select coalesce(c.canal_origem_id, c.canal_id) as cid, count(distinct c.contato_id)::int as n
    from conversas c
    join contatos ct on ct.id = c.contato_id
    where c.organizacao_id = v_org
      and coalesce(c.canal_origem_id, c.canal_id) = any(p_canais)
      and ct.criado_em < v_ini
      and exists (select 1 from mensagens m
                  where m.conversa_id = c.id and m.direcao = 'entrada'
                    and m.criado_em >= v_ini and m.criado_em < v_fim)
    group by 1
  ),
  anterior as (  -- novos da semana anterior, por canal
    select coalesce(c.canal_origem_id, c.canal_id) as cid, count(*)::int as n
    from conversas c
    join contatos ct on ct.id = c.contato_id
    where c.organizacao_id = v_org
      and coalesce(c.canal_origem_id, c.canal_id) = any(p_canais)
      and c.criado_em >= v_bini and c.criado_em < v_ini
      and ct.criado_em >= v_bini
    group by 1
  )
  select jsonb_build_object(
    'ini', to_char(v_sexta - 6, 'YYYY-MM-DD'),
    'fim', to_char(v_sexta, 'YYYY-MM-DD'),
    'organizacao_id', v_org,
    'gerado_em', to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'),
    'campanhas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'canal_id', a.id,
        'nome', a.nome_interno,
        'novos', (select coalesce(sum(p.novos), 0)::int from por_dia p where p.cid = a.id),
        'retornos', coalesce(r.n, 0),
        'anterior_novos', coalesce(x.n, 0),
        'por_dia', (select jsonb_agg(jsonb_build_object('dia', to_char(p.dia, 'YYYY-MM-DD'), 'novos', p.novos)
                    order by p.dia) from por_dia p where p.cid = a.id)
      ) order by a.nome_interno)
      from alvo a
      left join retornos r on r.cid = a.id
      left join anterior x on x.cid = a.id), '[]'::jsonb),
    'totais', jsonb_build_object(
      'novos',    coalesce((select sum(novos) from por_dia), 0),
      'retornos', coalesce((select sum(n) from retornos), 0)
    )
  ) into v_out;

  return v_out;
end $$;

-- ————————————————————————————————————————————————— monitor de tráfego

create table if not exists public.trafego_alertas (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null references public.canais(id),
  tipo text not null,           -- 'parou' | 'queda'
  detalhe jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
alter table public.trafego_alertas enable row level security;  -- sem policy: só definer/service

create or replace function public.trafego_monitorar(
  p_canais uuid[],
  p_cooldown_horas int default 6
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_org uuid;
  v_hora_sp int := extract(hour from now() at time zone 'America/Sao_Paulo')::int;
  v_meia_noite timestamptz := ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  atual3 int; media3 numeric; hoje int; media_dia numeric; ultima timestamptz;
  alertas jsonb := '[]'::jsonb;
begin
  for r in select k.id, k.nome_interno, k.organizacao_id from canais k where k.id = any(p_canais) loop
    v_org := r.organizacao_id;

    -- chegadas (conversas novas com origem no canal) nas últimas 3h
    select count(*) into atual3 from conversas c
     where c.organizacao_id = v_org
       and coalesce(c.canal_origem_id, c.canal_id) = r.id
       and c.criado_em >= now() - interval '3 hours';

    -- média das MESMAS 3h nos 7 dias anteriores (mesmo horário do dia)
    select round(avg(x.n)::numeric, 1) into media3 from (
      select (select count(*) from conversas c
               where c.organizacao_id = v_org
                 and coalesce(c.canal_origem_id, c.canal_id) = r.id
                 and c.criado_em >= now() - interval '3 hours' - make_interval(days => d)
                 and c.criado_em <  now() - make_interval(days => d)) as n
      from generate_series(1, 7) d) x;

    -- hoje até agora × média dos 7 dias até a mesma hora
    select count(*) into hoje from conversas c
     where c.organizacao_id = v_org
       and coalesce(c.canal_origem_id, c.canal_id) = r.id
       and c.criado_em >= v_meia_noite;
    select round(avg(x.n)::numeric, 1) into media_dia from (
      select (select count(*) from conversas c
               where c.organizacao_id = v_org
                 and coalesce(c.canal_origem_id, c.canal_id) = r.id
                 and c.criado_em >= v_meia_noite - make_interval(days => d)
                 and c.criado_em <  now() - make_interval(days => d)) as n
      from generate_series(1, 7) d) x;

    select max(c.criado_em) into ultima from conversas c
     where c.organizacao_id = v_org and coalesce(c.canal_origem_id, c.canal_id) = r.id;

    -- PAROU: nada em 3h onde a história diz que devia haver movimento
    if atual3 = 0 and coalesce(media3, 0) >= 2
       and not exists (select 1 from trafego_alertas t
                        where t.canal_id = r.id and t.tipo = 'parou'
                          and t.criado_em >= now() - make_interval(hours => p_cooldown_horas)) then
      insert into trafego_alertas (canal_id, tipo, detalhe)
      values (r.id, 'parou', jsonb_build_object('media3h', media3, 'ultima', ultima));
      alertas := alertas || jsonb_build_object(
        'canal_id', r.id, 'nome', r.nome_interno, 'tipo', 'parou',
        'media3h', media3,
        'ultima', case when ultima is null then null
                       else to_char(ultima at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') end);
    end if;

    -- QUEDA: só depois do meio-dia (antes disso a amostra engana) e com base real
    if v_hora_sp >= 12 and coalesce(media_dia, 0) >= 5 and hoje < 0.4 * media_dia
       and not exists (select 1 from trafego_alertas t
                        where t.canal_id = r.id and t.tipo = 'queda'
                          and t.criado_em >= now() - make_interval(hours => p_cooldown_horas)) then
      insert into trafego_alertas (canal_id, tipo, detalhe)
      values (r.id, 'queda', jsonb_build_object('hoje', hoje, 'media_dia', media_dia));
      alertas := alertas || jsonb_build_object(
        'canal_id', r.id, 'nome', r.nome_interno, 'tipo', 'queda',
        'hoje', hoje, 'media_dia', media_dia,
        'pct', round(100 * (1 - hoje / media_dia)));
    end if;
  end loop;

  return alertas;
end $$;

revoke all on function public.relatorio_trafego_campanhas(date, uuid, uuid[]) from public, authenticated;
grant execute on function public.relatorio_trafego_campanhas(date, uuid, uuid[]) to service_role;
revoke all on function public.relatorio_trafego_campanhas_semana(date, uuid, uuid[]) from public, authenticated;
grant execute on function public.relatorio_trafego_campanhas_semana(date, uuid, uuid[]) to service_role;
revoke all on function public.trafego_monitorar(uuid[], int) from public, authenticated;
grant execute on function public.trafego_monitorar(uuid[], int) to service_role;

-- monitor de hora em hora, 08:00–22:00 BRT (11–23h e 0–1h UTC)
select cron.unschedule('trafego-monitor')
where exists (select 1 from cron.job where jobname = 'trafego-monitor');

select cron.schedule(
  'trafego-monitor',
  '0 11-23,0-1 * * *',
  $job$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/relatorio-diario-trafego',
    body := '{"tipo":"monitor"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-relatorio-secret', (select secret from public.webhook_config where chave = 'relatorio_trafego')
    )
  );
  $job$
);
