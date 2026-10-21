-- ============================================================================
-- DASHBOARD v5 (21/10/2026) — o pedido FECHADO do dono, seis itens e nada além:
--   1) entradas de clientes no período (total);
--   2) entradas por número conectado (todos os números ligados aparecem, mesmo com 0,
--      e uma linha "Números antigos" junta o resto);
--   3) não elegíveis, com o motivo e quem marcou (IA, regra automática do RS, equipe);
--   4) fechados e o tempo para fechar (mediana e média), por número e no total;
--   5) avaliação por atendente: recebidos, fechados, não elegíveis marcados, tempo de
--      resposta e tempo para fechar;
--   6) mapa dia × hora das entradas.
-- Contrato: src/data/dashboardV5.tipos.ts (o jsonb sai em snake_case; o front normaliza
-- para camelCase em normalizarDashV5).
--
-- O que esta migration faz:
--   * cria 1 índice pequeno em oportunidades (org, criado_em) — tabela de ~7 mil linhas,
--     o build é instantâneo; IF NOT EXISTS (a v4, que não foi aplicada, previa o mesmo nome);
--   * cria os helpers internos dash_v5_* (SEM grant para anon/authenticated);
--   * cria a RPC pública dashboard_v5 (SECURITY DEFINER, mesmo portão de dashboard_resumo).
-- Só LEITURA: nada aqui grava, envia ou altera objeto existente.
--
-- DEFINIÇÕES (validadas em produção em 21/10 — relatórios rel-canais / rel-atendentes):
--   ENTRADA       = oportunidade criada no período (criado_em), no número de
--                   oportunidades.canal_origem_id. KPI = clientes distintos (contato_id).
--                   O número interno do escritório (51 8160-2825) fica fora de tudo.
--   NÚMEROS       = canais ativo, status_integracao 'conectado', tipo 'whatsapp' e papel
--                   diferente de 'notificacao' — SEMPRE listados. Qualquer outro canal
--                   (removido, inativo, desconectado) ou canal_origem_id nulo cai em UMA
--                   linha "Números antigos" (canal_id null, situacao 'antigo'), só quando
--                   ela tem movimento no período.
--   NÃO ELEGÍVEL  = status 'perdido' e motivo_perda em dashboard_motivos_descarte(), com
--                   fechado_em no período (estado ATUAL). Motivo = motivo_nao_elegivel
--                   (nulo → 'sem_categoria'). Quem marcou: fechado_por_id preenchido →
--                   'equipe'; nulo, motivo 'nao_mora_rs' e marcado < 1 min depois da
--                   entrada → 'regra_rs' (trigger do DDD fora do RS); senão → 'ia'.
--   FECHADO       = status 'ganho' com fechado_em no período (todos contam).
--   TEMPO P/ FECHAR = fechado_em − criado_em dos fechados com fechado_em >= criado_em, sem
--                   fechado_em_estimado e criado a partir de 01/08 (antes disso houve
--                   backfill). Mediana é o número principal; média e n acompanham. Horas.
--   ATENDENTES    = membros ativos da org com qualquer movimento no período:
--                   recebidos   = contatos distintos em bot_roteamentos (rodízio);
--                   transferidos = leads passados para ele (audit_log sync_responsavel_cliente
--                                 com dono antes e depois, diferentes) — só informativo;
--                   fechados    = ganhos creditados a coalesce(responsavel_no_fechamento_id,
--                                 fechado_por_id);
--                   ne_marcados = não elegíveis com fechado_por_id = ele;
--                   resposta    = por VEZ DO CLIENTE (1ª entrada de uma rajada) até a 1ª
--                                 saída seguinte, que só conta se for HUMANA (origem atenvo
--                                 ou telefone, sem agendamento de automação). Crédito ao
--                                 autor; resposta pelo celular (origem telefone, sem autor)
--                                 vai para o dono do card (contatos.responsavel_id).
--                                 Minutos ÚTEIS: seg–sex, 9h–19h de São Paulo. Vezes cujo
--                                 início está no período.
--                   tempo p/ fechar = fechado_em − max(criado_em, 1ª atribuição do contato a
--                                 ele no audit_log), mesmos filtros de qualidade acima.
--   MAPA          = entradas por data e hora de São Paulo em [p_mapa_inicio, p_fim)
--                   (p_mapa_inicio nulo = p_inicio). Só células com entrada; o front
--                   completa os zeros e, acima de 14 dias, agrega por dia da semana.
--
-- VALIDAÇÃO (produção, begin … rollback, 21/10 ~17:30, sem nenhum índice novo):
--   hoje   : 127 entradas (EMPRESTIMO 82 · JUROS 30 · ANTONIO 15), 79 NE, 5 fechados;
--   7 dias : 927 entradas, 486 NE (IA 293 · regra RS 40 · equipe 153), 25 fechados,
--            mediana 2,2 d (EMPRESTIMO 26,9 h · JUROS 4,75 d);
--   mês CAF: 1.489 clientes, 729 NE (IA 484 · regra RS 59 · equipe 186), 29 fechados.
--   EXPLAIN ANALYZE de dash_v5_dados: 7 dias ≈ 245–290 ms; mês CAF ≈ 355–375 ms.
-- O tempo de resposta lê mensagens por org + criado_em: 20261021200100_idx_mensagens_org_criado.sql
-- impede que o custo cresça com o histórico (aplicar ao vivo, CONCURRENTLY, fora de transação).
-- ============================================================================


