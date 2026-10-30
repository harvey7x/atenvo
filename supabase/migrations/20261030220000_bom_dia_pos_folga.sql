-- =============================================================================
-- BOM DIA PÓS-FOLGA (pedido do dono 30/10: "na terça-feira quero que a mensagem da IA fale sobre o
-- final de semana e o feriado, fale que espere que o final de semana tenha sido bom, e fale os dados do
-- sistema"). Segunda 02/11/2026 é Finados: terça é o 1º dia útil depois de sábado, domingo e feriado.
-- Regra geral (vale para toda folga): feriados = dash_v5s_feriados() (a lista do Dashboard).
--   · bom_dia_ultimo_util(dia): o último dia útil (seg–sex fora dos feriados) ANTES de `dia`;
--   · pausa = { inicio, dias, fim_de_semana, feriados:[nome] } quando há folga entre ele e hoje;
--   · VENDEDOR: "novos" desde as 18h do último dia útil (antes pulava só sábado/domingo);
--   · GESTOR: entradas, campanhas, não elegíveis e IA desde o 1º dia da folga até agora; "melhor de
--     ontem" = do último dia útil (melhor_dia); sem comparação com ontem depois de folga; fechados de hoje.
--   · p_momento 'tarde' (diagnóstico das 17h): sempre o dia de hoje, sem folga.
-- =============================================================================

create or replace function public.bom_dia_ultimo_util(p_dia date)
returns date
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select max(d)::date
  from generate_series(p_dia - 15, p_dia - 1, interval '1 day') d
  where extract(isodow from d) between 1 and 5
    and not (d::date = any (public.dash_v5s_feriados()))
$$;

create or replace function public.bom_dia_feriado_nome(p_dia date)
returns text
language sql immutable
as $$
  select case to_char(p_dia, 'MM-DD')
    when '01-01' then 'Ano-Novo' when '04-21' then 'Tiradentes' when '05-01' then 'Dia do Trabalho'
    when '09-07' then 'Independência' when '09-20' then 'Revolução Farroupilha'
    when '10-12' then 'Nossa Senhora Aparecida' when '11-02' then 'Finados'
    when '11-15' then 'Proclamação da República' when '11-20' then 'Consciência Negra'
    when '12-25' then 'Natal'
    else case p_dia
      when date '2026-02-16' then 'Carnaval' when date '2026-02-17' then 'Carnaval'
      when date '2026-04-03' then 'Sexta-feira Santa' when date '2026-06-04' then 'Corpus Christi'
      when date '2027-02-08' then 'Carnaval' when date '2027-02-09' then 'Carnaval'
      when date '2027-03-26' then 'Sexta-feira Santa' when date '2027-05-27' then 'Corpus Christi'
      else 'feriado' end
  end
$$;

-- o momento entra como parâmetro: o diagnóstico das 17h é SEMPRE do dia, só a manhã olha a folga.
-- Assinatura nova → a antiga (só p_org) sai, senão o PostgREST acharia duas e recusaria a chamada.
drop function if exists public.bom_dia_resumo(uuid);
create or replace function public.bom_dia_resumo(p_org uuid, p_momento text default 'manha')
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini   timestamptz := (v_hoje::timestamp) at time zone 'America/Sao_Paulo';        -- meia-noite de hoje
  v_ontem timestamptz := ((v_hoje - 1)::timestamp) at time zone 'America/Sao_Paulo';  -- meia-noite de ontem
  -- pós-folga (dono 30/10: "na terça… fale sobre o final de semana e o feriado"): último dia útil antes de
  -- hoje e, se houve folga no meio (sábado, domingo, feriado), a janela dos números começa no 1º dia dela
  v_util  date := public.bom_dia_ultimo_util(v_hoje);
  v_folga boolean := v_util < v_hoje - 1 and coalesce(p_momento, 'manha') <> 'tarde';
  v_ini_util timestamptz := (v_util::timestamp) at time zone 'America/Sao_Paulo';
  v_fim_util timestamptz := ((v_util + 1)::timestamp) at time zone 'America/Sao_Paulo';
  v_janela timestamptz := case when v_folga then v_fim_util
                               else ((v_hoje::timestamp) at time zone 'America/Sao_Paulo') end;
  v_fim   int;
  v_desde timestamptz;
  r       record;
begin
  if v_uid is null or not public.is_member(p_org) then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;

  -- ---------------------------------------------------------------- GESTOR
  -- Números do Dashboard v5 pelas MESMAS funções (dash_v5_entradas / dash_v5_fechamentos):
  -- leads = clientes distintos, sem o número interno; fechado e vendedor seguem a regra do
  -- administrativo do CAF (adm_casos, quando houver) — batem com a tela de gestão por construção.
  if exists (select 1 from public.bom_dia_gestores g where g.organizacao_id = p_org and g.usuario_id = v_uid) then
    return (
      -- ENTRADAS = a régua do Dashboard desde 30/10 ("tudo que entrou", como o Gerenciador de Anúncios):
      -- oportunidades novas (pelo número de origem) + quem já estava no sistema e voltou pela mensagem
      -- do anúncio (pelo número que recebeu). Campanha = dash_v5_trafego (rótulos do relatório em PDF).
      with ent as (
        select e.canal_origem_id as canal from public.dash_v5_entradas(p_org, v_janela, now()) e
        union all
        select a.canal_id from public.dash_v5_anuncio(p_org, v_janela, now()) a where a.ja_estava
      ),
      fec as (
        select f.tipo, f.canal_origem_id, f.credito_id
        from public.dash_v5_fechamentos(p_org, v_ini, now()) f
      ),
      -- não elegíveis na janela (hoje, ou desde o início da folga)
      ne_jan as (
        select f.canal_origem_id
        from public.dash_v5_fechamentos(p_org, v_janela, now()) f
        where f.tipo = 'ne'
      ),
      -- "melhor de ontem" = do último DIA ÚTIL (numa segunda/terça pós-feriado, o de sexta)
      fec_ontem as (
        select f.credito_id
        from public.dash_v5_fechamentos(p_org, v_ini_util, v_fim_util) f
        where f.tipo = 'ganho' and f.credito_id is not null
      ),
      vend_hoje as (select credito_id as uid, count(*) as n from fec where tipo = 'ganho' and credito_id is not null group by 1),
      vend_ontem as (select credito_id as uid, count(*) as n from fec_ontem group by 1)
      select jsonb_build_object(
        'modo', 'gestor',
        -- folga antes de hoje: { inicio, dias, fim_de_semana, feriados: [nome] } (null em dia normal)
        'pausa', case when v_folga then jsonb_build_object(
          'inicio', v_janela,
          'dias', (v_hoje - v_util - 1),
          'fim_de_semana', exists (select 1 from generate_series(v_util + 1, v_hoje - 1, interval '1 day') d
                                   where extract(isodow from d) in (6, 7)),
          'feriados', coalesce((select jsonb_agg(public.bom_dia_feriado_nome(d::date) order by d)
                                from generate_series(v_util + 1, v_hoje - 1, interval '1 day') d
                                where d::date = any (public.dash_v5s_feriados())), '[]'::jsonb)) end,
        'melhor_dia', v_util,
        'chegaram', (select count(*) from ent),
        'por_campanha', coalesce((
          select jsonb_agg(jsonb_build_object('canal', x.canal, 'n', x.n) order by x.n desc, x.canal)
          from (select public.dash_v5_trafego(ent.canal) as canal, count(*) as n from ent group by 1) x), '[]'::jsonb),
        -- comparação com ontem no MESMO horário (dono 30/10: escolheu "comparação com ontem")
        -- comparação com ontem só em dia normal (depois da folga, "ontem" foi domingo/feriado)
        'leads_ontem_mesma_hora', case when v_folga then null else
                                  (select count(*) from public.dash_v5_entradas(p_org, v_ontem, now() - interval '1 day'))
                                + (select count(*) from public.dash_v5_anuncio(p_org, v_ontem, now() - interval '1 day') a
                                   where a.ja_estava) end,
        -- trabalho da IA de vendas hoje (dono 30/10: escolheu "trabalho da IA"): conversas que a IA
        -- assumiu hoje, sem o número interno (o Dashboard não tem esse número)
        'ia_atendeu_hoje', (select count(*) from public.ia_sessoes s
                            left join public.contatos ct on ct.id = s.contato_id
                            where s.organizacao_id = p_org and s.criado_em >= v_janela
                              and not public.dash_v5_interno(ct.telefone)),
        'nao_elegiveis', (select count(*) from ne_jan),
        -- não elegíveis por campanha ("qual campanha teve mais clientes não elegíveis" — dono 30/10)
        'ne_por_campanha', coalesce((
          select jsonb_agg(jsonb_build_object('canal', x.canal, 'n', x.n) order by x.n desc, x.canal)
          from (select public.dash_v5_trafego(ne_jan.canal_origem_id) as canal, count(*) as n
                from ne_jan group by 1) x), '[]'::jsonb),
        'fechados_hoje', (select count(*) from fec where tipo = 'ganho'),
        'melhor_ontem', (select case when max(n) is null then null else jsonb_build_object(
          'n', max(n),
          'nomes', (select jsonb_agg(coalesce(nullif(split_part(btrim(u.nome), ' ', 1), ''), 'Equipe') order by u.nome)
                    from vend_ontem v join public.usuarios u on u.id = v.uid
                    where v.n = (select max(n) from vend_ontem))) end from vend_ontem),
        'melhor_hoje', (select case when max(n) is null then null else jsonb_build_object(
          'n', max(n),
          'nomes', (select jsonb_agg(coalesce(nullif(split_part(btrim(u.nome), ' ', 1), ''), 'Equipe') order by u.nome)
                    from vend_hoje v join public.usuarios u on u.id = v.uid
                    where v.n = (select max(n) from vend_hoje))) end from vend_hoje),
        'criticos', jsonb_build_object(
          -- número de ATENDIMENTO em uso (cliente escreveu nos últimos 14 dias) que caiu
          'desconectados', coalesce((
            select jsonb_agg(ca.nome_interno order by ca.nome_interno)
            from public.canais ca
            where ca.organizacao_id = p_org and ca.ativo
              and coalesce(ca.papel::text, 'atendimento') = 'atendimento'
              and coalesce(ca.status_integracao::text, '') not in ('conectado', 'removido')
              and exists (select 1 from public.conversas c
                          where c.organizacao_id = p_org and (c.canal_id = ca.id or c.ultimo_canal_id = ca.id)
                            and c.ultima_entrada_em >= now() - interval '14 days')), '[]'::jsonb),
          -- episódio aberto do ia-credito-monitor = a IA de vendas está sem crédito agora
          'ia_sem_credito', exists (select 1 from public.ia_credito_episodios e where e.fechado_em is null),
          -- cliente novo (24 h) com conversa aberta e sem dono há mais de 30 min (a distribuição leva até 20)
          'sem_dono', (select count(*) from public.contatos ct
                       where ct.organizacao_id = p_org and ct.responsavel_id is null and ct.mesclado_para is null
                         and ct.criado_em >= now() - interval '24 hours'
                         and ct.criado_em < now() - interval '30 minutes'
                         and not public.dash_v5_interno(ct.telefone)
                         and exists (select 1 from public.conversas c
                                     where c.contato_id = ct.id and c.arquivada_em is null
                                       and c.status in ('aberta', 'em_atendimento', 'pendente'))
                         and not public.bom_dia_fora_do_atendimento(p_org, ct.id))
        )
      )
    );
  end if;

  -- ---------------------------------------------------------------- VENDEDOR
  -- fim do último expediente = hora de fechar da Central de Avisos (18h) do dia útil anterior
  select coalesce(max(c.hora_fim), 18) into v_fim from public.vacuo_config c where c.organizacao_id = p_org;
  v_desde := (v_util + make_time(v_fim, 0, 0)) at time zone 'America/Sao_Paulo';

  with novos as (
    select 1
    from public.contatos ct
    where ct.organizacao_id = p_org
      and ct.responsavel_id = v_uid
      and ct.mesclado_para is null
      and ct.criado_em >= v_desde
      and not public.bom_dia_fora_do_atendimento(p_org, ct.id)
  ),
  esperando as (
    select 1
    from public.conversas c
    left join public.contatos ct on ct.id = c.contato_id
    left join public.bot_conversa_estado e on e.conversa_id = c.id
    left join lateral (
      select max(coalesce(m.recebida_em, m.criado_em)) filter (where m.direcao = 'entrada') as ult_in,
             max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'saida'
               and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
                    or (m.autor_id is null and m.origem = 'telefone'))) as ult_humano
      from public.mensagens m where m.conversa_id = c.id
    ) um on true
    left join lateral (
      select exists (select 1 from public.oportunidades ogf
                     where ogf.contato_id = c.contato_id and ogf.organizacao_id = c.organizacao_id
                       and ogf.status = 'ganho') as fechado
    ) fe on true
    -- cliente fechado que só agradeceu/confirmou não está esperando nada (mesma regra da Central)
    left join lateral (
      select min(coalesce(m.recebida_em, m.criado_em)) as pri_in
      from public.mensagens m
      where m.conversa_id = c.id and m.direcao = 'entrada'
        and coalesce(m.recebida_em, m.criado_em) > coalesce(um.ult_humano, '-infinity'::timestamptz)
        and not (fe.fechado and public.radar_so_agradecimento(m.tipo::text, m.conteudo))
    ) pend on true
    left join lateral (
      select bool_or(s.status = 'ativa') as ia_ativa
      from public.ia_sessoes s where s.conversa_id = c.id
    ) ia on true
    where c.organizacao_id = p_org
      and c.arquivada_em is null
      and c.status in ('aberta','em_atendimento','pendente')
      and coalesce(ct.responsavel_id, c.atendente_id) = v_uid
      and c.ultima_entrada_em >= now() - interval '14 days'
      and um.ult_in is not null
      and (um.ult_humano is null or um.ult_humano < um.ult_in)
      and pend.pri_in is not null
      and coalesce(e.etapa, '') <> 'inicio'
      and not coalesce(ia.ia_ativa, false)
      and not public.bom_dia_fora_do_atendimento(p_org, c.contato_id)
  ),
  passados as (
    select 1
    from public.conversas c
    left join public.contatos ct on ct.id = c.contato_id
    where c.organizacao_id = p_org
      and c.precisa_humano
      and c.precisa_humano_em >= now() - interval '7 days'
      and c.arquivada_em is null
      and c.status in ('aberta','em_atendimento','pendente')
      and coalesce(ct.responsavel_id, c.atendente_id) = v_uid
      and not exists (
        select 1 from public.mensagens m
        where m.conversa_id = c.id and m.direcao = 'saida'
          and coalesce(m.enviada_em, m.criado_em) > c.precisa_humano_em
          and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
               or (m.autor_id is null and m.origem = 'telefone')))
      and not public.bom_dia_fora_do_atendimento(p_org, c.contato_id)
  ),
  presenciais as (
    select 1
    from public.presenciais p
    join public.contatos ct on ct.id = p.contato_id
    where p.organizacao_id = p_org and p.status = 'marcado'
      and (p.quando at time zone 'America/Sao_Paulo')::date = v_hoje
      and ct.responsavel_id = v_uid
  )
  select (select count(*) from novos)       as novos,
         (select count(*) from esperando)   as sem_resposta,
         (select count(*) from passados)    as passados,
         (select count(*) from presenciais) as presenciais
    into r;

  return jsonb_build_object(
    'modo', 'vendedor',
    'desde', v_desde,
    'pausa', case when v_folga then jsonb_build_object(
      'inicio', v_janela,
      'dias', (v_hoje - v_util - 1),
      'fim_de_semana', exists (select 1 from generate_series(v_util + 1, v_hoje - 1, interval '1 day') d
                               where extract(isodow from d) in (6, 7)),
      'feriados', coalesce((select jsonb_agg(public.bom_dia_feriado_nome(d::date) order by d)
                            from generate_series(v_util + 1, v_hoje - 1, interval '1 day') d
                            where d::date = any (public.dash_v5s_feriados())), '[]'::jsonb)) end,
    'novos', r.novos,
    'sem_resposta', r.sem_resposta,
    'passados', r.passados,
    'presenciais', r.presenciais
  );
end
$function$;


revoke all on function public.bom_dia_ultimo_util(date) from public, anon, authenticated;
revoke all on function public.bom_dia_feriado_nome(date) from public, anon, authenticated;
revoke all on function public.bom_dia_resumo(uuid, text) from public, anon;
grant execute on function public.bom_dia_resumo(uuid, text) to authenticated;
