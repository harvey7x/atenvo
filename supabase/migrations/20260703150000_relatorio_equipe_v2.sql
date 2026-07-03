-- ETAPA 2B — relatorio_equipe v2: separa OPERACIONAL × CARTEIRA ATUAL × RESULTADO HISTÓRICO,
-- mantém linha "Sem atribuição" (celular/sem autor/sem responsável/sem snapshot) e nunca faz
-- fallback do celular/criador para o responsável atual. Nova migration (não edita antigas).
--
-- Fatos auditados:
--  * autor operacional = mensagens.autor_id (painel). webhook_fromMe = saida, autor_id null, origem='telefone'.
--  * responsável atual da conversa = contatos.responsavel_id (conversas.atendente_id não é usado).
--  * responsável comercial atual = oportunidades.responsavel_id (só carteira atual).
--  * resultado histórico = oportunidades.responsavel_no_fechamento_id (snapshot no fechamento).
--  * transferências/assunções = conversa_atividades (tipo assumido|transferido|devolvido; usuario_id=ator;
--    de/para = { responsavel_id }).
--  * valor contratado/recebido oficiais = definição da Financeiro v2 (data_inicio / data_pagamento).
--  * usuário fora de organizacao_usuarios ativo => vinculo 'inativo' (resultado histórico preservado, nunca transferido).

