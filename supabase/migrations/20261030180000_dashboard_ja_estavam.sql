-- DASHBOARD: "JÁ ESTAVAM NO SISTEMA" (pedido do dono, 30/10: "tem que mostrar o total, mesmo que
-- essas pessoas já tenham entrado em contato conosco" — o Gerenciador de Anúncios conta).
--
-- 1. public.dash_v5_anuncio(p_org, p_ini, p_fim) — régua ÚNICA de "pelo anúncio / já estavam no
--    sistema", para o relatório diário em PDF e o Dashboard: uma linha por (número que recebeu,
--    contato) que mandou a mensagem do anúncio na janela, com novo_aqui / ja_estava / origem.
--    Helper interno, sem grant para anon/authenticated.
-- 2. public.dash_v5_dados — ENTRADAS passam a contar quem já estava no sistema:
--    kpis/kpis_anterior.entradas = clientes DIFERENTES (novos + quem já estava e não é entrada
--    nova de nenhum número), + entradas_novas e retornos; canais[].entradas = novos + já
--    estavam, + entradas_novas, retornos, retornos_origens [{nome, n}] e pelo_anuncio; o mapa
--    soma quem já estava na hora da 1ª mensagem do anúncio. Uma leitura por janela.
-- 3. public.dash_v5_trafego(canal) — o tráfego (campanha) de um número, com os números antigos de
--    cada campanha: o "por onde tinham entrado antes" do PDF e do Dashboard.
-- 4. public.avaliacao_diaria_dados — o "já estavam" passa a vir de dash_v5_anuncio e o tráfego de
--    antes de dash_v5_trafego (mesmos números e rótulos: conferido contra a função viva em 8
--    dias/cortes). Base = definição viva (20261030160000).

-- PELO ANÚNCIO / JÁ ESTAVAM NO SISTEMA — régua ÚNICA do relatório diário em PDF e do Dashboard
-- (dono, 30/10: o Gerenciador de Anúncios conta TODA pessoa que manda a mensagem do anúncio, também
-- quem já tinha falado com a CAF; o sistema tem de mostrar o mesmo total, com aviso).
-- Uma linha por (número que recebeu, contato) que mandou a MENSAGEM DO ANÚNCIO na janela:
--   primeira        = a 1ª mensagem do anúncio dele para esse número na janela
--   novo_aqui       = ele é entrada NOVA desse número na janela (dash_v5_entradas)
--   ja_estava       = já existia antes (contato criado mais de 1 min antes da mensagem — o contato
--                     criado pela própria mensagem não conta), não é o número interno e não é
--                     entrada nova desse número (entrada nova de OUTRO número no mesmo dia conta
--                     aqui também: cada Gerenciador conta a pessoa na sua campanha)
--   origem_canal_id = o número por onde ele tinha entrado (contatos.canal_origem_id)
-- Número que recebeu: o do evento do webhook (mensagens não guarda o canal); sem evento
-- (reinjetada IMPWEB-, que não passa pelo webhook, ou evento apagado pela retenção de 14 dias),
-- o número da conversa.
create or replace function public.dash_v5_anuncio(p_org uuid, p_ini timestamptz, p_fim timestamptz)
 returns table (canal_id uuid, contato_id uuid, primeira timestamptz, novo_aqui boolean, ja_estava boolean, origem_canal_id uuid)
 language sql
 stable
 set search_path to 'public'
as $function$
  with ad as (
    select coalesce(w.canal_id, cv.canal_id) as cid, cv.contato_id, min(m.criado_em) as primeira
      from public.mensagens m
      join public.conversas cv on cv.id = m.conversa_id
      left join lateral (
        select we.canal_id
          from public.whatsapp_webhook_events we
         where we.provider_message_id = m.id_externo and we.event = 'messages.upsert'
         order by we.recebido_em
         limit 1
      ) w on true
     where m.organizacao_id = p_org and m.direcao = 'entrada'
       and m.criado_em >= p_ini and m.criado_em < p_fim
       and public.anuncio_mensagem_e_anuncio(m.conteudo, m.metadados)
       and cv.contato_id is not null
     group by 1, 2
  ),
  ent as (
    select distinct e.contato_id, e.canal_origem_id
      from public.dash_v5_entradas(p_org, p_ini, p_fim) e
     where e.contato_id is not null
  )
  select ad.cid, ad.contato_id, ad.primeira,
         exists (select 1 from ent where ent.contato_id = ad.contato_id and ent.canal_origem_id = ad.cid) as novo_aqui,
         (ct.criado_em < ad.primeira - interval '1 minute'
          and not public.dash_v5_interno(ct.telefone)
          and not exists (select 1 from ent where ent.contato_id = ad.contato_id and ent.canal_origem_id = ad.cid)) as ja_estava,
         ct.canal_origem_id
    from ad
    join public.contatos ct on ct.id = ad.contato_id
   where ad.cid is not null;
$function$;

