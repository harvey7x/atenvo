-- ============================================================================
-- DASHBOARD EM ABAS (12/11/2026) — três RPCs novas, uma por aba, no MESMO padrão
-- da dashboard_v5 (que fica INALTERADA e segue servindo a aba Visão geral):
--   * dashboard_v5_campanhas  — entradas/fechados/NE por campanha, série diária
--     para o gráfico de ondas, retornos ("já era nosso") com a quebra própria ×
--     outra campanha, recuperados pelo parente, quadro do melhor do dia/semana/mês;
--   * dashboard_v5_atendentes — o bloco vivo de atendentes + os DOIS relógios
--     (cliente e atendente, com n e "sem relógio" expostos), fechados por campanha
--     por atendente, série diária de ganhos e as fotos de agora (vácuo 3º aviso,
--     carteira aberta, parados >7d);
--   * dashboard_v5_iris       — funil da Iris (atendidas, qualificadas, propostas,
--     aceites, documentação, "fechou"), o que falta de documento, tempo até fechar
--     e série diária. O Vigia continua nas RPCs guardiao_resposta_* (gate próprio).
--
-- Réguas (validadas em 12/11 por caminhos independentes — ver contrato das abas):
--   FECHADO    = pódio do CAF via dash_v5_fechamentos tipo 'ganho' (reproduz o
--                placar ao centavo: mês 11/10→10/11 = 147 = adm_placar; semana = 35).
--   CAMPANHA   = dash_v5_campanha(canal_origem_id) — NUNCA por status de conexão
--                (ANTONIO 2.0 está desconectado com entradas hoje) e nunca por
--                conversas.canal_id (re-parenting mente).
--   ENTRADA    = oportunidade criada (dash_v5_entradas), igual aos KPIs.
--   NE         = régua do período (estado atual), igual à dashboard_v5.
--   RETORNO    = dash_v5_anuncio.ja_estava; origem = contatos.canal_origem_id
--                (aquisição congelada). Exato só nos últimos ~14 dias (retenção de
--                whatsapp_webhook_events) — o front avisa via retornos_confiavel_desde.
--   PARENTE    = ia_sessoes.dados: recebe_inss='nao' E familiar_recebe='sim' (D1),
--                coorte pela criação da sessão; universo = TODAS as sessões de IA
--                (a maioria é da IA antiga). "Algum parente": pai/mãe não é contável
--                (parentesco gravado em 7/265).
--   IRIS       = sessões com dados ? 'iris' (estado): "atendidas" tem banda de ±5%
--                até os eventos novos do ia-sdr (iris_desde) — o jsonb declara isso.
--   DOCS       = régua do código (checklistDe): identidade = qtd_fotos>=2 OU frente+
--                verso; comprovante presente (pendente_analista conta; "estrito" não);
--                e-mail = email OU email_a_criar. TODO boolean de jsonb com COALESCE.
--   Fuso: America/Sao_Paulo; semana = seg–dom SP; mês = mês CAF (adm_mes_inicio).
--
-- Segurança/custo: RPCs SECURITY DEFINER com o MESMO portão da dashboard_v5
-- (is_member/platform admin, teto 45 dias); helpers internos sem grant; custos
-- medidos em produção: fechados por dia×campanha 48 ms, anúncio 1,42 s/30d,
-- atividade da Iris ~3 s/30d — tudo dentro do statement_timeout de 8 s.
-- ============================================================================


-- ---------------------------------------------------------------- portão comum
create or replace function public.dash_v5_abas_portao(p_inicio timestamptz, p_fim timestamptz, p_org uuid)
returns uuid
language plpgsql stable
set search_path = public
as $$
declare
  v_org uuid;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'periodo_invalido';
  end if;
  if p_fim - p_inicio > interval '45 days' then
    raise exception 'periodo_longo';
  end if;
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
  return v_org;
end;
$$;


-- ------------------------------------------------- resumo por campanha (helper)
-- entradas / ganhos / ne de UMA janela, por campanha — usado pelo quadro do
-- melhor do dia/semana/mês e pela janela anterior.
create or replace function public.dash_v5c_resumo(p_org uuid, p_ini timestamptz, p_fim timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'campanha', z.campanha,
           'entradas', z.entradas,
           'ganhos',   z.ganhos,
           'ne',       z.ne) order by z.entradas desc, z.campanha), '[]'::jsonb)
    from (
      select y.campanha,
             sum(y.e) as entradas, sum(y.g) as ganhos, sum(y.n) as ne
        from (
          select public.dash_v5_campanha(e.canal_origem_id) as campanha, count(*) as e, 0 as g, 0 as n
            from public.dash_v5_entradas(p_org, p_ini, p_fim) e group by 1
          union all
          select public.dash_v5_campanha(f.canal_origem_id),
                 0,
                 count(*) filter (where f.tipo = 'ganho'),
                 count(*) filter (where f.tipo = 'ne')
            from public.dash_v5_fechamentos(p_org, p_ini, p_fim) f group by 1
        ) y
       group by 1
    ) z
$$;


