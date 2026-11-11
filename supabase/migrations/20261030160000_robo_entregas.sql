-- ROBÔ: "quanto ele tá concluindo, quanto ele tá entregando" (pedido do dono, 30/10)
--
-- 1. public.dash_v5_robo(p_org, p_ini, p_fim, p_canais) — régua ÚNICA do robô para o relatório
--    diário em PDF e para o Dashboard: a mesma SQL que o relatório usava desde 29/10 (coorte só de
--    lead NOVO, desfecho por conversa) + ENTREGAS (o robô passou o cliente a um atendente — evento
--    roteou_consultor, gravado na mesma execução da conclusão), entregues que seguem elegíveis e o
--    tempo da abertura até a entrega (mediana e 90º percentil, em segundos). Os eventos de cada
--    conversa vêm por lateral no índice (entidade, entidade_id): 45 dias em ~0,6 s (antes, 19 s).
--    Helper interno, sem grant para anon/authenticated.
-- 2. public.dashboard_v5 — devolve também o bloco 'robo' {total, canais[]} (nome e número de cada
--    WhatsApp onde o robô atendeu no período).
-- 3. public.avaliacao_diaria_dados — o bloco do robô passa a vir de dash_v5_robo (mesmos números,
--    conferidos em 8 dias/cortes: 20, 26, 27, 28, 28 até 22h, 29, 29 até 22h e 30/10) e ganha
--    robo.entregues / entregues_elegiveis / entrega_mediana_s / entrega_p90_s por campanha e
--    totais.robo_entregues / robo_entregues_elegiveis / robo_entrega_mediana_s / robo_entrega_p90_s.
--    Inclui a mudança de 20261030140000 (já estavam no sistema): esta definição é a final.
-- Base = definições VIVAS de 30/10 (pg_get_functiondef).

