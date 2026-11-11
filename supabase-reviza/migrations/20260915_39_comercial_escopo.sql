-- Comercial: vê/edita SÓ os clientes DELE (dono 15/09) + pode editar pagamentos dos dele.
-- "cliente do comercial" = leads.comercial (case-insensitive) igual ao nome do perfil logado.
-- admin/gestor/financeiro seguem vendo/editando tudo. Ver [[reviza-matriz-acessos-v2]].

-- helpers (SECURITY DEFINER: furam RLS de propósito, checam só o dono)
create or replace function public.comercial_dono(p_comercial text)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$ select exists(
  select 1 from public.profiles p
  where p.id = auth.uid() and p.ativo
    and upper(btrim(p.nome)) = upper(btrim(coalesce(p_comercial,''))) ) $$;

create or replace function public.comercial_dono_lead(p_lead uuid)
returns boolean language sql stable security definer set search_path to 'public','pg_temp'
as $$ select exists(
  select 1 from public.leads l
  join public.profiles p on upper(btrim(p.nome)) = upper(btrim(l.comercial))
  where l.id = p_lead and p.id = auth.uid() and p.ativo ) $$;

-- leads: comercial só enxerga os dele
drop policy if exists leads_sel on public.leads;
create policy leads_sel on public.leads for select using (
  current_papel() is not null
  and (current_papel()::text <> 'comercial' or public.comercial_dono(comercial))
);

-- leads: comercial só edita os dele (demais papeis inalterados)
drop policy if exists leads_upd on public.leads;
create policy leads_upd on public.leads for update
  using (
    tem_papel(variadic array['cadastro','comercial','financeiro','gestor','admin']::papel_usuario[])
    and (current_papel()::text <> 'comercial' or public.comercial_dono(comercial))
  )
  with check (
    tem_papel(variadic array['cadastro','comercial','financeiro','gestor','admin']::papel_usuario[])
    and (current_papel()::text <> 'comercial' or public.comercial_dono(comercial))
  );

-- pagamentos: comercial só vê os dos clientes dele
drop policy if exists pag_sel on public.pagamentos;
create policy pag_sel on public.pagamentos for select using (
  current_papel() is not null
  and (current_papel()::text <> 'comercial' or public.comercial_dono_lead(lead_id))
);

-- marcar_celula: comercial pode marcar pago/nao_pagou dos clientes DELE (tirar da régua segue gestor)
create or replace function public.marcar_celula(p_lead uuid, p_comp text, p_status status_pagamento, p_valor numeric default null::numeric, p_comprovante_path text default null::text)
returns void language plpgsql security definer set search_path to ''
as $function$
declare v_nome text; v_com text; v_dono uuid; v_titulo text;
begin
  if p_status = 'fora' then
    if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode='42501'; end if;
  else
    if not ( public.is_at_least('financeiro')
             or (public.current_papel()::text = 'comercial' and public.comercial_dono_lead(p_lead)) ) then
      raise exception 'sem permissao' using errcode='42501';
    end if;
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
    v_titulo := 'Recebido: ' || coalesce(v_nome, 'cliente') || ' · ' || public.comp_rotulo(p_comp);
    delete from public.notificacoes
      where user_id = v_dono and tipo = 'celula_recebida' and titulo = v_titulo and lida_em is null;
    perform public.notificar(v_dono, 'celula_recebida', v_titulo,
      'R$ ' || replace(to_char(coalesce(p_valor, 0), 'FM999999990.00'), '.', ',') || ' marcado como pago na grade.',
      '/cobrancas/planilha');
  end if;

  perform private.registrar(
    case p_status when 'pago' then 'marcou pago' when 'nao_pagou' then 'marcou não pago' else 'tirou da régua' end,
    'grade', p_lead::text,
    (select nome from public.leads where id = p_lead),
    public.comp_rotulo(p_comp) || case when p_status='pago' then ' · ' || private.brl(p_valor) else '' end);
end $function$;
