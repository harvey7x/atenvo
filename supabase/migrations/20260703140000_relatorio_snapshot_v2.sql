-- ETAPA 2B — relatorio_snapshot v2: comparador oficial atual × anterior.
-- Consome as RPCs oficiais: relatorio_visao_geral (atendimento+comercial) e
-- relatorio_financeiro v2 (fluxo/estoque/posição), cada período com sua data de corte.
-- Não usa mais os campos financeiros ambíguos antigos. Nova migration (não edita antigas).
-- KPIs tipados (fluxo/estoque/posicao), unidade explícita, diferença de % em pontos percentuais,
-- direção semântica melhora/piora, sem infinito quando anterior=0, comparabilidade e qualidade.

drop function if exists public.relatorio_snapshot(uuid, date, date, date, date);

create or replace function public.relatorio_snapshot(
  p_org uuid,
  p_inicio_atual date, p_fim_atual date, p_corte_atual date,
  p_inicio_anterior date, p_fim_anterior date, p_corte_anterior date)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare
  v_ini_a timestamptz; v_fim_a timestamptz; v_ini_p timestamptz; v_fim_p timestamptz;
  va jsonb; vp jsonb; fa jsonb; fp jsonb;
  prt_a numeric; prt_p numeric;
  dur_a int; dur_p int; off_a int; off_p int;
  r jsonb;
