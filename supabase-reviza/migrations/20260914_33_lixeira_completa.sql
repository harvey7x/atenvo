-- Reviza — lixeira COMPLETA (revisão: o restore tem que trazer o cliente inteiro).
-- leads tem 8 filhos. A mig 32 guardava só 2 (segredos, pagamentos). Agora:
--  CASCADE (a linha some no delete → guardo a linha inteira p/ reinserir):
--    private.lead_segredos, public.pagamentos, wa_regua_disparos, wa_regua_msgs(cli_id)
--  SET NULL (o vínculo vira null no delete, a linha fica → guardo os ids p/ religar):
--    entradas, mov_fin, wa_conversas, wa_envio_alvos
-- Assim restaurar devolve cadastro + senhas + pagamentos + régua/disparos + e
-- re-vincula financeiro/conversas/envios ao cliente. Aplicada 2026-09-14 (reviza_33).

alter table private.leads_lixeira add column if not exists cascata  jsonb not null default '{}'::jsonb;
alter table private.leads_lixeira add column if not exists vinculos jsonb not null default '{}'::jsonb;

create or replace function private.leads_trash() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into private.leads_lixeira(lead_id, nome, lead, segredos, pagamentos, cascata, vinculos, deletado_por)
  values (
    old.id, old.nome, to_jsonb(old),
    (select to_jsonb(s) from private.lead_segredos s where s.lead_id = old.id),
    (select coalesce(jsonb_agg(to_jsonb(p) order by p.comp), '[]'::jsonb) from public.pagamentos p where p.lead_id = old.id),
    jsonb_build_object(
      'wa_regua_disparos', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.wa_regua_disparos t where t.lead_id = old.id),
      'wa_regua_msgs',     (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.wa_regua_msgs t where t.cli_id  = old.id)
    ),
    jsonb_build_object(
      'entradas',       (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.entradas       where lead_id = old.id),
      'mov_fin',        (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.mov_fin        where lead_id = old.id),
      'wa_conversas',   (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.wa_conversas   where lead_id = old.id),
      'wa_envio_alvos', (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.wa_envio_alvos where lead_id = old.id)
    ),
    auth.uid()
  );
  return old;
end $$;

create or replace function public.lead_restaurar(p_trash_id uuid) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare x private.leads_lixeira%rowtype;
begin
  if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode='42501'; end if;
  select * into x from private.leads_lixeira where id = p_trash_id;
  if not found then raise exception 'item da lixeira inexistente'; end if;
  if x.restaurado_em is not null then raise exception 'este cliente ja foi restaurado'; end if;
  if exists (select 1 from public.leads where id = x.lead_id) then raise exception 'o cliente ja esta na base'; end if;

  -- cadastro + senhas + pagamentos
  insert into public.leads select * from jsonb_populate_record(null::public.leads, x.lead);
  if x.segredos is not null then
    insert into private.lead_segredos select * from jsonb_populate_record(null::private.lead_segredos, x.segredos);
  end if;
  insert into public.pagamentos select * from jsonb_populate_recordset(null::public.pagamentos, coalesce(x.pagamentos,'[]'::jsonb))
    on conflict (lead_id, comp) do nothing;

  -- filhos CASCADE (régua/disparos) — wa_regua_msgs antes (wa_regua_disparos referencia)
  insert into public.wa_regua_msgs select * from jsonb_populate_recordset(null::public.wa_regua_msgs, coalesce(x.cascata->'wa_regua_msgs','[]'::jsonb))
    on conflict (id) do nothing;
  insert into public.wa_regua_disparos select * from jsonb_populate_recordset(null::public.wa_regua_disparos, coalesce(x.cascata->'wa_regua_disparos','[]'::jsonb))
    on conflict (id) do nothing;

  -- filhos SET NULL — re-vincula ao cliente (só se ainda órfãos)
  update public.entradas       t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'entradas','[]'::jsonb)))::uuid)       and t.lead_id is null;
  update public.mov_fin        t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'mov_fin','[]'::jsonb)))::uuid)        and t.lead_id is null;
  update public.wa_conversas   t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'wa_conversas','[]'::jsonb)))::uuid)   and t.lead_id is null;
  update public.wa_envio_alvos t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'wa_envio_alvos','[]'::jsonb)))::uuid) and t.lead_id is null;

  update private.leads_lixeira set restaurado_em = now() where id = p_trash_id;
  return x.lead_id;
end $$;
revoke all on function public.lead_restaurar(uuid) from public, anon;
grant execute on function public.lead_restaurar(uuid) to authenticated;
