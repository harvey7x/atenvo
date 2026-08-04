-- ─────────────────────────────────────────────────────────────────────────────
-- DISPARO — Fase 2b: LOG de envios + RE-ARMAR (re-disparar a mesma campanha).
--
-- Problema: "disparar de novo pras mesmas pessoas trocando template" na MESMA
-- campanha. Re-armar alvos (enviado→pendente) apagaria enviado_em/wamid, e com eles
-- o histórico que o resultado da campanha usa. Solução: um log APPEND-ONLY de envios
-- (disparo_envios) — cada envio real vira uma linha, imune ao re-arme. A edge
-- disparo-processar passa a gravar nele; o resultado passa a ancorar o tempo no log.
--
-- Decisão de produto: o re-arme NÃO mexe em quem já 'respondido' nem 'optout' — não
-- re-blasta template em quem já está conversando (protege o quality rating do número)
-- nem ressuscita quem pediu pra sair. Só reenvia enviado/falhou/pulado.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.disparo_envios (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  campanha_id     uuid not null references public.disparo_campanhas(id) on delete cascade,
  contato_id      uuid not null references public.contatos(id) on delete cascade,
  template_id     uuid,
  wamid           text,
  enviado_em      timestamptz not null default now()
);
create index if not exists disparo_envios_camp_ix on public.disparo_envios (campanha_id, contato_id, enviado_em);

alter table public.disparo_envios enable row level security;
drop policy if exists disparo_envios_sel on public.disparo_envios;
create policy disparo_envios_sel on public.disparo_envios
  for select to authenticated using (public.papel_na_org(organizacao_id) is not null);
revoke insert, update, delete on public.disparo_envios from anon, authenticated;
grant select on public.disparo_envios to authenticated;
grant select, insert, update, delete on public.disparo_envios to service_role;

-- Backfill: reconstrói o log do que já saiu (idempotente pela tripla campanha+contato+tempo).
insert into public.disparo_envios (organizacao_id, campanha_id, contato_id, template_id, wamid, enviado_em)
select c.organizacao_id, a.campanha_id, a.contato_id, c.template_id, a.wamid, a.enviado_em
from public.disparo_alvos a
join public.disparo_campanhas c on c.id = a.campanha_id
where a.status in ('enviado', 'respondido') and a.enviado_em is not null
  and not exists (
    select 1 from public.disparo_envios e
    where e.campanha_id = a.campanha_id and e.contato_id = a.contato_id and e.enviado_em = a.enviado_em
  );

-- Re-armar: reenvio dos NÃO-engajados. admin|supervisor. Preserva respondido/optout.
create or replace function public.disparo_rearmar(p_campanha uuid)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_n int;
begin
  select organizacao_id into v_org from public.disparo_campanhas where id = p_campanha;
  if v_org is null then raise exception 'campanha_invalida'; end if;
  if not (public.is_platform_admin() or
      (public.papel_na_org(v_org) = any (array['admin'::user_role, 'supervisor'::user_role]) and public.org_operacional(v_org)))
  then raise exception 'sem_permissao'; end if;

  update public.disparo_alvos
     set status = 'pendente', enviado_em = null, wamid = null, erro = null
   where campanha_id = p_campanha and status in ('enviado', 'falhou', 'pulado');
  get diagnostics v_n = row_count;

  update public.disparo_campanhas
     set status = 'ativa', atualizado_em = now()
   where id = p_campanha and status <> 'cancelada';

  return jsonb_build_object('rearmados', v_n);
end $fn$;
revoke all on function public.disparo_rearmar(uuid) from public, anon;
grant execute on function public.disparo_rearmar(uuid) to authenticated, service_role;

-- Resultado ancorado no LOG (sobrevive ao re-arme): tempo = 1º envio por contato.
-- 'responderam' segue do status do alvo (sinal do webhook é mais preciso que derivar de
-- mensagem; e o re-arme preserva 'respondido').
create or replace function public.disparo_campanha_resultado(p_campanha uuid)
returns table (enviados int, responderam int, chamaram_murillo int, fecharam int)
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
         where o.contato_id = b.contato_id and o.status = 'ganho'
           and o.fechado_em is not null and o.fechado_em > b.enviado_em
       ))
  where public.papel_na_org((select organizacao_id from camp)) is not null;
$fn$;
revoke all on function public.disparo_campanha_resultado(uuid) from public, anon;
grant execute on function public.disparo_campanha_resultado(uuid) to authenticated, service_role;