-- ROBÔ — régua ÚNICA do PDF diário (avaliacao_diaria_dados) e do Dashboard (dashboard_v5).
-- Coorte = só LEAD NOVO (regra do dono, 29/10): o robô mandou a ABERTURA na janela e o contato não
-- tinha oportunidade criada antes dela NEM mensagem de entrada antes dela (em qualquer conversa
-- dele). Desfecho (um por conversa): terminou, recusou, escalou_humano, ne_no_meio,
-- atendente_assumiu ou parou_<último passo> — a MESMA SQL que o relatório usava desde 29/10.
-- ENTREGAS (dono, 30/10: "quanto ele tá concluindo, quanto ele tá entregando"):
--   entregues           = o robô passou o cliente para um atendente (evento roteou_consultor do
--                         fluxo, gravado na mesma execução da conclusão) dentro da janela
--   entregues_elegiveis = desses, os que não viraram não elegível até o fim da janela (a mesma
--                         régua de "seguiram elegíveis": todas as oportunidades do contato criadas
--                         na janela marcadas como não elegível antes do fim = não elegível)
--   entrega_mediana_s / entrega_p90_s = segundos da abertura do robô até a entrega
-- Devolve {total: {...}, canais: {canal_id: {...}}} por número de ORIGEM da conversa
-- (canal_origem_id; sem ele, canal_id). Com p_canais: só esses números, todos presentes (zerados
-- quando não houve ninguém) e o total é a soma deles.
create or replace function public.dash_v5_robo(p_org uuid, p_ini timestamptz, p_fim timestamptz, p_canais uuid[] default null)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  -- (desempenho: só as ABERTURAS do robô varrem a janela inteira; os demais eventos vêm por
  -- conversa da coorte — lateral pelo índice (entidade, entidade_id) —, então o custo cresce com a
  -- coorte e não com o quadrado dela)
  with ab as (
    select a.entidade_id as conversa_id, min(a.criado_em) as entrou_em
      from public.audit_log a
     where a.organizacao_id = p_org and a.entidade = 'conversas'
       and a.acao in ('fluxo_emprestimo', 'fluxo_video')
       and a.criado_em >= p_ini and a.criado_em < p_fim
       and a.dados_depois->>'evento' = 'entrada_recebida' and a.dados_depois->>'decisao' = 'enviar'
       and coalesce(a.dados_depois->>'passo_atual', 'inicio') = 'inicio'
     group by 1
  ),
  entradas as (
    select ab.conversa_id, ab.entrou_em
      from ab
      join public.conversas cn on cn.id = ab.conversa_id
     where not exists (select 1
                         from public.oportunidades o
                        where o.contato_id = cn.contato_id
                          and o.criado_em < p_ini)
       and not exists (select 1
                         from public.conversas c2
                         join public.mensagens m on m.conversa_id = c2.id
                        where c2.contato_id = cn.contato_id
                          and m.direcao = 'entrada'
                          and m.criado_em < p_ini)
  ),
  rot as (        -- 1ª distribuição depois da entrada (fecho ou varredor de 20 min)
    select en.conversa_id, min(r.criado_em) as rot_em
      from entradas en
      join public.bot_roteamentos r on r.conversa_id = en.conversa_id
                                  and r.criado_em >= en.entrou_em and r.criado_em < p_fim
     group by 1
  ),
  coorte as (
    select en.conversa_id, en.entrou_em, c.contato_id,
           coalesce(c.canal_origem_id, c.canal_id) as origem,
           min(ev.criado_em) filter (where ev.d->>'evento' in
               ('analise_concluida', 'beneficio_encaminhado', 'beneficio_concluido'))   as fecho_em,
           min(ev.criado_em) filter (where ev.acao in ('fluxo_emprestimo', 'fluxo_video')
                                       and ev.d->>'evento' = 'roteou_consultor')       as entregue_em,
           bool_or(ev.d->>'evento' = 'recusou')                                         as recusou,
           max(ev.d->>'motivo') filter (where ev.d->>'evento' = 'sinalizou_humano')     as escalou,
           bool_or(ev.acao = 'bot_pausado' and ev.d->>'motivo' = 'humano_assumiu'
                   and (rt.rot_em is null or ev.criado_em < rt.rot_em))                 as pausa_humano,
           bool_or(ev.acao = 'bot_pausado' and ev.d->>'motivo' = 'nao_elegivel')        as pausa_ne,
           (array_agg(ev.d->>'motivo' order by ev.criado_em desc)
              filter (where ev.acao = 'bot_runner' and ev.d->>'outcome' in ('fluxo_emprestimo', 'fluxo_video')
                        and ev.d->>'motivo' in ('aguardando_sim_nao', 'aguardando_nome', 'aguardando_cpf',
                                                'aguardando_beneficio', 'fim', 'sem_beneficio', 'recusado')))[1] as ultimo_passo
      from entradas en
      join public.conversas c on c.id = en.conversa_id
      left join rot rt on rt.conversa_id = en.conversa_id
      left join lateral (   -- eventos do robô DESTA conversa, da entrada até o fim da janela
        select a.acao, a.dados_depois as d, a.criado_em
          from public.audit_log a
         where a.entidade = 'conversas' and a.entidade_id = en.conversa_id
           and a.organizacao_id = p_org
           and a.acao in ('fluxo_emprestimo', 'fluxo_video', 'bot_runner', 'bot_pausado')
           and a.criado_em >= en.entrou_em and a.criado_em < p_fim
      ) ev on true
     group by en.conversa_id, en.entrou_em, c.contato_id, c.canal_origem_id, c.canal_id
  ),
  classif as (
    select k.origem, k.entrou_em, k.entregue_em,
           case when k.fecho_em is not null then 'terminou'
                when k.recusou              then 'recusou'
                when k.escalou is not null  then 'escalou_humano'
                when k.pausa_ne             then 'ne_no_meio'
                when k.pausa_humano         then 'atendente_assumiu'
                else 'parou_' || coalesce(k.ultimo_passo, 'abertura') end as desfecho,
           k.entregue_em is not null as entregue,
           coalesce((select bool_and(coalesce(o.status = 'perdido'
                                              and coalesce(o.motivo_perda, '') = 'nao_elegivel'
                                              and o.fechado_em < p_fim, false))
                       from public.oportunidades o
                      where o.contato_id = k.contato_id
                        and o.criado_em >= p_ini and o.criado_em < p_fim), false) as virou_ne
      from coorte k
     where p_canais is null or k.origem = any (p_canais)
  ),
  agg as (
    select k.origem, grouping(k.origem) as g,
           jsonb_build_object(
             'entraram',            count(*),
             'terminaram',          count(*) filter (where k.desfecho = 'terminou'),
             'recusaram',           count(*) filter (where k.desfecho = 'recusou'),
             'escalou_humano',      count(*) filter (where k.desfecho = 'escalou_humano'),
             'ne_no_meio',          count(*) filter (where k.desfecho = 'ne_no_meio'),
             'atendente_assumiu',   count(*) filter (where k.desfecho = 'atendente_assumiu'),
             'pararam',             count(*) filter (where k.desfecho like 'parou\_%'),
             'parou_sim_nao',       count(*) filter (where k.desfecho = 'parou_aguardando_sim_nao'),
             'parou_nome',          count(*) filter (where k.desfecho = 'parou_aguardando_nome'),
             'parou_cpf',           count(*) filter (where k.desfecho = 'parou_aguardando_cpf'),
             'parou_beneficio',     count(*) filter (where k.desfecho = 'parou_aguardando_beneficio'),
             'entregues',           count(*) filter (where k.entregue),
             'entregues_elegiveis', count(*) filter (where k.entregue and not k.virou_ne),
             'entrega_mediana_s',   round((percentile_cont(0.5) within group (order by extract(epoch from k.entregue_em - k.entrou_em))
                                             filter (where k.entregue))::numeric),
             'entrega_p90_s',       round((percentile_cont(0.9) within group (order by extract(epoch from k.entregue_em - k.entrou_em))
                                             filter (where k.entregue))::numeric)) as o
      from classif k
     group by grouping sets ((k.origem), ())
  ),
  zero as (
    select jsonb_build_object(
             'entraram', 0, 'terminaram', 0, 'recusaram', 0, 'escalou_humano', 0, 'ne_no_meio', 0,
             'atendente_assumiu', 0, 'pararam', 0, 'parou_sim_nao', 0, 'parou_nome', 0, 'parou_cpf', 0,
             'parou_beneficio', 0, 'entregues', 0, 'entregues_elegiveis', 0,
             'entrega_mediana_s', null, 'entrega_p90_s', null) as o
  )
  select jsonb_build_object(
           'total', coalesce((select a.o from agg a where a.g = 1), (select z.o from zero z)),
           'canais', case
             when p_canais is null then
               coalesce((select jsonb_object_agg(a.origem::text, a.o) from agg a where a.g = 0 and a.origem is not null), '{}'::jsonb)
             else
               coalesce((select jsonb_object_agg(x.id::text, coalesce(a.o, (select z.o from zero z)))
                           from (select distinct unnest(p_canais) as id) x
                           left join agg a on a.g = 0 and a.origem = x.id), '{}'::jsonb)
           end);
