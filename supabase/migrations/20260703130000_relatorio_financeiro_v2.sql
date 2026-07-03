-- ETAPA 2B — relatorio_financeiro v2: separa ESTOQUE × FLUXO × POSIÇÃO na data de corte.
-- Nova migration (não edita as antigas). Isolada por org (is_member/is_platform_admin), SP,
-- período com FIM EXCLUSIVO, data de corte EXPLÍCITA (p_data_corte).
--
-- Fatos do modelo (auditados):
--  * Data oficial de contratação = cobrancas.data_inicio (início do contrato). criado_em = registro no sistema.
--  * cobranca_pagamentos é a tabela de parcelas: 1 linha por (cobranca_id, ciclo).
--  * chk_pag_coerencia: 'paga' => valor_pago=valor E data_pagamento not null;
--    'prevista'/'nao_paga'/'cancelada' => valor_pago NULL e data_pagamento NULL.
--    => PAGAMENTO PARCIAL NÃO É REPRESENTÁVEL. saldo de uma parcela é valor (aberta) ou 0 (paga).
--  * Cancelamento de parcela NÃO tem timestamp; apenas pagamento tem data (data_pagamento).
--    Por isso a posição em corte < hoje é reconstruída por data_pagamento e sinalizada em qualidade_posicao.
--  * Carteira ATIVA exclui status 'cancelado' e 'finalizado' (contratos vivos).

drop function if exists public.relatorio_financeiro(uuid, date, date);

