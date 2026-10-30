-- =============================================================================
-- BOM DIA DO ATENVO (pedido do dono 30/10/2026)
-- "Todo dia às 8 da manhã… olá, nome do atendente, seja bem-vindo ao Atenvo. Hoje você
--  tem X novos clientes, Y clientes sem resposta, informações importantes" — falado por
--  uma IA com voz feminina (edge function bom-dia-voz).
--
-- bom_dia_resumo(org) é a fonte ÚNICA dos números: a tela mostra e a voz fala o mesmo
-- resultado. Dois modos:
--
-- VENDEDOR (todo mundo, inclusive o admin Matheus — decisão do dono 30/10): a carteira de
-- quem pergunta (dono = contatos.responsavel_id, com o mesmo coalesce da Central de Avisos).
--   novos        clientes NOVOS desde o fim do último expediente (18h do dia útil anterior;
--                segunda, sábado e domingo contam desde sexta 18h). Sem mesclados, sem
--                perdido/NE.
--   sem_resposta a MESMA regra da Central de Avisos (vacuo_avaliar v5), SEM o relógio:
--                conversa aberta, mensagem do cliente sem resposta humana, robô fora do
--                início, IA não atendendo, fora perdido/NE, últimos 14 dias. Às 8h a Central
--                ainda não avisou ninguém (só conta minutos úteis a partir das 9h) — aqui
--                entra também quem escreveu durante a noite.
--   passados     o robô/IA passou para humano (precisa_humano) nos últimos 7 dias e ninguém
--                da equipe respondeu depois disso.
--   presenciais  atendimentos presenciais marcados para HOJE.
--
-- GESTOR (quem está em bom_dia_gestores — o administrador Murilo, pedido do dono 30/10):
-- a empresa inteira, "hoje" = desde a meia-noite (decisão do dono). Usa as MESMAS funções do
-- Dashboard v5 (dash_v5_entradas / dash_v5_fechamentos) — o dono pediu números que batem 100%:
--   chegaram / por_campanha  ENTRADAS do Dashboard (régua de 30/10, "como o Gerenciador"): oportunidades
--                            novas + quem já estava e voltou pelo anúncio; campanha = dash_v5_trafego
--                            ('Empréstimo · Antônio', 'Juros abusivos · Andrius', 'Empréstimo · Diego',
--                            'Outros números'); conferido 30/10: Dashboard 88 = bom dia 88;
--   leads_ontem_mesma_hora   o mesmo de ontem até esta hora (= kpis_anterior do Dashboard; 172 = 172);
--   nao_elegiveis / ne_por_campanha  os NE do Dashboard (perdido + motivo de descarte);
--   fechados_hoje            os ganhos do Dashboard — com casos do CAF (adm_casos), a regra do pódio;
--   melhor_ontem/melhor_hoje quem tem mais ganhos creditados (credito_id do Dashboard: vendedor do
--                            caso do CAF, senão responsável no fechamento/quem fechou);
--   ia_atendeu_hoje          conversas que a IA de vendas assumiu hoje (não existe no Dashboard);
--   criticos                 número de atendimento em uso desconectado, IA sem crédito (episódio
--                            aberto do ia-credito-monitor) e clientes novos sem dono há > 30 min.
-- bom_dia_modo(org) diz ao app se quem pergunta é gestor (o shell só arma o resumo das 17h
-- para o gestor).
-- =============================================================================

-- PERDIDO/NE: nunca ganhou, sem oportunidade em andamento e a mais recente perdida — a regra
-- da aba "Meus" e da Central de Avisos (ganho é "grudento"). Helper interno, sem grant.
create or replace function public.bom_dia_fora_do_atendimento(p_org uuid, p_contato uuid)
returns boolean
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select not exists (select 1 from public.oportunidades og
                     where og.contato_id = p_contato and og.organizacao_id = p_org and og.status = 'ganho')
     and not exists (select 1 from public.oportunidades oa
                     where oa.contato_id = p_contato and oa.organizacao_id = p_org and oa.status = 'em_andamento')
     and coalesce((select ol.status::text from public.oportunidades ol
                   where ol.contato_id = p_contato and ol.organizacao_id = p_org
                   order by ol.atualizado_em desc limit 1), '') = 'perdido'
$$;

-- Quem ouve o bom dia de GESTOR. Só a RPC (security definer) lê; ninguém do app escreve.
create table if not exists public.bom_dia_gestores (
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  usuario_id     uuid not null references public.usuarios(id) on delete cascade,
  criado_em      timestamptz not null default now(),
  primary key (organizacao_id, usuario_id)
);
alter table public.bom_dia_gestores enable row level security;
revoke all on public.bom_dia_gestores from anon, authenticated;
grant select, insert, update, delete on public.bom_dia_gestores to service_role;

