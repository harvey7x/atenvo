-- ─────────────────────────────────────────────────────────────────────────────
-- DISPARO — Fase C (Seção 4): filtros combináveis + timeline por contato.
--
-- disparo_campanha_pessoas ganha chamou_murillo / template_nome / atendente_id para
-- alimentar a matriz de filtros combináveis (E). "Respondeu" no filtro = status do
-- alvo = 'respondido' (mesmo critério da Fase B / campanha — não "qualquer inbound").
-- A seleção filtrada (contato_ids) é REAPROVEITADA pela Fase D como alvo de remarketing.
--
-- disparo_contato_timeline monta a jornada da pessoa a partir das fontes que JÁ existem
-- (log de envios, 1ª inbound de resposta, 1ª inbound no canal do Murillo, movimentação
-- da oportunidade, fechamento) — sem captura nova de evento.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.disparo_campanha_pessoas(uuid);
create or replace function public.disparo_campanha_pessoas(p_campanha uuid)
returns table (contato_id uuid, nome text, telefone text, status text, enviado_em timestamptz,
  etapa_kanban text, atendente text, atendente_id uuid, fechou boolean, chamou_murillo boolean, template_nome text)
language sql stable security definer set search_path = public as $fn$
  with camp as (select id, organizacao_id from public.disparo_campanhas where id = p_campanha),
  murillo as (select c.id canal_id from public.canais c, camp where c.organizacao_id=camp.organizacao_id and c.numero_conectado='555191035329' order by c.criado_em limit 1),
  send0 as (select e.contato_id, min(e.enviado_em) e0 from public.disparo_envios e, camp where e.campanha_id=camp.id group by e.contato_id),
  op as (select distinct on (o.contato_id) o.contato_id, fc.nome as etapa, o.status as ost
    from public.oportunidades o join public.funil_colunas fc on fc.id=o.coluna_id
    where o.organizacao_id=(select organizacao_id from camp) order by o.contato_id, o.atualizado_em desc)
  select a.contato_id, co.nome,
    (select ci.valor_normalizado from public.contato_identidades ci where ci.contato_id=a.contato_id and ci.tipo='whatsapp' limit 1),
    a.status, a.enviado_em, op.etapa, u.nome, co.responsavel_id, (op.ost='ganho'),
    exists(select 1 from public.conversas cv join public.mensagens m on m.conversa_id=cv.id
      where cv.contato_id=a.contato_id and cv.canal_id=(select canal_id from murillo) and m.direcao='entrada'
        and m.criado_em > (select e0 from send0 s where s.contato_id=a.contato_id)),
    (select t.nome from public.disparo_envios e join public.wa_templates t on t.id=e.template_id
      where e.campanha_id=camp.id and e.contato_id=a.contato_id order by e.enviado_em desc limit 1)
  from public.disparo_alvos a
  join public.contatos co on co.id=a.contato_id
  cross join camp
  left join op on op.contato_id=a.contato_id
  left join public.usuarios u on u.id=co.responsavel_id
  where a.campanha_id=camp.id and public.papel_na_org(camp.organizacao_id) is not null
  order by a.criado_em;
$fn$;
revoke all on function public.disparo_campanha_pessoas(uuid) from public, anon;
grant execute on function public.disparo_campanha_pessoas(uuid) to authenticated, service_role;

create or replace function public.disparo_contato_timeline(p_campanha uuid, p_contato uuid)
returns table (tipo text, quando timestamptz, detalhe text)
language sql stable security definer set search_path = public as $fn$
  with camp as (select id, organizacao_id from public.disparo_campanhas where id=p_campanha),
  murillo as (select c.id canal_id from public.canais c, camp where c.organizacao_id=camp.organizacao_id and c.numero_conectado='555191035329' order by c.criado_em limit 1),
  send0 as (select min(e.enviado_em) e0 from public.disparo_envios e where e.campanha_id=p_campanha and e.contato_id=p_contato),
  op as (select o.status, o.movimentado_em, o.fechado_em, fc.nome etapa, fc.entrada
         from public.oportunidades o join public.funil_colunas fc on fc.id=o.coluna_id, camp
         where o.contato_id=p_contato and o.organizacao_id=camp.organizacao_id order by o.atualizado_em desc limit 1)
  select ev.tipo, ev.quando, ev.detalhe from (
    select 'enviado' tipo, e.enviado_em quando, t.nome detalhe
      from public.disparo_envios e left join public.wa_templates t on t.id=e.template_id
      where e.campanha_id=p_campanha and e.contato_id=p_contato
    union all
    select 'respondeu', (select min(m.criado_em) from public.conversas cv join public.mensagens m on m.conversa_id=cv.id
      where cv.contato_id=p_contato and m.direcao='entrada' and m.criado_em > (select e0 from send0)), null
    union all
    select 'murillo', (select min(m.criado_em) from public.conversas cv join public.mensagens m on m.conversa_id=cv.id
      where cv.contato_id=p_contato and cv.canal_id=(select canal_id from murillo) and m.direcao='entrada' and m.criado_em > (select e0 from send0)), null
    union all
    select 'etapa', op.movimentado_em, op.etapa from op where op.entrada is false
    union all
    select 'fechou', op.fechado_em, null from op where op.status='ganho' and op.fechado_em is not null
  ) ev
  where ev.quando is not null and public.papel_na_org((select organizacao_id from camp)) is not null
  order by ev.quando;
$fn$;
revoke all on function public.disparo_contato_timeline(uuid, uuid) from public, anon;
grant execute on function public.disparo_contato_timeline(uuid, uuid) to authenticated, service_role;