revoke all on function public.dash_v5_anuncio(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.dash_v5_anuncio(uuid, timestamptz, timestamptz) to service_role;

-- TRÁFEGO de um número: a campanha a que ele pertence, com os números ANTIGOS de cada campanha
-- (EMPRÉSTIMO de 17/08 e EMPRESTIMO (DIEGO) de 15/09 são do Diego; ANDRIUS de 29/06 é do juros);
-- o resto, "Outros números". Mesmos rótulos do relatório diário em PDF (v_camp de
-- avaliacao_diaria_dados): número novo de campanha entra AQUI e LÁ.
create or replace function public.dash_v5_trafego(p_canal uuid)
 returns text
 language sql
 immutable
 parallel safe
as $function$
  select case p_canal
           when 'e85ab4e4-931e-4da9-932b-30541f9e007b' then 'Empréstimo · Diego'
           when 'c3e8311c-d574-4283-9bbb-f4adcf050f02' then 'Empréstimo · Diego'
           when 'eaa0b251-1284-4fab-aebf-940bae893da9' then 'Empréstimo · Diego'
           when 'c839e143-4aaf-4be1-ac18-a863d0804da2' then 'Empréstimo · Antônio'
           when 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117' then 'Juros abusivos · Andrius'
           when 'ae43fc08-36ff-49d3-8272-e4280645223a' then 'Juros abusivos · Andrius'
           else 'Outros números'
         end;
$function$;

revoke all on function public.dash_v5_trafego(uuid) from public, anon, authenticated;
grant execute on function public.dash_v5_trafego(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.dash_v5_dados(p_org uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_ini_ant timestamp with time zone, p_fim_ant timestamp with time zone, p_mapa_ini timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_canais     jsonb;
  v_ne         jsonb;
  v_atendentes jsonb;
  v_mapa       jsonb;
  v_an         jsonb;   -- dash_v5_anuncio do período (pelo anúncio / já estavam no sistema)
  v_an_mapa    jsonb;   -- idem na janela do mapa (quando ela começa antes do período)
  v_kpis       jsonb;
  v_kpis_ant   jsonb;
  v_ret        integer;
begin
  -- JÁ ESTAVAM NO SISTEMA (dono, 30/10: "tem que mostrar o total, mesmo que essas pessoas já
  -- tenham entrado em contato conosco"): quem mandou a mensagem do anúncio para um número e já
  -- tinha falado com a CAF antes também é ENTRADA — como no Gerenciador de Anúncios e no relatório
  -- diário em PDF (a mesma régua: dash_v5_anuncio). Uma leitura por janela, guardada aqui.
  select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_an
    from public.dash_v5_anuncio(p_org, p_inicio, p_fim) a;

  -- ---------------- números conectados + "Números antigos" ----------------
  with con as (
    select ca.id, ca.nome_interno, ca.numero_conectado
      from public.canais ca
     where ca.organizacao_id = p_org
       and ca.ativo
       and ca.status_integracao = 'conectado'
       and ca.tipo = 'whatsapp'
       and coalesce(ca.papel, '') <> 'notificacao'
  ),
  ent as (
    select case when e.canal_origem_id in (select id from con) then e.canal_origem_id end as k,
           count(*) as n
      from public.dash_v5_entradas(p_org, p_inicio, p_fim) e
     group by 1
  ),
  -- já estavam no sistema por número (mesmo balde: conectado ou "Números antigos"), por qual
  -- TRÁFEGO tinham entrado antes (dash_v5_trafego: os rótulos do PDF) e quantos vieram pela
  -- mensagem do anúncio
  an as (
    select case when x.canal_id in (select id from con) then x.canal_id end as k, x.*
      from jsonb_to_recordset(v_an) as x(canal_id uuid, contato_id uuid, primeira timestamptz,
                                         novo_aqui boolean, ja_estava boolean, origem_canal_id uuid)
  ),
  ret as (
    select an.k,
           count(*) filter (where an.ja_estava)                  as retornos,
           count(*) filter (where an.ja_estava or an.novo_aqui) as pelo_anuncio
      from an group by an.k
  ),
  ret_o as (
    select z.k, jsonb_agg(jsonb_build_object('nome', z.nome, 'n', z.n) order by z.n desc, z.nome) as origens
      from (select an.k, public.dash_v5_trafego(an.origem_canal_id) as nome, count(*) as n
              from an
             where an.ja_estava
             group by 1, 2) z
     group by z.k
  ),
  fe as (
    select case when x.canal_origem_id in (select id from con) then x.canal_origem_id end as k,
           x.tipo, x.motivo, x.horas
      from public.dash_v5_fechamentos(p_org, p_inicio, p_fim) x
  ),
  fk as (
    select fe.k,
           count(*) filter (where fe.tipo = 'ne')    as ne,
           count(*) filter (where fe.tipo = 'ganho') as ganhos,
           percentile_cont(0.5) within group (order by fe.horas) as med,
           avg(fe.horas)   as media,
           count(fe.horas) as n
      from fe group by fe.k
  ),
  fm as (
    select z.k, jsonb_object_agg(z.motivo, z.q) as motivos
      from (select fe.k, fe.motivo, count(*) as q from fe where fe.tipo = 'ne' group by 1, 2) z
     group by z.k
  ),
  linhas as (
    select c.id as canal_id, c.nome_interno as nome, c.numero_conectado as numero, 'conectado'::text as situacao
      from con c
    union all
    select null::uuid, 'Números antigos', null::text, 'antigo'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'canal_id',       l.canal_id,
           'nome',           l.nome,
           'numero',         l.numero,
           'situacao',       l.situacao,
           'entradas',       coalesce(en.n, 0) + coalesce(rt.retornos, 0),
           'entradas_novas', coalesce(en.n, 0),
           'retornos',       coalesce(rt.retornos, 0),
           'retornos_origens', coalesce(ro.origens, '[]'::jsonb),
           'pelo_anuncio',   coalesce(rt.pelo_anuncio, 0),
           'ne',             coalesce(fk.ne, 0),
           'ne_motivos',     coalesce(fm.motivos, '{}'::jsonb),
           'ganhos',         coalesce(fk.ganhos, 0),
           'fech_mediana_h', round(fk.med::numeric, 3),
           'fech_media_h',   round(fk.media::numeric, 3),
           'fech_n',         coalesce(fk.n, 0))
         order by (l.situacao = 'antigo'), coalesce(en.n, 0) + coalesce(rt.retornos, 0) desc, coalesce(fk.ganhos, 0) desc, l.nome), '[]'::jsonb)
    into v_canais
    from linhas l
    left join ent en on en.k is not distinct from l.canal_id
    left join ret rt on rt.k is not distinct from l.canal_id
    left join ret_o ro on ro.k is not distinct from l.canal_id
    left join fk     on fk.k is not distinct from l.canal_id
    left join fm     on fm.k is not distinct from l.canal_id
   where l.situacao = 'conectado'
      or coalesce(en.n, 0) + coalesce(rt.retornos, 0) + coalesce(fk.ne, 0) + coalesce(fk.ganhos, 0) > 0;

  -- ---------------- não elegíveis: motivo e quem marcou ----------------
  with x as (
    select f.motivo, f.quem from public.dash_v5_fechamentos(p_org, p_inicio, p_fim) f where f.tipo = 'ne'
  )
  select jsonb_build_object(
           'total', (select count(*) from x),
           'motivos', coalesce((select jsonb_agg(jsonb_build_object('motivo', m.motivo, 'qtd', m.q) order by m.q desc, m.motivo)
                                  from (select x.motivo, count(*) as q from x group by 1) m), '[]'::jsonb),
           'quem', jsonb_build_object(
                     'ia',       (select count(*) from x where x.quem = 'ia'),
                     'regra_rs', (select count(*) from x where x.quem = 'regra_rs'),
                     'equipe',   (select count(*) from x where x.quem = 'equipe')))
    into v_ne;

  -- ---------------- atendentes ----------------
  with membros as (
    select u.id as uid, u.nome
      from public.organizacao_usuarios ou
      join public.usuarios u on u.id = ou.usuario_id
     where ou.organizacao_id = p_org and ou.status = 'ativo'
  ),
  -- recebidos: lead novo entregue pelo rodízio (1 por contato)
  rec as (
    select r.consultor_id as uid, count(distinct coalesce(r.contato_id, r.conversa_id)) as n
      from public.bot_roteamentos r
     where r.organizacao_id = p_org and r.criado_em >= p_inicio and r.criado_em < p_fim
     group by 1
  ),
  -- transferidos PARA ele (troca de dono com dono antes e depois)
  transf as (
    select (a.dados_depois->>'responsavel_id')::uuid as uid, count(distinct a.entidade_id) as n
      from public.audit_log a
     where a.organizacao_id = p_org and a.acao = 'sync_responsavel_cliente'
       and a.criado_em >= p_inicio and a.criado_em < p_fim
       and a.dados_antes->>'responsavel_id' is not null and a.dados_depois->>'responsavel_id' is not null
       and a.dados_antes->>'responsavel_id' <> a.dados_depois->>'responsavel_id'
     group by 1
  ),
  fe as (
    select * from public.dash_v5_fechamentos(p_org, p_inicio, p_fim)
  ),
  -- fechados e o tempo para fechar de cada um (relógio a partir da atribuição a ele NESTE
  -- lead: a 1ª a partir de criado_em − 5 min — o rodízio às vezes grava a atribuição
  -- segundos antes da oportunidade; a de um lead anterior do mesmo contato não conta)
  gan as (
    select g.credito_id as uid, count(*) as ganhos,
           percentile_cont(0.5) within group (order by g.h) as med,
           avg(g.h)   as media,
           count(g.h) as n
      from (
        select f.credito_id,
               case when f.horas is not null then
                 (extract(epoch from f.fechado_em - greatest(f.criado_em, coalesce(
                    (select min(a.criado_em) from public.audit_log a
                      where a.entidade = 'contatos' and a.entidade_id = f.contato_id
                        and a.acao = 'sync_responsavel_cliente'
                        and a.dados_depois->>'responsavel_id' = f.credito_id::text
                        and a.criado_em >= f.criado_em - interval '5 minutes'
                        and a.criado_em <= f.fechado_em), f.criado_em))) / 3600.0)::double precision
               end as h
          from fe f
         where f.tipo = 'ganho' and f.credito_id is not null
      ) g
     group by 1
  ),
  nem as (
    select f.fechado_por_id as uid, count(*) as n
      from fe f where f.tipo = 'ne' and f.fechado_por_id is not null
     group by 1
  ),
  -- TEMPO DE RESPOSTA (bloco auto_ag … rv do final_atendentes.sql, validado em 21/10)
  auto_ag as (
    select a.id::text as id
      from public.mensagens_agendadas a
     where a.organizacao_id = p_org
       and (a.metadados ? 'disparo_lote' or a.metadados ? 'recuperacao_id' or a.regua_ativacao_id is not null
            or a.metadados ? 'pendencia_id' or a.metadados->>'origem' = 'pendencia')
  ),
  m as (
    select mm.id, mm.conversa_id, mm.criado_em, mm.autor_id, mm.origem,
           case when mm.direcao = 'entrada' then 'in'
                when mm.origem in ('atenvo', 'telefone')
                 and (mm.metadados->>'agendamento_id' is null
                      or mm.metadados->>'agendamento_id' not in (select id from auto_ag)) then 'hum'
                else 'auto' end as k
      from public.mensagens mm
     where mm.organizacao_id = p_org
       -- a resposta pode vir depois do fim do período (a vez do cliente é que precisa estar
       -- dentro): período já fechado lê até 3 dias além; em andamento, até agora
       and mm.criado_em >= p_inicio - interval '1 day'
       and mm.criado_em < least(p_fim + interval '3 days', now())
       and mm.tipo not in ('sistema', 'nota_interna')
       and not (mm.direcao = 'saida' and mm.status = 'falhou')
  ),
  s as (
    select m.*, count(*) filter (where m.k <> 'in')
                  over (partition by m.conversa_id order by m.criado_em, m.id rows unbounded preceding) as c
      from m
  ),
  t as (select s.conversa_id, s.c, min(s.criado_em) as t0 from s where s.k = 'in' group by 1, 2),
  r as (select s.conversa_id, s.c - 1 as c, s.criado_em as t1, s.k, s.autor_id, s.origem from s where s.k <> 'in'),
  hum as (
    select coalesce(r.autor_id, case when r.origem = 'telefone' then ct.responsavel_id end) as uid, r.origem,
           (select coalesce(sum(extract(epoch from greatest(interval '0',
                      least(r.t1 at time zone 'America/Sao_Paulo', d + interval '19 hour')
                    - greatest(t.t0 at time zone 'America/Sao_Paulo', d + interval '9 hour')))) / 60, 0)
              from generate_series(date_trunc('day', t.t0 at time zone 'America/Sao_Paulo'),
                                   date_trunc('day', r.t1 at time zone 'America/Sao_Paulo'), interval '1 day') d
             where extract(isodow from d) <= 5) as min_util
      from t
      join r using (conversa_id, c)
      join public.conversas cv on cv.id = t.conversa_id
      left join public.contatos ct on ct.id = cv.contato_id
     where r.k = 'hum' and t.t0 >= p_inicio and t.t0 < p_fim
  ),
  rv as (
    select h.uid, count(*) as turnos, count(*) filter (where h.origem = 'telefone') as cel,
           percentile_cont(0.5) within group (order by h.min_util) as med,
           avg(h.min_util) as media
      from hum h where h.uid is not null
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'usuario_id',       mb.uid,
           'nome',             mb.nome,
           'recebidos',        coalesce(rec.n, 0),
           'transferidos',     coalesce(tr.n, 0),
           'ganhos',           coalesce(gan.ganhos, 0),
           'ne_marcados',      coalesce(nem.n, 0),
           'resp_n',           coalesce(rv.turnos, 0),
           'resp_celular_n',   coalesce(rv.cel, 0),
           'resp_mediana_min', round(rv.med::numeric, 1),
           'resp_media_min',   round(rv.media::numeric, 1),
           'fech_n',           coalesce(gan.n, 0),
           'fech_mediana_h',   round(gan.med::numeric, 3),
           'fech_media_h',     round(gan.media::numeric, 3))
         order by coalesce(rec.n, 0) desc, coalesce(gan.ganhos, 0) desc, mb.nome), '[]'::jsonb)
    into v_atendentes
    from membros mb
    left join rec          on rec.uid = mb.uid
    left join transf tr    on tr.uid  = mb.uid
    left join gan          on gan.uid = mb.uid
    left join nem          on nem.uid = mb.uid
    left join rv           on rv.uid  = mb.uid
   where coalesce(rec.n, 0) + coalesce(tr.n, 0) + coalesce(gan.ganhos, 0)
       + coalesce(nem.n, 0) + coalesce(rv.turnos, 0) > 0;

  -- ---------------- mapa dia × hora (só células com entrada) ----------------
  -- entradas novas + quem já estava no sistema (na hora da 1ª mensagem do anúncio), na janela do
  -- mapa (a do período, ou os últimos 7 dias quando o período é curto)
  if p_mapa_ini = p_inicio then
    v_an_mapa := v_an;
  else
    select coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) into v_an_mapa
      from public.dash_v5_anuncio(p_org, p_mapa_ini, p_fim) a;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('dia', z.dia, 'hora', z.hora, 'entradas', z.n)
                            order by z.dia, z.hora), '[]'::jsonb)
    into v_mapa
    from (select to_char(u.t at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
                 extract(hour from u.t at time zone 'America/Sao_Paulo')::int as hora,
                 count(*) as n
            from (select e.criado_em as t from public.dash_v5_entradas(p_org, p_mapa_ini, p_fim) e
                  union all
                  select x.primeira from jsonb_to_recordset(v_an_mapa) as x(primeira timestamptz, ja_estava boolean)
                   where x.ja_estava) u
           group by 1, 2) z;

  -- ---------------- KPIs: entradas = clientes DIFERENTES (novos + quem já estava no sistema) ----
  -- quem é entrada nova de qualquer número no período já está no total; o resto dos que já
  -- estavam soma por cima. entradas_novas guarda a régua antiga.
  v_kpis := public.dash_v5_kpis(p_org, p_inicio, p_fim);
  with ent as materialized (
    select distinct e.contato_id from public.dash_v5_entradas(p_org, p_inicio, p_fim) e where e.contato_id is not null
  )
  select count(distinct x.contato_id) into v_ret
    from jsonb_to_recordset(v_an) as x(contato_id uuid, ja_estava boolean)
   where x.ja_estava and not exists (select 1 from ent where ent.contato_id = x.contato_id);
  v_kpis := v_kpis || jsonb_build_object('entradas_novas', (v_kpis->>'entradas')::int, 'retornos', v_ret,
                                         'entradas', (v_kpis->>'entradas')::int + v_ret);
  -- o anterior com a MESMA régua (a variação compara total com total)
  if p_ini_ant is not null and p_fim_ant is not null then
    v_kpis_ant := public.dash_v5_kpis(p_org, p_ini_ant, p_fim_ant);
    with ent as materialized (
      select distinct e.contato_id from public.dash_v5_entradas(p_org, p_ini_ant, p_fim_ant) e where e.contato_id is not null
    )
    select count(distinct a.contato_id) into v_ret
      from public.dash_v5_anuncio(p_org, p_ini_ant, p_fim_ant) a
     where a.ja_estava and not exists (select 1 from ent where ent.contato_id = a.contato_id);
    v_kpis_ant := v_kpis_ant || jsonb_build_object('entradas_novas', (v_kpis_ant->>'entradas')::int, 'retornos', v_ret,
                                                   'entradas', (v_kpis_ant->>'entradas')::int + v_ret);
  end if;

  return jsonb_build_object(
    'gerado_em',     now(),
    'periodo',       jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'mapa_inicio', p_mapa_ini),
    'kpis',          v_kpis,
    'kpis_anterior', v_kpis_ant,
    'canais',        v_canais,
    'ne',            v_ne,
    'atendentes',    v_atendentes,
    'mapa',          v_mapa);