create or replace function public.relatorio_equipe(p_org uuid, p_inicio date, p_fim date)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare
  v_ini timestamptz := (p_inicio::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (p_fim::timestamp) at time zone 'America/Sao_Paulo';
  r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then
    raise exception 'sem_acesso' using errcode='insufficient_privilege';
  end if;

  with
  -- Universo de usuários: membros ativos + qualquer um que apareça como autor/responsável/snapshot/ator no escopo.
  scope as (
    select distinct uid from (
      select usuario_id uid from organizacao_usuarios where organizacao_id=p_org and status='ativo'
      union select m.autor_id from mensagens m join conversas c on c.id=m.conversa_id
        where c.organizacao_id=p_org and m.direcao='saida' and m.autor_id is not null and m.criado_em>=v_ini and m.criado_em<v_fim
      union select responsavel_id from oportunidades where organizacao_id=p_org and responsavel_id is not null
      union select responsavel_no_fechamento_id from oportunidades where organizacao_id=p_org and responsavel_no_fechamento_id is not null
      union select usuario_id from conversa_atividades where organizacao_id=p_org and usuario_id is not null and criado_em>=v_ini and criado_em<v_fim
      union select responsavel_id from contatos where organizacao_id=p_org and responsavel_id is not null
    ) s where uid is not null
  ),
  usuarios_base as (
    select sc.uid, coalesce(u.nome,'(usuário removido)') nome,
      case when exists(select 1 from organizacao_usuarios ou where ou.organizacao_id=p_org and ou.usuario_id=sc.uid and ou.status='ativo') then 'ativo' else 'inativo' end vinculo
    from scope sc left join usuarios u on u.id=sc.uid
  ),
  -- OPERACIONAL: mensagens de painel (autor humano) por autor
  msg_u as (
    select m.autor_id uid, count(*) mensagens_painel, count(distinct m.conversa_id) conversas_respondidas
    from mensagens m join conversas c on c.id=m.conversa_id
    where c.organizacao_id=p_org and m.direcao='saida' and m.autor_id is not null and m.tipo not in('sistema','nota_interna')
      and m.criado_em>=v_ini and m.criado_em<v_fim
    group by m.autor_id
  ),
  -- Primeira resposta: população = conversa cuja 1ª ENTRADA cai no período; crédito = autor da 1ª resposta humana posterior.
  fr_base as (
    select c.id conversa_id, ct.responsavel_id resp_contato,
      (select min(coalesce(mm.recebida_em,mm.criado_em)) from mensagens mm where mm.conversa_id=c.id and mm.direcao='entrada') fin
    from conversas c left join contatos ct on ct.id=c.contato_id where c.organizacao_id=p_org
  ),
  fr as (
    select b.conversa_id, b.fin, r.t resp_t, r.autor, r.origem,
      extract(epoch from (r.t - b.fin))/60.0 delay_min
    from fr_base b
    join lateral (
      select coalesce(m.enviada_em,m.criado_em) t, m.autor_id autor, m.origem
      from mensagens m
      where m.conversa_id=b.conversa_id and m.direcao='saida'
        and ((m.autor_id is not null and m.tipo not in('sistema','nota_interna')) or (m.autor_id is null and m.origem='telefone'))
        and b.fin is not null and coalesce(m.enviada_em,m.criado_em) > b.fin
      order by coalesce(m.enviada_em,m.criado_em) asc limit 1
    ) r on true
    where b.fin is not null and b.fin>=v_ini and b.fin<v_fim
  ),
  fr_u as (  -- crédito de 1ª resposta ao AUTOR do painel (celular => sem atribuição)
    select autor uid, count(*) primeiras_respostas,
      round(avg(delay_min)::numeric,1) fr_media_min,
      round((percentile_cont(0.5) within group (order by delay_min))::numeric,1) fr_mediana_min
    from fr where autor is not null group by autor
  ),
  -- Transferências / assunções (conversa_atividades)
  ativ_u as (
    select uid, count(*) filter (where tipo='assumido') assumidos,
           count(*) filter (where tipo='transferido' and ator) transf_realizadas,
           count(*) filter (where tipo='transferido' and recebeu) transf_recebidas
    from (
      select a.usuario_id uid, a.tipo, true ator, false recebeu
        from conversa_atividades a where a.organizacao_id=p_org and a.usuario_id is not null and a.criado_em>=v_ini and a.criado_em<v_fim
      union all
      select (a.para->>'responsavel_id')::uuid, a.tipo, false, true
        from conversa_atividades a where a.organizacao_id=p_org and a.tipo='transferido' and a.para->>'responsavel_id' is not null and a.criado_em>=v_ini and a.criado_em<v_fim
    ) t where uid is not null group by uid
  ),
  -- Conversas atualmente sob responsabilidade (estoque, via contato.responsavel_id)
  resp_u as (
    select ct.responsavel_id uid, count(*) conversas_sob_resp,
      count(*) filter (where fb.fin is not null and not exists(
        select 1 from mensagens m where m.conversa_id=fb.conversa_id and m.direcao='saida'
          and ((m.autor_id is not null and m.tipo not in('sistema','nota_interna')) or (m.autor_id is null and m.origem='telefone'))
          and coalesce(m.enviada_em,m.criado_em)>fb.fin)) inbound_sem_resposta_sob_resp
    from conversas c2 join contatos ct on ct.id=c2.contato_id
      join fr_base fb on fb.conversa_id=c2.id
    where c2.organizacao_id=p_org and ct.responsavel_id is not null
    group by ct.responsavel_id
  ),
  -- COMERCIAL — coorte por DONO ATUAL (responsavel_id): criadas + ganhos + conversão consistente
  op_owner as (
    select responsavel_id uid,
      count(*) filter (where criado_em>=v_ini and criado_em<v_fim) criadas,
      count(*) filter (where criado_em>=v_ini and criado_em<v_fim and status='ganho') ganhos_coorte,
      count(*) filter (where status='em_andamento') carteira_atual
    from oportunidades where organizacao_id=p_org and responsavel_id is not null group by responsavel_id
  ),
  -- RESULTADO HISTÓRICO por SNAPSHOT (responsavel_no_fechamento_id)
  op_snap as (
    select responsavel_no_fechamento_id uid,
      count(*) filter (where fechado_em>=v_ini and fechado_em<v_fim and status='ganho') fech_periodo,
      count(*) filter (where fechado_em>=v_ini and fechado_em<v_fim and status='perdido') perdas_periodo
    from oportunidades where organizacao_id=p_org and responsavel_no_fechamento_id is not null group by responsavel_no_fechamento_id
  ),
  -- RECEITA por snapshot (via cobranca -> oportunidade -> responsavel_no_fechamento_id), definição Financeiro v2
  rc_contratado as (
    select o.responsavel_no_fechamento_id uid,
      coalesce(sum(cb.valor_mensal*coalesce(cb.ciclos_totais,0)) filter (where cb.status<>'cancelado' and cb.data_inicio>=p_inicio and cb.data_inicio<p_fim),0) contratado_periodo,
      coalesce(sum(cb.valor_mensal*coalesce(cb.ciclos_totais,0)) filter (where cb.status<>'cancelado' and o.fechado_em>=v_ini and o.fechado_em<v_fim and o.status='ganho'),0) carteira_contratada_fech
    from cobrancas cb join oportunidades o on o.id=cb.oportunidade_id
    where cb.organizacao_id=p_org and o.responsavel_no_fechamento_id is not null group by o.responsavel_no_fechamento_id
  ),
  rc_recebido as (
    select o.responsavel_no_fechamento_id uid,
      coalesce(sum(cp.valor_pago) filter (where cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim),0) recebido_periodo
    from cobranca_pagamentos cp join cobrancas cb on cb.id=cp.cobranca_id and cb.status<>'cancelado'
      join oportunidades o on o.id=cb.oportunidade_id
    where cp.organizacao_id=p_org and o.responsavel_no_fechamento_id is not null group by o.responsavel_no_fechamento_id
  ),
  linhas as (
    select ub.uid, ub.nome, ub.vinculo,
      coalesce(mu.mensagens_painel,0) mensagens_painel, coalesce(mu.conversas_respondidas,0) conversas_respondidas,
      coalesce(fu.primeiras_respostas,0) primeiras_respostas, fu.fr_media_min, fu.fr_mediana_min,
      coalesce(au.assumidos,0) assumidos, coalesce(au.transf_recebidas,0) transf_recebidas, coalesce(au.transf_realizadas,0) transf_realizadas,
      coalesce(ru.conversas_sob_resp,0) conversas_sob_resp, coalesce(ru.inbound_sem_resposta_sob_resp,0) inbound_sem_resposta_sob_resp,
      coalesce(oo.criadas,0) criadas, coalesce(oo.ganhos_coorte,0) ganhos_coorte, coalesce(oo.carteira_atual,0) carteira_atual,
      case when coalesce(oo.criadas,0)=0 then null else round(100.0*oo.ganhos_coorte/oo.criadas,1) end conversao_coorte_pct,
      coalesce(os.fech_periodo,0) fech_periodo, coalesce(os.perdas_periodo,0) perdas_periodo,
      coalesce(rcc.contratado_periodo,0) contratado_periodo, coalesce(rcr.recebido_periodo,0) recebido_periodo,
      coalesce(rcc.carteira_contratada_fech,0) carteira_contratada_fech,
      case when coalesce(os.fech_periodo,0)=0 then null else round(coalesce(rcc.carteira_contratada_fech,0)/os.fech_periodo,2) end ticket_medio_fech
    from usuarios_base ub
      left join msg_u mu on mu.uid=ub.uid
      left join fr_u fu on fu.uid=ub.uid
      left join ativ_u au on au.uid=ub.uid
      left join resp_u ru on ru.uid=ub.uid
      left join op_owner oo on oo.uid=ub.uid
      left join op_snap os on os.uid=ub.uid
      left join rc_contratado rcc on rcc.uid=ub.uid
      left join rc_recebido rcr on rcr.uid=ub.uid
  ),
  -- SEM ATRIBUIÇÃO
  sem as (
    select
      (select count(*) from mensagens m join conversas c on c.id=m.conversa_id where c.organizacao_id=p_org and m.direcao='saida' and m.autor_id is null and m.origem='telefone' and m.criado_em>=v_ini and m.criado_em<v_fim) mensagens_celular,
      (select count(distinct m.conversa_id) from mensagens m join conversas c on c.id=m.conversa_id where c.organizacao_id=p_org and m.direcao='saida' and m.autor_id is null and m.origem='telefone' and m.criado_em>=v_ini and m.criado_em<v_fim
         and not exists(select 1 from mensagens p2 join conversas c2 on c2.id=p2.conversa_id where p2.conversa_id=m.conversa_id and p2.direcao='saida' and p2.autor_id is not null and p2.tipo not in('sistema','nota_interna') and p2.criado_em>=v_ini and p2.criado_em<v_fim)) conversas_so_celular,
      (select count(*) from mensagens m join conversas c on c.id=m.conversa_id where c.organizacao_id=p_org and m.direcao='saida' and m.autor_id is null and coalesce(m.origem,'')<>'telefone' and m.tipo not in('sistema','nota_interna') and m.criado_em>=v_ini and m.criado_em<v_fim) outras_saidas_sem_autor,
      (select count(*) from fr where autor is null) primeiras_respostas_celular,
      (select count(*) from oportunidades where organizacao_id=p_org and criado_em>=v_ini and criado_em<v_fim and responsavel_id is null) oportunidades_sem_responsavel,
      (select count(*) from oportunidades where organizacao_id=p_org and status='em_andamento' and responsavel_id is null) carteira_atual_sem_resp,
      (select count(*) from oportunidades where organizacao_id=p_org and fechado_em>=v_ini and fechado_em<v_fim and status in ('ganho','perdido') and responsavel_no_fechamento_id is null) fechamentos_sem_snapshot,
      (select coalesce(sum(cb.valor_mensal*coalesce(cb.ciclos_totais,0)),0) from cobrancas cb left join oportunidades o on o.id=cb.oportunidade_id where cb.organizacao_id=p_org and cb.status<>'cancelado' and cb.data_inicio>=p_inicio and cb.data_inicio<p_fim and (o.id is null or o.responsavel_no_fechamento_id is null)) contratado_sem_atrib,
      (select coalesce(sum(cp.valor_pago),0) from cobranca_pagamentos cp join cobrancas cb on cb.id=cp.cobranca_id and cb.status<>'cancelado' left join oportunidades o on o.id=cb.oportunidade_id where cp.organizacao_id=p_org and cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim and (o.id is null or o.responsavel_no_fechamento_id is null)) recebido_sem_atrib
  ),
  -- TOTAIS (para cobertura e reconciliação; devem fechar com visao_geral / financeiro)
  tot as (
    select
      (select count(*) from mensagens m join conversas c on c.id=m.conversa_id where c.organizacao_id=p_org and m.direcao='saida' and m.tipo not in('sistema','nota_interna') and m.criado_em>=v_ini and m.criado_em<v_fim) saida_humana_ou_auto,
      (select count(*) from mensagens m join conversas c on c.id=m.conversa_id where c.organizacao_id=p_org and m.direcao='saida' and ((m.autor_id is not null and m.tipo not in('sistema','nota_interna')) or (m.autor_id is null and m.origem='telefone')) and m.criado_em>=v_ini and m.criado_em<v_fim) saida_humana_total,
      (select count(*) from mensagens m join conversas c on c.id=m.conversa_id where c.organizacao_id=p_org and m.direcao='saida' and m.autor_id is not null and m.tipo not in('sistema','nota_interna') and m.criado_em>=v_ini and m.criado_em<v_fim) saida_painel_total,
      (select count(*) from fr) fr_elegiveis, (select count(*) from fr where autor is not null) fr_painel,
      (select count(*) from oportunidades where organizacao_id=p_org and criado_em>=v_ini and criado_em<v_fim) opp_criadas_total,
      (select count(*) from oportunidades where organizacao_id=p_org and criado_em>=v_ini and criado_em<v_fim and responsavel_id is not null) opp_criadas_com_resp,
      (select count(*) from oportunidades where organizacao_id=p_org and fechado_em>=v_ini and fechado_em<v_fim and status in ('ganho','perdido')) fech_total,
      (select count(*) from oportunidades where organizacao_id=p_org and fechado_em>=v_ini and fechado_em<v_fim and status in ('ganho','perdido') and responsavel_no_fechamento_id is not null) fech_com_snap,
      (select coalesce(sum(cp.valor_pago),0) from cobranca_pagamentos cp join cobrancas cb on cb.id=cp.cobranca_id and cb.status<>'cancelado' where cp.organizacao_id=p_org and cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim) recebido_total,
      (select coalesce(sum(cb.valor_mensal*coalesce(cb.ciclos_totais,0)),0) from cobrancas cb where cb.organizacao_id=p_org and cb.status<>'cancelado' and cb.data_inicio>=p_inicio and cb.data_inicio<p_fim) contratado_total
    from (select 1) x
  ),
  cob_defs(codigo, atribuidos, elegiveis, orientacao) as (
    select 'autoria_mensagens', t.saida_painel_total, t.saida_humana_total, 'Respostas pelo celular e sem autor não têm atribuição; incentive o uso do painel.' from tot t
    union all select 'primeira_resposta', t.fr_painel, t.fr_elegiveis, 'Primeiras respostas pelo celular caem em Sem atribuição.' from tot t
    union all select 'responsavel_oportunidades', t.opp_criadas_com_resp, t.opp_criadas_total, 'Atribua um responsável às oportunidades para ranking comercial confiável.' from tot t
    union all select 'responsavel_fechamentos', t.fech_com_snap, t.fech_total, 'Fechamentos sem snapshot de responsável não creditam ninguém.' from tot t
    union all select 'receita_atribuida', (t.recebido_total - s.recebido_sem_atrib)::numeric, t.recebido_total, 'Receita de cobranças sem oportunidade/snapshot fica sem atribuição.' from tot t, sem s
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio',p_inicio,'fim_exclusivo',p_fim,'timezone','America/Sao_Paulo'),
    'usuarios', coalesce((select jsonb_agg(jsonb_build_object(
        'usuario_id',l.uid,'nome',l.nome,'vinculo',l.vinculo,
        'operacional', jsonb_build_object(
          'mensagens_painel',l.mensagens_painel,'conversas_respondidas',l.conversas_respondidas,
          'primeiras_respostas',l.primeiras_respostas,'primeira_resposta_media_min',l.fr_media_min,'primeira_resposta_mediana_min',l.fr_mediana_min,
          'atendimentos_assumidos',l.assumidos,'transferencias_recebidas',l.transf_recebidas,'transferencias_realizadas',l.transf_realizadas,
          'conversas_sob_responsabilidade',l.conversas_sob_resp,'conversas_inbound_sem_resposta_sob_resp',l.inbound_sem_resposta_sob_resp),
        'comercial', jsonb_build_object(
          'oportunidades_criadas_sob_resp',l.criadas,'carteira_atual',l.carteira_atual,
          'ganhos_coorte',l.ganhos_coorte,'conversao_coorte_pct',l.conversao_coorte_pct,
          'fechamentos_periodo',l.fech_periodo,'perdas_periodo',l.perdas_periodo,
          'valor_contratado_periodo',l.contratado_periodo,'receita_recebida_periodo',l.recebido_periodo,
          'carteira_contratada_fechamentos',l.carteira_contratada_fech,'ticket_medio_fechamentos',l.ticket_medio_fech)
      ) order by l.mensagens_painel desc, l.recebido_periodo desc) from linhas l),'[]'::jsonb),
    'sem_atribuicao', (select jsonb_build_object(
        'operacional', jsonb_build_object('mensagens_celular',s.mensagens_celular,'conversas_respondidas_so_celular',s.conversas_so_celular,'primeiras_respostas_celular',s.primeiras_respostas_celular,'outras_saidas_sem_autor',s.outras_saidas_sem_autor),
        'comercial', jsonb_build_object('oportunidades_sem_responsavel',s.oportunidades_sem_responsavel,'carteira_atual_sem_responsavel',s.carteira_atual_sem_resp,'fechamentos_sem_snapshot',s.fechamentos_sem_snapshot,'valor_contratado_sem_atribuicao',s.contratado_sem_atrib,'receita_recebida_sem_atribuicao',s.recebido_sem_atrib)
      ) from sem s),
    'cobertura', coalesce((select jsonb_agg(jsonb_build_object(
        'codigo',cd.codigo,'atribuidos',cd.atribuidos,'elegiveis',cd.elegiveis,'sem_atribuicao',(cd.elegiveis-cd.atribuidos),
        'percentual', case when cd.elegiveis=0 then null else round(100.0*cd.atribuidos/cd.elegiveis,1) end,
        'qualidade', case when cd.elegiveis=0 then 'sem_dados' when 100.0*cd.atribuidos/cd.elegiveis>=90 then 'alta' when 100.0*cd.atribuidos/cd.elegiveis>=70 then 'media' else 'baixa' end,
        'orientacao', cd.orientacao) order by cd.codigo) from cob_defs cd),'[]'::jsonb),
    'rankings', (
      with rk(metrica, sentido, cob_codigo) as (values
        ('respostas_painel','maior_melhor','autoria_mensagens'),
        ('velocidade_primeira_resposta','menor_melhor','primeira_resposta'),
        ('conversas_respondidas','maior_melhor','autoria_mensagens'),
        ('fechamentos_periodo','maior_melhor','responsavel_fechamentos'),
        ('conversao_coorte','maior_melhor','responsavel_oportunidades'),
        ('valor_contratado_periodo','maior_melhor','responsavel_fechamentos'),
        ('receita_recebida_periodo','maior_melhor','receita_atribuida'))
      select jsonb_agg(jsonb_build_object(
        'metrica',rk.metrica,'sentido',rk.sentido,
        'cobertura_pct',(select case when cd.elegiveis=0 then null else round(100.0*cd.atribuidos/cd.elegiveis,1) end from cob_defs cd where cd.codigo=rk.cob_codigo),
        'qualidade',(select case when cd.elegiveis=0 then 'sem_dados' when 100.0*cd.atribuidos/cd.elegiveis>=90 then 'alta' when 100.0*cd.atribuidos/cd.elegiveis>=70 then 'media' else 'baixa' end from cob_defs cd where cd.codigo=rk.cob_codigo),
        'itens', coalesce((
          select jsonb_agg(jsonb_build_object('usuario_id',uid,'nome',nome,'posicao',pos,'valor',valor) order by pos)
          from (
            select l.uid, l.nome, l.vinculo,
              case rk.metrica
                when 'respostas_painel' then l.mensagens_painel
                when 'velocidade_primeira_resposta' then l.fr_media_min
                when 'conversas_respondidas' then l.conversas_respondidas
                when 'fechamentos_periodo' then l.fech_periodo
                when 'conversao_coorte' then l.conversao_coorte_pct
                when 'valor_contratado_periodo' then l.contratado_periodo
                when 'receita_recebida_periodo' then l.recebido_periodo end valor,
              row_number() over (order by
                case when rk.sentido='menor_melhor' then case rk.metrica when 'velocidade_primeira_resposta' then l.fr_media_min end end asc nulls last,
                case when rk.sentido='maior_melhor' then case rk.metrica
                  when 'respostas_painel' then l.mensagens_painel::numeric
                  when 'conversas_respondidas' then l.conversas_respondidas::numeric
                  when 'fechamentos_periodo' then l.fech_periodo::numeric
                  when 'conversao_coorte' then l.conversao_coorte_pct
                  when 'valor_contratado_periodo' then l.contratado_periodo
                  when 'receita_recebida_periodo' then l.recebido_periodo end end desc nulls last
              ) pos
            from linhas l
          ) q
          where valor is not null and (rk.metrica='velocidade_primeira_resposta' or valor <> 0)
        ),'[]'::jsonb)
      )) from rk
    ),
    'totais', (select jsonb_build_object(
        'saida_painel_total',t.saida_painel_total,'saida_humana_total',t.saida_humana_total,
        'primeira_resposta_elegiveis',t.fr_elegiveis,'primeira_resposta_painel',t.fr_painel,
        'oportunidades_criadas_total',t.opp_criadas_total,'fechamentos_total',t.fech_total,
        'receita_recebida_total',t.recebido_total,'valor_contratado_total',t.contratado_total) from tot t)
  ) into r;
  return r;
end $function$;
grant execute on function public.relatorio_equipe(uuid, date, date) to authenticated;
