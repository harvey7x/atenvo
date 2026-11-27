-- =====================================================================
-- 48 — Remover todos os "Novos" (dono 17/09 via Matheus): botão que apaga
-- de uma vez os clientes com débito ativo (situacao='ativo' = a aba Novos),
-- REVERSÍVEL em lote pelo Desfazer.
-- (a) remover_novos(): apaga todos os leads 'ativo'. Cada DELETE dispara o
--     gatilho da lixeira (mig 32) → cada cliente vai inteiro (linha + senhas
--     cifradas + pagamentos) pra private.leads_lixeira. Devolve os ids
--     apagados pro Desfazer. Gate gestor/admin (mesmo do delete unitário,
--     RLS leads_del).
-- (b) restaurar_leads(p_lead_ids): traz de volta, de uma vez, os leads dados
--     — cada um do registro mais recente NÃO restaurado da lixeira. É o
--     inverso do remover_novos (e também serve pra restaurar em lote pela
--     Lixeira). Pula quem já voltou ou já está na base (sem abortar o lote).
-- =====================================================================

create or replace function public.remover_novos()
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_ids uuid[];
begin
  if not public.is_at_least('gestor') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  with alvo as (
    select id from public.leads where situacao = 'ativo' for update
  ), del as (
    delete from public.leads l using alvo a where l.id = a.id returning l.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from del;
  return jsonb_build_object('removidos', to_jsonb(v_ids), 'n', coalesce(array_length(v_ids, 1), 0));
end $$;

create or replace function public.restaurar_leads(p_lead_ids uuid[])
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid; v_n int := 0; x private.leads_lixeira%rowtype;
begin
  if not public.is_at_least('gestor') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  foreach v_id in array coalesce(p_lead_ids, '{}'::uuid[]) loop
    select * into x from private.leads_lixeira
      where lead_id = v_id and restaurado_em is null
      order by deletado_em desc limit 1;
    if not found then continue; end if;                    -- nada na lixeira pra esse lead
    if exists (select 1 from public.leads where id = x.lead_id) then continue; end if; -- já voltou
    insert into public.leads select * from jsonb_populate_record(null::public.leads, x.lead);
    if x.segredos is not null then
      insert into private.lead_segredos select * from jsonb_populate_record(null::private.lead_segredos, x.segredos)
        on conflict (lead_id) do nothing;
    end if;
    if jsonb_array_length(x.pagamentos) > 0 then
      insert into public.pagamentos select * from jsonb_populate_recordset(null::public.pagamentos, x.pagamentos)
        on conflict (lead_id, comp) do nothing;
    end if;
    update private.leads_lixeira set restaurado_em = now() where id = x.id;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('restaurados', v_n);
end $$;

revoke all on function public.remover_novos(), public.restaurar_leads(uuid[]) from public, anon;
grant execute on function public.remover_novos(), public.restaurar_leads(uuid[]) to authenticated;
