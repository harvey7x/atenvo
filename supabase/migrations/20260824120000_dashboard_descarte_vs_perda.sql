-- Dashboard: separa DESCARTE de PERDA (decisão do dono, 24/08).
--
-- Problema: "Já tem processo" é a ÚNICA coluna com resultado='perdido' no
-- funil, então TODO fechamento negativo cai nela — independente do motivo.
-- Medido no histórico: nao_elegivel 31 · sem_interesse 34 · concorrente 17 ·
-- dados_invalidos 16 · nao_respondeu 3 · outro 2. Chamar tudo isso de "perda"
-- mistura quem nunca foi ganhável com quem escapou.
--
-- Regra nova: quem sai por motivo de INELEGIBILIDADE é DESCARTE, não perda.
-- O corte é pelo MOTIVO, nunca pela coluna (a coluna é balde único).
--
-- Onde mudar a régua: public.dashboard_motivos_descarte() — lista única,
-- consumida pelos KPIs, pelo funil, pela tabela de atendentes e pelos motivos.

create or replace function public.dashboard_motivos_descarte()
returns text[]
language sql
immutable
as $$
  -- 'nao_elegivel' = fora do perfil (é onde cai "já tem processo", que no texto
  -- livre aparece uma vez literalmente). NÃO inclui 'concorrente': ali houve
  -- disputa e ela foi perdida — é perda de verdade, não descarte.
  select array['nao_elegivel']::text[];
$$;

comment on function public.dashboard_motivos_descarte() is
  'Motivos de saída que contam como DESCARTE (fora do perfil), não como perda. Régua única do Dashboard.';


create or replace function public.dashboard_kpis_periodo(
  p_org    uuid,
  p_inicio timestamptz,
  p_fim    timestamptz
) returns jsonb
language sql
stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'novos_leads', (
      select count(*) from public.contatos c
      where c.organizacao_id = p_org and c.mesclado_para is null
        and c.criado_em >= p_inicio and c.criado_em < p_fim
    ),
    'conversas_ativas', (
      select count(distinct m.conversa_id) from public.mensagens m
      where m.organizacao_id = p_org
        and m.criado_em >= p_inicio and m.criado_em < p_fim
    ),
    'mediana_primeira_resposta_min', (
      select round(
        percentile_cont(0.5) within group (
          order by extract(epoch from (pr.t1 - pr.t0)) / 60.0
        )::numeric, 1)
      from (
        select t0.t0, t1.t1
        from public.conversas cv
        cross join lateral (
          select min(m.criado_em) as t0
          from public.mensagens m
          where m.conversa_id = cv.id and m.direcao = 'entrada'
        ) t0
        cross join lateral (
          select min(m.criado_em) as t1
          from public.mensagens m
          where m.conversa_id = cv.id and m.direcao = 'saida'
            and m.origem is distinct from 'bot'
            and t0.t0 is not null and m.criado_em > t0.t0
        ) t1
        where cv.organizacao_id = p_org
          and cv.criado_em >= p_inicio and cv.criado_em < p_fim
      ) pr
      where pr.t0 is not null and pr.t1 is not null
    ),
    'ganhos_qtd', (
      select count(*) from public.oportunidades o
      where o.organizacao_id = p_org and o.status = 'ganho'
        and o.fechado_em >= p_inicio and o.fechado_em < p_fim
    ),
    'ganhos_valor', (
      select coalesce(sum(coalesce(o.valor_ressarcido, o.valor_ressarcimento_estimado)), 0)
      from public.oportunidades o
      where o.organizacao_id = p_org and o.status = 'ganho'
        and o.fechado_em >= p_inicio and o.fechado_em < p_fim
    ),
    -- perda REAL: era ganhável e escapou. Motivo nulo cai aqui de propósito —
    -- descarte precisa ser afirmado, nunca presumido por ausência de motivo.
    'perdidos_qtd', (
      select count(*) from public.oportunidades o
      where o.organizacao_id = p_org and o.status = 'perdido'
        and o.fechado_em >= p_inicio and o.fechado_em < p_fim
        and not (coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte()))
    ),
    'descartados_qtd', (
      select count(*) from public.oportunidades o
      where o.organizacao_id = p_org and o.status = 'perdido'
        and o.fechado_em >= p_inicio and o.fechado_em < p_fim
        and coalesce(o.motivo_perda, '') = any (public.dashboard_motivos_descarte())
    )
  );
$$;

comment on function public.dashboard_kpis_periodo(uuid, timestamptz, timestamptz) is
  'Interno do dashboard_resumo (período atual e anterior). Sem checagem de auth própria: só o definer chama.';

revoke all on function public.dashboard_kpis_periodo(uuid, timestamptz, timestamptz) from public, anon, authenticated;


create or replace function public.dashboard_resumo(
  p_inicio timestamptz,
  p_fim    timestamptz,
  p_org    uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
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

  v_dur     := p_fim - p_inicio;
  v_ini_ant := p_inicio - v_dur;
  v_fim_ant := p_inicio;

  select jsonb_build_object(

    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
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

    -- funil: a coluna terminal negativa vem QUEBRADA em perda × descarte,
    -- porque ela é balde único — a barra empilhada mostra os dois pesos.
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

    -- motivos de SAÍDA: continua listando tudo, agora com o grupo declarado —
    -- esconder o descarte da lista seria trocar uma mentira por outra.
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
$$;

comment on function public.dashboard_resumo(timestamptz, timestamptz, uuid) is
  'Agregado único da tela /dashboard por período. p_org opcional: sem ele, usa a org ativa do usuário. Resposta humana = saída com origem <> ''bot''. Saída negativa vem separada em perda × descarte (ver dashboard_motivos_descarte).';

grant execute on function public.dashboard_resumo(timestamptz, timestamptz, uuid) to authenticated;
