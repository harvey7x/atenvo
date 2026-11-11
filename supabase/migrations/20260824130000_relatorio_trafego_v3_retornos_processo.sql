-- Relatório de tráfego v3 (pedido do dono 2026-08-24, segunda rodada):
--
--  * RETORNO redefinido: lead ANTIGO que mandou mensagem DE NOVO *no chip da campanha*.
--    A verdade de "em qual chip a mensagem chegou" vive em whatsapp_webhook_events
--    (canal_id + provider_message_id ↔ mensagens.id_externo) — a conversa muda de canal
--    (v27) e a origem congelada não diz onde o lead falou HOJE. Retenção dos eventos =
--    14 dias (prune_logs), o que cobre diário (1d) e semanal (7d) com folga.
--  * COM PROCESSO: leads da campanha descartados por já terem processo judicial —
--    oportunidade com canal_origem na campanha movida pra coluna resultado='perdido'
--    ("Já tem processo" é a única perdida — ver memória funil-descarte-vs-perda),
--    contada pelo fechado_em.
--
-- Mesmas assinaturas (create or replace direto, sem drop).

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
  novos as (
    select coalesce(c.canal_origem_id, c.canal_id) as cid, count(*)::int as n
    from conversas c
    join contatos ct on ct.id = c.contato_id
    where c.organizacao_id = v_org
      and coalesce(c.canal_origem_id, c.canal_id) = any(p_canais)
      and c.criado_em >= v_ini and c.criado_em < v_fim
      and ct.criado_em >= v_ini and ct.criado_em < v_fim
    group by 1
  ),
  retornos as (  -- lead antigo que mandou mensagem DE NOVO no chip da campanha
    select e.canal_id as cid, count(distinct c2.contato_id)::int as n
    from whatsapp_webhook_events e
    join mensagens m on m.id_externo = e.provider_message_id and m.direcao = 'entrada'
    join conversas c2 on c2.id = m.conversa_id
    join contatos ct on ct.id = c2.contato_id
    where e.event = 'messages.upsert' and e.from_me = false
      and e.canal_id = any(p_canais)
      and e.recebido_em >= v_ini and e.recebido_em < v_fim
      and ct.criado_em < v_ini
    group by 1
  ),
  processos as (  -- descartados por já terem processo (única coluna resultado='perdido')
    select o.canal_origem_id as cid, count(*)::int as n
    from oportunidades o
    join funil_colunas fc on fc.id = o.coluna_id
    where o.organizacao_id = v_org
      and fc.resultado = 'perdido'
      and o.canal_origem_id = any(p_canais)
      and o.fechado_em >= v_ini and o.fechado_em < v_fim
    group by 1
  ),
  base7 as (
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
  horas as (
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
        'com_processo', coalesce(pz.n, 0),
        'media7_novos', b.media,
        'dias_ativos_7d', coalesce(b.dias_ativos, 0),
        'horas', (select jsonb_agg(jsonb_build_object('hora', h.hora, 'total', h.total) order by h.hora)
                  from horas h where h.cid = a.id)
      ) order by a.nome_interno)
      from alvo a
      left join novos n on n.cid = a.id
      left join retornos r on r.cid = a.id
      left join processos pz on pz.cid = a.id
      left join base7 b on b.cid = a.id), '[]'::jsonb),
    'totais', jsonb_build_object(
      'novos',        coalesce((select sum(n) from novos), 0),
      'retornos',     coalesce((select sum(n) from retornos), 0),
      'com_processo', coalesce((select sum(n) from processos), 0)
    )
  ) into v_out;

  return v_out;
end $$;

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
  por_dia as (
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
    select e.canal_id as cid, count(distinct c2.contato_id)::int as n
    from whatsapp_webhook_events e
    join mensagens m on m.id_externo = e.provider_message_id and m.direcao = 'entrada'
    join conversas c2 on c2.id = m.conversa_id
    join contatos ct on ct.id = c2.contato_id
    where e.event = 'messages.upsert' and e.from_me = false
      and e.canal_id = any(p_canais)
      and e.recebido_em >= v_ini and e.recebido_em < v_fim
      and ct.criado_em < v_ini
    group by 1
  ),
  processos as (
    select o.canal_origem_id as cid, count(*)::int as n
    from oportunidades o
    join funil_colunas fc on fc.id = o.coluna_id
    where o.organizacao_id = v_org
      and fc.resultado = 'perdido'
      and o.canal_origem_id = any(p_canais)
      and o.fechado_em >= v_ini and o.fechado_em < v_fim
    group by 1
  ),
  anterior as (
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
        'com_processo', coalesce(pz.n, 0),
        'anterior_novos', coalesce(x.n, 0),
        'por_dia', (select jsonb_agg(jsonb_build_object('dia', to_char(p.dia, 'YYYY-MM-DD'), 'novos', p.novos)
                    order by p.dia) from por_dia p where p.cid = a.id)
      ) order by a.nome_interno)
      from alvo a
      left join retornos r on r.cid = a.id
      left join processos pz on pz.cid = a.id
      left join anterior x on x.cid = a.id), '[]'::jsonb),
    'totais', jsonb_build_object(
      'novos',        coalesce((select sum(novos) from por_dia), 0),
      'retornos',     coalesce((select sum(n) from retornos), 0),
      'com_processo', coalesce((select sum(n) from processos), 0)
    )
  ) into v_out;

  return v_out;
end $$;