create or replace function public.relatorio_financeiro(
  p_org uuid, p_inicio date, p_fim date, p_data_corte date default null)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_corte date := coalesce(p_data_corte, v_hoje);
  v_cancel_par int;
  v_qual_status text;
  v_qual_motivo text;
  r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then
    raise exception 'sem_acesso' using errcode='insufficient_privilege';
  end if;

  -- Qualidade da reconstrução da POSIÇÃO na data de corte.
  select count(*) into v_cancel_par
    from cobranca_pagamentos where organizacao_id = p_org and status = 'cancelada';
  if v_corte >= v_hoje then
    v_qual_status := 'completa';
    v_qual_motivo := null;
  elsif v_cancel_par = 0 then
    v_qual_status := 'completa_reconstruida';
    v_qual_motivo := 'posicao historica reconstruida por data_pagamento; nao ha parcelas canceladas que possam distorcer a data de corte';
  else
    v_qual_status := 'limitada';
    v_qual_motivo := 'cancelamentos de parcela nao possuem data; a posicao em corte anterior a hoje pode divergir para parcelas canceladas depois do corte';
  end if;

  with
  cob as (
    select c.*,
      (c.status <> 'cancelado') as nao_cancelada,
      (c.status not in ('cancelado','finalizado')) as ativa
    from cobrancas c where c.organizacao_id = p_org),
  -- Parcelas de cobranças NÃO canceladas (contrato cancelado não carrega recebível).
  -- 'finalizado' é mantido: seus pagamentos são receita real e ele não tem saldo aberto.
  par as (
    select cp.*,
      (cp.status='paga' and cp.data_pagamento is not null and cp.data_pagamento < v_corte) as pago_ate_corte,
      (cp.status <> 'cancelada'
        and not (cp.status='paga' and cp.data_pagamento is not null and cp.data_pagamento < v_corte)) as aberto_corte,
      (case
         when cp.status='cancelada' then 0
         when cp.status='paga' and cp.data_pagamento is not null and cp.data_pagamento < v_corte
           then greatest(cp.valor - coalesce(cp.valor_pago,0), 0)
         else cp.valor
       end) as saldo_corte
    from cobranca_pagamentos cp
      join cobrancas cc on cc.id = cp.cobranca_id and cc.status <> 'cancelado'
    where cp.organizacao_id = p_org),
  -- ESTOQUE (carteira viva, independe do período)
  estoque as (
    select
      coalesce(sum(valor_mensal*coalesce(ciclos_totais,0)) filter (where ativa),0) carteira,
      count(*) filter (where ativa) contratos,
      coalesce(avg(valor_mensal) filter (where ativa),0) ticket_mensal,
      coalesce(sum(coalesce(valor_economizado,0)) filter (where ativa),0) economia
    from cob),
  -- FLUXO de contratos no período (por data_inicio)
  fluxo as (
    select
      count(*) filter (where nao_cancelada and data_inicio>=p_inicio and data_inicio<p_fim) novos_contratos,
      coalesce(sum(valor_mensal*coalesce(ciclos_totais,0))
        filter (where nao_cancelada and data_inicio>=p_inicio and data_inicio<p_fim),0) valor_contratado
    from cob),
  -- FLUXO de parcelas no período (previsto por data_prevista, recebido por data_pagamento)
  fluxo_par as (
    select
      coalesce(sum(valor)
        filter (where status<>'cancelada' and data_prevista>=p_inicio and data_prevista<p_fim),0) prevista,
      coalesce(sum(valor_pago)
        filter (where status='paga' and data_pagamento>=p_inicio and data_pagamento<p_fim),0) recebida,
      coalesce(sum(valor - coalesce(valor_pago,0))
        filter (where status<>'cancelada' and data_prevista>=p_inicio and data_prevista<p_fim),0) com_vencimento_aberto
    from par),
  -- POSIÇÃO na data de corte (saldo em aberto = valor de parcelas ainda não pagas até o corte)
  posicao as (
    select
      coalesce(sum(saldo_corte) filter (where aberto_corte),0) saldo_total,
      coalesce(sum(saldo_corte) filter (where aberto_corte and data_prevista>=v_corte),0) saldo_a_vencer,
      coalesce(sum(saldo_corte) filter (where aberto_corte and data_prevista<v_corte),0) saldo_vencido,
      coalesce(sum(valor) filter (where status<>'cancelada' and data_prevista<v_corte),0) vencido_total_valor,
      count(*) filter (where aberto_corte and data_prevista<v_corte) venc_ab_q,
      count(*) filter (where status<>'cancelada' and data_prevista<v_corte) venc_tot_q
    from par),
  -- CONTRATADO por dimensão (base = carteira ativa; cada soma fecha com carteira_contratada_ativa)
  ct_serv as (
    select coalesce(servico,'(sem serviço)') servico,
      coalesce(sum(valor_mensal*coalesce(ciclos_totais,0)) filter (where ativa),0) v
    from cob group by coalesce(servico,'(sem serviço)')
    having coalesce(sum(valor_mensal*coalesce(ciclos_totais,0)) filter (where ativa),0) <> 0),
  ct_canal as (
    select ct.canal_origem_id cid,
      coalesce(sum(cb.valor_mensal*coalesce(cb.ciclos_totais,0)) filter (where cb.ativa),0) v
    from cob cb left join contatos ct on ct.id=cb.contato_id
    group by ct.canal_origem_id
    having coalesce(sum(cb.valor_mensal*coalesce(cb.ciclos_totais,0)) filter (where cb.ativa),0) <> 0),
  ct_resp as (
    select o.responsavel_no_fechamento_id rid,
      coalesce(sum(cb.valor_mensal*coalesce(cb.ciclos_totais,0)) filter (where cb.ativa),0) v
    from cob cb left join oportunidades o on o.id=cb.oportunidade_id
    group by o.responsavel_no_fechamento_id
    having coalesce(sum(cb.valor_mensal*coalesce(cb.ciclos_totais,0)) filter (where cb.ativa),0) <> 0),
  -- RECEBIDO por dimensão (base = parcelas pagas no período; cada soma fecha com receita_recebida_periodo)
  rc_serv as (
    select coalesce(cb.servico,'(sem serviço)') servico,
      coalesce(sum(cp.valor_pago) filter (where cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim),0) v
    from par cp join cob cb on cb.id=cp.cobranca_id
    group by coalesce(cb.servico,'(sem serviço)')
    having coalesce(sum(cp.valor_pago) filter (where cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim),0) <> 0),
  rc_canal as (
    select ct.canal_origem_id cid,
      coalesce(sum(cp.valor_pago) filter (where cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim),0) v
    from par cp join cob cb on cb.id=cp.cobranca_id left join contatos ct on ct.id=cb.contato_id
    group by ct.canal_origem_id
    having coalesce(sum(cp.valor_pago) filter (where cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim),0) <> 0),
  rc_resp as (
    select o.responsavel_no_fechamento_id rid,
      coalesce(sum(cp.valor_pago) filter (where cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim),0) v
    from par cp join cob cb on cb.id=cp.cobranca_id left join oportunidades o on o.id=cb.oportunidade_id
    group by o.responsavel_no_fechamento_id
    having coalesce(sum(cp.valor_pago) filter (where cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim),0) <> 0),
  -- PREVISÃO futura (saldo aberto por mês a partir do corte; soma fecha com saldo_a_vencer_data_corte)
  prev as (
    select to_char(data_prevista,'YYYY-MM') mes, coalesce(sum(saldo_corte),0) previsto
    from par where aberto_corte and data_prevista>=v_corte
    group by to_char(data_prevista,'YYYY-MM'))
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio',p_inicio,'fim_exclusivo',p_fim,'timezone','America/Sao_Paulo'),
    'data_corte', v_corte,
    'qualidade_posicao', jsonb_build_object('status', v_qual_status, 'motivo', v_qual_motivo),
    'modelo', jsonb_build_object(
      'pagamento_parcial_suportado', false,
      'observacao', 'chk_pag_coerencia: parcela paga exige valor_pago=valor; demais estados tem valor_pago nulo. Uma parcela por (cobranca,ciclo). Data de contratacao = cobrancas.data_inicio.'),
    'estoque', jsonb_build_object(
      'carteira_contratada_ativa', e.carteira,
      'contratos_ativos', e.contratos,
      'ticket_medio_mensal_ativo', round(e.ticket_mensal,2),
      'ticket_medio_contratado_ativo', case when e.contratos=0 then 0 else round(e.carteira/e.contratos,2) end,
      'economia_gerada_ativa', e.economia),
    'fluxo', jsonb_build_object(
      'novos_contratos_periodo', f.novos_contratos,
      'valor_contratado_periodo', f.valor_contratado,
      'receita_prevista_periodo', fp.prevista,
      'receita_recebida_periodo', fp.recebida,
      'valor_com_vencimento_no_periodo', fp.com_vencimento_aberto),
    'posicao', jsonb_build_object(
      'saldo_total_em_aberto', p.saldo_total,
      'saldo_a_vencer_data_corte', p.saldo_a_vencer,
      'saldo_vencido_data_corte', p.saldo_vencido,
      'inadimplencia_valor_data_corte_pct',
        case when p.vencido_total_valor=0 then null else round(100.0*p.saldo_vencido/p.vencido_total_valor,1) end,
      'inadimplencia_parcelas_data_corte_pct',
        case when p.venc_tot_q=0 then null else round(100.0*p.venc_ab_q/p.venc_tot_q,1) end),
    'contratado', jsonb_build_object(
      'por_servico', coalesce((select jsonb_agg(jsonb_build_object('servico',servico,'valor_contratado',v) order by v desc) from ct_serv),'[]'::jsonb),
      'por_canal_origem', coalesce((select jsonb_agg(jsonb_build_object('canal_id',c.cid,'canal',coalesce(cn.nome_interno,'(sem origem)'),'valor_contratado',c.v) order by c.v desc) from ct_canal c left join canais cn on cn.id=c.cid),'[]'::jsonb),
      'por_responsavel_fechamento', coalesce((select jsonb_agg(jsonb_build_object('responsavel_id',rp.rid,'nome',coalesce(u.nome,'Sem atribuição'),'valor_contratado',rp.v) order by rp.v desc) from ct_resp rp left join usuarios u on u.id=rp.rid),'[]'::jsonb)),
    'recebido', jsonb_build_object(
      'por_servico', coalesce((select jsonb_agg(jsonb_build_object('servico',servico,'receita_recebida',v) order by v desc) from rc_serv),'[]'::jsonb),
      'por_canal_origem', coalesce((select jsonb_agg(jsonb_build_object('canal_id',c.cid,'canal',coalesce(cn.nome_interno,'(sem origem)'),'receita_recebida',c.v) order by c.v desc) from rc_canal c left join canais cn on cn.id=c.cid),'[]'::jsonb),
      'por_responsavel_fechamento', coalesce((select jsonb_agg(jsonb_build_object('responsavel_id',rp.rid,'nome',coalesce(u.nome,'Sem atribuição'),'receita_recebida',rp.v) order by rp.v desc) from rc_resp rp left join usuarios u on u.id=rp.rid),'[]'::jsonb)),
    'previsao_proximos_meses', coalesce((select jsonb_agg(jsonb_build_object('mes',mes,'previsto',previsto) order by mes) from prev),'[]'::jsonb)
  ) into r
  from estoque e, fluxo f, fluxo_par fp, posicao p;
  return r;
