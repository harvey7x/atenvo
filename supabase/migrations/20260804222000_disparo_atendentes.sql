-- ─────────────────────────────────────────────────────────────────────────────
-- DISPARO — Fase B (Seção 3 da spec): relatório de ATENDENTES por campanha.
--
-- 1 linha por atendente (contatos/oportunidades.responsavel_id → usuarios.nome),
-- incluindo "Sem atendente". UNIDADE = PESSOA distinta (count distinct por contato),
-- NUNCA linhas do log — um lead com 2 disparos conta 1x pro atendente.
--
-- Colunas: atribuidos, responderam (= alvo status 'respondido', mesmos 77 da campanha),
-- avancaram_murillo (chamou o Murillo chip OU saiu do Lead Novo), fecharam (ganho pós-envio),
-- sla_time_seg = SLA DO TIME (≠ tempo-do-lead da Fase A): média de (1ª resposta OUTBOUND
-- do atendente − 1ª mensagem inbound do lead após o envio), parados = respondeu e ainda
-- SEM 1ª resposta do atendente há mais de p_horas_parado (default 1h; wall-clock — a
-- ponderação por horário comercial fica pra um refino, o limiar já é ajustável na tela).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.disparo_campanha_atendentes(p_campanha uuid, p_horas_parado int default 1)
returns table (
  atendente_id uuid, atendente text,
  atribuidos int, responderam int, avancaram_murillo int, fecharam int,
  sla_time_seg int, parados int
)
language sql stable security definer set search_path = public as $fn$
  with camp as (select id, organizacao_id from public.disparo_campanhas where id = p_campanha),
  murillo as (
    select c.id as canal_id from public.canais c, camp
    where c.organizacao_id = camp.organizacao_id and c.numero_conectado = '555191035329'
    order by c.criado_em limit 1
  ),
  base as (
    select e.contato_id, min(e.enviado_em) as enviado_em
    from public.disparo_envios e, camp where e.campanha_id = camp.id group by e.contato_id
  ),
  pes as (
    select b.contato_id, b.enviado_em, ct.responsavel_id,
      exists (select 1 from public.disparo_alvos a, camp
              where a.campanha_id = camp.id and a.contato_id = b.contato_id and a.status = 'respondido') as respondeu,
      (select min(m.criado_em) from public.conversas cv join public.mensagens m on m.conversa_id = cv.id
        where cv.contato_id = b.contato_id and m.direcao = 'entrada' and m.criado_em > b.enviado_em) as resp_lead,
      exists (select 1 from public.conversas cv join public.mensagens m on m.conversa_id = cv.id
              where cv.contato_id = b.contato_id and cv.canal_id = (select canal_id from murillo)
                and m.direcao = 'entrada' and m.criado_em > b.enviado_em) as chamou_mur,
      (select fc.entrada from public.oportunidades o join public.funil_colunas fc on fc.id = o.coluna_id
        where o.contato_id = b.contato_id and o.organizacao_id = (select organizacao_id from camp)
        order by o.atualizado_em desc limit 1) as etapa_entrada,
      exists (select 1 from public.oportunidades o
              where o.contato_id = b.contato_id and o.status = 'ganho'
                and o.fechado_em is not null and o.fechado_em > b.enviado_em) as fechou
    from base b join public.contatos ct on ct.id = b.contato_id
  ),
  pes2 as (
    select p.*,
      (select min(m.criado_em) from public.conversas cv join public.mensagens m on m.conversa_id = cv.id
        where cv.contato_id = p.contato_id and m.direcao = 'saida'
          and m.autor_id = p.responsavel_id and m.criado_em > p.resp_lead) as resp_atend
    from pes p
  )
  select
    p.responsavel_id,
    coalesce(u.nome, 'Sem atendente'),
    count(*)::int,
    count(*) filter (where p.respondeu)::int,
    count(*) filter (where p.chamou_mur or p.etapa_entrada is false)::int,
    count(*) filter (where p.fechou)::int,
    (avg(extract(epoch from (p.resp_atend - p.resp_lead))) filter (where p.respondeu and p.resp_atend is not null))::int,
    count(*) filter (where p.respondeu and p.resp_lead is not null and p.resp_atend is null
                       and (now() - p.resp_lead) > make_interval(hours => greatest(p_horas_parado, 0)))::int
  from pes2 p
  left join public.usuarios u on u.id = p.responsavel_id
  where public.papel_na_org((select organizacao_id from camp)) is not null
  group by p.responsavel_id, u.nome
  order by (count(*) filter (where p.fechou)::numeric / nullif(count(*), 0)) desc nulls last;
$fn$;
revoke all on function public.disparo_campanha_atendentes(uuid, int) from public, anon;
grant execute on function public.disparo_campanha_atendentes(uuid, int) to authenticated, service_role;
