-- 120 · DASHBOARD › CRM (26/11, "igual" ao Dashboard do sistema que a Reviza usava antes: a visão do CRM). Uma rotina só,
-- do período escolhido (os cards que ENTRARAM no período):
--   por_uf        de que estado são os clientes (pelo DDD do telefone)
--   funil         quantos cards em cada etapa do funil padrão, na ordem, e quantos já viraram venda
--   etiquetas     as etiquetas mais usadas nos cards (e nos contatos deles)
--   reunioes      as próximas reuniões marcadas (Agenda)
--   tarefas       o resumo das tarefas da equipe: abertas, em andamento, concluídas no período, atrasadas, por pessoa
-- Só leitura. Administrador e supervisor (como o resto do Dashboard). ADITIVA.

create or replace function public.atd_dashboard_crm(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 3650);
  v_ini timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - make_interval(days => v_dias - 1);
  v_funil uuid;
begin
  if coalesce(public.org_papel(v_org), '') not in ('admin', 'supervisor') and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  select id into v_funil from public.funis where organizacao_id = v_org and padrao order by criado_em limit 1;
  return jsonb_build_object(
    'dias', v_dias,
    'cards', (select count(*) from public.oportunidades o where o.organizacao_id = v_org and o.funil_id = v_funil and o.criado_em >= v_ini and o.status <> 'cancelado'),
    'por_uf', coalesce((
      with ddd(d, uf) as (values
        ('11','SP'),('12','SP'),('13','SP'),('14','SP'),('15','SP'),('16','SP'),('17','SP'),('18','SP'),('19','SP'),
        ('21','RJ'),('22','RJ'),('24','RJ'),('27','ES'),('28','ES'),
        ('31','MG'),('32','MG'),('33','MG'),('34','MG'),('35','MG'),('37','MG'),('38','MG'),
        ('41','PR'),('42','PR'),('43','PR'),('44','PR'),('45','PR'),('46','PR'),('47','SC'),('48','SC'),('49','SC'),
        ('51','RS'),('53','RS'),('54','RS'),('55','RS'),
        ('61','DF'),('62','GO'),('64','GO'),('63','TO'),('65','MT'),('66','MT'),('67','MS'),('68','AC'),('69','RO'),
        ('71','BA'),('73','BA'),('74','BA'),('75','BA'),('77','BA'),('79','SE'),
        ('81','PE'),('87','PE'),('82','AL'),('83','PB'),('84','RN'),('85','CE'),('88','CE'),('86','PI'),('89','PI'),
        ('91','PA'),('93','PA'),('94','PA'),('92','AM'),('97','AM'),('95','RR'),('96','AP'),('98','MA'),('99','MA')),
      cli as (
        select distinct on (coalesce(o.contato_id, o.id)) left(private.atd_chave_fone(coalesce(c.telefone, o.telefone)), 2) as d
          from public.oportunidades o left join public.contatos c on c.id = o.contato_id
         where o.organizacao_id = v_org and o.funil_id = v_funil and o.criado_em >= v_ini and o.status <> 'cancelado')
      select jsonb_agg(jsonb_build_object('uf', x.uf, 'qtd', x.qtd) order by x.qtd desc)
        from (select coalesce(ddd.uf, 'Sem DDD') as uf, count(*) as qtd from cli left join ddd on ddd.d = cli.d group by 1) x), '[]'::jsonb),
    'funil', coalesce((
      select jsonb_agg(jsonb_build_object('etapa', x.nome, 'resultado', x.resultado, 'cor', x.cor, 'qtd', x.qtd) order by x.ordem)
        from (select fc.nome, fc.resultado, fc.cor, fc.ordem,
                     (select count(*) from public.oportunidades o where o.coluna_id = fc.id and o.criado_em >= v_ini and o.status <> 'cancelado') as qtd
                from public.funil_colunas fc where fc.funil_id = v_funil and fc.organizacao_id = v_org and not fc.arquivada) x), '[]'::jsonb),
    'vendas', (select count(*) from public.oportunidades o where o.organizacao_id = v_org and o.funil_id = v_funil and o.criado_em >= v_ini and o.status = 'ganho'),
    'perdidos', (select count(*) from public.oportunidades o where o.organizacao_id = v_org and o.funil_id = v_funil and o.criado_em >= v_ini and o.status = 'perdido'),
    'etiquetas', coalesce((
      select jsonb_agg(jsonb_build_object('nome', x.e, 'qtd', x.qtd, 'cor', (select t.cor from public.etiquetas t where t.organizacao_id = v_org and upper(btrim(t.nome)) = upper(x.e) limit 1)) order by x.qtd desc)
        from (select e, count(distinct o_id) as qtd from (
                select o.id as o_id, btrim(unnest(coalesce(o.etiquetas, '{}') || coalesce(c.etiquetas, '{}'))) as e
                  from public.oportunidades o left join public.contatos c on c.id = o.contato_id
                 where o.organizacao_id = v_org and o.funil_id = v_funil and o.criado_em >= v_ini and o.status <> 'cancelado') y
               where e <> '' group by 1 order by 2 desc limit 12) x), '[]'::jsonb),
    'reunioes', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'titulo', x.titulo, 'tipo', x.tipo, 'inicio', x.inicio, 'cliente', x.cliente,
                                          'responsavel', x.responsavel, 'conversa_id', x.conversa_id) order by x.inicio)
        from (select r.id, r.titulo, r.tipo, r.inicio, c.nome as cliente, u.nome as responsavel, r.conversa_id
                from public.atd_reunioes r left join public.contatos c on c.id = r.contato_id left join public.usuarios u on u.id = r.responsavel_id
               where r.organizacao_id = v_org and r.status = 'marcada' and r.inicio >= now() order by r.inicio limit 8) x), '[]'::jsonb),
    'reunioes_7d', (select count(*) from public.atd_reunioes r where r.organizacao_id = v_org and r.status = 'marcada' and r.inicio >= now() and r.inicio < now() + interval '7 days'),
    'tarefas', jsonb_build_object(
      'pendentes', (select count(*) from public.atd_tarefas t where t.organizacao_id = v_org and t.status = 'pendente'),
      'andamento', (select count(*) from public.atd_tarefas t where t.organizacao_id = v_org and t.status = 'andamento'),
      'atrasadas', (select count(*) from public.atd_tarefas t where t.organizacao_id = v_org and t.status <> 'concluida' and t.prazo < now()),
      'concluidas', (select count(*) from public.atd_tarefas t where t.organizacao_id = v_org and t.status = 'concluida' and t.concluida_em >= v_ini),
      'criadas', (select count(*) from public.atd_tarefas t where t.organizacao_id = v_org and t.criado_em >= v_ini),
      'por_prioridade', coalesce((select jsonb_object_agg(x.prioridade, x.qtd) from (select t.prioridade, count(*) as qtd from public.atd_tarefas t
                           where t.organizacao_id = v_org and t.status <> 'concluida' group by 1) x), '{}'::jsonb),
      'por_pessoa', coalesce((
        select jsonb_agg(jsonb_build_object('nome', x.nome, 'abertas', x.abertas, 'concluidas', x.concluidas, 'atrasadas', x.atrasadas) order by x.abertas desc, x.nome)
          from (select coalesce(u.nome, 'Sem responsável') as nome,
                       count(*) filter (where t.status <> 'concluida') as abertas,
                       count(*) filter (where t.status = 'concluida' and t.concluida_em >= v_ini) as concluidas,
                       count(*) filter (where t.status <> 'concluida' and t.prazo < now()) as atrasadas
                  from public.atd_tarefas t left join public.usuarios u on u.id = t.responsavel_id
                 where t.organizacao_id = v_org and (t.status <> 'concluida' or t.concluida_em >= v_ini) group by 1) x), '[]'::jsonb)));
end $$;
revoke all on function public.atd_dashboard_crm(int) from public, anon;
grant execute on function public.atd_dashboard_crm(int) to authenticated, service_role;

-- DESFAZER: drop function if exists public.atd_dashboard_crm(int);