-- ---------------------------------------------------------------- 1) CAMPANHAS
create or replace function public.dash_v5c_dados(
  p_org uuid, p_ini timestamptz, p_fim timestamptz,
  p_ini_ant timestamptz, p_fim_ant timestamptz)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_agora     timestamptz := now();
  v_dia_ini   timestamptz;
  v_sem_ini   timestamptz;
  v_mes_ini   timestamptz;
  v_mes_ant   timestamptz;
  v_campanhas jsonb;
  v_serie     jsonb;
  v_parente   jsonb;
begin
  -- quadros fixos (independem do período selecionado): hoje, semana atual (seg SP),
  -- mês CAF atual — cada um comparado com o anterior CORTADO no mesmo tempo decorrido
  v_dia_ini := date_trunc('day',  v_agora at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_sem_ini := date_trunc('week', v_agora at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_mes_ini := public.adm_mes_inicio(v_agora)::timestamp at time zone 'America/Sao_Paulo';
  v_mes_ant := public.adm_mes_inicio(v_mes_ini - interval '1 day')::timestamp at time zone 'America/Sao_Paulo';

  -- ------------------ tabela por campanha (período selecionado) ------------------
  with ent as (
    select public.dash_v5_campanha(e.canal_origem_id) as camp, count(*) as n
      from public.dash_v5_entradas(p_org, p_ini, p_fim) e
     group by 1
  ),
  fe as (
    select public.dash_v5_campanha(f.canal_origem_id) as camp, f.tipo, f.motivo, f.quem, f.horas
      from public.dash_v5_fechamentos(p_org, p_ini, p_fim) f
  ),
  fk as (
    select fe.camp,
           count(*) filter (where fe.tipo = 'ganho') as ganhos,
           count(*) filter (where fe.tipo = 'ne')    as ne,
           percentile_cont(0.5) within group (order by fe.horas) as med,
           count(fe.horas) as n
      from fe group by 1
  ),
  fm as (
    select z.camp, jsonb_object_agg(z.motivo, z.q) as motivos
      from (select fe.camp, fe.motivo, count(*) as q from fe where fe.tipo = 'ne' group by 1, 2) z
     group by 1
  ),
  fq as (
    select z.camp, jsonb_object_agg(z.quem, z.q) as quem
      from (select fe.camp, fe.quem, count(*) as q from fe where fe.tipo = 'ne' group by 1, 2) z
     group by 1
  ),
  an as (
    select public.dash_v5_campanha(a.canal_id)        as camp,
           public.dash_v5_campanha(a.origem_canal_id) as camp_orig,
           a.novo_aqui, a.ja_estava
      from public.dash_v5_anuncio(p_org, p_ini, p_fim) a
  ),
  ak as (
    select an.camp,
           count(*)                                                        as pelo_anuncio,
           count(*) filter (where an.ja_estava)                            as retornos,
           count(*) filter (where an.ja_estava and an.camp_orig = an.camp) as retornos_mesma
      from an group by 1
  ),
  ao as (
    select z.camp, jsonb_agg(jsonb_build_object('campanha', z.camp_orig, 'n', z.q)
                             order by z.q desc, z.camp_orig) as origens
      from (select an.camp, an.camp_orig, count(*) as q
              from an where an.ja_estava group by 1, 2) z
     group by 1
  ),
  par as (
    select public.dash_v5_campanha(s.canal_id) as camp, count(*) as n
      from public.ia_sessoes s
     where s.organizacao_id = p_org
       and s.criado_em >= p_ini and s.criado_em < p_fim
       and s.dados->>'recebe_inss' = 'nao' and s.dados->>'familiar_recebe' = 'sim'
     group by 1
  ),
  cn as (
    select c.campanha as camp,
           jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome_interno, 'numero', c.numero_conectado)
                     order by c.criado_em) as canais
      from public.canais c
     where c.organizacao_id = p_org and c.campanha is not null
     group by 1
  ),
  slugs as (
    select c.campanha as camp from public.canais c
     where c.organizacao_id = p_org and c.campanha is not null
     group by 1
    union select ent.camp from ent
    union select fe.camp  from fe
    union select ak.camp  from ak
    union select par.camp from par
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'campanha',         s.camp,
           'canais',           coalesce(cn.canais, '[]'::jsonb),
           'entradas',         coalesce(ent.n, 0),
           'ganhos',           coalesce(fk.ganhos, 0),
           'fech_mediana_h',   round(fk.med::numeric, 3),
           'fech_n',           coalesce(fk.n, 0),
           'ne',               coalesce(fk.ne, 0),
           'ne_motivos',       coalesce(fm.motivos, '{}'::jsonb),
           'ne_quem',          coalesce(fq.quem, '{}'::jsonb),
           'pelo_anuncio',     coalesce(ak.pelo_anuncio, 0),
           'retornos',         coalesce(ak.retornos, 0),
           'retornos_mesma',   coalesce(ak.retornos_mesma, 0),
           'retornos_origens', coalesce(ao.origens, '[]'::jsonb),
           'parente_rec',      coalesce(par.n, 0))
         order by (s.camp in ('outros', 'sem_campanha')), coalesce(ent.n, 0) desc, s.camp), '[]'::jsonb)
    into v_campanhas
    from slugs s
    left join ent on ent.camp = s.camp
    left join fk  on fk.camp  = s.camp
    left join fm  on fm.camp  = s.camp
    left join fq  on fq.camp  = s.camp
    left join ak  on ak.camp  = s.camp
    left join ao  on ao.camp  = s.camp
    left join par on par.camp = s.camp
    left join cn  on cn.camp  = s.camp
   where s.camp not in ('outros', 'sem_campanha')
      or coalesce(ent.n, 0) + coalesce(fk.ganhos, 0) + coalesce(fk.ne, 0) + coalesce(ak.pelo_anuncio, 0) > 0;

  -- ------------------ série diária (entradas / ganhos / ne por campanha) ------------------
  with pontos as (
    select to_char(e.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
           public.dash_v5_campanha(e.canal_origem_id) as camp, count(*) as e, 0 as g, 0 as n
      from public.dash_v5_entradas(p_org, p_ini, p_fim) e group by 1, 2
    union all
    select to_char(f.fechado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
           public.dash_v5_campanha(f.canal_origem_id),
           0, count(*) filter (where f.tipo = 'ganho'), count(*) filter (where f.tipo = 'ne')
      from public.dash_v5_fechamentos(p_org, p_ini, p_fim) f group by 1, 2
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'dia', z.dia, 'campanha', z.camp,
           'entradas', z.e, 'ganhos', z.g, 'ne', z.n) order by z.dia, z.camp), '[]'::jsonb)
    into v_serie
    from (select p.dia, p.camp, sum(p.e) as e, sum(p.g) as g, sum(p.n) as n
            from pontos p group by 1, 2) z;

  -- ------------------ recuperados pelo parente (janela selecionada) ------------------
  with sb as (      -- porta 2: disse que NÃO recebe INSS (todas as sessões de IA)
    select s.contato_id,
           s.dados->>'familiar_recebe' as fam,
           coalesce(s.dados->>'ne_origem', '') = 'familia_sem_resposta' as ne_timer,
           s.criado_em
      from public.ia_sessoes s
     where s.organizacao_id = p_org
       and s.criado_em >= p_ini and s.criado_em < p_fim
       and s.dados->>'recebe_inss' = 'nao'
  ),
  d1 as (select sb.contato_id, sb.criado_em from sb where sb.fam = 'sim'),
  desf as (        -- desfecho ATUAL pela última oportunidade do contato
    select case when o.status is null then 'sem_opp'
                when o.status::text in ('ganho', 'perdido') then o.status::text
                else 'em_andamento' end as st,
           -- o gargalo real está em motivo_nao_elegivel (ex.: sem_emprestimo_banco);
           -- motivo_perda é só a categoria ('nao_elegivel')
           case when o.status = 'perdido'
                then coalesce(o.motivo_nao_elegivel, o.motivo_perda, 'sem_motivo') end as motivo,
           count(*) as n
      from d1
      left join lateral (
        select o2.status, o2.motivo_perda, o2.motivo_nao_elegivel
          from public.oportunidades o2
         where o2.contato_id = d1.contato_id
         order by o2.criado_em desc limit 1
      ) o on true
     group by 1, 2
  )
  select jsonb_build_object(
           'total', (select count(*) from d1),
           'serie', coalesce((select jsonb_agg(jsonb_build_object('dia', x.dia, 'n', x.n) order by x.dia)
                                from (select to_char(d1.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
                                             count(*) as n from d1 group by 1) x), '[]'::jsonb),
           'funil', jsonb_build_object(
             'sem_beneficio', (select count(*) from sb),
             'familiar_sim',  (select count(*) from sb where sb.fam = 'sim'),
             'familiar_nao',  (select count(*) from sb where sb.fam = 'nao'),
             'sem_resposta',  (select count(*) from sb where sb.fam is null),
             'ne_timer',      (select count(*) from sb where sb.ne_timer)),
           'desfecho', jsonb_build_object(
             'ganho',           coalesce((select sum(desf.n) from desf where desf.st = 'ganho'), 0),
             'em_andamento',    coalesce((select sum(desf.n) from desf where desf.st = 'em_andamento'), 0),
             'perdido',         coalesce((select sum(desf.n) from desf where desf.st = 'perdido'), 0),
             'sem_opp',         coalesce((select sum(desf.n) from desf where desf.st = 'sem_opp'), 0),
             'perdido_motivos', coalesce((select jsonb_object_agg(desf.motivo, desf.n)
                                            from desf where desf.motivo is not null), '{}'::jsonb)),
           'ne_desfeito', (select count(*) from public.ia_eventos e
                            where e.organizacao_id = p_org
                              and e.tipo = 'ne_familia_respondeu'
                              and e.criado_em >= p_ini and e.criado_em < p_fim))
    into v_parente;

  return jsonb_build_object(
    'gerado_em', v_agora,
    'periodo',   jsonb_build_object('inicio', p_ini, 'fim', p_fim),
    'campanhas', v_campanhas,
    'serie',     v_serie,
    'anterior',  public.dash_v5c_resumo(p_org, p_ini_ant, p_fim_ant),
    'quadro',    jsonb_build_object(
      'dia',        jsonb_build_object('ini', v_dia_ini, 'atual', public.dash_v5c_resumo(p_org, v_dia_ini, v_agora),
                                       'anterior', public.dash_v5c_resumo(p_org, v_dia_ini - interval '1 day', v_agora - interval '1 day')),
      'semana',     jsonb_build_object('ini', v_sem_ini, 'atual', public.dash_v5c_resumo(p_org, v_sem_ini, v_agora),
                                       'anterior', public.dash_v5c_resumo(p_org, v_sem_ini - interval '7 days', v_agora - interval '7 days')),
      'mes',        jsonb_build_object('ini', v_mes_ini, 'atual', public.dash_v5c_resumo(p_org, v_mes_ini, v_agora),
                                       'anterior', public.dash_v5c_resumo(p_org, v_mes_ant, v_mes_ant + (v_agora - v_mes_ini)))),
    'parente',   v_parente,
    'retornos_confiavel_desde', to_char((v_agora - interval '14 days') at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'));
end;
$$;

create or replace function public.dashboard_v5_campanhas(
  p_inicio     timestamptz,
  p_fim        timestamptz,
  p_org        uuid        default null,
  p_inicio_ant timestamptz default null,
  p_fim_ant    timestamptz default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_ini_ant timestamptz;
  v_fim_ant timestamptz;
begin
  v_org := public.dash_v5_abas_portao(p_inicio, p_fim, p_org);
  if p_inicio_ant is not null and p_fim_ant is not null then
    if p_fim_ant <= p_inicio_ant then raise exception 'periodo_anterior_invalido'; end if;
    v_ini_ant := p_inicio_ant; v_fim_ant := p_fim_ant;
  else
    v_ini_ant := p_inicio - (p_fim - p_inicio); v_fim_ant := p_inicio;
  end if;
  return public.dash_v5c_dados(v_org, p_inicio, p_fim, v_ini_ant, v_fim_ant);
end;
$$;


-- ---------------------------------------------------------------- 2) ATENDENTES
-- O miolo (recebidos/transferidos/ganhos/ne/resposta/relógio do atendente) é o
-- bloco VIVO da dash_v5_dados, copiado sem mudança de régua; os acréscimos são:
-- relógio do CLIENTE por atendente (horas do fechamento, mesma régua dos KPIs),
-- "sem relógio" exposto, campanha × atendente, ganhos da janela anterior, série
-- diária de ganhos e as fotos de agora (vácuo 3º aviso, carteira, parados >7d).
create or replace function public.dash_v5a_dados(
  p_org uuid, p_ini timestamptz, p_fim timestamptz,
  p_ini_ant timestamptz, p_fim_ant timestamptz)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_atendentes jsonb;
  v_serie      jsonb;
begin
  with membros as (
    select u.id as uid, u.nome
      from public.organizacao_usuarios ou
      join public.usuarios u on u.id = ou.usuario_id
     where ou.organizacao_id = p_org and ou.status = 'ativo'
  ),
  rec as (
    select r.consultor_id as uid, count(distinct coalesce(r.contato_id, r.conversa_id)) as n
      from public.bot_roteamentos r
     where r.organizacao_id = p_org and r.criado_em >= p_ini and r.criado_em < p_fim
     group by 1
  ),
  transf as (
    select (a.dados_depois->>'responsavel_id')::uuid as uid, count(distinct a.entidade_id) as n
      from public.audit_log a
     where a.organizacao_id = p_org and a.acao = 'sync_responsavel_cliente'
       and a.criado_em >= p_ini and a.criado_em < p_fim
       and a.dados_antes->>'responsavel_id' is not null and a.dados_depois->>'responsavel_id' is not null
       and a.dados_antes->>'responsavel_id' <> a.dados_depois->>'responsavel_id'
     group by 1
  ),
  fe as (
    select * from public.dash_v5_fechamentos(p_org, p_ini, p_fim)
  ),
  gan as (
    select g.credito_id as uid, count(*) as ganhos,
           percentile_cont(0.5) within group (order by g.h)  as med,
           avg(g.h)   as media,
           count(g.h) as n,
           percentile_cont(0.5) within group (order by g.hc) as med_cli,
           avg(g.hc)   as media_cli,
           count(g.hc) as n_cli
      from (
        select f.credito_id, f.horas as hc,
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
  campat as (
    select z.uid, jsonb_agg(jsonb_build_object('campanha', z.campanha, 'ganhos', z.n)
                            order by z.n desc, z.campanha) as arr
      from (select f.credito_id as uid, public.dash_v5_campanha(f.canal_origem_id) as campanha, count(*) as n
              from fe f where f.tipo = 'ganho' and f.credito_id is not null group by 1, 2) z
     group by 1
  ),
  gan_ant as (
    select f.credito_id as uid, count(*) as n
      from public.dash_v5_fechamentos(p_org, p_ini_ant, p_fim_ant) f
     where f.tipo = 'ganho' and f.credito_id is not null
     group by 1
  ),
  nem as (
    select f.fechado_por_id as uid, count(*) as n
      from fe f where f.tipo = 'ne' and f.fechado_por_id is not null
     group by 1
  ),
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
       and mm.criado_em >= p_ini - interval '1 day'
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
     where r.k = 'hum' and t.t0 >= p_ini and t.t0 < p_fim
  ),
  rv as (
    select h.uid, count(*) as turnos, count(*) filter (where h.origem = 'telefone') as cel,
           percentile_cont(0.5) within group (order by h.min_util) as med,
           avg(h.min_util) as media
      from hum h where h.uid is not null
     group by 1
  ),
  -- fotos de AGORA (não dependem do período; o front as separa visualmente)
  vac as (
    select v.usuario_id as uid, count(*) as n
      from public.vacuo_estado v
     where v.organizacao_id = p_org and v.aviso >= 3 and not v.fechado
     group by 1
  ),
  cart as (
    select ct.responsavel_id as uid,
           count(*) as aberta,
           count(*) filter (where cv.ultima_interacao_em < now() - interval '7 days') as par7
      from public.conversas cv
      join public.contatos ct on ct.id = cv.contato_id
     where cv.organizacao_id = p_org and cv.status = 'aberta' and cv.arquivada_em is null
       and ct.responsavel_id is not null
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'usuario_id',       mb.uid,
           'nome',             mb.nome,
           'recebidos',        coalesce(rec.n, 0),
           'transferidos',     coalesce(tr.n, 0),
           'ganhos',           coalesce(gan.ganhos, 0),
           'ganhos_ant',       coalesce(ga.n, 0),
           'ne_marcados',      coalesce(nem.n, 0),
           'resp_n',           coalesce(rv.turnos, 0),
           'resp_celular_n',   coalesce(rv.cel, 0),
           'resp_mediana_min', round(rv.med::numeric, 1),
           'resp_media_min',   round(rv.media::numeric, 1),
           'fech_n',           coalesce(gan.n, 0),
           'fech_mediana_h',   round(gan.med::numeric, 3),
           'fech_media_h',     round(gan.media::numeric, 3),
           'fech_sem_relogio', coalesce(gan.ganhos, 0) - coalesce(gan.n, 0),
           'cli_n',            coalesce(gan.n_cli, 0),
           'cli_mediana_h',    round(gan.med_cli::numeric, 3),
           'cli_media_h',      round(gan.media_cli::numeric, 3),
           'campanhas',        coalesce(ca.arr, '[]'::jsonb),
           'vacuo_3o',         coalesce(vac.n, 0),
           'carteira',         coalesce(cart.aberta, 0),
           'parados_7d',       coalesce(cart.par7, 0))
         order by coalesce(gan.ganhos, 0) desc, coalesce(rec.n, 0) desc, mb.nome), '[]'::jsonb)
    into v_atendentes
    from membros mb
    left join rec          on rec.uid  = mb.uid
    left join transf tr    on tr.uid   = mb.uid
    left join gan          on gan.uid  = mb.uid
    left join gan_ant ga   on ga.uid   = mb.uid
    left join campat ca    on ca.uid   = mb.uid
    left join nem          on nem.uid  = mb.uid
    left join rv           on rv.uid   = mb.uid
    left join vac          on vac.uid  = mb.uid
    left join cart         on cart.uid = mb.uid
   where coalesce(rec.n, 0) + coalesce(tr.n, 0) + coalesce(gan.ganhos, 0)
       + coalesce(nem.n, 0) + coalesce(rv.turnos, 0) > 0;

  -- série diária de ganhos por atendente (pódio)
  select coalesce(jsonb_agg(jsonb_build_object('dia', z.dia, 'usuario_id', z.uid, 'ganhos', z.n)
                            order by z.dia, z.uid), '[]'::jsonb)
    into v_serie
    from (select to_char(f.fechado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
                 f.credito_id as uid, count(*) as n
            from public.dash_v5_fechamentos(p_org, p_ini, p_fim) f
           where f.tipo = 'ganho' and f.credito_id is not null
           group by 1, 2) z;

  return jsonb_build_object(
    'gerado_em',    now(),
    'periodo',      jsonb_build_object('inicio', p_ini, 'fim', p_fim),
    'atendentes',   v_atendentes,
    'serie_ganhos', v_serie);
end;
$$;

create or replace function public.dashboard_v5_atendentes(
  p_inicio     timestamptz,
  p_fim        timestamptz,
  p_org        uuid        default null,
  p_inicio_ant timestamptz default null,
  p_fim_ant    timestamptz default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_ini_ant timestamptz;
  v_fim_ant timestamptz;
begin
  v_org := public.dash_v5_abas_portao(p_inicio, p_fim, p_org);
  if p_inicio_ant is not null and p_fim_ant is not null then
    if p_fim_ant <= p_inicio_ant then raise exception 'periodo_anterior_invalido'; end if;
    v_ini_ant := p_inicio_ant; v_fim_ant := p_fim_ant;
  else
    v_ini_ant := p_inicio - (p_fim - p_inicio); v_fim_ant := p_inicio;
  end if;
  return public.dash_v5a_dados(v_org, p_inicio, p_fim, v_ini_ant, v_fim_ant);
end;
$$;


-- ---------------------------------------------------------------- 3) IRIS
-- Funil de UMA janela (reusado para a atual e a anterior).
create or replace function public.dash_v5i_funil(p_org uuid, p_ini timestamptz, p_fim timestamptz)
returns jsonb
language sql stable
set search_path = public
as $$
  with ses as (
    select s.id, s.contato_id, s.criado_em, s.docs, s.dados
      from public.ia_sessoes s
     where s.organizacao_id = p_org and s.dados ? 'iris'
  ),
  atv as (          -- sessões em que a Iris FALOU na janela
    select distinct (m.metadados->>'sessao_id')::uuid as sid
      from public.mensagens m
     where m.organizacao_id = p_org
       and m.criado_em >= p_ini and m.criado_em < p_fim
       and m.direcao = 'saida' and m.origem = 'bot'
       and m.metadados->>'fluxo' = 'ia_sdr' and m.metadados ? 'sessao_id'
  ),
  atvi as (select s.id, s.contato_id from ses s join atv on atv.sid = s.id),
  ev as (
    select e.sessao_id, e.tipo, e.detalhe
      from public.ia_eventos e
      join ses s on s.id = e.sessao_id
     where e.organizacao_id = p_org
       and e.criado_em >= p_ini and e.criado_em < p_fim
  ),
  docs as (
    select (coalesce((s.docs->'doc_pessoal'->>'qtd_fotos')::int, 0) >= 2
            or (coalesce((s.docs->'doc_pessoal'->>'frente')::boolean, false)
                and coalesce((s.docs->'doc_pessoal'->>'verso')::boolean, false))) as ident_ok,
           (coalesce((s.docs->'doc_pessoal'->>'qtd_fotos')::int, 0) >= 1
            or coalesce((s.docs->'doc_pessoal'->>'frente')::boolean, false)
            or coalesce((s.docs->'doc_pessoal'->>'verso')::boolean, false)) as ident_algum,
           (s.docs ? 'comprovante') as compr_ok,
           coalesce((s.docs->'comprovante'->>'pendente_analista')::boolean, false) as compr_pend,
           (coalesce(s.dados->>'email', '') <> ''
            or coalesce((s.dados->>'email_a_criar')::boolean, false)) as email_ok,
           greatest((s.docs->'doc_pessoal'->>'atualizado_em')::timestamptz,
                    coalesce((s.docs->'comprovante'->>'validado_em')::timestamptz,
                             (s.docs->'comprovante'->>'em')::timestamptz)) as conclusao_em,
           least((s.docs->'doc_pessoal'->>'atualizado_em')::timestamptz,
                 case when (s.docs ? 'comprovante')
                       and not coalesce((s.docs->'comprovante'->>'pendente_analista')::boolean, false)
                      then coalesce((s.docs->'comprovante'->>'validado_em')::timestamptz,
                                    (s.docs->'comprovante'->>'em')::timestamptz) end) as algum_em,
           s.dados->>'aceite_proposta' as aceite
      from ses s
  )
  select jsonb_build_object(
    'atendidas_sessoes', (select count(*) from atvi),
    'atendidas_contatos', (select count(distinct a.contato_id) from atvi a),
    'coorte_novas', (select count(*) from ses s where s.criado_em >= p_ini and s.criado_em < p_fim),
    'qualificadas', (select count(distinct ev.sessao_id) from ev
                      where ev.tipo = 'financeiras_decisao' and ev.detalhe->>'passa' = 'true'),
    'reprovadas',   (select count(distinct ev.sessao_id) from ev
                      where ev.tipo = 'financeiras_decisao' and ev.detalhe->>'passa' = 'false'),
    'propostas_portab', (select count(distinct ev.sessao_id) from ev
                          where ev.tipo = 'iris_portabilidade_proposta'),
    'aceite_sim',    (select count(distinct ev.sessao_id) from ev
                       where ev.tipo = 'iris_proposta_resposta' and ev.detalhe->>'leitura' = 'sim'),
    'aceite_duvida', (select count(distinct ev.sessao_id) from ev
                       where ev.tipo = 'iris_proposta_resposta' and ev.detalhe->>'leitura' = 'duvida'),
    'aceite_nao',    (select count(distinct ev.sessao_id) from ev
                       where ev.tipo = 'iris_proposta_resposta' and ev.detalhe->>'leitura' = 'nao'),
    'docs_algum', (select count(*) from docs d
                    where (d.ident_algum or (d.compr_ok and not d.compr_pend))
                      and d.algum_em >= p_ini and d.algum_em < p_fim),
    'docs_completos', (select count(*) from docs d
                        where d.ident_ok and d.compr_ok and d.email_ok
                          and d.conclusao_em >= p_ini and d.conclusao_em < p_fim),
    'docs_completos_estrito', (select count(*) from docs d
                                where d.ident_ok and d.compr_ok and not d.compr_pend and d.email_ok
                                  and d.conclusao_em >= p_ini and d.conclusao_em < p_fim),
    'fechou_aceite', (select count(*) from docs d
                       where d.ident_ok and d.compr_ok and d.email_ok and d.aceite = 'sim'
                         and d.conclusao_em >= p_ini and d.conclusao_em < p_fim))
$$;

create or replace function public.dash_v5i_dados(
  p_org uuid, p_ini timestamptz, p_fim timestamptz,
  p_ini_ant timestamptz, p_fim_ant timestamptz)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_faltas jsonb;
  v_tempo  jsonb;
  v_serie  jsonb;
  v_camp   jsonb;
  v_etapas jsonb;
begin
  -- ------------------ o que falta de documento (foto do AGORA) ------------------
  with ses as (
    select s.id, s.criado_em, s.docs, s.dados
      from public.ia_sessoes s
     where s.organizacao_id = p_org and s.dados ? 'iris'
  ),
  d as (
    select (coalesce((s.docs->'doc_pessoal'->>'qtd_fotos')::int, 0) >= 2
            or (coalesce((s.docs->'doc_pessoal'->>'frente')::boolean, false)
                and coalesce((s.docs->'doc_pessoal'->>'verso')::boolean, false))) as ident_ok,
           (coalesce((s.docs->'doc_pessoal'->>'qtd_fotos')::int, 0) >= 1
            or coalesce((s.docs->'doc_pessoal'->>'frente')::boolean, false)
            or coalesce((s.docs->'doc_pessoal'->>'verso')::boolean, false)) as ident_algum,
           (s.docs ? 'comprovante') as compr_ok,
           coalesce((s.docs->'comprovante'->>'pendente_analista')::boolean, false) as compr_pend,
           (coalesce(s.dados->>'email', '') <> ''
            or coalesce((s.dados->>'email_a_criar')::boolean, false)) as email_ok,
           coalesce(s.dados->>'pre_aprovada_enviada', '') = 'true' as pre_ap,
           s.dados->>'aceite_proposta' as aceite
      from ses s
  ),
  u as (
    select * from d
     where (d.pre_ap or d.aceite in ('sim', 'pendente'))
       and not (d.ident_ok and d.compr_ok and d.email_ok)
  )
  select jsonb_build_object(
           'universo',    (select count(*) from u),
           'comprovante', (select count(*) from u where not u.compr_ok),
           'email',       (select count(*) from u where not u.email_ok),
           'identidade',  (select count(*) from u where not u.ident_ok),
           'so_outro_lado', (select count(*) from u
                              where not u.ident_ok and u.ident_algum and u.compr_ok and u.email_ok),
           'nada_dos_3',  (select count(*) from u
                            where not u.ident_algum and not u.compr_ok and not u.email_ok),
           'compr_pendente_analista', (select count(*) from u where u.compr_pend))
    into v_faltas;

  -- ------------------ tempo até fechar (sessões da era Iris: criadas >= 01/11) ------------------
  with ses as (
    select s.criado_em,
           (coalesce((s.docs->'doc_pessoal'->>'qtd_fotos')::int, 0) >= 2
            or (coalesce((s.docs->'doc_pessoal'->>'frente')::boolean, false)
                and coalesce((s.docs->'doc_pessoal'->>'verso')::boolean, false))) as ident_ok,
           (s.docs ? 'comprovante') as compr_ok,
           (coalesce(s.dados->>'email', '') <> ''
            or coalesce((s.dados->>'email_a_criar')::boolean, false)) as email_ok,
           greatest((s.docs->'doc_pessoal'->>'atualizado_em')::timestamptz,
                    coalesce((s.docs->'comprovante'->>'validado_em')::timestamptz,
                             (s.docs->'comprovante'->>'em')::timestamptz)) as conclusao_em
      from public.ia_sessoes s
     where s.organizacao_id = p_org and s.dados ? 'iris'
       and s.criado_em >= timestamptz '2026-11-01 00:00-03'
  ),
  ok as (
    select extract(epoch from (s.conclusao_em - s.criado_em)) / 60.0 as minutos
      from ses s
     where s.ident_ok and s.compr_ok and s.email_ok
       and s.conclusao_em >= p_ini and s.conclusao_em < p_fim
       and s.conclusao_em >= s.criado_em
  )
  select jsonb_build_object(
           'n', (select count(*) from ok),
           'mediana_min', (select round((percentile_cont(0.5) within group (order by ok.minutos))::numeric, 1) from ok),
           'p90_h', (select round(((percentile_cont(0.9) within group (order by ok.minutos)) / 60.0)::numeric, 1) from ok))
    into v_tempo;

  -- ------------------ série diária (atendidas × qualificadas × docs completos) ------------------
  with ses as (
    select s.id, s.criado_em, s.docs, s.dados, s.canal_id
      from public.ia_sessoes s
     where s.organizacao_id = p_org and s.dados ? 'iris'
  ),
  atv as (
    select to_char(m.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
           (m.metadados->>'sessao_id')::uuid as sid
      from public.mensagens m
     where m.organizacao_id = p_org
       and m.criado_em >= p_ini and m.criado_em < p_fim
       and m.direcao = 'saida' and m.origem = 'bot'
       and m.metadados->>'fluxo' = 'ia_sdr' and m.metadados ? 'sessao_id'
     group by 1, 2
  ),
  pontos as (
    select a.dia, count(*) as at, 0 as qu, 0 as dc
      from atv a join ses s on s.id = a.sid group by 1
    union all
    select to_char(e.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
           0, count(distinct e.sessao_id), 0
      from public.ia_eventos e
      join ses s on s.id = e.sessao_id
     where e.organizacao_id = p_org and e.criado_em >= p_ini and e.criado_em < p_fim
       and e.tipo = 'financeiras_decisao' and e.detalhe->>'passa' = 'true'
     group by 1
    union all
    select to_char(x.conclusao_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'), 0, 0, count(*)
      from (select greatest((s.docs->'doc_pessoal'->>'atualizado_em')::timestamptz,
                            coalesce((s.docs->'comprovante'->>'validado_em')::timestamptz,
                                     (s.docs->'comprovante'->>'em')::timestamptz)) as conclusao_em
              from ses s
             where (coalesce((s.docs->'doc_pessoal'->>'qtd_fotos')::int, 0) >= 2
                    or (coalesce((s.docs->'doc_pessoal'->>'frente')::boolean, false)
                        and coalesce((s.docs->'doc_pessoal'->>'verso')::boolean, false)))
               and (s.docs ? 'comprovante')
               and (coalesce(s.dados->>'email', '') <> ''
                    or coalesce((s.dados->>'email_a_criar')::boolean, false))) x
     where x.conclusao_em >= p_ini and x.conclusao_em < p_fim
     group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'dia', z.dia, 'atendidas', z.at, 'qualificadas', z.qu, 'docs_completos', z.dc)
           order by z.dia), '[]'::jsonb)
    into v_serie
    from (select p.dia, sum(p.at) as at, sum(p.qu) as qu, sum(p.dc) as dc
            from pontos p group by 1) z;

  -- ------------------ por campanha + etapas (estado) ------------------
  with ses as (
    select s.id, s.criado_em, s.docs, s.dados, s.canal_id, s.etapa
      from public.ia_sessoes s
     where s.organizacao_id = p_org and s.dados ? 'iris'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'campanha', z.camp, 'sessoes', z.n, 'docs_completos', z.dc)
           order by z.n desc, z.camp), '[]'::jsonb)
    into v_camp
    from (
      select public.dash_v5_campanha(s.canal_id) as camp,
             count(*) filter (where s.criado_em >= p_ini and s.criado_em < p_fim) as n,
             count(*) filter (
               where (coalesce((s.docs->'doc_pessoal'->>'qtd_fotos')::int, 0) >= 2
                      or (coalesce((s.docs->'doc_pessoal'->>'frente')::boolean, false)
                          and coalesce((s.docs->'doc_pessoal'->>'verso')::boolean, false)))
                 and (s.docs ? 'comprovante')
                 and (coalesce(s.dados->>'email', '') <> ''
                      or coalesce((s.dados->>'email_a_criar')::boolean, false))
                 and greatest((s.docs->'doc_pessoal'->>'atualizado_em')::timestamptz,
                              coalesce((s.docs->'comprovante'->>'validado_em')::timestamptz,
                                       (s.docs->'comprovante'->>'em')::timestamptz)) >= p_ini
                 and greatest((s.docs->'doc_pessoal'->>'atualizado_em')::timestamptz,
                              coalesce((s.docs->'comprovante'->>'validado_em')::timestamptz,
                                       (s.docs->'comprovante'->>'em')::timestamptz)) < p_fim) as dc
        from ses s
       group by 1
    ) z
   where z.n + z.dc > 0;

  select coalesce(jsonb_object_agg(z.etapa, z.n), '{}'::jsonb)
    into v_etapas
    from (select coalesce(s.etapa, 'sem_etapa') as etapa, count(*) as n
            from public.ia_sessoes s
           where s.organizacao_id = p_org and s.dados ? 'iris'
           group by 1) z;

  return jsonb_build_object(
    'gerado_em',  now(),
    'periodo',    jsonb_build_object('inicio', p_ini, 'fim', p_fim),
    'exatidao_atendidas', 'banda_5pct',
    'funil',      public.dash_v5i_funil(p_org, p_ini, p_fim),
    'funil_ant',  public.dash_v5i_funil(p_org, p_ini_ant, p_fim_ant),
    'faltas',     v_faltas,
    'tempo',      v_tempo,
    'etapas',     v_etapas,
    'por_campanha', v_camp,
    'serie',      v_serie);
end;
$$;

create or replace function public.dashboard_v5_iris(
  p_inicio     timestamptz,
  p_fim        timestamptz,
  p_org        uuid        default null,
  p_inicio_ant timestamptz default null,
  p_fim_ant    timestamptz default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_ini_ant timestamptz;
  v_fim_ant timestamptz;
begin
  v_org := public.dash_v5_abas_portao(p_inicio, p_fim, p_org);
  if p_inicio_ant is not null and p_fim_ant is not null then
    if p_fim_ant <= p_inicio_ant then raise exception 'periodo_anterior_invalido'; end if;
    v_ini_ant := p_inicio_ant; v_fim_ant := p_fim_ant;
  else
    v_ini_ant := p_inicio - (p_fim - p_inicio); v_fim_ant := p_inicio;
  end if;
  return public.dash_v5i_dados(v_org, p_inicio, p_fim, v_ini_ant, v_fim_ant);
end;
$$;


-- ---------------------------------------------------------------- grants
revoke all on function public.dash_v5_abas_portao(timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.dash_v5c_resumo(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.dash_v5c_dados(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.dash_v5a_dados(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.dash_v5i_funil(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.dash_v5i_dados(uuid, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

revoke all on function public.dashboard_v5_campanhas(timestamptz, timestamptz, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_v5_campanhas(timestamptz, timestamptz, uuid, timestamptz, timestamptz) to authenticated, service_role;
revoke all on function public.dashboard_v5_atendentes(timestamptz, timestamptz, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_v5_atendentes(timestamptz, timestamptz, uuid, timestamptz, timestamptz) to authenticated, service_role;
revoke all on function public.dashboard_v5_iris(timestamptz, timestamptz, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_v5_iris(timestamptz, timestamptz, uuid, timestamptz, timestamptz) to authenticated, service_role;
