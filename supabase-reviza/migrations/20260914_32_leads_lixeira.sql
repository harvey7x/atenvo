-- Reviza — BLINDAGEM contra perda de cliente (pedido do dono 14/09: "nunca perca
-- clientes"). Diagnóstico: nenhum lead foi perdido (base íntegra, import é
-- insert-only, só o botão Excluir apaga e é gestor/admin). Mas a exclusão era
-- IRREVERSÍVEL. Agora todo DELETE em leads copia o cliente inteiro — linha +
-- senhas cifradas + histórico de pagamentos — para uma LIXEIRA em `private`
-- (nunca exposta na API), com quem/quando. Recuperável a qualquer momento por
-- gestor/admin. Zero mudança no fluxo da tela.
-- Aplicada 2026-09-14 via MCP como "reviza_32_leads_lixeira".

create table if not exists private.leads_lixeira (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null,
  nome          text,
  lead          jsonb not null,          -- a linha inteira do lead
  segredos      jsonb,                   -- private.lead_segredos (senhas cifradas)
  pagamentos    jsonb not null default '[]'::jsonb,  -- histórico de pagamentos
  deletado_em   timestamptz not null default now(),
  deletado_por  uuid,
  restaurado_em timestamptz
);

-- captura ANTES do delete (o cascade dos filhos ainda não rodou → dá pra copiar)
create or replace function private.leads_trash() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  insert into private.leads_lixeira(lead_id, nome, lead, segredos, pagamentos, deletado_por)
  values (
    old.id, old.nome, to_jsonb(old),
    (select to_jsonb(s) from private.lead_segredos s where s.lead_id = old.id),
    (select coalesce(jsonb_agg(to_jsonb(p) order by p.comp), '[]'::jsonb) from public.pagamentos p where p.lead_id = old.id),
    auth.uid()
  );
  return old;
end $$;

drop trigger if exists leads_lixeira_bd on public.leads;
create trigger leads_lixeira_bd before delete on public.leads
  for each row execute function private.leads_trash();

-- lista o que está na lixeira ainda não restaurado (gestor/admin)
create or replace function public.lixeira_listar()
  returns table(id uuid, lead_id uuid, nome text, comercial text, valor numeric,
                pagamentos_qtd int, deletado_em timestamptz, deletado_por text)
  language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode='42501'; end if;
  return query
    select x.id, x.lead_id, x.nome, x.lead->>'comercial',
           nullif(x.lead->>'valor','')::numeric,
           jsonb_array_length(x.pagamentos),
           x.deletado_em,
           coalesce((select p.nome from public.profiles p where p.id = x.deletado_por), '—')
    from private.leads_lixeira x
    where x.restaurado_em is null
    order by x.deletado_em desc;
end $$;

-- restaura o cliente inteiro (lead + senhas + pagamentos) — gestor/admin
create or replace function public.lead_restaurar(p_trash_id uuid) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare x private.leads_lixeira%rowtype;
begin
  if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode='42501'; end if;
  select * into x from private.leads_lixeira where id = p_trash_id;
  if not found then raise exception 'item da lixeira inexistente'; end if;
  if x.restaurado_em is not null then raise exception 'este cliente ja foi restaurado'; end if;
  if exists (select 1 from public.leads where id = x.lead_id) then raise exception 'o cliente ja esta na base'; end if;

  insert into public.leads select * from jsonb_populate_record(null::public.leads, x.lead);
  if x.segredos is not null then
    insert into private.lead_segredos select * from jsonb_populate_record(null::private.lead_segredos, x.segredos);
  end if;
  if jsonb_array_length(x.pagamentos) > 0 then
    insert into public.pagamentos select * from jsonb_populate_recordset(null::public.pagamentos, x.pagamentos)
      on conflict (lead_id, comp) do nothing;
  end if;
  update private.leads_lixeira set restaurado_em = now() where id = p_trash_id;
  return x.lead_id;
end $$;

revoke all on function public.lixeira_listar(), public.lead_restaurar(uuid) from public, anon;
grant execute on function public.lixeira_listar(), public.lead_restaurar(uuid) to authenticated;
