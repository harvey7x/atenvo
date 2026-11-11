-- =====================================================================
-- Não elegível COM MOTIVO + dashboard_resumo v4 (período anterior exato,
-- motivos do descarte e comparativo de tráfego) — pedido do dono 10/09.
--
-- 1) oportunidades.motivo_nao_elegivel: o PORQUÊ do descarte, em 3
--    categorias fixas: sem_beneficio_inss | muitos_processos | sem_interesse.
--    (null = registro antigo ou descarte do bot sem categoria.)
-- 2) opp_sync_fechamento: o sub-motivo segue o ciclo do motivo_perda
--    (ganho/reabertura limpam; perda que não é descarte também limpa).
-- 3) oportunidade_nao_elegivel(p_conversa, p_motivo): RPC do bot ganha o
--    parâmetro opcional (edge antiga chamando com 1 arg continua válida).
-- 4) dashboard_resumo(p_inicio, p_fim, p_org, p_inicio_ant, p_fim_ant):
--    o front passa o período anterior EXATO (mês 10→10 tem duração
--    diferente do anterior; o deslocamento por duração erraria 1 dia).
--    Blocos novos: descarte_motivos(+_anterior) e trafego(+_anterior),
--    tráfego SEMPRE por oportunidades.canal_origem_id (linhagem correta).
-- =====================================================================

-- 1) coluna do sub-motivo -------------------------------------------------
alter table public.oportunidades add column if not exists motivo_nao_elegivel text;
alter table public.oportunidades drop constraint if exists oportunidades_motivo_nao_elegivel_chk;
alter table public.oportunidades add constraint oportunidades_motivo_nao_elegivel_chk
  check (motivo_nao_elegivel is null or motivo_nao_elegivel in ('sem_beneficio_inss','muitos_processos','sem_interesse'));

-- 2) ciclo de vida no trigger de fechamento -------------------------------
create or replace function public.opp_sync_fechamento()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_novo text; v_antigo text; v_uid uuid := auth.uid();
begin
  if NEW.coluna_id is not distinct from OLD.coluna_id then return NEW; end if;
  select coalesce(resultado,'neutro') into v_novo from public.funil_colunas where id = NEW.coluna_id;
  select coalesce(resultado,'neutro') into v_antigo from public.funil_colunas where id = OLD.coluna_id;
  v_novo := coalesce(v_novo,'neutro'); v_antigo := coalesce(v_antigo,'neutro');
  if v_novo = v_antigo then return NEW; end if;
  if v_novo = 'ganho' then
    NEW.status := 'ganho'; NEW.fechado_em := coalesce(NEW.fechado_em, now()); NEW.fechado_por_id := coalesce(NEW.fechado_por_id, v_uid);
    NEW.responsavel_no_fechamento_id := NEW.responsavel_id; NEW.motivo_perda := null; NEW.motivo_perda_desc := null;
    NEW.motivo_nao_elegivel := null;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,responsavel_no_fechamento_id,executado_por)
      values (NEW.organizacao_id,NEW.id,'ganho',OLD.coluna_id,NEW.coluna_id,OLD.status,'ganho',v_antigo,'ganho',NEW.responsavel_id,v_uid);
  elsif v_novo = 'perdido' then
    if NEW.motivo_perda is null then raise exception 'motivo_perda_obrigatorio' using errcode='check_violation'; end if;
    if NEW.motivo_perda='outro' and coalesce(btrim(NEW.motivo_perda_desc),'')='' then raise exception 'motivo_perda_desc_obrigatorio' using errcode='check_violation'; end if;
    if NEW.motivo_perda is distinct from 'nao_elegivel' then NEW.motivo_nao_elegivel := null; end if;
    NEW.status := 'perdido'; NEW.fechado_em := coalesce(NEW.fechado_em, now()); NEW.fechado_por_id := coalesce(NEW.fechado_por_id, v_uid);
    NEW.responsavel_no_fechamento_id := NEW.responsavel_id;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,motivo_perda,responsavel_no_fechamento_id,executado_por)
      values (NEW.organizacao_id,NEW.id,'perdido',OLD.coluna_id,NEW.coluna_id,OLD.status,'perdido',v_antigo,'perdido',NEW.motivo_perda,NEW.responsavel_id,v_uid);
  elsif v_antigo in ('ganho','perdido') and v_novo = 'neutro' then
    if coalesce(btrim(NEW.motivo_reabertura),'')='' then raise exception 'motivo_reabertura_obrigatorio' using errcode='check_violation'; end if;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,motivo_reabertura,executado_por)
      values (NEW.organizacao_id,NEW.id,'reaberto',OLD.coluna_id,NEW.coluna_id,OLD.status,'em_andamento',v_antigo,'neutro',NEW.motivo_reabertura,v_uid);
    NEW.status := 'em_andamento'; NEW.fechado_em := null; NEW.fechado_por_id := null; NEW.responsavel_no_fechamento_id := null;
    NEW.motivo_perda := null; NEW.motivo_perda_desc := null; NEW.motivo_reabertura := null;
    NEW.motivo_nao_elegivel := null;
  end if;
  return NEW;
