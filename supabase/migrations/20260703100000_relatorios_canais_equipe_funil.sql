-- ETAPA 2B — RPCs 1-3: canais (comercial×operacional), equipe, funil.
-- Mesmos princípios de relatorio_visao_geral: isolada por org (is_member), SP, fim exclusivo,
-- sem dupla contagem, ganho/perdido por status (funil_colunas.resultado), snapshot no fechamento.
-- p_org explícito, validado internamente por membership.

-- ============ 1) RELATORIO_CANAIS ============
create or replace function public.relatorio_canais(p_org uuid, p_inicio date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare
  v_ini timestamptz := (p_inicio::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (p_fim::timestamp) at time zone 'America/Sao_Paulo';
  r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'sem_acesso' using errcode='insufficient_privilege'; end if;
  with
  -- COMERCIAL: canal de ORIGEM preservado (contatos/oportunidades.canal_origem_id)
  ct as (select canal_origem_id cid, count(*) contatos from contatos where organizacao_id=p_org and criado_em>=v_ini and criado_em<v_fim group by canal_origem_id),
  op as (select canal_origem_id cid,
      count(*) filter (where criado_em>=v_ini and criado_em<v_fim) criadas,
      count(*) filter (where criado_em>=v_ini and criado_em<v_fim and status='ganho') ganhos_coorte,
      count(*) filter (where fechado_em>=v_ini and fechado_em<v_fim and status='ganho') fech_periodo,
      count(*) filter (where fechado_em>=v_ini and fechado_em<v_fim and status='perdido') perdas_periodo
    from oportunidades where organizacao_id=p_org group by canal_origem_id),
  -- receita por canal de origem (via contato -> canal_origem_id). Parcelas não duplicam (agrega por parcela).
  rc as (select ct2.canal_origem_id cid,
      coalesce(sum(cb.valor_mensal*coalesce(cb.ciclos_totais,0)) filter (where cb.status<>'cancelado'),0) contratada
    from cobrancas cb join contatos ct2 on ct2.id=cb.contato_id where cb.organizacao_id=p_org group by ct2.canal_origem_id),
  rp as (select ct2.canal_origem_id cid,
      coalesce(sum(cp.valor) filter (where cp.status<>'cancelada' and cp.data_prevista>=p_inicio and cp.data_prevista<p_fim),0) prevista,
      coalesce(sum(cp.valor_pago) filter (where cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim),0) recebida
    from cobranca_pagamentos cp join cobrancas cb on cb.id=cp.cobranca_id join contatos ct2 on ct2.id=cb.contato_id where cp.organizacao_id=p_org group by ct2.canal_origem_id),
  comercial as (
    select coalesce(ct.cid,op.cid,rc.cid,rp.cid) cid,
      coalesce(ct.contatos,0) contatos, coalesce(op.criadas,0) criadas, coalesce(op.ganhos_coorte,0) ganhos_coorte,
      case when coalesce(op.criadas,0)=0 then 0 else round(100.0*op.ganhos_coorte/op.criadas,1) end conversao_coorte_pct,
      coalesce(op.fech_periodo,0) fech_periodo, coalesce(op.perdas_periodo,0) perdas_periodo,
      coalesce(rc.contratada,0) receita_contratada, coalesce(rp.prevista,0) receita_prevista, coalesce(rp.recebida,0) receita_recebida
    from ct full join op on op.cid=ct.cid full join rc on rc.cid=coalesce(ct.cid,op.cid) full join rp on rp.cid=coalesce(ct.cid,op.cid,rc.cid)
  ),
  -- OPERACIONAL: canal da CONVERSA
  base as (select c.id, c.canal_id, (select min(coalesce(mm.recebida_em,mm.criado_em)) from mensagens mm where mm.conversa_id=c.id and mm.direcao='entrada') fin
           from conversas c where c.organizacao_id=p_org and c.criado_em>=v_ini and c.criado_em<v_fim),
  cflags as (select b.id,b.canal_id,b.fin,
      exists(select 1 from mensagens m where m.conversa_id=b.id and m.direcao='saida' and m.autor_id is not null and m.tipo not in('sistema','nota_interna') and b.fin is not null and coalesce(m.enviada_em,m.criado_em)>b.fin) painel_apos,
      exists(select 1 from mensagens m where m.conversa_id=b.id and m.direcao='saida' and m.autor_id is null and m.origem='telefone' and b.fin is not null and coalesce(m.enviada_em,m.criado_em)>b.fin) celular_apos
    from base b),
  oper_conv as (select canal_id,
      count(*) conversas, count(*) filter (where fin is not null) com_inbound,
      count(*) filter (where fin is not null and (painel_apos or celular_apos)) atendidas,
      count(*) filter (where fin is not null and not painel_apos and not celular_apos) sem_resposta
    from cflags group by canal_id),
  oper_msg as (select c.canal_id,
      count(*) filter (where m.direcao='entrada') recebidas,
      count(*) filter (where m.direcao='saida' and m.tipo not in('sistema','nota_interna')) enviadas,
      count(*) filter (where m.direcao='saida' and m.autor_id is not null and m.tipo not in('sistema','nota_interna')) resp_painel,
      count(*) filter (where m.direcao='saida' and m.autor_id is null and m.origem='telefone') resp_celular,
      count(*) filter (where m.direcao='saida' and m.status='falhou') falhas
    from mensagens m join conversas c on c.id=m.conversa_id where c.organizacao_id=p_org and m.criado_em>=v_ini and m.criado_em<v_fim group by c.canal_id),
  -- tempo médio 1ª resposta por canal (min entre 1ª entrada e 1ª resposta humana posterior)
  frt as (select b.canal_id, avg(extract(epoch from (resp.t - b.fin))/60.0) mins
    from base b join lateral (select min(coalesce(m.enviada_em,m.criado_em)) t from mensagens m where m.conversa_id=b.id and m.direcao='saida' and ((m.autor_id is not null and m.tipo not in('sistema','nota_interna')) or (m.autor_id is null and m.origem='telefone')) and b.fin is not null and coalesce(m.enviada_em,m.criado_em)>b.fin) resp on true
    where b.fin is not null and resp.t is not null group by b.canal_id),
  operacional as (select coalesce(oc.canal_id,om.canal_id) canal_id,
      coalesce(oc.conversas,0) conversas, coalesce(oc.com_inbound,0) com_inbound, coalesce(oc.atendidas,0) atendidas, coalesce(oc.sem_resposta,0) sem_resposta,
      case when coalesce(oc.com_inbound,0)=0 then 0 else round(100.0*oc.atendidas/oc.com_inbound,1) end taxa_atendimento_pct,
      coalesce(om.recebidas,0) msg_recebidas, coalesce(om.enviadas,0) msg_enviadas, coalesce(om.resp_painel,0) respostas_painel, coalesce(om.resp_celular,0) respostas_celular,
      round(frt.mins,1) primeira_resposta_min, coalesce(om.falhas,0) falhas_envio
    from oper_conv oc full join oper_msg om on om.canal_id=oc.canal_id left join frt on frt.canal_id=coalesce(oc.canal_id,om.canal_id))
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio',p_inicio,'fim_exclusivo',p_fim,'timezone','America/Sao_Paulo'),
    'comercial', coalesce((select jsonb_agg(jsonb_build_object('canal_id',cm.cid,'canal',coalesce(cn.nome_interno,'(sem origem)'),'contatos_originados',cm.contatos,'oportunidades_criadas',cm.criadas,'ganhos_coorte',cm.ganhos_coorte,'conversao_coorte_pct',cm.conversao_coorte_pct,'fechamentos_periodo',cm.fech_periodo,'perdas_periodo',cm.perdas_periodo,'receita_contratada',cm.receita_contratada,'receita_prevista',cm.receita_prevista,'receita_recebida',cm.receita_recebida) order by cm.criadas desc nulls last) from comercial cm left join canais cn on cn.id=cm.cid),'[]'::jsonb),
    'operacional', coalesce((select jsonb_agg(jsonb_build_object('canal_id',op2.canal_id,'canal',coalesce(cn.nome_interno,'(sem canal)'),'conversas',op2.conversas,'conversas_com_inbound',op2.com_inbound,'conversas_atendidas',op2.atendidas,'conversas_sem_resposta',op2.sem_resposta,'taxa_atendimento_pct',op2.taxa_atendimento_pct,'mensagens_recebidas',op2.msg_recebidas,'mensagens_enviadas',op2.msg_enviadas,'respostas_painel',op2.respostas_painel,'respostas_celular',op2.respostas_celular,'primeira_resposta_min',op2.primeira_resposta_min,'falhas_envio',op2.falhas_envio) order by op2.conversas desc nulls last) from operacional op2 left join canais cn on cn.id=op2.canal_id),'[]'::jsonb)
  ) into r;
  return r;
end $function$;
grant execute on function public.relatorio_canais(uuid, date, date) to authenticated;

-- ============ 2) RELATORIO_EQUIPE ============
create or replace function public.relatorio_equipe(p_org uuid, p_inicio date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare
  v_ini timestamptz := (p_inicio::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (p_fim::timestamp) at time zone 'America/Sao_Paulo';
  r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'sem_acesso' using errcode='insufficient_privilege'; end if;
  with
  membros as (select u.id, u.nome from organizacao_usuarios ou join usuarios u on u.id=ou.usuario_id where ou.organizacao_id=p_org and ou.status='ativo'),
  -- ATENDIMENTO por autor real (painel). webhook_fromMe (autor null) -> linha "Sem atribuição".
  atend as (select m.autor_id aid, count(*) msgs_painel, count(distinct m.conversa_id) conversas_resp
            from mensagens m join conversas c on c.id=m.conversa_id where c.organizacao_id=p_org and m.direcao='saida' and m.autor_id is not null and m.tipo not in('sistema','nota_interna') and m.criado_em>=v_ini and m.criado_em<v_fim group by m.autor_id),
  celular as (select count(*) msgs, count(distinct m.conversa_id) conversas from mensagens m join conversas c on c.id=m.conversa_id where c.organizacao_id=p_org and m.direcao='saida' and m.autor_id is null and m.origem='telefone' and m.criado_em>=v_ini and m.criado_em<v_fim),
  -- COMERCIAL: carteira atual (responsavel_id) + resultado histórico (responsavel_no_fechamento_id)
  com_atual as (select responsavel_id rid, count(*) filter (where status='em_andamento') opp_atuais, count(*) filter (where criado_em>=v_ini and criado_em<v_fim) criadas, count(*) filter (where criado_em>=v_ini and criado_em<v_fim and status='ganho') ganhos_coorte from oportunidades where organizacao_id=p_org group by responsavel_id),
  com_fech as (select responsavel_no_fechamento_id rid, count(*) filter (where fechado_em>=v_ini and fechado_em<v_fim and status='ganho') fech_periodo, count(*) filter (where fechado_em>=v_ini and fechado_em<v_fim and status='perdido') perdas from oportunidades where organizacao_id=p_org and fechado_em>=v_ini and fechado_em<v_fim group by responsavel_no_fechamento_id),
  cob as (select coalesce(responsavel_id,criado_por) rid, coalesce(sum(valor_mensal*coalesce(ciclos_totais,0)) filter (where status<>'cancelado'),0) contratada, array_agg(id) ids from cobrancas where organizacao_id=p_org group by coalesce(responsavel_id,criado_por)),
  linhas as (
    select mb.id, mb.nome,
      coalesce(a.msgs_painel,0) msgs_painel, coalesce(a.conversas_resp,0) conversas_resp,
      coalesce(ca.opp_atuais,0) opp_atuais, coalesce(ca.criadas,0) criadas, coalesce(ca.ganhos_coorte,0) ganhos_coorte,
      coalesce(cf.fech_periodo,0) fech_periodo, coalesce(cf.perdas,0) perdas,
      case when coalesce(ca.criadas,0)=0 then 0 else round(100.0*ca.ganhos_coorte/ca.criadas,1) end conversao_pct,
      coalesce(cb.contratada,0) receita_contratada
    from membros mb
      left join atend a on a.aid=mb.id
      left join com_atual ca on ca.rid=mb.id
      left join com_fech cf on cf.rid=mb.id
      left join cob cb on cb.rid=mb.id
  ),
  tot as (select (select count(*) from mensagens m join conversas c on c.id=m.conversa_id where c.organizacao_id=p_org and m.direcao='saida' and m.tipo not in('sistema','nota_interna') and m.criado_em>=v_ini and m.criado_em<v_fim) saida_total,
                 (select count(*) from mensagens m join conversas c on c.id=m.conversa_id where c.organizacao_id=p_org and m.direcao='saida' and m.autor_id is not null and m.tipo not in('sistema','nota_interna') and m.criado_em>=v_ini and m.criado_em<v_fim) saida_painel,
                 (select count(*) from oportunidades where organizacao_id=p_org and criado_em>=v_ini and criado_em<v_fim) opp_criadas,
                 (select count(*) from oportunidades where organizacao_id=p_org and criado_em>=v_ini and criado_em<v_fim and responsavel_id is not null) opp_com_resp)
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio',p_inicio,'fim_exclusivo',p_fim,'timezone','America/Sao_Paulo'),
    'usuarios', coalesce((select jsonb_agg(jsonb_build_object('usuario_id',l.id,'nome',l.nome,'mensagens_painel',l.msgs_painel,'conversas_respondidas',l.conversas_resp,'oportunidades_atuais',l.opp_atuais,'oportunidades_criadas',l.criadas,'ganhos_coorte',l.ganhos_coorte,'fechamentos_periodo',l.fech_periodo,'perdas',l.perdas,'conversao_pct',l.conversao_pct,'receita_contratada',l.receita_contratada) order by l.msgs_painel desc) from linhas l),'[]'::jsonb),
    'sem_atribuicao', jsonb_build_object('mensagens_celular',(select msgs from celular),'conversas_celular',(select conversas from celular),'oportunidades_sem_responsavel',(select count(*) from oportunidades where organizacao_id=p_org and responsavel_id is null),'fechamentos_sem_responsavel_hist',(select count(*) from oportunidades where organizacao_id=p_org and fechado_em>=v_ini and fechado_em<v_fim and responsavel_no_fechamento_id is null)),
    'cobertura', jsonb_build_object('atribuicao_msgs_pct',case when (select saida_total from tot)=0 then null else round(100.0*(select saida_painel from tot)/(select saida_total from tot),1) end,'responsavel_opp_pct',case when (select opp_criadas from tot)=0 then null else round(100.0*(select opp_com_resp from tot)/(select opp_criadas from tot),1) end),
    'alertas', ((case when (select saida_total from tot)>0 and (100.0*(select saida_painel from tot)/(select saida_total from tot))<50 then jsonb_build_array('cobertura_atribuicao_mensagens_baixa') else '[]'::jsonb end) || (case when (select opp_criadas from tot)>0 and (100.0*(select opp_com_resp from tot)/(select opp_criadas from tot))<50 then jsonb_build_array('cobertura_responsavel_oportunidades_baixa') else '[]'::jsonb end))
  ) into r;
  return r;
end $function$;
grant execute on function public.relatorio_equipe(uuid, date, date) to authenticated;

-- ============ 3) RELATORIO_FUNIL ============
-- Histórico só registra transições terminais (ganho/perdido/reaberto) em oportunidade_eventos;
-- movimentações entre colunas NEUTRAS não são logadas -> cobertura de fluxo é PARCIAL (marcado).
-- Idade média = now - criado_em; tempo na etapa ~ now - atualizado_em (última movimentação). Não inventa datas.
create or replace function public.relatorio_funil(p_org uuid, p_inicio date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare
  v_ini timestamptz := (p_inicio::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (p_fim::timestamp) at time zone 'America/Sao_Paulo';
  v_now timestamptz := now(); r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'sem_acesso' using errcode='insufficient_privilege'; end if;
  with
  cols as (select id, nome, ordem, resultado, encerra_oportunidade from funil_colunas where organizacao_id=p_org and arquivada=false),
  cur as (select coluna_id, count(*) qtd_atual,
      count(*) filter (where status='em_andamento' and atualizado_em < v_now - interval '7 days') paradas_7d,
      avg(extract(epoch from (v_now - criado_em))/86400.0) idade_media_dias,
      avg(extract(epoch from (v_now - atualizado_em))/86400.0) tempo_etapa_dias
    from oportunidades where organizacao_id=p_org and status in ('em_andamento','ganho','perdido') group by coluna_id),
  ev as (select coluna_nova_id cid, count(*) filter (where evento='ganho' and criado_em>=v_ini and criado_em<v_fim) ganhos, count(*) filter (where evento='perdido' and criado_em>=v_ini and criado_em<v_fim) perdas
         from oportunidade_eventos where organizacao_id=p_org group by coluna_nova_id)
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio',p_inicio,'fim_exclusivo',p_fim,'timezone','America/Sao_Paulo'),
    'cobertura_historico', 'parcial: só transições terminais (ganho/perdido/reaberto) são registradas; entradas/saídas em colunas neutras não têm histórico',
    'colunas', coalesce((select jsonb_agg(jsonb_build_object(
        'coluna_id',c.id,'coluna',c.nome,'ordem',c.ordem,'resultado',c.resultado,
        'quantidade_atual',coalesce(cur.qtd_atual,0),
        'ganhos_periodo',coalesce(ev.ganhos,0),'perdas_periodo',coalesce(ev.perdas,0),
        'oportunidades_paradas_7d',coalesce(cur.paradas_7d,0),
        'idade_media_dias',round(coalesce(cur.idade_media_dias,0)::numeric,1),
        'tempo_medio_etapa_dias',round(coalesce(cur.tempo_etapa_dias,0)::numeric,1),
        'entradas_periodo',null,'saidas_periodo',null,'conversao_proxima_etapa_pct',null
      ) order by c.ordem) from cols c left join cur on cur.coluna_id=c.id left join ev on ev.cid=c.id),'[]'::jsonb)
  ) into r;
  return r;
end $function$;
grant execute on function public.relatorio_funil(uuid, date, date) to authenticated;