end;
$function$;

CREATE OR REPLACE FUNCTION public.avaliacao_diaria_dados(p_dia date DEFAULT NULL::date, p_org uuid DEFAULT 'de300000-0000-4000-8000-000000000001'::uuid, p_ate time without time zone DEFAULT NULL::time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  -- dia avaliado: padrão = ONTEM no fuso de Brasília
  v_dia      date := coalesce(p_dia, (now() at time zone 'America/Sao_Paulo')::date - 1);
  -- corte opcional (relatório do próprio dia às 22:00): janelas [D 00:00, D+corte) e
  -- [D-1 00:00, D-1+corte). null = dia inteiro (o comportamento de sempre).
  v_ate      time := p_ate;
  v_ini      timestamptz;
  v_fim      timestamptz;
  v_ini_ant  timestamptz;
  v_fim_ant  timestamptz;
  v_lim      timestamptz;
  -- campanhas: ordem fixa (Diego, Antônio, Juros) — sempre pelo canal de ORIGEM
  v_camp     constant jsonb := '[
    {"ordem":1,"chave":"diego",  "rotulo":"Empréstimo · Diego",      "canal_id":"e85ab4e4-931e-4da9-932b-30541f9e007b"},
    {"ordem":2,"chave":"antonio","rotulo":"Empréstimo · Antônio",    "canal_id":"c839e143-4aaf-4be1-ac18-a863d0804da2"},
    {"ordem":3,"chave":"juros",  "rotulo":"Juros abusivos · Andrius","canal_id":"fc80ec9e-9f8f-4dca-a3f0-e1101d73e117"}
  ]'::jsonb;
  w_rot      text;
  w_ini      timestamptz;
  w_fim      timestamptz;
  v_ent      jsonb;
  v_ne       jsonb;
  v_robo     jsonb;
  v_robo_j   jsonb;                  -- dash_v5_robo da janela: {total, canais}
  v_fech     integer;
  v_quem     jsonb;                  -- quem marcou os não elegíveis da janela (robô + pessoas)
  v_jan      jsonb := '{}'::jsonb;   -- {'d': {...}, 'ant': {...}}
  v_sem      jsonb;                  -- {canal_id: dias seguidos sem entrada até D}
  v_campanhas jsonb;
  v_equipe   jsonb;
  v_totais   jsonb;
  v_melhor   text;
  v_lacuna   jsonb;
