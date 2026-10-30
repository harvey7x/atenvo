-- DASHBOARD: "TUDO QUE ENTROU AO TOTAL", DIA A DIA COMO O GERENCIADOR (pedido do dono, 30/10:
-- "ainda não está batendo com o gerenciador do Antônio no mensal… aqui no dashboard deixo tudo que
-- entrou ao total, em outra área a gente coloca os leads que entraram e já estavam no sistema").
--
-- O Gerenciador conta cada conversa iniciada pelo anúncio NO DIA (29/10: 58 pessoas com a marca do
-- Facebook = 58 do Gerenciador); no mês ele SOMA os dias — quem volta pelo anúncio em outro dia
-- conta de novo. O Dashboard contava cada cliente uma vez por período.
-- 1. public.dash_v5_anuncio — "já estavam" / "novo aqui" passam a ser POR DIA (horário de
--    Brasília): uma linha por (número, contato, dia). Janela de 1 dia = exatamente como antes (o
--    relatório diário em PDF não muda); em 7 dias / no mês, quem voltou pelo anúncio em outro dia
--    conta naquele dia também.
-- 2. public.dash_v5_dados — kpis/kpis_anterior.entradas = entradas novas (oportunidades) + já
--    estavam (por dia) = a soma da tabela por número; kpis.clientes guarda os clientes diferentes.
-- Base = definições vivas (20261030180000).

CREATE OR REPLACE FUNCTION public.dash_v5_anuncio(p_org uuid, p_ini timestamp with time zone, p_fim timestamp with time zone)
 RETURNS TABLE(canal_id uuid, contato_id uuid, primeira timestamp with time zone, novo_aqui boolean, ja_estava boolean, origem_canal_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with ad as (
    select coalesce(w.canal_id, cv.canal_id) as cid, cv.contato_id,
           (m.criado_em at time zone 'America/Sao_Paulo')::date as dia, min(m.criado_em) as primeira
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
     group by 1, 2, 3
  ),
  ent as (
    select distinct e.contato_id, e.canal_origem_id, (e.criado_em at time zone 'America/Sao_Paulo')::date as dia
      from public.dash_v5_entradas(p_org, p_ini, p_fim) e
     where e.contato_id is not null
  )
  select ad.cid, ad.contato_id, ad.primeira,
         exists (select 1 from ent where ent.contato_id = ad.contato_id and ent.canal_origem_id = ad.cid and ent.dia = ad.dia) as novo_aqui,
         (ct.criado_em < ad.primeira - interval '1 minute'
          and not public.dash_v5_interno(ct.telefone)
          and not exists (select 1 from ent where ent.contato_id = ad.contato_id and ent.canal_origem_id = ad.cid and ent.dia = ad.dia)) as ja_estava,
         ct.canal_origem_id
    from ad
    join public.contatos ct on ct.id = ad.contato_id
   where ad.cid is not null;
$function$;

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
  v_novas      integer;
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

  -- ---------------- KPIs: entradas = TUDO QUE ENTROU (dono, 30/10: "deixo tudo que entrou ao total") ----
  -- como o Gerenciador de Anúncios: cada cliente que chega por um número num dia é uma entrada (o
  -- cliente novo e quem já estava no sistema e voltou pela mensagem do anúncio; quem volta em outro
  -- dia conta de novo). = a soma da tabela por número. clientes = os clientes diferentes (régua antiga).
  v_kpis := public.dash_v5_kpis(p_org, p_inicio, p_fim);
  select count(*) into v_novas from public.dash_v5_entradas(p_org, p_inicio, p_fim);
  select count(*) into v_ret from jsonb_to_recordset(v_an) as x(ja_estava boolean) where x.ja_estava;
  v_kpis := v_kpis || jsonb_build_object('clientes', (v_kpis->>'entradas')::int, 'entradas_novas', v_novas,
                                         'retornos', v_ret, 'entradas', v_novas + v_ret);
  -- o anterior com a MESMA régua (a variação compara total com total)
  if p_ini_ant is not null and p_fim_ant is not null then
    v_kpis_ant := public.dash_v5_kpis(p_org, p_ini_ant, p_fim_ant);
    select count(*) into v_novas from public.dash_v5_entradas(p_org, p_ini_ant, p_fim_ant);
    select count(*) into v_ret from public.dash_v5_anuncio(p_org, p_ini_ant, p_fim_ant) a where a.ja_estava;
    v_kpis_ant := v_kpis_ant || jsonb_build_object('clientes', (v_kpis_ant->>'entradas')::int, 'entradas_novas', v_novas,
                                                   'retornos', v_ret, 'entradas', v_novas + v_ret);
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