-- ---------------------------------------------------------------- 1) índice
create index if not exists idx_oport_org_criado
  on public.oportunidades (organizacao_id, criado_em);


-- ---------------------------------------------------------------- 2) helpers
-- Os helpers SQL simples NÃO têm SET search_path de propósito: assim o planner embute
-- (inline) o corpo na consulta de quem chama, com os valores reais do período. Por isso
-- toda referência é qualificada com public. Nenhum é SECURITY DEFINER e nenhum tem
-- grant para anon/authenticated: só rodam dentro da RPC (que roda como dona).

-- número interno do escritório (51 8160-2825, com ou sem nono dígito) — igual ao v4
create or replace function public.dash_v5_interno(p_tel text)
returns boolean
language sql immutable parallel safe
as $$
  select regexp_replace(coalesce(p_tel, ''), '\D', '', 'g') ~ '8?1602825$'
$$;

-- ENTRADAS: uma linha por oportunidade criada em [p_ini, p_fim)
create or replace function public.dash_v5_entradas(p_org uuid, p_ini timestamptz, p_fim timestamptz)
returns table (oportunidade_id uuid, contato_id uuid, canal_origem_id uuid, criado_em timestamptz)
language sql stable
as $$
  select o.id, o.contato_id, o.canal_origem_id, o.criado_em
    from public.oportunidades o
    left join public.contatos ct on ct.id = o.contato_id
   where o.organizacao_id = p_org
     and o.criado_em >= p_ini and o.criado_em < p_fim
     and not public.dash_v5_interno(coalesce(ct.telefone, o.telefone))
$$;

-- FECHAMENTOS: uma linha por oportunidade ganha ou não elegível com fechado_em em
-- [p_ini, p_fim), no estado atual. tipo 'ganho' | 'ne'. horas = duração válida para o
-- "tempo para fechar" (null quando não é ganho ou não passa nos filtros de qualidade).
create or replace function public.dash_v5_fechamentos(p_org uuid, p_ini timestamptz, p_fim timestamptz)
returns table (
  oportunidade_id uuid, contato_id uuid, canal_origem_id uuid,
  tipo text, motivo text, quem text,
  fechado_por_id uuid, credito_id uuid,
  criado_em timestamptz, fechado_em timestamptz, horas double precision)
language sql stable
as $$
  select o.id, o.contato_id, o.canal_origem_id,
         case when o.status = 'ganho' then 'ganho' else 'ne' end,
         case when o.status = 'ganho' then null else coalesce(o.motivo_nao_elegivel, 'sem_categoria') end,
         case when o.status = 'ganho' then null
              when o.fechado_por_id is not null then 'equipe'
              when o.motivo_nao_elegivel = 'nao_mora_rs'
               and o.fechado_em - o.criado_em < interval '1 minute' then 'regra_rs'
              else 'ia' end,
         o.fechado_por_id,
         case when o.status = 'ganho' then coalesce(o.responsavel_no_fechamento_id, o.fechado_por_id) end,
         o.criado_em, o.fechado_em,
         case when o.status = 'ganho'
               and o.fechado_em >= o.criado_em
               and not coalesce(o.fechado_em_estimado, false)
               and o.criado_em >= timestamptz '2026-08-01 00:00-03'
              then (extract(epoch from o.fechado_em - o.criado_em) / 3600.0)::double precision end
    from public.oportunidades o
    left join public.contatos ct on ct.id = o.contato_id
   where o.organizacao_id = p_org
     and o.fechado_em >= p_ini and o.fechado_em < p_fim
     and (o.status = 'ganho'
          or (o.status = 'perdido'
              and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())))
     and not public.dash_v5_interno(coalesce(ct.telefone, o.telefone))
$$;