begin
  -- 1) Acesso (isolamento por organização)
  if not (public.is_member(p_org) or public.is_platform_admin()) then
    raise exception 'sem_acesso' using errcode='insufficient_privilege';
  end if;
  -- 2) Datas obrigatórias
  if p_inicio_atual is null or p_fim_atual is null or p_corte_atual is null
     or p_inicio_anterior is null or p_fim_anterior is null or p_corte_anterior is null then
    raise exception 'datas_obrigatorias' using errcode='22023';
  end if;
  -- 3) Início < fim (fim exclusivo)
  if not (p_inicio_atual < p_fim_atual and p_inicio_anterior < p_fim_anterior) then
    raise exception 'periodo_invalido' using errcode='22023';
  end if;
  -- 4) Corte coerente com o período (dentro de [inicio, fim])
  if not (p_corte_atual >= p_inicio_atual and p_corte_atual <= p_fim_atual
          and p_corte_anterior >= p_inicio_anterior and p_corte_anterior <= p_fim_anterior) then
    raise exception 'corte_incoerente' using errcode='22023';
  end if;

  v_ini_a := (p_inicio_atual::timestamp) at time zone 'America/Sao_Paulo';
  v_fim_a := (p_fim_atual::timestamp) at time zone 'America/Sao_Paulo';
  v_ini_p := (p_inicio_anterior::timestamp) at time zone 'America/Sao_Paulo';
  v_fim_p := (p_fim_anterior::timestamp) at time zone 'America/Sao_Paulo';
  dur_a := p_fim_atual - p_inicio_atual; dur_p := p_fim_anterior - p_inicio_anterior;
  off_a := p_corte_atual - p_inicio_atual; off_p := p_corte_anterior - p_inicio_anterior;

  -- Fontes oficiais
  va := public.relatorio_visao_geral(p_org, p_inicio_atual, p_fim_atual);
  vp := public.relatorio_visao_geral(p_org, p_inicio_anterior, p_fim_anterior);
  fa := public.relatorio_financeiro(p_org, p_inicio_atual, p_fim_atual, p_corte_atual);
  fp := public.relatorio_financeiro(p_org, p_inicio_anterior, p_fim_anterior, p_corte_anterior);

  -- Tempo médio de 1ª resposta (SQL canônico = mesma definição de relatorio_canais)
  prt_a := (select round(avg(extract(epoch from (resp.t - b.fin))/60.0),1)
    from (select c.id, (select min(coalesce(mm.recebida_em,mm.criado_em)) from mensagens mm where mm.conversa_id=c.id and mm.direcao='entrada') fin
          from conversas c where c.organizacao_id=p_org and c.criado_em>=v_ini_a and c.criado_em<v_fim_a) b
    join lateral (select min(coalesce(m.enviada_em,m.criado_em)) t from mensagens m where m.conversa_id=b.id and m.direcao='saida'
          and ((m.autor_id is not null and m.tipo not in('sistema','nota_interna')) or (m.autor_id is null and m.origem='telefone'))
          and b.fin is not null and coalesce(m.enviada_em,m.criado_em)>b.fin) resp on true
    where b.fin is not null);
  prt_p := (select round(avg(extract(epoch from (resp.t - b.fin))/60.0),1)
    from (select c.id, (select min(coalesce(mm.recebida_em,mm.criado_em)) from mensagens mm where mm.conversa_id=c.id and mm.direcao='entrada') fin
          from conversas c where c.organizacao_id=p_org and c.criado_em>=v_ini_p and c.criado_em<v_fim_p) b
    join lateral (select min(coalesce(m.enviada_em,m.criado_em)) t from mensagens m where m.conversa_id=b.id and m.direcao='saida'
          and ((m.autor_id is not null and m.tipo not in('sistema','nota_interna')) or (m.autor_id is null and m.origem='telefone'))
          and b.fin is not null and coalesce(m.enviada_em,m.criado_em)>b.fin) resp on true
    where b.fin is not null);

  with raw(ord,codigo,titulo,grupo,tipo,unidade,sentido,formula,fonte,va_val,vp_val,qual_a,qual_p,cob_a,cob_p) as (values
    -- ATENDIMENTO (fluxo)
    (1,'contatos_novos','Contatos novos','atendimento','fluxo','quantidade','maior_melhor','count(contatos.criado_em no periodo)','relatorio_visao_geral',(va#>>'{operacional,contatos_novos}')::numeric,(vp#>>'{operacional,contatos_novos}')::numeric,'completa','completa',null::text,null::text),
    (2,'conversas_novas','Conversas novas','atendimento','fluxo','quantidade','neutro','count(conversas.criado_em no periodo)','relatorio_visao_geral',(va#>>'{operacional,conversas_novas}')::numeric,(vp#>>'{operacional,conversas_novas}')::numeric,'completa','completa',null,null),
    (3,'conversas_com_inbound','Conversas com inbound','atendimento','fluxo','quantidade','neutro','conversas com >=1 entrada','relatorio_visao_geral',(va#>>'{operacional,conversas_com_inbound}')::numeric,(vp#>>'{operacional,conversas_com_inbound}')::numeric,'completa','completa',null,null),
    (4,'conversas_atendidas','Conversas atendidas','atendimento','fluxo','quantidade','maior_melhor','inbound + resposta humana (painel ou celular) posterior','relatorio_visao_geral',(va#>>'{operacional,conversas_atendidas}')::numeric,(vp#>>'{operacional,conversas_atendidas}')::numeric,'completa','completa',null,null),
    (5,'conversas_sem_resposta','Conversas sem resposta','atendimento','fluxo','quantidade','menor_melhor','inbound sem resposta humana nem automacao','relatorio_visao_geral',(va#>>'{operacional,conversas_sem_resposta}')::numeric,(vp#>>'{operacional,conversas_sem_resposta}')::numeric,'completa','completa',null,null),
    (6,'taxa_atendimento_pct','Taxa de atendimento','atendimento','fluxo','percentual','maior_melhor','atendidas / conversas com inbound','relatorio_visao_geral',(va#>>'{operacional,taxa_atendimento_pct}')::numeric,(vp#>>'{operacional,taxa_atendimento_pct}')::numeric,'completa','completa',null,null),
    (7,'respostas_painel','Respostas pelo painel','atendimento','fluxo','quantidade','neutro','mensagens de saida com autor_id','relatorio_visao_geral',(va#>>'{operacional,respostas_painel}')::numeric,(vp#>>'{operacional,respostas_painel}')::numeric,'completa','completa',(va#>>'{operacional,cobertura_atribuicao_msgs_pct}'),(vp#>>'{operacional,cobertura_atribuicao_msgs_pct}')),
    (8,'respostas_celular','Respostas pelo celular','atendimento','fluxo','quantidade','neutro','mensagens de saida sem autor (webhook_fromMe)','relatorio_visao_geral',(va#>>'{operacional,respostas_celular}')::numeric,(vp#>>'{operacional,respostas_celular}')::numeric,'completa','completa',(va#>>'{operacional,cobertura_atribuicao_msgs_pct}'),(vp#>>'{operacional,cobertura_atribuicao_msgs_pct}')),
    (9,'tempo_primeira_resposta_min','Tempo medio de 1a resposta','atendimento','fluxo','minutos','menor_melhor','media(min entre 1a entrada e 1a resposta humana posterior)','sql_canonico',prt_a,prt_p,'completa','completa',null,null),
    -- COMERCIAL (fluxo)
    (10,'oportunidades_criadas','Oportunidades criadas','comercial','fluxo','quantidade','maior_melhor','count(oportunidades.criado_em no periodo)','relatorio_visao_geral',(va#>>'{comercial,oportunidades_criadas}')::numeric,(vp#>>'{comercial,oportunidades_criadas}')::numeric,'completa','completa',(va#>>'{comercial,cobertura_responsavel_opp_pct}'),(vp#>>'{comercial,cobertura_responsavel_opp_pct}')),
    (11,'ganhos_coorte','Ganhos da coorte','comercial','fluxo','quantidade','maior_melhor','criadas no periodo que estao ganho','relatorio_visao_geral',(va#>>'{comercial,ganhos_coorte}')::numeric,(vp#>>'{comercial,ganhos_coorte}')::numeric,'completa','completa',(va#>>'{comercial,cobertura_responsavel_opp_pct}'),(vp#>>'{comercial,cobertura_responsavel_opp_pct}')),
    (12,'conversao_coorte_pct','Conversao da coorte','comercial','fluxo','percentual','maior_melhor','ganhos_coorte / oportunidades_criadas','relatorio_visao_geral',(va#>>'{comercial,conversao_coorte_pct}')::numeric,(vp#>>'{comercial,conversao_coorte_pct}')::numeric,'completa','completa',null,null),
    (13,'fechamentos_periodo','Fechamentos realizados no periodo','comercial','fluxo','quantidade','maior_melhor','count(fechado_em no periodo, status ganho)','relatorio_visao_geral',(va#>>'{comercial,fechamentos_periodo}')::numeric,(vp#>>'{comercial,fechamentos_periodo}')::numeric,'completa','completa',null,null),
    (14,'perdas_periodo','Perdas realizadas no periodo','comercial','fluxo','quantidade','menor_melhor','count(fechado_em no periodo, status perdido)','relatorio_visao_geral',(va#>>'{comercial,perdas_periodo}')::numeric,(vp#>>'{comercial,perdas_periodo}')::numeric,'completa','completa',null,null),
    -- FINANCEIRO FLUXO
    (15,'novos_contratos_periodo','Novos contratos no periodo','financeiro_fluxo','fluxo','quantidade','maior_melhor','count(cobrancas nao canceladas com data_inicio no periodo)','relatorio_financeiro',(fa#>>'{fluxo,novos_contratos_periodo}')::numeric,(fp#>>'{fluxo,novos_contratos_periodo}')::numeric,'completa','completa',null,null),
    (16,'valor_contratado_periodo','Valor contratado no periodo','financeiro_fluxo','fluxo','moeda','maior_melhor','sum(valor_mensal*ciclos_totais) com data_inicio no periodo','relatorio_financeiro',(fa#>>'{fluxo,valor_contratado_periodo}')::numeric,(fp#>>'{fluxo,valor_contratado_periodo}')::numeric,'completa','completa',null,null),
    (17,'receita_prevista_periodo','Receita prevista no periodo','financeiro_fluxo','fluxo','moeda','maior_melhor','sum(valor) parcelas nao canceladas por data_prevista no periodo','relatorio_financeiro',(fa#>>'{fluxo,receita_prevista_periodo}')::numeric,(fp#>>'{fluxo,receita_prevista_periodo}')::numeric,'completa','completa',null,null),
    (18,'receita_recebida_periodo','Receita recebida no periodo','financeiro_fluxo','fluxo','moeda','maior_melhor','sum(valor_pago) parcelas pagas por data_pagamento no periodo','relatorio_financeiro',(fa#>>'{fluxo,receita_recebida_periodo}')::numeric,(fp#>>'{fluxo,receita_recebida_periodo}')::numeric,'completa','completa',null,null),
    (19,'valor_com_vencimento_no_periodo','Valor com vencimento no periodo','financeiro_fluxo','fluxo','moeda','neutro','saldo aberto de parcelas com data_prevista no periodo','relatorio_financeiro',(fa#>>'{fluxo,valor_com_vencimento_no_periodo}')::numeric,(fp#>>'{fluxo,valor_com_vencimento_no_periodo}')::numeric,'completa','completa',null,null),
    -- FINANCEIRO ESTOQUE
    (20,'contratos_ativos','Contratos ativos','financeiro_estoque','estoque','quantidade','maior_melhor','count(cobrancas nao canceladas nem finalizadas)','relatorio_financeiro',(fa#>>'{estoque,contratos_ativos}')::numeric,(fp#>>'{estoque,contratos_ativos}')::numeric,'completa','completa',null,null),
    (21,'carteira_contratada_ativa','Carteira contratada ativa','financeiro_estoque','estoque','moeda','maior_melhor','sum(valor_mensal*ciclos_totais) da carteira ativa','relatorio_financeiro',(fa#>>'{estoque,carteira_contratada_ativa}')::numeric,(fp#>>'{estoque,carteira_contratada_ativa}')::numeric,'completa','completa',null,null),
    (22,'ticket_medio_mensal_ativo','Ticket medio mensal ativo','financeiro_estoque','estoque','moeda','maior_melhor','avg(valor_mensal) da carteira ativa','relatorio_financeiro',(fa#>>'{estoque,ticket_medio_mensal_ativo}')::numeric,(fp#>>'{estoque,ticket_medio_mensal_ativo}')::numeric,'completa','completa',null,null),
    (23,'ticket_medio_contratado_ativo','Ticket medio contratado ativo','financeiro_estoque','estoque','moeda','maior_melhor','carteira_contratada_ativa / contratos_ativos','relatorio_financeiro',(fa#>>'{estoque,ticket_medio_contratado_ativo}')::numeric,(fp#>>'{estoque,ticket_medio_contratado_ativo}')::numeric,'completa','completa',null,null),
    -- FINANCEIRO POSIÇÃO (qualidade = qualidade_posicao de cada período)
    (24,'saldo_total_em_aberto','Saldo total em aberto','financeiro_posicao','posicao','moeda','neutro','sum(saldo) de parcelas abertas na data de corte','relatorio_financeiro',(fa#>>'{posicao,saldo_total_em_aberto}')::numeric,(fp#>>'{posicao,saldo_total_em_aberto}')::numeric,(fa#>>'{qualidade_posicao,status}'),(fp#>>'{qualidade_posicao,status}'),(fa#>>'{qualidade_posicao,motivo}'),(fp#>>'{qualidade_posicao,motivo}')),
    (25,'saldo_a_vencer_data_corte','Saldo a vencer na data de corte','financeiro_posicao','posicao','moeda','neutro','saldo aberto com data_prevista >= corte','relatorio_financeiro',(fa#>>'{posicao,saldo_a_vencer_data_corte}')::numeric,(fp#>>'{posicao,saldo_a_vencer_data_corte}')::numeric,(fa#>>'{qualidade_posicao,status}'),(fp#>>'{qualidade_posicao,status}'),(fa#>>'{qualidade_posicao,motivo}'),(fp#>>'{qualidade_posicao,motivo}')),
    (26,'saldo_vencido_data_corte','Saldo vencido na data de corte','financeiro_posicao','posicao','moeda','menor_melhor','saldo aberto com data_prevista < corte','relatorio_financeiro',(fa#>>'{posicao,saldo_vencido_data_corte}')::numeric,(fp#>>'{posicao,saldo_vencido_data_corte}')::numeric,(fa#>>'{qualidade_posicao,status}'),(fp#>>'{qualidade_posicao,status}'),(fa#>>'{qualidade_posicao,motivo}'),(fp#>>'{qualidade_posicao,motivo}')),
    (27,'inadimplencia_valor_data_corte_pct','Inadimplencia por valor','financeiro_posicao','posicao','percentual','menor_melhor','saldo vencido / total vencido (por valor)','relatorio_financeiro',(fa#>>'{posicao,inadimplencia_valor_data_corte_pct}')::numeric,(fp#>>'{posicao,inadimplencia_valor_data_corte_pct}')::numeric,(fa#>>'{qualidade_posicao,status}'),(fp#>>'{qualidade_posicao,status}'),(fa#>>'{qualidade_posicao,motivo}'),(fp#>>'{qualidade_posicao,motivo}')),
    (28,'inadimplencia_parcelas_data_corte_pct','Inadimplencia por parcelas','financeiro_posicao','posicao','percentual','menor_melhor','parcelas vencidas abertas / vencidas totais','relatorio_financeiro',(fa#>>'{posicao,inadimplencia_parcelas_data_corte_pct}')::numeric,(fp#>>'{posicao,inadimplencia_parcelas_data_corte_pct}')::numeric,(fa#>>'{qualidade_posicao,status}'),(fp#>>'{qualidade_posicao,status}'),(fa#>>'{qualidade_posicao,motivo}'),(fp#>>'{qualidade_posicao,motivo}'))
  ),
  kpi as (
    select ord,codigo,titulo,grupo,tipo,unidade,sentido,formula,fonte,va_val,vp_val,qual_a,qual_p,cob_a,cob_p,
      -- diferença absoluta (percentual => pontos percentuais; moeda => 2; minutos/percentual => 1; quantidade => 0)
      case when va_val is null or vp_val is null then null
           else round(va_val - vp_val, case unidade when 'moeda' then 2 when 'quantidade' then 0 else 1 end) end as dif_abs,
      -- variação percentual (nula para unidade percentual: usa-se a diferença em p.p.; sem infinito)
      case when unidade='percentual' then null
           when va_val is null or vp_val is null then null
           when vp_val=0 and va_val=0 then 0
           when vp_val=0 then null
           else round(100.0*(va_val-vp_val)/abs(vp_val),1) end as var_pct,
      -- direção semântica
      case
        when va_val is null or vp_val is null then 'indefinido'
        when vp_val=0 and va_val>0 then 'aumento_sem_base'
        when va_val=vp_val then 'estavel'
        when sentido='neutro' then (case when va_val>vp_val then 'aumento' else 'queda' end)
        when (va_val>vp_val and sentido='maior_melhor') or (va_val<vp_val and sentido='menor_melhor') then 'melhora'
        else 'piora'
      end as direcao
    from raw
  )
  select jsonb_build_object(
    'periodo_atual', jsonb_build_object('inicio',p_inicio_atual,'fim_exclusivo',p_fim_atual,'data_corte',p_corte_atual,'timezone','America/Sao_Paulo'),
    'periodo_anterior', jsonb_build_object('inicio',p_inicio_anterior,'fim_exclusivo',p_fim_anterior,'data_corte',p_corte_anterior,'timezone','America/Sao_Paulo'),
    'comparabilidade', jsonb_build_object(
      'duracao_atual_dias', dur_a, 'duracao_anterior_dias', dur_p, 'mesma_duracao', (dur_a=dur_p),
      'offset_corte_atual_dias', off_a, 'offset_corte_anterior_dias', off_p, 'cortes_equivalentes', (off_a=off_p),
      'atual_parcial', (p_corte_atual < p_fim_atual), 'anterior_parcial', (p_corte_anterior < p_fim_anterior),
      'periodos_comparaveis', (dur_a=dur_p and off_a=off_p),
      'aviso_periodo', case when dur_a<>dur_p then 'duracoes_diferentes'
                            when off_a<>off_p then 'cortes_nao_equivalentes'
                            else null end),
    'qualidade_financeira', jsonb_build_object(
      'atual', fa->'qualidade_posicao', 'anterior', fp->'qualidade_posicao',
      'orientacao', case when (fa#>>'{qualidade_posicao,status}')='limitada' or (fp#>>'{qualidade_posicao,status}')='limitada'
        then 'Posicao em data de corte anterior a hoje e reconstruida por data_pagamento; cancelamentos sem timestamp podem afetar. Trate a comparacao de saldo/inadimplencia como indicativa.'
        when (fa#>>'{qualidade_posicao,status}')='completa_reconstruida' or (fp#>>'{qualidade_posicao,status}')='completa_reconstruida'
        then 'Posicao de periodo passado reconstruida por data_pagamento (sem parcelas canceladas); confiavel.'
        else null end),
    'kpis', coalesce((select jsonb_agg(jsonb_build_object(
      'codigo',codigo,'titulo',titulo,'grupo',grupo,'tipo',tipo,'unidade',unidade,'sentido',sentido,
      'formula',formula,'fonte',fonte,
      'valor_atual',va_val,'valor_anterior',vp_val,
      'diferenca_absoluta',dif_abs,'variacao_percentual',var_pct,'direcao',direcao,
      'qualidade_atual',qual_a,'qualidade_anterior',qual_p,'cobertura_atual',cob_a,'cobertura_anterior',cob_p
    ) order by ord) from kpi),'[]'::jsonb)
  ) into r;
  return r;
end $function$;
grant execute on function public.relatorio_snapshot(uuid, date, date, date, date, date, date) to authenticated;
