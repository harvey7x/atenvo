-- 81 — Cancelados: Desfazer SEGURO (2ª revisão, 27/10, sobre a mig 80).
--  · o estado de ANTES fica guardado NO SERVIDOR (private.leads_cancel_desfazer); o navegador só
--    recebe um token — não dá pra inventar data, autor ou motivo mandando um "antes" forjado;
--  · o Desfazer só mexe em quem AINDA está como a ação deixou (mesmo carimbo de quando/quem; no
--    "voltar", ainda fora dos Cancelados) — o que outra pessoa mudou depois fica como está;
--  · só quem fez desfaz, uma vez, em até 1 hora.
-- As 3 RPCs passam a devolver {n, token}. leads_cancelamento_restaurar(jsonb) da mig 80 sai.

create table if not exists private.leads_cancel_desfazer (
  token uuid primary key default gen_random_uuid(),
  usuario uuid not null,
  tipo text not null check (tipo in ('cancelar', 'status', 'voltar')),
  marca timestamptz not null,            -- o now() que a ação gravou em cancelamento_em
  marca_nome text,                       -- o nome que a ação gravou em cancelamento_por_nome
  antes jsonb not null,
  criado_em timestamptz not null default now(),
  usado_em timestamptz
);
create index if not exists leads_cancel_desfazer_criado_idx on private.leads_cancel_desfazer (criado_em);
revoke all on table private.leads_cancel_desfazer from public, anon, authenticated;

drop function if exists public.leads_cancelamento_restaurar(jsonb);
drop function if exists public.leads_cancelar(uuid[], text);
drop function if exists public.leads_cancelamento_status(uuid[], text);
drop function if exists public.leads_cancelados_voltar(uuid[]);