end $function$;

-- 3) RPC do bot: aceita o motivo (opcional; edge antiga segue funcionando) --
drop function if exists public.oportunidade_nao_elegivel(uuid);
create or replace function public.oportunidade_nao_elegivel(p_conversa uuid, p_motivo text default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org uuid; v_contato uuid; v_col uuid;
begin
  if p_motivo is not null and p_motivo not in ('sem_beneficio_inss','muitos_processos','sem_interesse') then
    raise exception 'motivo_nao_elegivel_invalido' using errcode='check_violation';
  end if;

  select organizacao_id, contato_id into v_org, v_contato
    from public.conversas where id = p_conversa;
  if v_contato is null or v_org is null then return; end if;

  select id into v_col
    from public.funil_colunas
    where organizacao_id = v_org
      and resultado = 'perdido'
      and coalesce(arquivada, false) = false
    order by ordem
    limit 1;
  if v_col is null then return; end if;

  update public.oportunidades o
     set coluna_id = v_col,
         motivo_perda = 'nao_elegivel',
         motivo_nao_elegivel = p_motivo,
         etiquetas = case
           when 'nao_elegivel' = any (coalesce(o.etiquetas, '{}'::text[])) then o.etiquetas
           else array_append(coalesce(o.etiquetas, '{}'::text[]), 'nao_elegivel')
         end
   where o.contato_id = v_contato
     and o.organizacao_id = v_org
     and o.status = 'em_andamento';
end $function$;

revoke all on function public.oportunidade_nao_elegivel(uuid, text) from public, anon, authenticated;
grant execute on function public.oportunidade_nao_elegivel(uuid, text) to service_role;

-- 4) helpers dos blocos novos (internos: SEM grant a authenticated — rodam
--    por dentro de dashboard_resumo; ninguém os chama direto pelo PostgREST)

-- 4a) motivos do descarte no intervalo (estado atual das opps, por fechado_em)
create or replace function public.dashboard_descarte_motivos_periodo(p_org uuid, p_ini timestamptz, p_fim timestamptz)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('motivo', t.motivo, 'qtd', t.qtd) order by t.qtd desc, t.motivo), '[]'::jsonb)
  from (
    select coalesce(o.motivo_nao_elegivel, 'sem_categoria') as motivo, count(*) as qtd
    from public.oportunidades o
    where o.organizacao_id = p_org
      and o.status = 'perdido'
      and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
      and o.fechado_em >= p_ini and o.fechado_em < p_fim
    group by 1
  ) t
$function$;

