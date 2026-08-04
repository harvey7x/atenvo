-- ─────────────────────────────────────────────────────────────────────────────
-- DISPARO — Fase 3: relatório por pessoa + excluir campanha.
--
-- Pedido do dono: relatório mais completo (quem fechou, quem está pendente, situação
-- do lead no Kanban, atendente responsável) e poder EXCLUIR campanhas (X no card).
--   * disparo_campanha_pessoas — uma linha por alvo com status do disparo, etapa atual
--     no Kanban (oportunidade mais recente), atendente (contatos.responsavel_id) e se
--     a pessoa está com oportunidade ganha.
--   * disparo_excluir_campanha — apaga a campanha (alvos e log caem por cascade).
--     admin|supervisor. Usado pra limpar campanhas de teste da lista.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.disparo_campanha_pessoas(p_campanha uuid)
returns table (
  contato_id uuid, nome text, telefone text,
  status text, enviado_em timestamptz,
  etapa_kanban text, atendente text, fechou boolean
)
language sql stable security definer set search_path = public as $fn$
  with camp as (select id, organizacao_id from public.disparo_campanhas where id = p_campanha),
  op as (   -- oportunidade ATUAL por contato (a mais recente)
    select distinct on (o.contato_id) o.contato_id, fc.nome as etapa, o.status as ost
    from public.oportunidades o
    join public.funil_colunas fc on fc.id = o.coluna_id
    where o.organizacao_id = (select organizacao_id from camp)
    order by o.contato_id, o.atualizado_em desc
  )
  select a.contato_id, co.nome,
    (select ci.valor_normalizado from public.contato_identidades ci
       where ci.contato_id = a.contato_id and ci.tipo = 'whatsapp' limit 1),
    a.status, a.enviado_em, op.etapa, u.nome, (op.ost = 'ganho')
  from public.disparo_alvos a
  join public.contatos co on co.id = a.contato_id
  cross join camp
  left join op on op.contato_id = a.contato_id
  left join public.usuarios u on u.id = co.responsavel_id
  where a.campanha_id = camp.id
    and public.papel_na_org(camp.organizacao_id) is not null
  order by a.criado_em;
$fn$;
revoke all on function public.disparo_campanha_pessoas(uuid) from public, anon;
grant execute on function public.disparo_campanha_pessoas(uuid) to authenticated, service_role;

create or replace function public.disparo_excluir_campanha(p_campanha uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.disparo_campanhas where id = p_campanha;
  if v_org is null then raise exception 'campanha_invalida'; end if;
  if not (public.is_platform_admin() or
      (public.papel_na_org(v_org) = any (array['admin'::user_role, 'supervisor'::user_role]) and public.org_operacional(v_org)))
  then raise exception 'sem_permissao'; end if;
  -- alvos e disparo_envios têm FK on delete cascade → somem junto.
  delete from public.disparo_campanhas where id = p_campanha;
end $fn$;
revoke all on function public.disparo_excluir_campanha(uuid) from public, anon;
grant execute on function public.disparo_excluir_campanha(uuid) to authenticated, service_role;
