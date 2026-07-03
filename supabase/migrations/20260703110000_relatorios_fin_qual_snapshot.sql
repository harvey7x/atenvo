-- ETAPA 2B — RPCs 4-6: financeiro, qualidade_dados, snapshot. Isoladas por org, SP, fim exclusivo.

-- ============ 4) RELATORIO_FINANCEIRO ============
create or replace function public.relatorio_financeiro(p_org uuid, p_inicio date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'sem_acesso' using errcode='insufficient_privilege'; end if;
  with
  cob as (select * from cobrancas where organizacao_id=p_org),
  par as (select * from cobranca_pagamentos where organizacao_id=p_org),
  agg_cob as (select
      coalesce(sum(valor_mensal*coalesce(ciclos_totais,0)) filter (where status<>'cancelado'),0) contratada,
      count(*) filter (where status<>'cancelado') contratos,
      coalesce(avg(valor_mensal) filter (where status<>'cancelado'),0) ticket_mensal,
      coalesce(sum(valor_economizado),0) economia from cob),
  agg_par as (select
      coalesce(sum(valor) filter (where status<>'cancelada' and data_prevista>=p_inicio and data_prevista<p_fim),0) prevista,
      coalesce(sum(valor_pago) filter (where status='paga' and data_pagamento>=p_inicio and data_pagamento<p_fim),0) recebida,
      coalesce(sum(valor) filter (where status not in ('cancelada','paga') and data_prevista>=v_hoje),0) a_vencer,
      coalesce(sum(valor) filter (where status not in ('cancelada','paga') and data_prevista<v_hoje),0) vencido_aberto,
      coalesce(sum(valor) filter (where status<>'cancelada' and data_prevista<v_hoje),0) vencido_total,
      count(*) filter (where status not in ('cancelada','paga') and data_prevista<v_hoje) venc_ab_qtd,
      count(*) filter (where status<>'cancelada' and data_prevista<v_hoje) venc_tot_qtd from par),
  por_servico as (select servico, coalesce(sum(valor_mensal*coalesce(ciclos_totais,0)) filter (where status<>'cancelado'),0) contratada from cob group by servico),
  por_canal as (select ct.canal_origem_id cid, coalesce(sum(cb.valor_mensal*coalesce(cb.ciclos_totais,0)) filter (where cb.status<>'cancelado'),0) contratada from cob cb join contatos ct on ct.id=cb.contato_id group by ct.canal_origem_id),
  por_resp as (select o.responsavel_no_fechamento_id rid, coalesce(sum(cp.valor_pago) filter (where cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim),0) recebida
               from par cp join cob cb on cb.id=cp.cobranca_id left join oportunidades o on o.id=cb.oportunidade_id group by o.responsavel_no_fechamento_id),
  prev as (select to_char(data_prevista,'YYYY-MM') mes, coalesce(sum(valor),0) previsto from par where status not in ('cancelada','paga') and data_prevista>=v_hoje group by to_char(data_prevista,'YYYY-MM') order by 1 limit 6)
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio',p_inicio,'fim_exclusivo',p_fim,'timezone','America/Sao_Paulo'),
    'receita_contratada', ac.contratada, 'receita_prevista', ap.prevista, 'receita_recebida', ap.recebida,
    'a_vencer', ap.a_vencer, 'vencido', ap.vencido_aberto,
    'inadimplencia_valor_pct', case when ap.vencido_total=0 then null else round(100.0*ap.vencido_aberto/ap.vencido_total,1) end,
    'inadimplencia_parcelas_pct', case when ap.venc_tot_qtd=0 then null else round(100.0*ap.venc_ab_qtd/ap.venc_tot_qtd,1) end,
    'ticket_medio_mensal', round(ac.ticket_mensal,2),
    'ticket_medio_contratado', case when ac.contratos=0 then 0 else round(ac.contratada/ac.contratos,2) end,
    'economia_gerada', ac.economia,
    'receita_por_servico', coalesce((select jsonb_agg(jsonb_build_object('servico',servico,'receita_contratada',contratada) order by contratada desc) from por_servico),'[]'::jsonb),
    'receita_por_canal_origem', coalesce((select jsonb_agg(jsonb_build_object('canal_id',pc.cid,'canal',coalesce(cn.nome_interno,'(sem origem)'),'receita_contratada',pc.contratada) order by pc.contratada desc) from por_canal pc left join canais cn on cn.id=pc.cid),'[]'::jsonb),
    'receita_por_responsavel_fechamento', coalesce((select jsonb_agg(jsonb_build_object('responsavel_id',pr.rid,'nome',coalesce(u.nome,'Sem atribuição'),'receita_recebida',pr.recebida) order by pr.recebida desc) from por_resp pr left join usuarios u on u.id=pr.rid),'[]'::jsonb),
    'previsao_proximos_meses', coalesce((select jsonb_agg(jsonb_build_object('mes',mes,'previsto',previsto) order by mes) from prev),'[]'::jsonb)
  ) into r from agg_cob ac, agg_par ap;
  return r;