revoke all on function public.dashboard_descarte_motivos_periodo(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- 4b) tráfego por conexão de aquisição da OPORTUNIDADE (canal_origem_id):
--     entradas por criado_em; fechamentos por fechado_em (padrão do resto).
--     "atendidas" = leads do período cuja conversa de origem tem >=1 resposta
--     humana do painel (origem <> 'bot' E autor_id preenchido), a qualquer tempo.
create or replace function public.dashboard_trafego_periodo(p_org uuid, p_ini timestamptz, p_fim timestamptz)
 returns jsonb
 language sql
 stable
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(to_jsonb(t.*) order by t.leads desc, t.canal), '[]'::jsonb)
  from (
    select
      o.canal_origem_id as canal_id,
      coalesce(ca.nome_interno, 'Sem conexão') as canal,
      count(*) filter (where o.criado_em >= p_ini and o.criado_em < p_fim) as leads,
      count(*) filter (where o.criado_em >= p_ini and o.criado_em < p_fim
        and exists (select 1 from public.mensagens ms
                     where ms.conversa_id = o.conversa_origem_id
                       and ms.direcao = 'saida'
                       and ms.autor_id is not null
                       and ms.origem is distinct from 'bot')) as atendidas,
      count(*) filter (where o.criado_em >= p_ini and o.criado_em < p_fim and o.status = 'em_andamento') as em_andamento,
      count(*) filter (where o.status = 'ganho' and o.fechado_em >= p_ini and o.fechado_em < p_fim) as ganhos,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and not (coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte()))) as perdas,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())) as descartes,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
        and o.motivo_nao_elegivel = 'sem_beneficio_inss') as ne_sem_beneficio_inss,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
        and o.motivo_nao_elegivel = 'muitos_processos') as ne_muitos_processos,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
        and o.motivo_nao_elegivel = 'sem_interesse') as ne_sem_interesse,
      count(*) filter (where o.status = 'perdido' and o.fechado_em >= p_ini and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
        and o.motivo_nao_elegivel is null) as ne_sem_categoria
    from public.oportunidades o
    left join public.canais ca on ca.id = o.canal_origem_id
    where o.organizacao_id = p_org
      and ((o.criado_em >= p_ini and o.criado_em < p_fim)
        or (o.fechado_em is not null and o.fechado_em >= p_ini and o.fechado_em < p_fim))
    group by 1, 2
  ) t
$function$;

