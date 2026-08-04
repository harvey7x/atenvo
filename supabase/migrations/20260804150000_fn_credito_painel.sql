-- fn_credito_painel: métricas do fluxo de crédito nas últimas p_horas, por canal (oficial 1390 / luiza).
-- Lida pelo endpoint read-only credito-painel (routine de monitoramento). Só leitura.
create or replace function fn_credito_painel(p_horas int default 2)
returns jsonb language sql stable security definer set search_path=public as $$
  with j as (select now() - make_interval(hours => p_horas) as ini),
  canal(id, nome) as (values
    ('27f32142-3853-4316-9262-445c364cc0f0'::uuid,'oficial'),
    ('fc80ec9e-9f8f-4dca-a3f0-e1101d73e117'::uuid,'luiza')),
  leads as (
    select c.nome, count(distinct cv.contato_id) n
    from audit_log a join conversas cv on cv.id=a.entidade_id join canal c on c.id=cv.canal_id, j
    where a.acao='fluxo_botoes' and a.dados_depois->>'evento'='entrada_recebida' and a.criado_em>=j.ini
    group by 1),
  conv as (
    select c.nome, count(*) n
    from audit_log a join conversas cv on cv.id=a.entidade_id join canal c on c.id=cv.canal_id, j
    where a.acao='fluxo_botoes' and a.dados_depois->>'evento'='roteou_fecho' and a.criado_em>=j.ini
    group by 1),
  nud as (
    select count(*) filter (where m.metadados->>'fluxo'='credito_nudge') handoff,
           count(*) filter (where m.metadados->>'fluxo'='credito_nudge_abertura') abertura
    from mensagens m, j where m.criado_em>=j.ini and m.metadados->>'fluxo' in ('credito_nudge','credito_nudge_abertura')),
  err as (
    select count(*) n from audit_log a, j
    where a.acao='fluxo_botoes' and a.dados_depois->>'evento' in ('tela_falhou','banner_falhou','guardrail_bloqueou') and a.criado_em>=j.ini)
  select jsonb_build_object(
    'horas', p_horas,
    'leads', jsonb_build_object('oficial', coalesce((select n from leads where nome='oficial'),0), 'luiza', coalesce((select n from leads where nome='luiza'),0)),
    'conversoes', jsonb_build_object('oficial', coalesce((select n from conv where nome='oficial'),0), 'luiza', coalesce((select n from conv where nome='luiza'),0)),
    'nudges', jsonb_build_object('handoff', coalesce((select handoff from nud),0), 'abertura', coalesce((select abertura from nud),0)),
    'erros', coalesce((select n from err),0));
$$;
