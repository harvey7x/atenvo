-- ─────────────────────────────────────────────────────────────────────────────
-- DISPARO — Fase 2a: RESULTADO por campanha (pedido do dono 2026-08-04).
--
-- Cada campanha mostra, sobre as pessoas que RECEBERAM o disparo:
--   * responderam       — alvo status 'respondido' (webhook marca quem responde ao template)
--   * chamaram_murillo   — a pessoa mandou mensagem (entrada) pro canal Murillo Chip
--                          DEPOIS do disparo dela (regra do dono: qualquer contato posterior)
--   * fecharam           — oportunidade da pessoa virou 'ganho' com fechado_em > o envio
--
-- Referência de tempo = disparo_alvos.enviado_em (o envio àquela pessoa). Tudo lido de
-- dados que já existem — NÃO mexe na mecânica de envio. (O "re-disparar sem perder o
-- resultado da rodada" — que precisa de log de envios — é a Fase 2b, à parte.)
-- Canal Murillo é resolvido pelo numero_conectado, não por id fixo (robusto a recriação).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.disparo_campanha_resultado(p_campanha uuid)
returns table (
  enviados int, responderam int, chamaram_murillo int, fecharam int
)
language sql stable security definer set search_path = public as $fn$
  with camp as (
    select id, organizacao_id from public.disparo_campanhas where id = p_campanha
  ),
  murillo as (
    select c.id as canal_id
    from public.canais c, camp
    where c.organizacao_id = camp.organizacao_id
      and c.numero_conectado = '555191035329'
    order by c.criado_em
    limit 1
  ),
  base as (
    select a.contato_id, a.enviado_em
    from public.disparo_alvos a, camp
    where a.campanha_id = camp.id
      and a.status in ('enviado', 'respondido')
      and a.enviado_em is not null
  )
  select
    (select count(*)::int from base),
    (select count(*)::int from public.disparo_alvos a, camp
       where a.campanha_id = camp.id and a.status = 'respondido'),
    (select count(distinct b.contato_id)::int from base b
       where exists (
         select 1 from public.conversas cv
         join public.mensagens m on m.conversa_id = cv.id
         where cv.contato_id = b.contato_id
           and cv.canal_id = (select canal_id from murillo)
           and m.direcao = 'entrada'
           and m.criado_em > b.enviado_em
       )),
    (select count(distinct b.contato_id)::int from base b
       where exists (
         select 1 from public.oportunidades o
         where o.contato_id = b.contato_id
           and o.status = 'ganho'
           and o.fechado_em is not null
           and o.fechado_em > b.enviado_em
       ))
  where public.papel_na_org((select organizacao_id from camp)) is not null;
$fn$;
revoke all on function public.disparo_campanha_resultado(uuid) from public, anon;
grant execute on function public.disparo_campanha_resultado(uuid) to authenticated, service_role;