revoke all on function public.dashboard_trafego_periodo(uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- 5) dashboard_resumo v4 ----------------------------------------------------
drop function if exists public.dashboard_resumo(timestamptz, timestamptz, uuid);
create or replace function public.dashboard_resumo(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_org uuid default null,
  p_inicio_ant timestamptz default null,
  p_fim_ant timestamptz default null
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_org      uuid;
  v_dur      interval;
  v_ini_ant  timestamptz;
  v_fim_ant  timestamptz;
  v_tz       text := 'America/Sao_Paulo';
  v_desc     text[] := public.dashboard_motivos_descarte();
  v_out      jsonb;
begin
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    raise exception 'periodo_invalido';
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

  v_dur := p_fim - p_inicio;
  -- período anterior: o EXATO informado pelo front (mês 10→10 tem duração
  -- própria), ou o deslocamento por duração quando nada vier (compatível).
  if p_inicio_ant is not null and p_fim_ant is not null then
    if p_fim_ant <= p_inicio_ant then raise exception 'periodo_anterior_invalido'; end if;
    v_ini_ant := p_inicio_ant; v_fim_ant := p_fim_ant;
  else
    v_ini_ant := p_inicio - v_dur; v_fim_ant := p_inicio;
  end if;

  select jsonb_build_object(

    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'periodo_anterior', jsonb_build_object('inicio', v_ini_ant, 'fim', v_fim_ant),
    'motivos_descarte', to_jsonb(v_desc),

    'kpis',          public.dashboard_kpis_periodo(v_org, p_inicio, p_fim),
    'kpis_anterior', public.dashboard_kpis_periodo(v_org, v_ini_ant, v_fim_ant),

    'leads_por_dia', (
      select coalesce(jsonb_agg(
               jsonb_build_object('dia', d.dia, 'qtd', coalesce(x.qtd, 0))
               order by d.dia), '[]'::jsonb)
      from (
        select generate_series(
                 date_trunc('day', p_inicio at time zone v_tz),
                 date_trunc('day', (p_fim - interval '1 microsecond') at time zone v_tz),
                 interval '1 day')::date as dia
      ) d
      left join (
        select date_trunc('day', c.criado_em at time zone v_tz)::date as dia, count(*) as qtd
        from public.contatos c
        where c.organizacao_id = v_org and c.mesclado_para is null
          and c.criado_em >= p_inicio and c.criado_em < p_fim
        group by 1
      ) x on x.dia = d.dia
    ),

    'origem_trafego', (
      select coalesce(jsonb_agg(
               jsonb_build_object('fonte', t.fonte, 'canal', t.canal, 'qtd', t.qtd)
               order by t.qtd desc, t.fonte, t.canal), '[]'::jsonb)
      from (
        select
          coalesce(
            f.nome,
            c.canal_origem_snapshot->>'fonte_nome',
            case when c.origem like 'import%' then 'Importação' else 'Sem fonte' end
          ) as fonte,
          coalesce(ca.nome_interno, 'Sem canal') as canal,
          count(*) as qtd
        from public.contatos c
        left join public.canais ca            on ca.id = c.canal_origem_id
        left join public.fontes_aquisicao f   on f.id  = ca.fonte_aquisicao_id
        where c.organizacao_id = v_org and c.mesclado_para is null
          and c.criado_em >= p_inicio and c.criado_em < p_fim
        group by 1, 2
      ) t
    ),

    'funil', (
      select coalesce(jsonb_agg(
               jsonb_build_object('coluna', fc.nome, 'ordem', fc.ordem,
                                  'resultado', fc.resultado, 'qtd', q.qtd,
                                  'qtd_perda', q.qtd_perda, 'qtd_descarte', q.qtd_descarte)
               order by fc.ordem), '[]'::jsonb)
      from public.funil_colunas fc
      cross join lateral (
        select
          count(*) as qtd,
          count(*) filter (
            where fc.resultado = 'perdido'
              and not (coalesce(o.motivo_perda, '') = any (v_desc))
          ) as qtd_perda,
          count(*) filter (
            where fc.resultado = 'perdido'
              and coalesce(o.motivo_perda, '') = any (v_desc)
          ) as qtd_descarte
        from public.oportunidades o
        where o.organizacao_id = v_org and o.coluna_id = fc.id
          and (fc.resultado = 'neutro'
               or (o.fechado_em >= p_inicio and o.fechado_em < p_fim))
      ) q
      where fc.organizacao_id = v_org and fc.arquivada = false
    ),

    'atendentes', (
      select coalesce(jsonb_agg(
               jsonb_build_object(
                 'nome', u.nome,
                 'conversas_atribuidas', m.conversas_atribuidas,
                 'msgs_enviadas',        m.msgs_enviadas,
                 'mediana_resposta_min', m.mediana_resposta_min,
                 'ganhos',               m.ganhos,
                 'perdidos',             m.perdidos,
                 'descartados',          m.descartados)
               order by m.ganhos desc, m.msgs_enviadas desc, u.nome), '[]'::jsonb)
      from public.usuarios u
      join public.organizacao_usuarios ou
        on ou.usuario_id = u.id and ou.organizacao_id = v_org and ou.status = 'ativo'
      cross join lateral (
        select
          (select count(*) from public.conversas cv
            where cv.organizacao_id = v_org and cv.atendente_id = u.id
              and cv.criado_em >= p_inicio and cv.criado_em < p_fim
          ) as conversas_atribuidas,
          (select count(*) from public.mensagens ms
            where ms.organizacao_id = v_org and ms.direcao = 'saida'
              and ms.autor_id = u.id and ms.origem is distinct from 'bot'
              and ms.criado_em >= p_inicio and ms.criado_em < p_fim
          ) as msgs_enviadas,
          (select round(
             percentile_cont(0.5) within group (
               order by extract(epoch from (pa.t1 - pa.t0)) / 60.0
             )::numeric, 1)
           from (
             select t0.t0, t1.t1
             from public.conversas cv
             cross join lateral (
               select min(ms.criado_em) as t0
               from public.mensagens ms
               where ms.conversa_id = cv.id and ms.direcao = 'entrada'
             ) t0
             cross join lateral (
               select min(ms.criado_em) as t1
               from public.mensagens ms
               where ms.conversa_id = cv.id and ms.direcao = 'saida'
                 and ms.autor_id = u.id and ms.origem is distinct from 'bot'
                 and t0.t0 is not null and ms.criado_em > t0.t0
             ) t1
             where cv.organizacao_id = v_org
               and cv.criado_em >= p_inicio and cv.criado_em < p_fim
           ) pa
           where pa.t0 is not null and pa.t1 is not null
          ) as mediana_resposta_min,
          (select count(*) from public.oportunidade_eventos oe
            where oe.organizacao_id = v_org and oe.evento = 'ganho'
              and oe.responsavel_no_fechamento_id = u.id
              and oe.criado_em >= p_inicio and oe.criado_em < p_fim
          ) as ganhos,
          (select count(*) from public.oportunidade_eventos oe
            where oe.organizacao_id = v_org and oe.evento = 'perdido'
              and oe.responsavel_no_fechamento_id = u.id
              and oe.criado_em >= p_inicio and oe.criado_em < p_fim
              and not (coalesce(oe.motivo_perda, '') = any (v_desc))
          ) as perdidos,
          (select count(*) from public.oportunidade_eventos oe
            where oe.organizacao_id = v_org and oe.evento = 'perdido'
              and oe.responsavel_no_fechamento_id = u.id
              and oe.criado_em >= p_inicio and oe.criado_em < p_fim
              and coalesce(oe.motivo_perda, '') = any (v_desc)
          ) as descartados
      ) m
      where u.ativo = true
    ),

    'picos_hora', (
      select coalesce(jsonb_agg(
               jsonb_build_object('hora', h.hora, 'qtd', coalesce(x.qtd, 0))
               order by h.hora), '[]'::jsonb)
      from generate_series(0, 23) as h(hora)
      left join (
        select extract(hour from (ms.criado_em at time zone v_tz))::int as hora, count(*) as qtd
        from public.mensagens ms
        where ms.organizacao_id = v_org and ms.direcao = 'entrada'
          and ms.criado_em >= p_inicio and ms.criado_em < p_fim
        group by 1
      ) x on x.hora = h.hora
    ),

    'motivos_perda', (
      select coalesce(jsonb_agg(
               jsonb_build_object('motivo', t.motivo, 'qtd', t.qtd, 'grupo', t.grupo)
               order by t.qtd desc, t.motivo), '[]'::jsonb)
      from (
        select coalesce(nullif(btrim(oe.motivo_perda), ''), 'Sem motivo') as motivo,
               case when coalesce(oe.motivo_perda, '') = any (v_desc) then 'descarte' else 'perda' end as grupo,
               count(*) as qtd
        from public.oportunidade_eventos oe
        where oe.organizacao_id = v_org and oe.evento = 'perdido'
          and oe.criado_em >= p_inicio and oe.criado_em < p_fim
        group by 1, 2
      ) t
    ),

    'descarte_motivos',          public.dashboard_descarte_motivos_periodo(v_org, p_inicio, p_fim),
    'descarte_motivos_anterior', public.dashboard_descarte_motivos_periodo(v_org, v_ini_ant, v_fim_ant),

    'trafego',          public.dashboard_trafego_periodo(v_org, p_inicio, p_fim),
    'trafego_anterior', public.dashboard_trafego_periodo(v_org, v_ini_ant, v_fim_ant),

    'bancos', (
      select coalesce(jsonb_agg(
               jsonb_build_object('banco', t.banco, 'qtd', t.qtd)
               order by t.qtd desc, t.banco), '[]'::jsonb)
      from (
        select fj.banco_nome as banco, count(*) as qtd
        from public.fichas_judiciais fj
        where fj.organizacao_id = v_org
          and nullif(btrim(fj.banco_nome), '') is not null
          and fj.criado_em >= p_inicio and fj.criado_em < p_fim
        group by 1
        order by count(*) desc, fj.banco_nome
        limit 8
      ) t
    )

  ) into v_out;

  return v_out;
end;
$function$;

revoke all on function public.dashboard_resumo(timestamptz, timestamptz, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.dashboard_resumo(timestamptz, timestamptz, uuid, timestamptz, timestamptz) to authenticated, service_role;