-- KPIs de um período (o atual e o anterior usam EXATAMENTE a mesma conta)
create or replace function public.dash_v5_kpis(p_org uuid, p_ini timestamptz, p_fim timestamptz)
returns jsonb
language plpgsql stable
set search_path = public
as $$
begin
  return (
    select jsonb_build_object(
             'entradas', (select count(distinct coalesce(e.contato_id, e.oportunidade_id))
                            from public.dash_v5_entradas(p_org, p_ini, p_fim) e),
             'ne',             f.ne,
             'ganhos',         f.ganhos,
             'fech_mediana_h', round(f.med::numeric, 3),
             'fech_media_h',   round(f.media::numeric, 3),
             'fech_n',         f.n)
      from (select count(*) filter (where x.tipo = 'ne')    as ne,
                   count(*) filter (where x.tipo = 'ganho') as ganhos,
                   percentile_cont(0.5) within group (order by x.horas) as med,  -- nulos ficam fora
                   avg(x.horas)   as media,
                   count(x.horas) as n
              from public.dash_v5_fechamentos(p_org, p_ini, p_fim) x) f
  );
end;
$$;

-- CORPO do dashboard (sem portão de acesso: quem chama é a RPC, que já validou).
create or replace function public.dash_v5_dados(
  p_org uuid, p_inicio timestamptz, p_fim timestamptz,
  p_ini_ant timestamptz, p_fim_ant timestamptz, p_mapa_ini timestamptz)
returns jsonb
language plpgsql stable
set search_path = public
as $$
declare
  v_canais     jsonb;
  v_ne         jsonb;
  v_atendentes jsonb;
  v_mapa       jsonb;
begin
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
           'entradas',       coalesce(en.n, 0),
           'ne',             coalesce(fk.ne, 0),
           'ne_motivos',     coalesce(fm.motivos, '{}'::jsonb),
           'ganhos',         coalesce(fk.ganhos, 0),
           'fech_mediana_h', round(fk.med::numeric, 3),
           'fech_media_h',   round(fk.media::numeric, 3),
           'fech_n',         coalesce(fk.n, 0))
         order by (l.situacao = 'antigo'), coalesce(en.n, 0) desc, coalesce(fk.ganhos, 0) desc, l.nome), '[]'::jsonb)
    into v_canais
    from linhas l
    left join ent en on en.k is not distinct from l.canal_id
    left join fk     on fk.k is not distinct from l.canal_id
    left join fm     on fm.k is not distinct from l.canal_id
   where l.situacao = 'conectado'
      or coalesce(en.n, 0) + coalesce(fk.ne, 0) + coalesce(fk.ganhos, 0) > 0;

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
  -- fechados e o tempo para fechar de cada um (relógio a partir da atribuição a ele)
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
       and mm.criado_em >= p_inicio - interval '1 day' and mm.criado_em < p_fim
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
  select coalesce(jsonb_agg(jsonb_build_object('dia', z.dia, 'hora', z.hora, 'entradas', z.n)
                            order by z.dia, z.hora), '[]'::jsonb)
    into v_mapa
    from (select to_char(e.criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as dia,
                 extract(hour from e.criado_em at time zone 'America/Sao_Paulo')::int as hora,
                 count(*) as n
            from public.dash_v5_entradas(p_org, p_mapa_ini, p_fim) e
           group by 1, 2) z;

  return jsonb_build_object(
    'gerado_em',     now(),
    'periodo',       jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'mapa_inicio', p_mapa_ini),
    'kpis',          public.dash_v5_kpis(p_org, p_inicio, p_fim),
    'kpis_anterior', case when p_ini_ant is not null and p_fim_ant is not null
                          then public.dash_v5_kpis(p_org, p_ini_ant, p_fim_ant) end,
    'canais',        v_canais,
    'ne',            v_ne,
    'atendentes',    v_atendentes,
    'mapa',          v_mapa);
end;
$$;


-- ---------------------------------------------------------------- 3) RPC pública
create or replace function public.dashboard_v5(
  p_inicio      timestamptz,
  p_fim         timestamptz,
  p_org         uuid        default null,
  p_inicio_ant  timestamptz default null,
  p_fim_ant     timestamptz default null,
  p_mapa_inicio timestamptz default null
)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_org     uuid;
  v_dur     interval;
  v_ini_ant timestamptz;
  v_fim_ant timestamptz;
  v_mapa    timestamptz;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'periodo_invalido';
  end if;
  -- teto de segurança: o tempo de resposta lê as mensagens do período inteiro
  if p_fim - p_inicio > interval '93 days' then
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
  if v_mapa >= p_fim or p_fim - v_mapa > interval '93 days' then
    raise exception 'periodo_mapa_invalido';
  end if;

  return public.dash_v5_dados(v_org, p_inicio, p_fim, v_ini_ant, v_fim_ant, v_mapa);
end;
$$;


-- ---------------------------------------------------------------- 4) grants
revoke all on function public.dash_v5_interno(text) from public, anon, authenticated;
revoke all on function public.dash_v5_entradas(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.dash_v5_fechamentos(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.dash_v5_kpis(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.dash_v5_dados(uuid, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;

revoke all on function public.dashboard_v5(timestamptz, timestamptz, uuid, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_v5(timestamptz, timestamptz, uuid, timestamptz, timestamptz, timestamptz) to authenticated, service_role;