begin
  -- '24:00' = dia inteiro; '00:00' (janela vazia) e segundos não são corte válido
  if v_ate = time '24:00' then
    v_ate := null;
  end if;
  if v_ate is not null and (v_ate = time '00:00' or extract(second from v_ate) <> 0) then
    raise exception 'p_ate inválido (%): use HH:MM entre 00:01 e 24:00', p_ate;
  end if;

  v_ini     := v_dia::timestamp at time zone 'America/Sao_Paulo';
  v_ini_ant := (v_dia - 1)::timestamp at time zone 'America/Sao_Paulo';
  if v_ate is null then
    v_fim     := (v_dia + 1)::timestamp at time zone 'America/Sao_Paulo';
    v_fim_ant := v_ini;
  else
    v_fim     := (v_dia + v_ate) at time zone 'America/Sao_Paulo';
    v_fim_ant := ((v_dia - 1) + v_ate) at time zone 'America/Sao_Paulo';
  end if;

  -- ------------------------------------------------------------------ por janela (D e D-1)
  -- com corte, as duas janelas param no MESMO horário (comparação justa: 00:00–22:00 × 00:00–22:00)
  for w_rot, w_ini, w_fim in
    select j.r, j.i, j.f from (values ('d', v_ini, v_fim), ('ant', v_ini_ant, v_fim_ant)) j(r, i, f)
  loop
    -- ENTRADAS + aproveitáveis + reinjetadas (IMPWEB ou importação manual) por campanha
    with camp as (
      select * from jsonb_to_recordset(v_camp) as c(ordem int, chave text, rotulo text, canal_id uuid)
    ),
    ent as (
      select e.canal_origem_id as cid,
             coalesce(e.contato_id, e.oportunidade_id) as k,
             e.contato_id,
             -- virou NE até o fim da janela — fim do dia ou o corte (todas as oportunidades do dia daquele contato)
             bool_and(coalesce(o.status = 'perdido'
                               and coalesce(o.motivo_perda, '') = 'nao_elegivel'
                               and o.fechado_em < w_fim, false)) as virou_ne
        from public.dash_v5_entradas(p_org, w_ini, w_fim) e
        join public.oportunidades o on o.id = e.oportunidade_id
       where e.canal_origem_id in (select canal_id from camp)
       group by 1, 2, 3
    ),
    ent_r as (
      select ent.*,
             -- ATRASADA = (a) a 1ª mensagem de entrada do contato GRAVADA NO DIA veio da reinjeção
             -- (IMPWEB-: mensagem atrasada importada) OU (b) o lead foi IMPORTADO À MÃO do WhatsApp
             -- de um número que estava fora do ar: nota interna '📥 Lead importado…' gravada na
             -- janela em qualquer conversa do contato (importação manual não grava a mensagem do
             -- cliente, só a nota). Janela do dia: um contato do replay/importação que volte outro
             -- dia (ex.: pelo anúncio) não conta de novo como atrasado.
             coalesce((select m.id_externo like 'IMPWEB-%'
                         from public.conversas cv
                         join public.mensagens m on m.conversa_id = cv.id
                        where cv.contato_id = ent.contato_id
                          and m.direcao = 'entrada'
                          and m.criado_em >= w_ini and m.criado_em < w_fim
                        order by m.criado_em, m.id
                        limit 1), false)
             or exists (select 1
                          from public.conversas cv
                          join public.mensagens m on m.conversa_id = cv.id
                         where cv.contato_id = ent.contato_id
                           and m.tipo = 'nota_interna'
                           and m.direcao = 'saida'
                           and m.conteudo like '📥 Lead importado%'
                           and m.criado_em >= w_ini and m.criado_em < w_fim) as reinjetada
        from ent
    ),
    -- JÁ ESTAVAM NO SISTEMA (dono, 30/10): o Gerenciador de Anúncios conta TODA pessoa que manda a
    -- mensagem do anúncio, inclusive quem já tinha entrado antes por outro tráfego (ou pela própria
    -- campanha, outro dia). Essas pessoas agora também são ENTRADAS, com aviso e com o tráfego por
    -- onde tinham entrado. AD = quem mandou a mensagem do anúncio para o número da campanha na
    -- janela (como se acha o número que recebeu: ver dash_v5_anuncio).
    -- a régua ÚNICA de "pelo anúncio / já estavam no sistema" (dash_v5_anuncio, a mesma do
    -- Dashboard — 30/10), só nos números das campanhas
    an as (
      select a.* from public.dash_v5_anuncio(p_org, w_ini, w_fim) a
       where a.canal_id in (select canal_id from camp)
    ),
    ad as (
      select an.canal_id as cid, an.contato_id, an.primeira from an
    ),
    -- RETORNO = mandou a mensagem do anúncio e o contato já existia antes dela (1 min de folga: o
    -- contato criado pela própria mensagem não conta). Quem é entrada nova DESTA campanha na janela
    -- conta lá; entrada nova de OUTRA campanha no mesmo dia conta aqui também (cada Gerenciador
    -- conta a pessoa na sua campanha). Número interno fica fora, como nas entradas.
    ret as (
      select an.canal_id as cid, an.contato_id, an.origem_canal_id as origem from an where an.ja_estava
    ),
    -- por onde tinha entrado antes: o TRÁFEGO (dash_v5_trafego — números antigos contam como a
    -- campanha deles; o resto, "Outros números"), o mesmo rótulo do Dashboard
    ret_o as (
      select r.cid, public.dash_v5_trafego(r.origem) as rotulo, count(*) as n
        from ret r
       group by 1, 2
    )
    -- entradas = clientes novos (entradas_novas, a régua de sempre) + retornos.
    -- pelo_anuncio = novos que mandaram a mensagem do anúncio + retornos (= o que o Gerenciador
    -- conta); diretas = novos sem a mensagem do anúncio, fora os do número fora do ar (reinjetadas,
    -- já avisadas à parte).
    select jsonb_object_agg(x.cid, x.o) into v_ent
      from (
        select c.canal_id::text as cid,
               jsonb_build_object(
                 'entradas',      count(r.k) + (select count(*) from ret where ret.cid = c.canal_id),
                 'entradas_novas', count(r.k),
                 'aproveitaveis', count(r.k) filter (where not r.virou_ne),
                 'aproveitaveis_novas', count(r.k) filter (where not r.virou_ne and not r.reinjetada),
                 'reinjetadas',   count(r.k) filter (where r.reinjetada),
                 'retornos',      (select count(*) from ret where ret.cid = c.canal_id),
                 'retornos_origens', coalesce((select jsonb_agg(jsonb_build_object('rotulo', o.rotulo, 'n', o.n) order by o.n desc, o.rotulo)
                                                 from ret_o o where o.cid = c.canal_id), '[]'::jsonb),
                 'pelo_anuncio',  count(r.k) filter (where exists (select 1 from ad where ad.cid = c.canal_id and ad.contato_id = r.contato_id))
                                  + (select count(*) from ret where ret.cid = c.canal_id),
                 'diretas',       count(r.k) filter (where not r.reinjetada
                                                       and not exists (select 1 from ad where ad.cid = c.canal_id and ad.contato_id = r.contato_id))) as o
          from camp c
          left join ent_r r on r.cid = c.canal_id
         group by c.canal_id
      ) x;

    -- NÃO ELEGÍVEIS por campanha (régua do Dashboard v5) + fechados (ganhos) da org
    with camp as (
      select * from jsonb_to_recordset(v_camp) as c(ordem int, chave text, rotulo text, canal_id uuid)
    ),
    fe as (
      select f.* from public.dash_v5_fechamentos(p_org, w_ini, w_fim) f
    ),
    ne as (
      select fe.canal_origem_id as cid, fe.motivo, fe.quem, fe.fechado_por_id,
             -- robô = a MESMA régua do ne_robo abaixo (IA ou regra do RS); todo o resto é pessoa
             coalesce(fe.quem in ('ia', 'regra_rs'), false) as robo
        from fe
       where fe.tipo = 'ne' and fe.canal_origem_id in (select canal_id from camp)
    ),
    pes as (        -- quem marcou, fora o robô: por fechado_por_id (nulo = sem registro)
      select ne.fechado_por_id as uid, count(*)::int as n
        from ne
       where not ne.robo
       group by 1
    ),
    quem as (       -- robô SEMPRE primeiro (mesmo com 0); soma de n = total de não elegíveis
      select 0 as ordem, 'robo' as tipo, null::uuid as uid, 'Robô' as nome,
             (select count(*) from ne where ne.robo)::int as n
      union all
      select 1, 'pessoa', p.uid,
             case when p.uid is null then 'Sem registro'
                  else coalesce(nullif(btrim(u.nome), ''), 'Sem nome') end,
             p.n
        from pes p
        left join public.usuarios u on u.id = p.uid
    ),
    mot as (
      select ne.cid, ne.motivo,
             case ne.motivo
               when 'sem_beneficio_inss'   then 'não recebe benefício do INSS'
               when 'sem_emprestimo_banco' then 'sem empréstimo nas 5 financeiras'
               when 'nao_mora_rs'          then 'fora do RS'
               when 'sem_interesse'        then 'sem interesse'
               when 'muitos_processos'     then 'já tem muitos processos'
               when 'sem_categoria'        then 'sem motivo informado'
               else replace(ne.motivo, '_', ' ') end as rotulo,
             count(*) as n,
             count(*) filter (where ne.quem in ('ia', 'regra_rs')) as n_robo
        from ne
       group by 1, 2
    )
    select jsonb_object_agg(x.cid, x.o),
           (select count(*) from fe where fe.tipo = 'ganho'),
           (select jsonb_agg(jsonb_build_object('tipo', q.tipo, 'usuario_id', q.uid, 'nome', q.nome, 'n', q.n)
                             order by q.ordem, q.n desc, q.nome, q.uid)
              from quem q)
      into v_ne, v_fech, v_quem
      from (
        select c.canal_id::text as cid,
               jsonb_build_object(
                 'ne',        (select count(*) from ne where ne.cid = c.canal_id),
                 'ne_robo',   (select count(*) from ne where ne.cid = c.canal_id and ne.quem in ('ia', 'regra_rs')),
                 'ne_equipe', (select count(*) from ne where ne.cid = c.canal_id and ne.quem = 'equipe'),
                 -- motivo principal = 1º da lista: mais casos → mais casos do robô → rótulo
                 'ne_motivos', coalesce((
                    select jsonb_agg(jsonb_build_object('motivo', m.motivo, 'rotulo', m.rotulo,
                                                        'n', m.n, 'robo', m.n_robo)
                                     order by m.n desc, m.n_robo desc, m.rotulo)
                      from mot m where m.cid = c.canal_id), '[]'::jsonb)) as o
          from camp c
      ) x;

    -- ROBÔ por campanha: a régua ÚNICA do robô (dash_v5_robo, a mesma do Dashboard — 30/10), só com
    -- os números das campanhas (todas presentes, zeradas quando ninguém começou o fluxo). Traz também
    -- as ENTREGAS (o robô passou o cliente a um atendente), as entregues que seguem elegíveis e o
    -- tempo até entregar; o total da janela vem à parte porque mediana não se soma.
    v_robo_j := public.dash_v5_robo(p_org, w_ini, w_fim,
                  array(select (x->>'canal_id')::uuid from jsonb_array_elements(v_camp) x));
    v_robo   := v_robo_j -> 'canais';

    v_jan := v_jan || jsonb_build_object(w_rot, jsonb_build_object(
               'ent', v_ent, 'ne', v_ne, 'robo', v_robo, 'robo_total', v_robo_j -> 'total',
               'fechados', v_fech, 'quem', v_quem));
  end loop;

  -- ------------------------------------------------------------------ dias seguidos sem entrada
  -- Mesma régua de ENTRADAS (dash_v5_entradas pelo canal de origem; ela é 1 linha por
  -- oportunidade criada na janela, então 1 chamada de 30 dias = 30 chamadas de 1 dia). Última
  -- entrada nos 30 dias que terminam em D (inclusive): D − última = dias sem entrada (0 = D teve
  -- entrada); nenhuma nos 30 dias = 30 (teto).
  with camp as (
    select * from jsonb_to_recordset(v_camp) as c(ordem int, chave text, rotulo text, canal_id uuid)
  ),
  ult as (
    select e.canal_origem_id as cid,
           max((e.criado_em at time zone 'America/Sao_Paulo')::date) as ultima
      from public.dash_v5_entradas(p_org, (v_dia - 29)::timestamp at time zone 'America/Sao_Paulo', v_fim) e
     where e.canal_origem_id in (select canal_id from camp)
     group by 1
  )
  select jsonb_object_agg(c.canal_id::text,
           case when u.ultima is null then 30 else least(30, greatest(0, v_dia - u.ultima)) end)
    into v_sem
    from camp c
    left join ult u on u.cid = c.canal_id;

  -- ------------------------------------------------------------------ campanhas
  select jsonb_agg(jsonb_build_object(
           'chave',            c.chave,
           'rotulo',           c.rotulo,
           'canal_id',         c.canal_id,
           -- estado do número AGORA (canais.status_integracao): só vale para o relatório cuja janela
           -- termina no presente (dia corrente / relatório das 22h gerado na hora). Dia passado →
           -- null nos dois campos (não se sabe como o número estava naquele dia).
           'conectado',        case when v_fim > now() - interval '1 hour'
                                    then coalesce(ca.ativo and ca.status_integracao = 'conectado', false) end,
           'status_integracao', case when v_fim > now() - interval '1 hour' then ca.status_integracao end,
           'entradas',         (v_jan #>  array['d',   'ent', c.canal_id::text, 'entradas'])::int,
           'entradas_ant',     (v_jan #>  array['ant', 'ent', c.canal_id::text, 'entradas'])::int,
           'entradas_novas',   (v_jan #>  array['d',   'ent', c.canal_id::text, 'entradas_novas'])::int,
           'retornos',         (v_jan #>  array['d',   'ent', c.canal_id::text, 'retornos'])::int,
           'retornos_origens', coalesce(v_jan #> array['d', 'ent', c.canal_id::text, 'retornos_origens'], '[]'::jsonb),
           'pelo_anuncio',     (v_jan #>  array['d',   'ent', c.canal_id::text, 'pelo_anuncio'])::int,
           'diretas',          (v_jan #>  array['d',   'ent', c.canal_id::text, 'diretas'])::int,
           'dias_sem_entrada', coalesce((v_sem ->> c.canal_id::text)::int, 0),
           'reinjetadas',      (v_jan #>  array['d',   'ent', c.canal_id::text, 'reinjetadas'])::int,
           'aproveitaveis',    (v_jan #>  array['d',   'ent', c.canal_id::text, 'aproveitaveis'])::int,
           'aproveitaveis_novas', (v_jan #> array['d',  'ent', c.canal_id::text, 'aproveitaveis_novas'])::int,
           'ne',               (v_jan #>  array['d',   'ne',  c.canal_id::text, 'ne'])::int,
           'ne_ant',           (v_jan #>  array['ant', 'ne',  c.canal_id::text, 'ne'])::int,
           'ne_robo',          (v_jan #>  array['d',   'ne',  c.canal_id::text, 'ne_robo'])::int,
           'ne_equipe',        (v_jan #>  array['d',   'ne',  c.canal_id::text, 'ne_equipe'])::int,
           'ne_motivos',       v_jan #> array['d', 'ne', c.canal_id::text, 'ne_motivos'],
           'motivo_principal', case when jsonb_array_length(v_jan #> array['d', 'ne', c.canal_id::text, 'ne_motivos']) > 0
                                    then jsonb_build_object(
                                           'motivo', v_jan #>> array['d', 'ne', c.canal_id::text, 'ne_motivos', '0', 'motivo'],
                                           'rotulo', v_jan #>> array['d', 'ne', c.canal_id::text, 'ne_motivos', '0', 'rotulo'],
                                           'n',     (v_jan #>  array['d', 'ne', c.canal_id::text, 'ne_motivos', '0', 'n'])::int)
                               end,
           'robo',             v_jan #> array['d', 'robo', c.canal_id::text],
           'robo_ant',         jsonb_build_object(
                                 'entraram',   (v_jan #> array['ant', 'robo', c.canal_id::text, 'entraram'])::int,
                                 'terminaram', (v_jan #> array['ant', 'robo', c.canal_id::text, 'terminaram'])::int)
         ) order by c.ordem)
    into v_campanhas
    from jsonb_to_recordset(v_camp) as c(ordem int, chave text, rotulo text, canal_id uuid)
    left join public.canais ca on ca.id = c.canal_id;

  -- ------------------------------------------------------------------ melhor tráfego
  -- mais APROVEITÁVEIS sem contar as reinjetadas (backlog de número caído não elege o melhor
  -- tráfego); empate → mais entradas NOVAS (quem já estava no sistema não elege o melhor tráfego);
  -- persiste → ordem fixa. Sem aproveitável novo → null.
  select x.o->>'chave' into v_melhor
    from jsonb_array_elements(v_campanhas) with ordinality as x(o, i)
   where (x.o->>'aproveitaveis_novas')::int > 0
   order by (x.o->>'aproveitaveis_novas')::int desc, (x.o->>'entradas_novas')::int desc, x.i
   limit 1;

  -- ------------------------------------------------------------------ equipe (dia D, todas as origens)
  with membros as (
    select u.id as uid, u.nome
      from public.organizacao_usuarios ou
      join public.usuarios u on u.id = ou.usuario_id
     where ou.organizacao_id = p_org and ou.status = 'ativo'
  ),
  rec as (
    select r.consultor_id as uid, count(distinct coalesce(r.contato_id, r.conversa_id)) as n
      from public.bot_roteamentos r
     where r.organizacao_id = p_org and r.criado_em >= v_ini and r.criado_em < v_fim
     group by 1
  ),
  fe as (
    select f.* from public.dash_v5_fechamentos(p_org, v_ini, v_fim) f
  ),
  gan as (
    select fe.credito_id as uid, count(*) as n from fe
     where fe.tipo = 'ganho' and fe.credito_id is not null group by 1
  ),
  nem as (
    select fe.fechado_por_id as uid, count(*) as n from fe
     where fe.tipo = 'ne' and fe.fechado_por_id is not null group by 1
  ),
  neq as (          -- não elegíveis das 3 campanhas marcados pela pessoa: a MESMA lista de nao_elegiveis_quem
    select (q->>'usuario_id')::uuid as uid, (q->>'n')::int as n
      from jsonb_array_elements(coalesce(v_jan #> '{d,quem}', '[]'::jsonb)) q
     where q->>'tipo' = 'pessoa' and q->>'usuario_id' is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'usuario_id',   m.uid,
           'nome',         m.nome,
           'distribuidos', coalesce(rec.n, 0),
           'fechados',     coalesce(gan.n, 0),
           'ne_marcados',  coalesce(nem.n, 0),
           'ne_campanhas', coalesce(neq.n, 0))
         order by coalesce(rec.n, 0) desc, coalesce(gan.n, 0) desc, coalesce(nem.n, 0) desc, m.nome), '[]'::jsonb)
    into v_equipe
    from membros m
    left join rec on rec.uid = m.uid
    left join gan on gan.uid = m.uid
    left join nem on nem.uid = m.uid
    left join neq on neq.uid = m.uid;

  -- ------------------------------------------------------------------ totais (soma das 3 campanhas)
  select jsonb_build_object(
           'entradas',            coalesce(sum((x->>'entradas')::int), 0),
           'entradas_ant',        coalesce(sum((x->>'entradas_ant')::int), 0),
           'entradas_novas',      coalesce(sum((x->>'entradas_novas')::int), 0),
           'retornos',            coalesce(sum((x->>'retornos')::int), 0),
           'pelo_anuncio',        coalesce(sum((x->>'pelo_anuncio')::int), 0),
           'diretas',             coalesce(sum((x->>'diretas')::int), 0),
           'ne',                  coalesce(sum((x->>'ne')::int), 0),
           'ne_ant',              coalesce(sum((x->>'ne_ant')::int), 0),
           'aproveitaveis',       coalesce(sum((x->>'aproveitaveis')::int), 0),
           'reinjetadas',         coalesce(sum((x->>'reinjetadas')::int), 0),
           'robo_entraram',       coalesce(sum((x#>>'{robo,entraram}')::int), 0),
           'robo_terminaram',     coalesce(sum((x#>>'{robo,terminaram}')::int), 0),
           'robo_entraram_ant',   coalesce(sum((x#>>'{robo_ant,entraram}')::int), 0),
           'robo_terminaram_ant', coalesce(sum((x#>>'{robo_ant,terminaram}')::int), 0),
           -- entregas do robô no dia (30/10): soma das campanhas; o tempo é o da janela inteira
           'robo_entregues',           coalesce(sum((x#>>'{robo,entregues}')::int), 0),
           'robo_entregues_elegiveis', coalesce(sum((x#>>'{robo,entregues_elegiveis}')::int), 0),
           'robo_entrega_mediana_s',   (v_jan #>> '{d,robo_total,entrega_mediana_s}')::int,
           'robo_entrega_p90_s',       (v_jan #>> '{d,robo_total,entrega_p90_s}')::int,
           -- fechados = todos os ganhos do dia na org (= KPI do Dashboard), não só das 3 campanhas
           'fechados',            (v_jan #> '{d,fechados}')::int,
           'fechados_ant',        (v_jan #> '{ant,fechados}')::int)
    into v_totais
    from jsonb_array_elements(v_campanhas) x;

  -- ------------------------------------------------------------------ lacuna de registro
  -- entre os buracos sem NENHUMA mensagem de entrada na org (bordas 00:00 e 24:00 BRT — ou o
  -- corte p_ate —, ou "agora" se a janela ainda não acabou), o de MAIOR sobreposição com o
  -- expediente 08:00–20:00;
  -- só sai se essa sobreposição for >= 2h (madrugada/noite inteira sem mensagem é normal).
  v_lim := least(v_fim, now());
  if v_lim > v_ini then
    with pts as (
      select v_ini as t
      union all
      select m.criado_em
        from public.mensagens m
       where m.organizacao_id = p_org and m.direcao = 'entrada'
         and m.criado_em >= v_ini and m.criado_em < v_lim
      union all
      select v_lim
    ),
    gaps as (
      select lag(pts.t) over (order by pts.t) as de, pts.t as ate from pts
    ),
    sob as (
      select g.de, g.ate,
             greatest(least(g.ate, (v_dia + time '20:00') at time zone 'America/Sao_Paulo')
                      - greatest(g.de, (v_dia + time '08:00') at time zone 'America/Sao_Paulo'),
                      interval '0') as exp
        from gaps g
       where g.de is not null
    )
    select jsonb_build_object(
             'de',               to_char(s.de at time zone 'America/Sao_Paulo', 'HH24:MI'),
             -- até a borda da janela: '24:00' no dia inteiro; com corte, o horário do corte ('22:00')
             'ate',              case when s.ate = v_fim then coalesce(to_char(v_ate, 'HH24:MI'), '24:00')
                                      else to_char(s.ate at time zone 'America/Sao_Paulo', 'HH24:MI') end,
             'horas',            round((extract(epoch from s.ate - s.de) / 3600.0)::numeric, 1),
             'horas_expediente', round((extract(epoch from s.exp) / 3600.0)::numeric, 1))
      into v_lacuna
      from sob s
     where s.exp >= interval '2 hours'
       and (v_lim = v_fim or s.ate < v_lim)  -- prévia do dia corrente: "até agora" não é lacuna
     order by s.exp desc, s.ate - s.de desc, s.de
     limit 1;
  end if;

  return jsonb_build_object(
    'dia',            to_char(v_dia, 'YYYY-MM-DD'),
    'dia_anterior',   to_char(v_dia - 1, 'YYYY-MM-DD'),
    'ate',            to_char(v_ate, 'HH24:MI'),
    'campanhas',      v_campanhas,
    'equipe',         v_equipe,
    'totais',         v_totais,
    'melhor_trafego', v_melhor,
    'lacuna',         v_lacuna,
    -- quem marcou os não elegíveis do dia (só a janela do relatório): robô + pessoas, soma = totais.ne
    'nao_elegiveis_quem', coalesce(v_jan #> '{d,quem}', '[]'::jsonb),
    'gerado_em',      now());
end;
$function$;