end $function$;
grant execute on function public.relatorio_financeiro(uuid, date, date) to authenticated;

-- ============ 5) RELATORIO_QUALIDADE_DADOS ============
create or replace function public.relatorio_qualidade_dados(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare r jsonb;
  n_opp int; n_ct int; n_conv int; n_msg_out int; n_cob int; n_par int;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'sem_acesso' using errcode='insufficient_privilege'; end if;
  select count(*) into n_opp from oportunidades where organizacao_id=p_org;
  select count(*) into n_ct from contatos where organizacao_id=p_org;
  select count(*) into n_conv from conversas where organizacao_id=p_org;
  select count(*) into n_msg_out from mensagens where organizacao_id=p_org and direcao='saida';
  select count(*) into n_cob from cobrancas where organizacao_id=p_org;
  select count(*) into n_par from cobranca_pagamentos where organizacao_id=p_org;
  with a(codigo,titulo,quantidade,universo,severidade,orientacao,drill) as (values
    ('opp_sem_responsavel','Oportunidades sem responsável', (select count(*) from oportunidades where organizacao_id=p_org and responsavel_id is null), n_opp, 'alta','Atribua um responsável às oportunidades para habilitar ranking comercial.','oportunidades:responsavel_id=null'),
    ('opp_sem_canal_origem','Oportunidades sem canal de origem', (select count(*) from oportunidades where organizacao_id=p_org and canal_origem_id is null), n_opp, 'media','Vincule a conexão de origem para desempenho por canal.','oportunidades:canal_origem_id=null'),
    ('ganho_sem_fechado_em','Ganhos sem data de fechamento', (select count(*) from oportunidades where organizacao_id=p_org and status='ganho' and fechado_em is null), n_opp, 'alta','Fechamentos sem fechado_em distorcem conversão por período.','oportunidades:status=ganho&fechado_em=null'),
    ('ganho_data_estimada','Ganhos com data estimada', (select count(*) from oportunidades where organizacao_id=p_org and status='ganho' and fechado_em_estimado), n_opp, 'media','Datas estimadas (backfill) devem ser sinalizadas nos gráficos.','oportunidades:fechado_em_estimado=true'),
    ('fechamento_sem_responsavel_hist','Fechamentos sem responsável histórico', (select count(*) from oportunidades where organizacao_id=p_org and status in ('ganho','perdido') and responsavel_no_fechamento_id is null), n_opp, 'media','Sem snapshot de responsável, o crédito do fechamento fica sem atribuição.','oportunidades:status_terminal&resp_fech=null'),
    ('conversa_sem_contato','Conversas sem contato', (select count(*) from conversas where organizacao_id=p_org and contato_id is null), n_conv, 'alta','Conversa sem contato impede consolidação por cliente.','conversas:contato_id=null'),
    ('msg_saida_sem_autor','Mensagens de saída sem autor', n_msg_out - (select count(*) from mensagens where organizacao_id=p_org and direcao='saida' and autor_id is not null), n_msg_out, 'media','Respostas pelo celular (webhook_fromMe) não têm autor; reduzem a cobertura de atribuição.','mensagens:direcao=saida&autor_id=null'),
    ('contato_sem_telefone','Contatos sem telefone', (select count(*) from contatos where organizacao_id=p_org and (telefone is null or btrim(telefone)='')), n_ct, 'baixa','Contatos sem telefone confirmado não recebem mensagens.','contatos:telefone=null'),
    ('contato_sem_canal_origem','Contatos sem canal de origem', (select count(*) from contatos where organizacao_id=p_org and canal_origem_id is null), n_ct, 'baixa','Sem origem preservada, o desempenho comercial por canal fica incompleto.','contatos:canal_origem_id=null'),
    ('contato_duplicado_telefone','Contatos duplicados por telefone', (select coalesce(sum(c-1),0) from (select count(*) c from contatos where organizacao_id=p_org and telefone is not null and btrim(telefone)<>'' group by regexp_replace(telefone,'[^0-9]','','g') having count(*)>1) t), n_ct, 'media','Contatos duplicados inflam contagens; consolide por telefone.','contatos:duplicado_telefone'),
    ('cobranca_sem_valor','Cobranças sem valor', (select count(*) from cobrancas where organizacao_id=p_org and (valor_mensal is null or valor_mensal=0)), n_cob, 'alta','Cobrança sem valor não entra no financeiro.','cobrancas:valor_mensal=0'),
    ('parcela_sem_valor','Parcelas sem valor', (select count(*) from cobranca_pagamentos where organizacao_id=p_org and (valor is null or valor=0)), n_par, 'alta','Parcela sem valor distorce previsto/recebido.','cobranca_pagamentos:valor=0'),
    ('responsavel_inativo','Oportunidades com responsável inativo', (select count(*) from oportunidades o where o.organizacao_id=p_org and o.responsavel_id is not null and not exists(select 1 from organizacao_usuarios ou where ou.usuario_id=o.responsavel_id and ou.organizacao_id=o.organizacao_id and ou.status='ativo')), n_opp, 'media','Reatribua oportunidades de responsáveis inativos.','oportunidades:responsavel_inativo'),
    ('coluna_sem_resultado','Colunas sem resultado configurado', (select count(*) from funil_colunas where organizacao_id=p_org and arquivada=false and resultado is null), (select count(*) from funil_colunas where organizacao_id=p_org and arquivada=false), 'baixa','Toda coluna deve ter resultado (neutro/ganho/perdido).','funil_colunas:resultado=null'),
    ('opp_incompativel_resultado','Oportunidades incompatíveis com o resultado da coluna', (select count(*) from oportunidades o join funil_colunas fc on fc.id=o.coluna_id where o.organizacao_id=p_org and ((fc.resultado='ganho' and o.status<>'ganho') or (fc.resultado='perdido' and o.status<>'perdido') or (fc.resultado='neutro' and o.status in ('ganho','perdido')))), n_opp, 'alta','Sincronização coluna×status divergente; verifique o trigger de fechamento.','oportunidades:incompativel_coluna')
  )
  select jsonb_build_object('org', p_org, 'alertas', jsonb_agg(jsonb_build_object('codigo',codigo,'titulo',titulo,'quantidade',quantidade,'percentual', case when universo=0 then null else round(100.0*quantidade/universo,1) end,'severidade',severidade,'orientacao',orientacao,'drill',drill) order by (case severidade when 'alta' then 0 when 'media' then 1 else 2 end), quantidade desc)) into r from a;
  return r;
end $function$;
grant execute on function public.relatorio_qualidade_dados(uuid) to authenticated;

-- ============ 6) RELATORIO_SNAPSHOT (comparativo, reusa relatorio_visao_geral) ============
create or replace function public.relatorio_snapshot(p_org uuid, p_ini_atual date, p_fim_atual date, p_ini_ant date, p_fim_ant date)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare va jsonb; vp jsonb; r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'sem_acesso' using errcode='insufficient_privilege'; end if;
  va := public.relatorio_visao_geral(p_org, p_ini_atual, p_fim_atual);
  vp := public.relatorio_visao_geral(p_org, p_ini_ant, p_fim_ant);
  with k(codigo, titulo, unidade, formula, path_grp, path_key) as (values
    ('contatos_novos','Contatos novos','qtd','count(contatos.criado_em no período)','operacional','contatos_novos'),
    ('conversas_novas','Conversas novas','qtd','count(conversas.criado_em no período)','operacional','conversas_novas'),
    ('conversas_atendidas','Conversas atendidas','qtd','inbound + resposta humana (painel ou celular) posterior','operacional','conversas_atendidas'),
    ('taxa_atendimento_pct','Taxa de atendimento','%','atendidas ÷ conversas com inbound','operacional','taxa_atendimento_pct'),
    ('oportunidades_criadas','Oportunidades criadas','qtd','count(oportunidades.criado_em no período)','comercial','oportunidades_criadas'),
    ('ganhos_coorte','Ganhos da coorte','qtd','criadas no período que estão ganho','comercial','ganhos_coorte'),
    ('conversao_coorte_pct','Conversão de coorte','%','ganhos_coorte ÷ criadas','comercial','conversao_coorte_pct'),
    ('fechamentos_periodo','Fechamentos do período','qtd','count(fechado_em no período, status ganho)','comercial','fechamentos_periodo'),
    ('receita_recebida','Receita recebida','R$','parcelas pagas por data_pagamento no período','financeiro','receita_recebida'),
    ('receita_prevista','Receita prevista','R$','parcelas previstas por data_prevista no período','financeiro','receita_prevista')
  )
  select jsonb_build_object(
    'periodo_atual', jsonb_build_object('inicio',p_ini_atual,'fim_exclusivo',p_fim_atual),
    'periodo_anterior', jsonb_build_object('inicio',p_ini_ant,'fim_exclusivo',p_fim_ant),
    'aviso', case when (p_fim_atual - p_ini_atual) <> (p_fim_ant - p_ini_ant) then 'periodos_de_duracoes_diferentes' else null end,
    'kpis', jsonb_agg(jsonb_build_object(
      'codigo',k.codigo,'titulo',k.titulo,'unidade',k.unidade,'formula',k.formula,
      'valor', (va->k.path_grp->>k.path_key)::numeric,
      'valor_anterior', (vp->k.path_grp->>k.path_key)::numeric,
      'diferenca_absoluta', round((va->k.path_grp->>k.path_key)::numeric - (vp->k.path_grp->>k.path_key)::numeric, 2),
      'variacao_percentual', case when coalesce((vp->k.path_grp->>k.path_key)::numeric,0)=0 then null else round(100.0*((va->k.path_grp->>k.path_key)::numeric-(vp->k.path_grp->>k.path_key)::numeric)/(vp->k.path_grp->>k.path_key)::numeric,1) end,
      'cobertura', va->'qualidade'->'alertas', 'qualidade', 'ver relatorio_qualidade_dados'
    ) order by k.codigo)
  ) into r from k;
  return r;
end $function$;
grant execute on function public.relatorio_snapshot(uuid, date, date, date, date) to authenticated;
