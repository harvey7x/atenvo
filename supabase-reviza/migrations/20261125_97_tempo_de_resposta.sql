-- 97 · TEMPO DE RESPOSTA DA EQUIPE com meta (dono 25/11, a partir do sistema que a Reviza usava antes: "SLA do atendimento
-- humano", "desempenho por operador, do mais lento ao mais rápido"). Só leitura: uma rotina para o Dashboard (administrador).
--
-- A régua (a mesma do Atenvo: humano é saída com origem diferente de 'bot'):
--   · uma ESPERA começa na mensagem do cliente que chega depois de uma resposta nossa (ou na primeira da conversa) e termina
--     na PRÓXIMA mensagem nossa. Mensagens seguidas do cliente são uma espera só (conta da primeira).
--   · terminou numa resposta de PESSOA (painel ou celular) → entra na conta. Terminou numa resposta da IA → a IA atendeu,
--     não entra (a IA não é a equipe). Mensagem que falhou no envio não é resposta.
--   · a resposta vai para quem escreveu; a do celular (sem autor no sistema) vai para o responsável pela conversa.
--   · horário comercial (padrão): só contam os minutos de segunda a sexta, das 8h às 18h (Brasília). Tempo corrido: tudo.
--   · AGUARDANDO = conversa aberta cuja última mensagem é do cliente, sem resposta de ninguém (nem da IA), há até 30 dias.
--   · NOTA INTERNA da equipe e aviso do SISTEMA (tipo 'nota_interna'/'sistema') não são resposta nem mensagem do cliente:
--     ficam fora de tudo (25/11, junto da migration 99 — sem isto uma nota com @ contava como resposta de pessoa).
-- Nada aqui muda dados.

create or replace function public.atd_minutos_uteis(p_de timestamptz, p_ate timestamptz, p_h_ini integer default 8, p_h_fim integer default 18)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select case when p_de is null or p_ate is null or p_ate <= p_de then 0::numeric else coalesce((
    select sum(greatest(0, extract(epoch from (
             least(p_ate, (x.d + make_time(p_h_fim, 0, 0)) at time zone 'America/Sao_Paulo')
           - greatest(p_de, (x.d + make_time(p_h_ini, 0, 0)) at time zone 'America/Sao_Paulo')))))
      from generate_series((p_de at time zone 'America/Sao_Paulo')::date, (p_ate at time zone 'America/Sao_Paulo')::date, interval '1 day') g(dd)
      cross join lateral (select g.dd::date as d) x
     where extract(isodow from x.d) between 1 and 5
  ), 0) / 60.0 end;
$$;
grant execute on function public.atd_minutos_uteis(timestamptz, timestamptz, integer, integer) to authenticated, service_role;

create or replace function public.dash_tempo_resposta(
  p_ini date, p_fim date, p_meta_min integer default 30, p_modo text default 'uteis',
  p_prev_ini date default null, p_serie_ini date default null, p_org uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := p_org;
  v_meta  numeric := greatest(1, least(coalesce(p_meta_min, 30), 24 * 60));
  v_uteis boolean := coalesce(p_modo, 'uteis') <> 'corrido';
  v_serie date := least(coalesce(p_serie_ini, p_ini), p_ini);
  v_desde date;
  v_res   jsonb;
begin
  if p_ini is null or p_fim is null or p_fim <= p_ini then raise exception 'periodo_invalido'; end if;
  v_desde := least(v_serie, coalesce(p_prev_ini, p_ini));
  if p_fim - v_desde > 100 then raise exception 'periodo_longo'; end if;
  if v_org is null then
    select ou.organizacao_id into v_org from public.organizacao_usuarios ou where ou.usuario_id = auth.uid() and ou.status = 'ativo' limit 1;
  end if;
  if v_org is null then raise exception 'org_indefinida'; end if;
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;

  with
  msgs as (  -- do começo da série (com 3 dias antes, para achar o início das esperas) até o fim
    select m.conversa_id, m.direcao, m.origem, m.autor_id,
           case when m.direcao = 'entrada' then coalesce(m.recebida_em, m.criado_em) else coalesce(m.enviada_em, m.criado_em) end as ts
      from public.mensagens m
     where m.organizacao_id = v_org
       and m.criado_em >= ((v_desde - 3)::timestamp at time zone 'America/Sao_Paulo')
       and m.criado_em <  ((p_fim + 3)::timestamp at time zone 'America/Sao_Paulo')
       and not (m.direcao = 'saida' and m.status::text = 'falhou')
       and m.tipo::text not in ('sistema', 'nota_interna')  -- nota da equipe e aviso do sistema não chegam ao cliente
  ),
  marcadas as (  -- grp = quantas mensagens NOSSAS já houve até aqui: a resposta de uma espera é a saída de grp + 1
    select q.*, lag(q.direcao) over w as dir_antes,
           sum(case when q.direcao = 'saida' then 1 else 0 end) over (w rows between unbounded preceding and current row) as grp
      from msgs q
    window w as (partition by q.conversa_id order by q.ts, q.direcao)
  ),
  -- cada espera: a 1ª mensagem do cliente depois de uma nossa; a resposta é a próxima mensagem NOSSA
  esperas as (
    select i.conversa_id, i.ts as inicio, s.ts as resposta, s.origem, s.autor_id
      from marcadas i
      join marcadas s on s.conversa_id = i.conversa_id and s.direcao = 'saida' and s.grp = i.grp + 1
     where i.direcao = 'entrada' and (i.dir_antes is null or i.dir_antes = 'saida')
       and i.ts >= (v_desde::timestamp at time zone 'America/Sao_Paulo')
       and i.ts <  (p_fim::timestamp at time zone 'America/Sao_Paulo')
  ),
  humanas as (  -- só as que uma PESSOA respondeu
    select e.*, (e.inicio at time zone 'America/Sao_Paulo')::date as dia,
           extract(hour from e.inicio at time zone 'America/Sao_Paulo')::int as hora,
           coalesce(e.autor_id, cv.atendente_id) as quem,
           case when v_uteis then public.atd_minutos_uteis(e.inicio, e.resposta) else extract(epoch from (e.resposta - e.inicio)) / 60.0 end as minutos
      from esperas e
      left join public.conversas cv on cv.id = e.conversa_id
     where e.origem is distinct from 'bot'
  ),
  resumo as (
    select jsonb_build_object(
      'respondidos', count(*),
      'dentro_meta', count(*) filter (where minutos <= v_meta),
      'mediana_min', round((percentile_cont(0.5) within group (order by minutos))::numeric, 1),
      'media_min', round(avg(minutos)::numeric, 1),
      'p90_min', round((percentile_cont(0.9) within group (order by minutos))::numeric, 1),
      'pior_min', round(max(minutos)::numeric, 1)) as j
      from humanas where dia >= p_ini
  ),
  anterior as (
    select case when p_prev_ini is null or p_prev_ini >= p_ini then null else jsonb_build_object(
      'respondidos', count(*),
      'dentro_meta', count(*) filter (where minutos <= v_meta),
      'mediana_min', round((percentile_cont(0.5) within group (order by minutos))::numeric, 1),
      'media_min', round(avg(minutos)::numeric, 1)) end as j
      from humanas where dia >= p_prev_ini and dia < p_ini
  ),
  dias as (select d::date as dia from generate_series(v_serie, p_fim - 1, interval '1 day') d),
  por_dia as (
    select coalesce(jsonb_agg(jsonb_build_object('dia', dd.dia, 'respondidos', coalesce(x.n, 0), 'dentro_meta', coalesce(x.ok, 0), 'mediana_min', x.med) order by dd.dia), '[]'::jsonb) as j
      from dias dd
      left join (select dia, count(*) n, count(*) filter (where minutos <= v_meta) ok,
                        round((percentile_cont(0.5) within group (order by minutos))::numeric, 1) med
                   from humanas group by dia) x on x.dia = dd.dia
  ),
  por_hora as (
    select coalesce(jsonb_agg(jsonb_build_object('hora', h, 'respondidos', coalesce(x.n, 0), 'mediana_min', x.med) order by h), '[]'::jsonb) as j
      from generate_series(0, 23) h
      left join (select hora, count(*) n, round((percentile_cont(0.5) within group (order by minutos))::numeric, 1) med
                   from humanas where dia >= p_ini group by hora) x on x.hora = h
  ),
  por_pessoa as (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x.quem, 'nome', coalesce(u.nome, 'Sem atendente identificado'),
             'respondidos', x.n, 'dentro_meta', x.ok, 'mediana_min', x.med, 'media_min', x.media, 'pior_min', x.pior)
           order by x.med desc nulls last, x.n desc), '[]'::jsonb) as j
      from (select quem, count(*) n, count(*) filter (where minutos <= v_meta) ok,
                   round((percentile_cont(0.5) within group (order by minutos))::numeric, 1) med,
                   round(avg(minutos)::numeric, 1) media, round(max(minutos)::numeric, 1) pior
              from humanas where dia >= p_ini group by quem) x
      left join public.usuarios u on u.id = x.quem
  ),
  -- AGORA: conversas abertas cuja última mensagem é do cliente (ninguém respondeu, nem a IA), há até 30 dias
  ultimas as (
    select distinct on (m.conversa_id) m.conversa_id, m.direcao,
           case when m.direcao = 'entrada' then coalesce(m.recebida_em, m.criado_em) else coalesce(m.enviada_em, m.criado_em) end as ts
      from public.mensagens m
     where m.organizacao_id = v_org and m.criado_em >= now() - interval '30 days'
       and not (m.direcao = 'saida' and m.status::text = 'falhou')
       and m.tipo::text not in ('sistema', 'nota_interna')
     order by m.conversa_id, m.criado_em desc
  ),
  esperando as (
    select u.conversa_id, cv.atendente_id,
           (select min(case when m2.direcao = 'entrada' then coalesce(m2.recebida_em, m2.criado_em) end)
              from public.mensagens m2
             where m2.conversa_id = u.conversa_id and m2.direcao = 'entrada'
               and m2.criado_em > coalesce((select max(m3.criado_em) from public.mensagens m3 where m3.conversa_id = u.conversa_id and m3.direcao = 'saida' and m3.status::text <> 'falhou' and m3.tipo::text not in ('sistema', 'nota_interna')), '-infinity'::timestamptz)) as desde,
           coalesce(nullif(btrim(c.nome), ''), c.telefone, 'Sem nome') as contato
      from ultimas u
      join public.conversas cv on cv.id = u.conversa_id
      left join public.contatos c on c.id = cv.contato_id
     where u.direcao = 'entrada' and cv.arquivada_em is null and cv.status not in ('resolvida', 'fechada')
  ),
  fila as (
    select coalesce(jsonb_agg(jsonb_build_object('conversa_id', x.conversa_id, 'contato', x.contato, 'desde', x.desde,
             'espera_min', round((case when v_uteis then public.atd_minutos_uteis(x.desde, now()) else extract(epoch from (now() - x.desde)) / 60.0 end)::numeric, 0),
             'responsavel', u.nome) order by x.desde), '[]'::jsonb) as j
      from (select * from esperando where desde is not null order by desde limit 100) x
      left join public.usuarios u on u.id = x.atendente_id
  )
  select jsonb_build_object(
    'meta_min', v_meta, 'modo', case when v_uteis then 'uteis' else 'corrido' end,
    'totais', (select j from resumo), 'anterior', (select j from anterior),
    'por_dia', (select j from por_dia), 'por_hora', (select j from por_hora), 'atendentes', (select j from por_pessoa),
    'aguardando', (select count(*) from esperando where desde is not null), 'fila', (select j from fila),
    'pela_ia', (select count(*) from esperas e where e.origem = 'bot' and (e.inicio at time zone 'America/Sao_Paulo')::date >= p_ini),
    'gerado_em', now()) into v_res;
  return v_res;
end;
$$;
revoke all on function public.dash_tempo_resposta(date, date, integer, text, date, date, uuid) from public, anon, authenticated;
grant execute on function public.dash_tempo_resposta(date, date, integer, text, date, date, uuid) to authenticated, service_role;
