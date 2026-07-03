-- ETAPA 2B — RPC 7: detalhamento paginado das oportunidades (drill dos KPIs comerciais).
-- Isolada por org (is_member), RLS, mínimo de PII (nome do cliente; sem telefone/cpf/email),
-- paginação + total, ordenação. Sem acesso entre orgs. p_por escolhe a dimensão de data
-- ('criacao' = criado_em para conversão de coorte; 'fechamento' = fechado_em para fechamentos do período).
create or replace function public.relatorio_detalhe_oportunidades(
  p_org uuid, p_inicio date, p_fim date, p_por text default 'criacao', p_canal_origem uuid default null,
  p_responsavel uuid default null, p_status text default null, p_coluna uuid default null, p_origem text default null,
  p_order text default 'recente', p_limit int default 50, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path to 'public','auth' as $function$
declare
  v_ini timestamptz := (p_inicio::timestamp) at time zone 'America/Sao_Paulo';
  v_fim timestamptz := (p_fim::timestamp) at time zone 'America/Sao_Paulo';
  v_lim int := least(greatest(coalesce(p_limit,50),1),200); v_off int := greatest(coalesce(p_offset,0),0); r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then raise exception 'sem_acesso' using errcode='insufficient_privilege'; end if;
  with f as (
    select o.id, o.status::text status, o.criado_em, o.fechado_em, o.fechado_em_estimado, o.valor_estimado, o.origem,
           coalesce(o.contato_nome, ct.nome, o.titulo, 'Lead') nome, fc.nome coluna_nome, fc.resultado, u.nome resp_nome, cn.nome_interno canal_nome
    from oportunidades o
      left join contatos ct on ct.id=o.contato_id
      left join funil_colunas fc on fc.id=o.coluna_id
      left join usuarios u on u.id=o.responsavel_id
      left join canais cn on cn.id=o.canal_origem_id
    where o.organizacao_id=p_org
      and (case when p_por='fechamento' then (o.fechado_em>=v_ini and o.fechado_em<v_fim) else (o.criado_em>=v_ini and o.criado_em<v_fim) end)
      and (p_canal_origem is null or o.canal_origem_id=p_canal_origem)
      and (p_responsavel is null or o.responsavel_id=p_responsavel)
      and (p_status is null or o.status::text=p_status)
      and (p_coluna is null or o.coluna_id=p_coluna)
      and (p_origem is null or o.origem=p_origem)),
  pg as (select * from f order by
      case when p_order='antigo' then criado_em end asc nulls last,
      case when p_order='valor' then valor_estimado end desc nulls last,
      case when p_order not in ('antigo','valor') then criado_em end desc nulls last
      limit v_lim offset v_off)
  select jsonb_build_object('total',(select count(*) from f),'limit',v_lim,'offset',v_off,
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id',id,'cliente',nome,'status',status,'coluna',coluna_nome,'resultado',resultado,'responsavel',resp_nome,'canal_origem',canal_nome,'origem',origem,'valor',valor_estimado,'criado_em',criado_em,'fechado_em',fechado_em,'fechado_em_estimado',fechado_em_estimado)) from pg),'[]'::jsonb)) into r;
  return r;
end $function$;
grant execute on function public.relatorio_detalhe_oportunidades(uuid, date, date, text, uuid, uuid, text, uuid, text, text, int, int) to authenticated;
