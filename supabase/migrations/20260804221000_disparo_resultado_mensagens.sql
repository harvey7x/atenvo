-- ─────────────────────────────────────────────────────────────────────────────
-- DISPARO — Passo 0 da continuação: reconciliar "Enviados" (custo/CAC corretos).
--
-- CAUSA da divergência 92 (card) vs 253 (funil): o card lia o STATUS ATUAL do alvo
-- (porStatus enviado+respondido) — que cai quando o "Disparar de novo" re-arma os de
-- Lead Novo pra 'pendente'. O funil lê o LOG disparo_envios (histórico, imune ao re-arme).
--
-- CORREÇÃO: custo = dinheiro que já saiu = TOTAL de mensagens enviadas (linhas do log),
-- que cresce a cada reenvio — não o status atual (subestima) nem pessoas distintas
-- (subestima reenvios). RPC ganha `mensagens` = count(*) do log. `enviados` segue sendo
-- pessoas distintas alcançadas (base do funil/taxas). Frontend: custo = mensagens×0,35.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.disparo_campanha_resultado(uuid);
create or replace function public.disparo_campanha_resultado(p_campanha uuid)
returns table (enviados int, mensagens int, responderam int, chamaram_murillo int, fecharam int, tempo_1a_resposta_seg int)
language sql stable security definer set search_path = public as $fn$
  with camp as (select id, organizacao_id from public.disparo_campanhas where id = p_campanha),
  murillo as (
    select c.id as canal_id from public.canais c, camp
    where c.organizacao_id = camp.organizacao_id and c.numero_conectado = '555191035329'
    order by c.criado_em limit 1
  ),
  base as (
    select e.contato_id, min(e.enviado_em) as enviado_em
    from public.disparo_envios e, camp
    where e.campanha_id = camp.id
    group by e.contato_id
  )
  select
    (select count(*)::int from base),                                                    -- enviados = pessoas alcançadas
    (select count(*)::int from public.disparo_envios e, camp where e.campanha_id = camp.id), -- mensagens = total de envios (custo)
    (select count(*)::int from public.disparo_alvos a, camp where a.campanha_id = camp.id and a.status = 'respondido'),
    (select count(distinct b.contato_id)::int from base b
       where exists (select 1 from public.conversas cv join public.mensagens m on m.conversa_id = cv.id
                     where cv.contato_id = b.contato_id and cv.canal_id = (select canal_id from murillo)
                       and m.direcao = 'entrada' and m.criado_em > b.enviado_em)),
    (select count(distinct b.contato_id)::int from base b
       where exists (select 1 from public.oportunidades o
                     where o.contato_id = b.contato_id and o.status = 'ganho'
                       and o.fechado_em is not null and o.fechado_em > b.enviado_em)),
    (select avg(extract(epoch from (mi.primeira - b.enviado_em)))::int
       from base b
       join lateral (select min(m.criado_em) as primeira from public.conversas cv join public.mensagens m on m.conversa_id = cv.id
                     where cv.contato_id = b.contato_id and m.direcao = 'entrada' and m.criado_em > b.enviado_em) mi on true
       where mi.primeira is not null)
  where public.papel_na_org((select organizacao_id from camp)) is not null;
$fn$;
revoke all on function public.disparo_campanha_resultado(uuid) from public, anon;
grant execute on function public.disparo_campanha_resultado(uuid) to authenticated, service_role;
