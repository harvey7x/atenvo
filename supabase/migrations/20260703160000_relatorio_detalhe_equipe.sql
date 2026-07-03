-- ETAPA 2B — drill-down paginado da equipe: abre os registros que compõem cada métrica.
-- Isolado por org (is_member), RLS, mínimo de PII (só nome do cliente; sem telefone/cpf/email;
-- conteúdo de mensagem NÃO é exposto). p_usuario null = fatia "Sem atribuição" da dimensão.
-- Dimensões: mensagens | primeiras_respostas | oportunidades | fechamentos | receitas.
create or replace function public.relatorio_detalhe_equipe(
  p_org uuid, p_inicio date, p_fim date, p_dimensao text,
  p_usuario uuid default null, p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare
  v_ini timestamptz := (p_inicio::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (p_fim::timestamp) at time zone 'America/Sao_Paulo';
  v_lim int := least(greatest(coalesce(p_limit,50),1),200);
  v_off int := greatest(coalesce(p_offset,0),0);
  v_total int := 0; v_itens jsonb := '[]'::jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then
    raise exception 'sem_acesso' using errcode='insufficient_privilege';
  end if;
  if p_dimensao not in ('mensagens','primeiras_respostas','oportunidades','fechamentos','receitas') then
    raise exception 'dimensao_invalida' using errcode='22023';
  end if;

  if p_dimensao='mensagens' then
    -- p_usuario null => mensagens de saída sem autor pelo celular (Sem atribuição)
    with base as (
      select m.id, m.conversa_id, coalesce(m.enviada_em,m.criado_em) quando, (m.autor_id is null) celular
      from mensagens m join conversas c on c.id=m.conversa_id
      where c.organizacao_id=p_org and m.direcao='saida' and m.tipo not in('sistema','nota_interna')
        and m.criado_em>=v_ini and m.criado_em<v_fim
        and ((p_usuario is not null and m.autor_id=p_usuario)
          or (p_usuario is null and m.autor_id is null and m.origem='telefone')))
    select count(*), coalesce((select jsonb_agg(jsonb_build_object('mensagem_id',id,'conversa_id',conversa_id,'quando',quando,'celular',celular) order by quando desc) from (select * from base order by quando desc limit v_lim offset v_off) p),'[]'::jsonb)
      into v_total, v_itens from base;

  elsif p_dimensao='primeiras_respostas' then
    with fr_base as (
      select c.id conversa_id, (select min(coalesce(mm.recebida_em,mm.criado_em)) from mensagens mm where mm.conversa_id=c.id and mm.direcao='entrada') fin,
        coalesce(o.contato_nome, ct.nome, 'Lead') cliente
      from conversas c left join contatos ct on ct.id=c.contato_id
        left join lateral (select contato_nome from oportunidades o where o.contato_id=c.contato_id limit 1) o on true
      where c.organizacao_id=p_org),
    fr as (
      select b.conversa_id, b.cliente, b.fin, r.t resp_t, r.autor, round((extract(epoch from (r.t-b.fin))/60.0)::numeric,1) delay_min
      from fr_base b join lateral (
        select coalesce(m.enviada_em,m.criado_em) t, m.autor_id autor from mensagens m
        where m.conversa_id=b.conversa_id and m.direcao='saida'
          and ((m.autor_id is not null and m.tipo not in('sistema','nota_interna')) or (m.autor_id is null and m.origem='telefone'))
          and b.fin is not null and coalesce(m.enviada_em,m.criado_em)>b.fin
        order by coalesce(m.enviada_em,m.criado_em) asc limit 1) r on true
      where b.fin is not null and b.fin>=v_ini and b.fin<v_fim
        and ((p_usuario is not null and r.autor=p_usuario) or (p_usuario is null and r.autor is null)))
    select count(*), coalesce((select jsonb_agg(jsonb_build_object('conversa_id',conversa_id,'cliente',cliente,'primeira_entrada',fin,'primeira_resposta',resp_t,'minutos',delay_min) order by resp_t desc) from (select * from fr order by resp_t desc limit v_lim offset v_off) p),'[]'::jsonb)
      into v_total, v_itens from fr;

  elsif p_dimensao='oportunidades' then
    -- criadas no período por responsável atual; p_usuario null => sem responsável
    with base as (
      select o.id, o.criado_em, o.status::text status, o.valor_estimado, coalesce(o.contato_nome, ct.nome, o.titulo, 'Lead') cliente
      from oportunidades o left join contatos ct on ct.id=o.contato_id
      where o.organizacao_id=p_org and o.criado_em>=v_ini and o.criado_em<v_fim
        and ((p_usuario is not null and o.responsavel_id=p_usuario) or (p_usuario is null and o.responsavel_id is null)))
    select count(*), coalesce((select jsonb_agg(jsonb_build_object('oportunidade_id',id,'cliente',cliente,'status',status,'valor',valor_estimado,'criado_em',criado_em) order by criado_em desc) from (select * from base order by criado_em desc limit v_lim offset v_off) p),'[]'::jsonb)
      into v_total, v_itens from base;

  elsif p_dimensao='fechamentos' then
    -- fechados no período por snapshot; p_usuario null => sem snapshot de responsável
    with base as (
      select o.id, o.fechado_em, o.status::text status, o.fechado_em_estimado, coalesce(o.contato_nome, ct.nome, o.titulo, 'Lead') cliente
      from oportunidades o left join contatos ct on ct.id=o.contato_id
      where o.organizacao_id=p_org and o.fechado_em>=v_ini and o.fechado_em<v_fim and o.status in ('ganho','perdido')
        and ((p_usuario is not null and o.responsavel_no_fechamento_id=p_usuario) or (p_usuario is null and o.responsavel_no_fechamento_id is null)))
    select count(*), coalesce((select jsonb_agg(jsonb_build_object('oportunidade_id',id,'cliente',cliente,'status',status,'fechado_em',fechado_em,'fechado_em_estimado',fechado_em_estimado) order by fechado_em desc) from (select * from base order by fechado_em desc limit v_lim offset v_off) p),'[]'::jsonb)
      into v_total, v_itens from base;

  elsif p_dimensao='receitas' then
    -- parcelas pagas no período por snapshot do fechamento; p_usuario null => sem opp/snapshot
    with base as (
      select cp.id, cp.valor_pago, cp.data_pagamento, cb.servico, coalesce(ct.nome,'Cliente') cliente
      from cobranca_pagamentos cp join cobrancas cb on cb.id=cp.cobranca_id and cb.status<>'cancelado'
        left join contatos ct on ct.id=cb.contato_id left join oportunidades o on o.id=cb.oportunidade_id
      where cp.organizacao_id=p_org and cp.status='paga' and cp.data_pagamento>=p_inicio and cp.data_pagamento<p_fim
        and ((p_usuario is not null and o.responsavel_no_fechamento_id=p_usuario)
          or (p_usuario is null and (o.id is null or o.responsavel_no_fechamento_id is null))))
    select count(*), coalesce((select jsonb_agg(jsonb_build_object('parcela_id',id,'cliente',cliente,'servico',servico,'valor_pago',valor_pago,'data_pagamento',data_pagamento) order by data_pagamento desc) from (select * from base order by data_pagamento desc limit v_lim offset v_off) p),'[]'::jsonb)
      into v_total, v_itens from base;
  end if;

  return jsonb_build_object(
    'periodo', jsonb_build_object('inicio',p_inicio,'fim_exclusivo',p_fim,'timezone','America/Sao_Paulo'),
    'dimensao', p_dimensao, 'usuario', p_usuario, 'sem_atribuicao', (p_usuario is null),
    'total', v_total, 'limit', v_lim, 'offset', v_off, 'itens', v_itens);
end $function$;
grant execute on function public.relatorio_detalhe_equipe(uuid, date, date, text, uuid, int, int) to authenticated;