-- guarda o "antes" e devolve {n, token} (token null quando nada mudou)
create or replace function private.cancel_guardar(p_tipo text, p_marca timestamptz, p_nome text, p_antes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_token uuid;
begin
  delete from private.leads_cancel_desfazer where criado_em < now() - interval '1 day';
  if jsonb_array_length(p_antes) = 0 then return jsonb_build_object('n', 0, 'token', null); end if;
  insert into private.leads_cancel_desfazer (usuario, tipo, marca, marca_nome, antes)
    values (auth.uid(), p_tipo, p_marca, p_nome, p_antes) returning token into v_token;
  return jsonb_build_object('n', jsonb_array_length(p_antes), 'token', v_token);
end $$;
revoke all on function private.cancel_guardar(text, timestamptz, text, jsonb) from public, anon, authenticated;

create function public.leads_cancelar(p_ids uuid[], p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_nome text; v_antes jsonb; v_agora timestamptz := now();
begin
  if not public.pode_aprovar_parado() then
    raise exception 'Mover para Cancelados é com o financeiro, o cadastro, o gestor ou o administrador.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('n', 0, 'token', null); end if;
  if cardinality(p_ids) > 5000 then raise exception 'Selecione no máximo 5000 clientes por vez.' using errcode = '22023'; end if;
  v_nome := coalesce(nullif(btrim(public.meu_nome()), ''), 'alguém');
  select coalesce(jsonb_agg(s.j), '[]'::jsonb) into v_antes
    from (select jsonb_build_object('id', l.id, 'cancelamento', l.cancelamento, 'cancelado_em', l.cancelado_em,
             'cancelado_por_nome', l.cancelado_por_nome, 'cancelamento_motivo', l.cancelamento_motivo,
             'cancelamento_em', l.cancelamento_em, 'cancelamento_por_nome', l.cancelamento_por_nome) as j
            from public.leads l where l.id = any (p_ids) and l.cancelamento is null for update) s;
  perform set_config('reviza.cancelamento', 'on', true);
  update public.leads
     set cancelamento = 'cancelado', cancelado_em = v_agora, cancelado_por_nome = v_nome,
         cancelamento_motivo = nullif(btrim(left(coalesce(p_motivo, ''), 500)), ''),
         cancelamento_em = v_agora, cancelamento_por_nome = v_nome
   where id in (select (x->>'id')::uuid from jsonb_array_elements(v_antes) x);
  perform set_config('reviza.cancelamento', '', true);
  return private.cancel_guardar('cancelar', v_agora, v_nome, v_antes);
end $$;

create function public.leads_cancelamento_status(p_ids uuid[], p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_nome text; v_todos boolean; v_antes jsonb; v_agora timestamptz := now();
begin
  if p_status is null or p_status not in ('cancelado', 'em_reativacao', 'reativado') then
    raise exception 'Status inválido.' using errcode = '22023';
  end if;
  v_todos := public.pode_aprovar_parado();
  if not v_todos and public.current_papel() is distinct from 'comercial'::public.papel_usuario then
    raise exception 'Sem permissão para mudar o status dos cancelados.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('n', 0, 'token', null); end if;
  if cardinality(p_ids) > 5000 then raise exception 'Selecione no máximo 5000 clientes por vez.' using errcode = '22023'; end if;
  v_nome := coalesce(nullif(btrim(public.meu_nome()), ''), 'alguém');
  select coalesce(jsonb_agg(s.j), '[]'::jsonb) into v_antes
    from (select jsonb_build_object('id', l.id, 'cancelamento', l.cancelamento, 'cancelado_em', l.cancelado_em,
             'cancelado_por_nome', l.cancelado_por_nome, 'cancelamento_motivo', l.cancelamento_motivo,
             'cancelamento_em', l.cancelamento_em, 'cancelamento_por_nome', l.cancelamento_por_nome) as j
            from public.leads l
           where l.id = any (p_ids) and l.cancelamento is not null and l.cancelamento <> p_status
             and (v_todos or public.comercial_dono(l.comercial))
           for update) s;
  perform set_config('reviza.cancelamento', 'on', true);
  update public.leads
     set cancelamento = p_status, cancelamento_em = v_agora, cancelamento_por_nome = v_nome
   where id in (select (x->>'id')::uuid from jsonb_array_elements(v_antes) x);
  perform set_config('reviza.cancelamento', '', true);
  return private.cancel_guardar('status', v_agora, v_nome, v_antes);
end $$;

create function public.leads_cancelados_voltar(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_antes jsonb;
begin
  if not public.pode_aprovar_parado() then
    raise exception 'Voltar da lista de Cancelados é com o financeiro, o cadastro, o gestor ou o administrador.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('n', 0, 'token', null); end if;
  if cardinality(p_ids) > 5000 then raise exception 'Selecione no máximo 5000 clientes por vez.' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(s.j), '[]'::jsonb) into v_antes
    from (select jsonb_build_object('id', l.id, 'cancelamento', l.cancelamento, 'cancelado_em', l.cancelado_em,
             'cancelado_por_nome', l.cancelado_por_nome, 'cancelamento_motivo', l.cancelamento_motivo,
             'cancelamento_em', l.cancelamento_em, 'cancelamento_por_nome', l.cancelamento_por_nome) as j
            from public.leads l where l.id = any (p_ids) and l.cancelamento is not null for update) s;
  perform set_config('reviza.cancelamento', 'on', true);
  update public.leads
     set cancelamento = null, cancelado_em = null, cancelado_por_nome = null, cancelamento_motivo = null,
         cancelamento_em = null, cancelamento_por_nome = null
   where id in (select (x->>'id')::uuid from jsonb_array_elements(v_antes) x);
  perform set_config('reviza.cancelamento', '', true);
  return private.cancel_guardar('voltar', now(), null, v_antes);
end $$;

-- Desfazer pelo token: só quem fez, uma vez, em até 1 hora, e só em quem ainda está como a ação deixou
create function public.leads_cancelamento_desfazer(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare d private.leads_cancel_desfazer%rowtype; v_n integer;
begin
  select * into d from private.leads_cancel_desfazer
   where token = p_token and usuario = auth.uid() and usado_em is null and criado_em > now() - interval '1 hour'
   for update;
  if not found then raise exception 'Esse Desfazer não vale mais (expirou ou já foi usado).' using errcode = '55000'; end if;
  perform set_config('reviza.cancelamento', 'on', true);
  update public.leads l
     set cancelamento = x.cancelamento, cancelado_em = x.cancelado_em, cancelado_por_nome = x.cancelado_por_nome,
         cancelamento_motivo = x.cancelamento_motivo, cancelamento_em = x.cancelamento_em,
         cancelamento_por_nome = x.cancelamento_por_nome
    from jsonb_to_recordset(d.antes) as x(id uuid, cancelamento text, cancelado_em timestamptz, cancelado_por_nome text,
                                          cancelamento_motivo text, cancelamento_em timestamptz, cancelamento_por_nome text)
   where l.id = x.id
     and case when d.tipo = 'voltar' then l.cancelamento is null
              else l.cancelamento_em = d.marca and l.cancelamento_por_nome is not distinct from d.marca_nome end;
  get diagnostics v_n = row_count;
  perform set_config('reviza.cancelamento', '', true);
  update private.leads_cancel_desfazer set usado_em = now() where token = d.token;
  return jsonb_build_object('n', v_n, 'total', jsonb_array_length(d.antes));
end $$;

revoke all on function public.leads_cancelar(uuid[], text) from public, anon;
revoke all on function public.leads_cancelamento_status(uuid[], text) from public, anon;
revoke all on function public.leads_cancelados_voltar(uuid[]) from public, anon;
revoke all on function public.leads_cancelamento_desfazer(uuid) from public, anon;
grant execute on function public.leads_cancelar(uuid[], text) to authenticated, service_role;
grant execute on function public.leads_cancelamento_status(uuid[], text) to authenticated, service_role;
grant execute on function public.leads_cancelados_voltar(uuid[]) to authenticated, service_role;
grant execute on function public.leads_cancelamento_desfazer(uuid) to authenticated, service_role;