-- Murilo (murilo@caf.com, administrador criado em 30/10) na CAF
insert into public.bom_dia_gestores (organizacao_id, usuario_id)
select 'de300000-0000-4000-8000-000000000001', u.id
from public.usuarios u where u.id = 'f81fcc8a-07a7-436a-9224-34003b65fc67'
on conflict do nothing;

create or replace function public.bom_dia_resumo(p_org uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini   timestamptz := (v_hoje::timestamp) at time zone 'America/Sao_Paulo';        -- meia-noite de hoje
  v_ontem timestamptz := ((v_hoje - 1)::timestamp) at time zone 'America/Sao_Paulo';  -- meia-noite de ontem
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
        select e.canal_origem_id as canal from public.dash_v5_entradas(p_org, v_ini, now()) e
        union all
        select a.canal_id from public.dash_v5_anuncio(p_org, v_ini, now()) a where a.ja_estava
      ),
      fec as (
        select f.tipo, f.canal_origem_id, f.credito_id
        from public.dash_v5_fechamentos(p_org, v_ini, now()) f
      ),
      fec_ontem as (
        select f.credito_id
        from public.dash_v5_fechamentos(p_org, v_ontem, v_ini) f
        where f.tipo = 'ganho' and f.credito_id is not null
      ),
      vend_hoje as (select credito_id as uid, count(*) as n from fec where tipo = 'ganho' and credito_id is not null group by 1),
      vend_ontem as (select credito_id as uid, count(*) as n from fec_ontem group by 1)
      select jsonb_build_object(
        'modo', 'gestor',
        'chegaram', (select count(*) from ent),
        'por_campanha', coalesce((
          select jsonb_agg(jsonb_build_object('canal', x.canal, 'n', x.n) order by x.n desc, x.canal)
          from (select public.dash_v5_trafego(ent.canal) as canal, count(*) as n from ent group by 1) x), '[]'::jsonb),
        -- comparação com ontem no MESMO horário (dono 30/10: escolheu "comparação com ontem")
        'leads_ontem_mesma_hora', (select count(*) from public.dash_v5_entradas(p_org, v_ontem, now() - interval '1 day'))
                                + (select count(*) from public.dash_v5_anuncio(p_org, v_ontem, now() - interval '1 day') a
                                   where a.ja_estava),
        -- trabalho da IA de vendas hoje (dono 30/10: escolheu "trabalho da IA"): conversas que a IA
        -- assumiu hoje, sem o número interno (o Dashboard não tem esse número)
        'ia_atendeu_hoje', (select count(*) from public.ia_sessoes s
                            left join public.contatos ct on ct.id = s.contato_id
                            where s.organizacao_id = p_org and s.criado_em >= v_ini
                              and not public.dash_v5_interno(ct.telefone)),
        'nao_elegiveis', (select count(*) from fec where tipo = 'ne'),
        -- não elegíveis por campanha ("qual campanha teve mais clientes não elegíveis" — dono 30/10)
        'ne_por_campanha', coalesce((
          select jsonb_agg(jsonb_build_object('canal', x.canal, 'n', x.n) order by x.n desc, x.canal)
          from (select public.dash_v5_trafego(fec.canal_origem_id) as canal, count(*) as n
                from fec where fec.tipo = 'ne' group by 1) x), '[]'::jsonb),
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
  v_desde := ((v_hoje - case extract(isodow from v_hoje)::int when 1 then 3 when 7 then 2 else 1 end)
              + make_time(v_fim, 0, 0)) at time zone 'America/Sao_Paulo';

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
    'novos', r.novos,
    'sem_resposta', r.sem_resposta,
    'passados', r.passados,
    'presenciais', r.presenciais
  );
end
$function$;

create or replace function public.bom_dia_modo(p_org uuid)
returns text
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select case when public.is_member(p_org) and exists (
           select 1 from public.bom_dia_gestores g where g.organizacao_id = p_org and g.usuario_id = auth.uid())
         then 'gestor' else 'vendedor' end
$$;

revoke all on function public.bom_dia_fora_do_atendimento(uuid, uuid) from public, anon, authenticated;
revoke all on function public.bom_dia_modo(uuid) from public, anon;
grant execute on function public.bom_dia_modo(uuid) to authenticated;
revoke all on function public.bom_dia_resumo(uuid) from public, anon;
grant execute on function public.bom_dia_resumo(uuid) to authenticated;