$function$;

-- helper interno (sem grant): só as funções SECURITY DEFINER (dashboard_v5, avaliacao_diaria_dados) chamam
revoke all on function public.dash_v5_robo(uuid, timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function public.dash_v5_robo(uuid, timestamptz, timestamptz, uuid[]) to service_role;

CREATE OR REPLACE FUNCTION public.dashboard_v5(p_inicio timestamp with time zone, p_fim timestamp with time zone, p_org uuid DEFAULT NULL::uuid, p_inicio_ant timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim_ant timestamp with time zone DEFAULT NULL::timestamp with time zone, p_mapa_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org     uuid;
  v_dur     interval;
  v_ini_ant timestamptz;
  v_fim_ant timestamptz;
  v_mapa    timestamptz;
  v_robo    jsonb;
  v_robo_c  jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'periodo_invalido';
  end if;
  -- teto de segurança: o tempo de resposta lê as mensagens do período inteiro (+3 dias).
  -- Com cache frio e sem idx_mensagens_org_criado, 92 dias levaram 16,6 s (o papel
  -- authenticated tem statement_timeout de 8 s). 45 dias cobre o mês comercial com folga.
  if p_fim - p_inicio > interval '45 days' then
    raise exception 'periodo_longo';
  end if;

  -- org: a informada ou a do usuário (igual a dashboard_resumo)
  v_org := p_org;
  if v_org is null then
    select ou.organizacao_id into v_org
      from public.organizacao_usuarios ou
     where ou.usuario_id = auth.uid() and ou.status = 'ativo'
     limit 1;
  end if;
  if v_org is null then raise exception 'org_indefinida'; end if;

  if not public.is_member(v_org) and not public.is_platform_admin() then
    raise exception 'sem_permissao';
  end if;

  -- período anterior: o EXATO informado pelo front (cortado no mesmo tempo decorrido),
  -- ou o deslocamento por duração quando nada vier
  v_dur := p_fim - p_inicio;
  if p_inicio_ant is not null and p_fim_ant is not null then
    if p_fim_ant <= p_inicio_ant then raise exception 'periodo_anterior_invalido'; end if;
    v_ini_ant := p_inicio_ant; v_fim_ant := p_fim_ant;
  else
    v_ini_ant := p_inicio - v_dur; v_fim_ant := p_inicio;
  end if;

  -- início do mapa (o front pede os últimos 7 dias quando o período é curto)
  v_mapa := coalesce(p_mapa_inicio, p_inicio);
  if v_mapa >= p_fim or p_fim - v_mapa > interval '45 days' then
    raise exception 'periodo_mapa_invalido';
  end if;

  -- ROBÔ (dono, 30/10: "quanto ele tá concluindo, quanto ele tá entregando"): a MESMA régua do
  -- relatório diário em PDF (dash_v5_robo), em todo número onde o robô atendeu no período — com
  -- o nome do número, conectado ou não (um número que caiu no meio do período continua na lista)
  v_robo := public.dash_v5_robo(v_org, p_inicio, p_fim, null);
  select coalesce(jsonb_agg(x.o || jsonb_build_object(
           'canal_id', x.k::uuid,
           'nome',     coalesce(nullif(btrim(ca.nome_interno), ''), 'Sem nome'),
           'numero',   ca.numero_conectado,
           'situacao', case when ca.ativo and ca.status_integracao = 'conectado' then 'conectado' else 'antigo' end)
         order by (x.o->>'entraram')::int desc, (x.o->>'entregues')::int desc, coalesce(ca.nome_interno, '')), '[]'::jsonb)
    into v_robo_c
    from jsonb_each(v_robo -> 'canais') as x(k, o)
    left join public.canais ca on ca.id = x.k::uuid;

  return public.dash_v5_dados(v_org, p_inicio, p_fim, v_ini_ant, v_fim_ant, v_mapa)
         || jsonb_build_object('robo', jsonb_build_object('total', v_robo -> 'total', 'canais', v_robo_c));
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
  -- números ANTIGOS de cada campanha (o tráfego por onde o cliente tinha entrado antes): EMPRÉSTIMO
  -- de 17/08 e EMPRESTIMO (DIEGO) de 15/09 são a campanha do Diego; ANDRIUS de 29/06 é a de juros
  v_linhagem constant jsonb := '[
    {"canal_id":"c3e8311c-d574-4283-9bbb-f4adcf050f02","chave":"diego"},
    {"canal_id":"eaa0b251-1284-4fab-aebf-940bae893da9","chave":"diego"},
    {"canal_id":"ae43fc08-36ff-49d3-8272-e4280645223a","chave":"juros"}
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
    -- janela; o número que recebeu vem do evento do webhook (mensagens não guarda o canal) e, sem
    -- evento (reinjetada IMPWEB-, que não passa pelo webhook, ou evento apagado pela retenção de 14
    -- dias), fica o número da conversa.
    lin as (
      select (x->>'canal_id')::uuid as canal_id, x->>'chave' as chave from jsonb_array_elements(v_linhagem) x
    ),
    ad as (
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
         and m.criado_em >= w_ini and m.criado_em < w_fim
         and coalesce(w.canal_id, cv.canal_id) in (select canal_id from camp)
         and public.anuncio_mensagem_e_anuncio(m.conteudo, m.metadados)
       group by 1, 2
    ),
    -- RETORNO = mandou a mensagem do anúncio e o contato já existia antes dela (1 min de folga: o
    -- contato criado pela própria mensagem não conta). Quem é entrada nova DESTA campanha na janela
    -- conta lá; entrada nova de OUTRA campanha no mesmo dia conta aqui também (cada Gerenciador
    -- conta a pessoa na sua campanha). Número interno fica fora, como nas entradas.
    ret as (
      select ad.cid, ad.contato_id, ct.canal_origem_id as origem
        from ad
        join public.contatos ct on ct.id = ad.contato_id
       where ct.criado_em < ad.primeira - interval '1 minute'
         and not public.dash_v5_interno(ct.telefone)
         and not exists (select 1 from ent where ent.contato_id = ad.contato_id and ent.cid = ad.cid)
    ),
    -- por onde tinha entrado antes: a campanha do relatório (números antigos contam como ela) ou
    -- "Outros números"
    ret_o as (
      select r.cid, coalesce(cc.rotulo, cl.rotulo, 'Outros números') as rotulo, count(*) as n
        from ret r
        left join camp cc on cc.canal_id = r.origem
        left join lin l on l.canal_id = r.origem
        left join camp cl on cl.chave = l.chave
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
