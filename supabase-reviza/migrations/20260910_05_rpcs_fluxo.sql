-- Reviza — RPCs do fluxo comercial->financeiro (atomicas, SECURITY DEFINER)
-- Aplicada 2026-09-10 via MCP como "reviza_05_rpcs_fluxo".

create or replace function public.confirmar_entrada(p_entrada_id uuid) returns void
  language plpgsql security definer set search_path = '' as $$
declare e public.entradas%rowtype;
begin
  if not public.is_at_least('financeiro') then raise exception 'sem permissao' using errcode='42501'; end if;
  select * into e from public.entradas where id=p_entrada_id for update;
  if not found then raise exception 'entrada inexistente'; end if;
  if e.estado <> 'pendente' then raise exception 'entrada ja decidida'; end if;
  if e.lead_id is null then raise exception 'entrada sem lead (orfa) — nao pode confirmar'; end if;

  update public.entradas set estado='confirmada', resolvido_por=auth.uid(), resolvido_em=now() where id=p_entrada_id;
  insert into public.competencias(comp) values (e.comp) on conflict do nothing;

  insert into public.pagamentos(lead_id, comp, status, valor, comprovante_path, pago_em, confirmado_por)
  values (e.lead_id, e.comp, 'pago', e.valor, e.comprovante_path, now(), auth.uid())
  on conflict (lead_id,comp) do update set
    status='pago', valor=excluded.valor,
    comprovante_path=coalesce(excluded.comprovante_path, public.pagamentos.comprovante_path),
    pago_em=now(), confirmado_por=auth.uid();

  insert into public.mov_fin(lead_id, lead_nome, comercial_nome, comp, valor, status, comprovante_path, origem_entrada_id, decidido_por)
  values (e.lead_id, e.lead_nome, e.por_nome, e.comp, e.valor, 'confirmada', e.comprovante_path, e.id, auth.uid());
end $$;

create or replace function public.recusar_entrada(p_entrada_id uuid, p_motivo text default null) returns void
  language plpgsql security definer set search_path = '' as $$
declare e public.entradas%rowtype;
begin
  if not public.is_at_least('financeiro') then raise exception 'sem permissao' using errcode='42501'; end if;
  select * into e from public.entradas where id=p_entrada_id for update;
  if not found then raise exception 'entrada inexistente'; end if;
  if e.estado <> 'pendente' then raise exception 'entrada ja decidida'; end if;

  update public.entradas set estado='recusada', resolvido_por=auth.uid(), resolvido_em=now() where id=p_entrada_id;
  insert into public.competencias(comp) values (e.comp) on conflict do nothing;
  insert into public.mov_fin(lead_id, lead_nome, comercial_nome, comp, valor, status, comprovante_path, origem_entrada_id, decidido_por)
  values (e.lead_id, e.lead_nome, e.por_nome, e.comp, e.valor, 'recusada', e.comprovante_path, e.id, auth.uid());
end $$;

-- Marcar celula (grade): pago/nao_pagou => financeiro+ ; limpar(fora) => gestor+.
-- Loga no ledger SO quando ha comprovante e status=pago (fidelidade ao modelo).
create or replace function public.marcar_celula(
  p_lead uuid, p_comp text, p_status public.status_pagamento,
  p_valor numeric default null, p_comprovante_path text default null) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_nome text; v_com text;
begin
  if p_status = 'fora' then
    if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode='42501'; end if;
  else
    if not public.is_at_least('financeiro') then raise exception 'sem permissao' using errcode='42501'; end if;
  end if;
  if p_status='pago' and p_valor is null then raise exception 'valor obrigatorio para pago' using errcode='22023'; end if;

  insert into public.competencias(comp) values (p_comp) on conflict do nothing;
  insert into public.pagamentos(lead_id, comp, status, valor, comprovante_path, pago_em, confirmado_por)
  values (p_lead, p_comp, p_status, case when p_status='pago' then p_valor else null end,
          p_comprovante_path, case when p_status='pago' then now() else null end, auth.uid())
  on conflict (lead_id,comp) do update set
    status=excluded.status,
    valor=case when excluded.status='pago' then excluded.valor else null end,
    comprovante_path=coalesce(excluded.comprovante_path, public.pagamentos.comprovante_path),
    pago_em=case when excluded.status='pago' then now() else null end,
    confirmado_por=auth.uid();

  if p_comprovante_path is not null and p_status='pago' then
    select l.nome, l.comercial into v_nome, v_com from public.leads l where l.id=p_lead;
    insert into public.mov_fin(lead_id, lead_nome, comercial_nome, comp, valor, status, comprovante_path, decidido_por)
    values (p_lead, v_nome, v_com, p_comp, p_valor, 'confirmada', p_comprovante_path, auth.uid());
  end if;
end $$;

revoke all on function public.confirmar_entrada(uuid), public.recusar_entrada(uuid,text), public.marcar_celula(uuid,text,public.status_pagamento,numeric,text) from public, anon;
grant execute on function public.confirmar_entrada(uuid), public.recusar_entrada(uuid,text), public.marcar_celula(uuid,text,public.status_pagamento,numeric,text) to authenticated;
