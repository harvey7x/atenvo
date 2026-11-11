-- Reviza — polimento das notificações (revisão adversarial 14/09):
-- (1) competência legível ("ago/26" como no resto do app) via comp_rotulo();
-- (2) marcar_celula sem SPAM: edições da mesma célula substituem a notificação
--     não lida anterior (título ganha a competência e vira a chave do dedup);
-- (3) desempate determinístico no match de comercial homônimo (order by created_at).
-- Corpos de confirmar/recusar/marcar_celula = mig 29 com só esses ajustes.
-- Aplicada 2026-09-14 via MCP como "reviza_30_notificacoes_polish".

create or replace function public.comp_rotulo(p_comp text) returns text
  language sql immutable set search_path = '' as
$$ select coalesce(
     case when p_comp ~ '^[0-9]{4}-[0-9]{2}$'
       then (array['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'])[substring(p_comp from 6 for 2)::int]
            || '/' || substring(p_comp from 3 for 2)
     end, p_comp) $$;

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

  perform public.notificar(e.por_id, 'pagamento_confirmado',
    'Pagamento confirmado: ' || coalesce(e.lead_nome, 'cliente'),
    'R$ ' || replace(to_char(e.valor, 'FM999999990.00'), '.', ',') || ' de ' || public.comp_rotulo(e.comp) || ' — o financeiro conferiu e confirmou. ✓',
    '/cobrancas/planilha');
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

  perform public.notificar(e.por_id, 'pagamento_recusado',
    'Pagamento não localizado: ' || coalesce(e.lead_nome, 'cliente'),
    'R$ ' || replace(to_char(e.valor, 'FM999999990.00'), '.', ',') || ' de ' || public.comp_rotulo(e.comp) || ' — o financeiro não achou a entrada no extrato'
      || case when p_motivo is not null and btrim(p_motivo) <> '' then ' (' || btrim(p_motivo) || ')' else '' end
      || '. Confira com o cliente.',
    '/cobrancas/planilha');
end $$;

create or replace function public.marcar_celula(
  p_lead uuid, p_comp text, p_status public.status_pagamento,
  p_valor numeric default null, p_comprovante_path text default null) returns void
  language plpgsql security definer set search_path = '' as $$
declare v_nome text; v_com text; v_dono uuid; v_titulo text;
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

  if p_status = 'pago' then
    select l.nome, l.comercial into v_nome, v_com from public.leads l where l.id = p_lead;
    select p.id into v_dono from public.profiles p
      where p.ativo and upper(btrim(p.nome)) = upper(btrim(coalesce(v_com, '')))
      order by p.created_at limit 1;
    -- edições da mesma célula SUBSTITUEM a notificação não lida (sem spam):
    -- o título carrega cliente + competência e serve de chave do dedup
    v_titulo := 'Recebido: ' || coalesce(v_nome, 'cliente') || ' · ' || public.comp_rotulo(p_comp);
    delete from public.notificacoes
      where user_id = v_dono and tipo = 'celula_recebida' and titulo = v_titulo and lida_em is null;
    perform public.notificar(v_dono, 'celula_recebida', v_titulo,
      'R$ ' || replace(to_char(coalesce(p_valor, 0), 'FM999999990.00'), '.', ',') || ' marcado como pago na grade.',
      '/cobrancas/planilha');
  end if;
end $$;

revoke all on function public.confirmar_entrada(uuid), public.recusar_entrada(uuid,text), public.marcar_celula(uuid,text,public.status_pagamento,numeric,text) from public, anon;
grant execute on function public.confirmar_entrada(uuid), public.recusar_entrada(uuid,text), public.marcar_celula(uuid,text,public.status_pagamento,numeric,text) to authenticated;
