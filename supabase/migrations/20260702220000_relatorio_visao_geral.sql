-- ETAPA 2B — Camada oficial de dados dos relatórios: RPC âncora de VISÃO GERAL.
-- Fonte ÚNICA (o front não recalcula). Isolada por organização (is_member), timezone
-- America/Sao_Paulo, período explícito com FIM EXCLUSIVO, sem dupla contagem.
-- Ganho/perdido por status (derivado de funil_colunas.resultado via trigger), nunca pelo nome.
-- p_org é explícito (o front passa a org atual); a função valida o vínculo do chamador.
create or replace function public.relatorio_visao_geral(p_org uuid, p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  v_ini timestamptz := (p_inicio::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (p_fim::timestamp) at time zone 'America/Sao_Paulo';   -- exclusivo
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then
    raise exception 'sem_acesso' using errcode='insufficient_privilege';
  end if;

  with
  -- ATENDIMENTO: cada conversa (criada no período) em UMA categoria mutuamente exclusiva.
  base as (
    select c.id,
      (select min(coalesce(m.recebida_em,m.criado_em)) from mensagens m where m.conversa_id=c.id and m.direcao='entrada') as fin
    from conversas c where c.organizacao_id=p_org and c.criado_em >= v_ini and c.criado_em < v_fim
  ),
  flags as (
    select b.id, b.fin,
      exists(select 1 from mensagens m where m.conversa_id=b.id and m.direcao='saida' and m.autor_id is not null and m.tipo not in ('sistema','nota_interna') and b.fin is not null and coalesce(m.enviada_em,m.criado_em)>b.fin) as painel_apos,
      exists(select 1 from mensagens m where m.conversa_id=b.id and m.direcao='saida' and m.autor_id is null and m.origem='telefone' and b.fin is not null and coalesce(m.enviada_em,m.criado_em)>b.fin) as celular_apos,
      exists(select 1 from mensagens m where m.conversa_id=b.id and m.direcao='saida' and m.autor_id is null and (m.origem is distinct from 'telefone' or m.tipo='sistema') and b.fin is not null and coalesce(m.enviada_em,m.criado_em)>b.fin) as auto_apos,
      exists(select 1 from mensagens m where m.conversa_id=b.id and m.direcao='saida' and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna')) or (m.autor_id is null and m.origem='telefone'))) as humano_qualquer
    from base b
  ),
  atd as (
    select
      count(*) filter (where fin is null) as sem_inbound,
      count(*) filter (where fin is not null and painel_apos) as inbound_painel,
      count(*) filter (where fin is not null and not painel_apos and celular_apos) as inbound_so_celular,
      count(*) filter (where fin is not null and not painel_apos and not celular_apos and humano_qualquer) as inbound_humana_antes,
      count(*) filter (where fin is not null and not painel_apos and not celular_apos and not humano_qualquer and auto_apos) as inbound_so_automacao,
      count(*) filter (where fin is not null and not painel_apos and not celular_apos and not humano_qualquer and not auto_apos) as inbound_sem_resposta,
      count(*) as total_conversas,
      count(*) filter (where fin is not null) as com_inbound
    from flags
  ),
  -- MENSAGENS de saída no período (cobertura de atribuição)
  msg as (
    select
      count(*) filter (where autor_id is not null and tipo not in ('sistema','nota_interna')) as resp_painel,
      count(*) filter (where autor_id is null and origem='telefone') as resp_celular,
      count(*) filter (where autor_id is null) as resp_sem_atrib
    from mensagens where organizacao_id=p_org and direcao='saida' and criado_em>=v_ini and criado_em<v_fim
  ),
  -- COMERCIAL
  opp as (
    select
      count(*) filter (where criado_em>=v_ini and criado_em<v_fim) as criadas,
      count(*) filter (where criado_em>=v_ini and criado_em<v_fim and status='ganho') as ganhos_coorte,
      count(*) filter (where criado_em>=v_ini and criado_em<v_fim and responsavel_id is not null) as criadas_com_resp,
      count(*) filter (where fechado_em>=v_ini and fechado_em<v_fim and status='ganho') as fech_periodo,
      count(*) filter (where fechado_em>=v_ini and fechado_em<v_fim and status='perdido') as perdas_periodo,
      count(*) filter (where fechado_em>=v_ini and fechado_em<v_fim and fechado_em_estimado) as fech_estimados
    from oportunidades where organizacao_id=p_org
  ),
  -- FINANCEIRO (contratos + parcelas)
  cob as (
    select
      coalesce(sum(valor_mensal*coalesce(ciclos_totais,0)) filter (where status<>'cancelado'),0) as receita_contratada,
      coalesce(avg(valor_mensal) filter (where status<>'cancelado'),0) as ticket_mensal,
      coalesce(sum(valor_economizado),0) as economia
    from cobrancas where organizacao_id=p_org
  ),
  par as (
    select
      coalesce(sum(valor) filter (where status<>'cancelada' and data_prevista>=p_inicio and data_prevista<p_fim),0) as prevista,
      coalesce(sum(valor_pago) filter (where status='paga' and data_pagamento>=p_inicio and data_pagamento<p_fim),0) as recebida,
      coalesce(sum(valor) filter (where status='prevista' and data_prevista>=v_hoje),0) as pendente,
      coalesce(sum(valor) filter (where status not in ('cancelada','paga') and data_prevista<v_hoje),0) as vencido_aberto,
      coalesce(sum(valor) filter (where status<>'cancelada' and data_prevista<v_hoje),0) as vencido_total,
      count(*) filter (where status not in ('cancelada','paga') and data_prevista<v_hoje) as venc_aberto_qtd,
      count(*) filter (where status<>'cancelada' and data_prevista<v_hoje) as venc_total_qtd
    from cobranca_pagamentos where organizacao_id=p_org
  ),
  -- QUALIDADE
  qual as (
    select
      (select count(*) from oportunidades where organizacao_id=p_org and responsavel_id is null) as opp_sem_resp,
      (select count(*) from mensagens where organizacao_id=p_org and direcao='saida' and autor_id is null) as msg_sem_autor,
      (select count(*) from contatos where organizacao_id=p_org and (telefone is null or btrim(telefone)='')) as contatos_sem_tel,
      (select count(*) from oportunidades where organizacao_id=p_org and status='ganho' and fechado_em_estimado) as fech_estimados_total
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim_exclusivo', p_fim, 'timezone', 'America/Sao_Paulo'),
    'operacional', jsonb_build_object(
      'contatos_novos', (select count(*) from contatos where organizacao_id=p_org and criado_em>=v_ini and criado_em<v_fim),
      'conversas_novas', a.total_conversas,
      'conversas_com_inbound', a.com_inbound,
      'conversas_atendidas', a.inbound_painel + a.inbound_so_celular,
      'conversas_sem_resposta', a.inbound_sem_resposta,
      'taxa_atendimento_pct', case when a.com_inbound=0 then 0 else round(100.0*(a.inbound_painel+a.inbound_so_celular)/a.com_inbound,1) end,
      'categorias', jsonb_build_object('sem_inbound',a.sem_inbound,'inbound_sem_resposta',a.inbound_sem_resposta,'inbound_painel',a.inbound_painel,'inbound_so_celular',a.inbound_so_celular,'inbound_humana_antes',a.inbound_humana_antes,'inbound_so_automacao',a.inbound_so_automacao,'total',a.total_conversas),
      'respostas_painel', m.resp_painel, 'respostas_celular', m.resp_celular, 'respostas_sem_atribuicao', m.resp_sem_atrib,
      'cobertura_atribuicao_msgs_pct', case when (m.resp_painel+m.resp_sem_atrib)=0 then null else round(100.0*m.resp_painel/(m.resp_painel+m.resp_sem_atrib),1) end
    ),
    'comercial', jsonb_build_object(
      'oportunidades_criadas', o.criadas,
      'ganhos_coorte', o.ganhos_coorte,
      'conversao_coorte_pct', case when o.criadas=0 then 0 else round(100.0*o.ganhos_coorte/o.criadas,1) end,
      'fechamentos_periodo', o.fech_periodo,
      'perdas_periodo', o.perdas_periodo,
      'fechamentos_estimados', o.fech_estimados,
      'cobertura_responsavel_opp_pct', case when o.criadas=0 then null else round(100.0*o.criadas_com_resp/o.criadas,1) end
    ),
    'financeiro', jsonb_build_object(
      'receita_contratada', cb.receita_contratada,
      'receita_prevista', pr.prevista,
      'receita_recebida', pr.recebida,
      'pendente', pr.pendente,
      'vencido', pr.vencido_aberto,
      'inadimplencia_valor_pct', case when pr.vencido_total=0 then null else round(100.0*pr.vencido_aberto/pr.vencido_total,1) end,
      'inadimplencia_parcelas_pct', case when pr.venc_total_qtd=0 then null else round(100.0*pr.venc_aberto_qtd/pr.venc_total_qtd,1) end,
      'ticket_medio_mensal', round(cb.ticket_mensal,2),
      'economia_gerada', cb.economia
    ),
    'qualidade', jsonb_build_object(
      'oportunidades_sem_responsavel', q.opp_sem_resp,
      'mensagens_sem_autor', q.msg_sem_autor,
      'contatos_sem_telefone', q.contatos_sem_tel,
      'fechamentos_com_data_estimada', q.fech_estimados_total,
      'alertas', (
        (case when (m.resp_painel+m.resp_sem_atrib)>0 and (100.0*m.resp_painel/(m.resp_painel+m.resp_sem_atrib))<50 then jsonb_build_array('cobertura_atribuicao_mensagens_baixa') else '[]'::jsonb end)
        || (case when o.criadas>0 and (100.0*o.criadas_com_resp/o.criadas)<50 then jsonb_build_array('cobertura_responsavel_oportunidades_baixa') else '[]'::jsonb end)
      )
    )
  ) into r
  from atd a, msg m, opp o, cob cb, par pr, qual q;
  return r;
end
$function$;

grant execute on function public.relatorio_visao_geral(uuid, date, date) to authenticated;