end $function$;
grant execute on function public.relatorio_financeiro(uuid, date, date, date) to authenticated;

-- ============ RELATORIO_QUALIDADE_DADOS — acrescenta alerta de serviço não normalizado ============
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
  with
  base as (
    select codigo,titulo,quantidade,universo,severidade,orientacao,drill, null::jsonb detalhe
    from (values
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
    ) a(codigo,titulo,quantidade,universo,severidade,orientacao,drill)
  ),
  -- Serviços equivalentes com grafias diferentes (espaços/caixa). Normalização SEGURA:
  -- colapsa espaços internos, remove espaços das pontas e ignora caixa. Acentuação NÃO é alterada.
  serv_norm as (
    select servico original,
      lower(btrim(regexp_replace(servico,'\s+',' ','g'))) chave,
      count(*) cob_qtd,
      coalesce(sum(valor_mensal*coalesce(ciclos_totais,0)),0) valor
    from cobrancas
    where organizacao_id=p_org and status<>'cancelado' and servico is not null and btrim(servico)<>''
    group by servico
  ),
  serv_grp as (
    select chave, count(*) variantes, sum(cob_qtd) cob_qtd, sum(valor) valor
    from serv_norm group by chave having count(*)>1
  ),
  serv_det as (
    select g.chave, g.variantes, g.cob_qtd, g.valor,
      jsonb_agg(jsonb_build_object('original', n.original, 'cobrancas', n.cob_qtd, 'valor_contratado', n.valor) order by n.valor desc) itens
    from serv_grp g join serv_norm n on n.chave=g.chave
    group by g.chave, g.variantes, g.cob_qtd, g.valor
  ),
  serv as (
    select 'servico_nao_normalizado' codigo,
      'Serviços equivalentes com grafias diferentes' titulo,
      (select count(*) from serv_grp)::int quantidade,
      null::int universo,
      'media' severidade,
      'Padronize a grafia do serviço (espaços/caixa) para consolidar a receita por serviço. Não altere os registros automaticamente.' orientacao,
      'cobrancas:servico_variantes' drill,
      coalesce((select jsonb_agg(jsonb_build_object(
        'normalizado', chave, 'variantes', variantes, 'cobrancas', cob_qtd,
        'impacto_financeiro', valor, 'itens', itens) order by valor desc) from serv_det),'[]'::jsonb) detalhe
  ),
  todos as (
    select codigo,titulo,quantidade,universo,severidade,orientacao,drill,detalhe from base
    union all
    select codigo,titulo,quantidade,universo,severidade,orientacao,drill,detalhe from serv
  )
  select jsonb_build_object('org', p_org, 'alertas',
    coalesce(jsonb_agg(jsonb_build_object(
      'codigo',codigo,'titulo',titulo,'quantidade',quantidade,
      'percentual', case when universo is null or universo=0 then null else round(100.0*quantidade/universo,1) end,
      'severidade',severidade,'orientacao',orientacao,'drill',drill,'detalhe',detalhe)
      order by (case severidade when 'alta' then 0 when 'media' then 1 else 2 end), quantidade desc),'[]'::jsonb)) into r
  from todos;
  return r;
end $function$;
grant execute on function public.relatorio_qualidade_dados(uuid) to authenticated;
