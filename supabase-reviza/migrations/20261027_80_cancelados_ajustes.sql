-- 80 — Cancelados: ajustes da revisão adversarial de 27/10 (mig 79).
--  1. "Remover todos os Novos" (remover_novos) NÃO leva quem está nos Cancelados (um Novo pode ser
--     movido pra lá; a tela nem mostra ele nos Novos, e a lixeira levaria o histórico junto).
--  2. As 3 RPCs devolvem o que mudou ({n, antes:[estado anterior de cada um]}) — o Desfazer usa o
--     que o SERVIDOR mudou (não o cache de até 30 s) e volta o estado EXATO (motivo, data, autor,
--     status) por `leads_cancelamento_restaurar`.
--  3. Restaurar da Lixeira (lead_restaurar) devolve o cliente com o cancelamento que ele tinha.
-- O tipo de retorno muda (integer → jsonb): drop + create (o front que chama ainda não foi publicado).

-- 1 ---------------------------------------------------------------------------------------------
create or replace function public.remover_novos()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_ids uuid[];
begin
  if not public.is_at_least('gestor') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  with alvo as (
    select id from public.leads where situacao = 'ativo' and not parado_pendente and cancelamento is null for update
  ), del as (
    delete from public.leads l using alvo a where l.id = a.id returning l.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_ids from del;
  return jsonb_build_object('removidos', to_jsonb(v_ids), 'n', coalesce(array_length(v_ids, 1), 0));
end $$;

-- 2 ---------------------------------------------------------------------------------------------
drop function if exists public.leads_cancelar(uuid[], text);
drop function if exists public.leads_cancelamento_status(uuid[], text);
drop function if exists public.leads_cancelados_voltar(uuid[]);

create function public.leads_cancelar(p_ids uuid[], p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_nome text; v_antes jsonb;
begin
  if not public.pode_aprovar_parado() then
    raise exception 'Mover para Cancelados é com o financeiro, o cadastro, o gestor ou o administrador.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('n', 0, 'antes', '[]'::jsonb); end if;
  if cardinality(p_ids) > 5000 then raise exception 'Selecione no máximo 5000 clientes por vez.' using errcode = '22023'; end if;
  v_nome := coalesce(nullif(btrim(public.meu_nome()), ''), 'alguém');
  -- o estado de ANTES de cada um que vai mudar (trava as linhas)
  select coalesce(jsonb_agg(s.j), '[]'::jsonb) into v_antes
    from (select jsonb_build_object('id', l.id, 'cancelamento', l.cancelamento, 'cancelado_em', l.cancelado_em,
             'cancelado_por_nome', l.cancelado_por_nome, 'cancelamento_motivo', l.cancelamento_motivo,
             'cancelamento_em', l.cancelamento_em, 'cancelamento_por_nome', l.cancelamento_por_nome) as j
            from public.leads l where l.id = any (p_ids) and l.cancelamento is null for update) s;
  perform set_config('reviza.cancelamento', 'on', true);
  update public.leads
     set cancelamento = 'cancelado', cancelado_em = now(), cancelado_por_nome = v_nome,
         cancelamento_motivo = nullif(btrim(left(coalesce(p_motivo, ''), 500)), ''),
         cancelamento_em = now(), cancelamento_por_nome = v_nome
   where id in (select (x->>'id')::uuid from jsonb_array_elements(v_antes) x);
  perform set_config('reviza.cancelamento', '', true);
  return jsonb_build_object('n', jsonb_array_length(v_antes), 'antes', v_antes);
end $$;

create function public.leads_cancelamento_status(p_ids uuid[], p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_nome text; v_todos boolean; v_antes jsonb;
begin
  if p_status is null or p_status not in ('cancelado', 'em_reativacao', 'reativado') then
    raise exception 'Status inválido.' using errcode = '22023';
  end if;
  v_todos := public.pode_aprovar_parado();
  if not v_todos and public.current_papel() is distinct from 'comercial'::public.papel_usuario then
    raise exception 'Sem permissão para mudar o status dos cancelados.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('n', 0, 'antes', '[]'::jsonb); end if;
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
     set cancelamento = p_status, cancelamento_em = now(), cancelamento_por_nome = v_nome
   where id in (select (x->>'id')::uuid from jsonb_array_elements(v_antes) x);
  perform set_config('reviza.cancelamento', '', true);
  return jsonb_build_object('n', jsonb_array_length(v_antes), 'antes', v_antes);
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
  if p_ids is null or cardinality(p_ids) = 0 then return jsonb_build_object('n', 0, 'antes', '[]'::jsonb); end if;
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
  return jsonb_build_object('n', jsonb_array_length(v_antes), 'antes', v_antes);
end $$;

-- Desfazer: regrava o estado anterior EXATO (o `antes` devolvido acima). Quem move/volta regrava
-- tudo; o comercial só desfaz STATUS dos clientes dele (o cliente segue nos Cancelados nos dois lados)
create or replace function public.leads_cancelamento_restaurar(p_antes jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer; v_todos boolean;
begin
  if p_antes is null or jsonb_typeof(p_antes) <> 'array' then raise exception 'Nada para restaurar.' using errcode = '22023'; end if;
  if jsonb_array_length(p_antes) > 5000 then raise exception 'Máximo de 5000 clientes por vez.' using errcode = '22023'; end if;
  v_todos := public.pode_aprovar_parado();
  if not v_todos and public.current_papel() is distinct from 'comercial'::public.papel_usuario then
    raise exception 'Sem permissão para desfazer nos cancelados.' using errcode = '42501';
  end if;
  perform set_config('reviza.cancelamento', 'on', true);
  if v_todos then
    update public.leads l
       set cancelamento = x.cancelamento, cancelado_em = x.cancelado_em, cancelado_por_nome = x.cancelado_por_nome,
           cancelamento_motivo = x.cancelamento_motivo, cancelamento_em = x.cancelamento_em,
           cancelamento_por_nome = x.cancelamento_por_nome
      from jsonb_to_recordset(p_antes) as x(id uuid, cancelamento text, cancelado_em timestamptz, cancelado_por_nome text,
                                            cancelamento_motivo text, cancelamento_em timestamptz, cancelamento_por_nome text)
     where l.id = x.id
       and (x.cancelamento is null or x.cancelamento in ('cancelado', 'em_reativacao', 'reativado'));
  else
    update public.leads l
       set cancelamento = x.cancelamento, cancelamento_em = x.cancelamento_em, cancelamento_por_nome = x.cancelamento_por_nome
      from jsonb_to_recordset(p_antes) as x(id uuid, cancelamento text, cancelamento_em timestamptz, cancelamento_por_nome text)
     where l.id = x.id and l.cancelamento is not null
       and x.cancelamento in ('cancelado', 'em_reativacao', 'reativado')
       and public.comercial_dono(l.comercial);
  end if;
  get diagnostics v_n = row_count;
  perform set_config('reviza.cancelamento', '', true);
  return v_n;
end $$;

revoke all on function public.leads_cancelar(uuid[], text) from public, anon;
revoke all on function public.leads_cancelamento_status(uuid[], text) from public, anon;
revoke all on function public.leads_cancelados_voltar(uuid[]) from public, anon;
revoke all on function public.leads_cancelamento_restaurar(jsonb) from public, anon;
grant execute on function public.leads_cancelar(uuid[], text) to authenticated, service_role;
grant execute on function public.leads_cancelamento_status(uuid[], text) to authenticated, service_role;
grant execute on function public.leads_cancelados_voltar(uuid[]) to authenticated, service_role;
grant execute on function public.leads_cancelamento_restaurar(jsonb) to authenticated, service_role;

-- 3 ---------------------------------------------------------------------------------------------
-- restaurar da Lixeira volta com o cancelamento do snapshot (o guarda da mig 79 zeraria no INSERT)
create or replace function public.lead_restaurar(p_trash_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v uuid;
begin
  if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode = '42501'; end if;
  -- mig 71: com a sync ligada, restaurar = tirar da aba cancelados NA planilha
  if public.sync_estrutura_bloqueada() then
    raise exception 'Com a sincronização ligada, restaurar é feito na planilha: tire a linha da aba cancelados (ou recoloque o cliente na aba CLIENTES MENSAL).'
      using errcode = '55000';
  end if;
  perform set_config('reviza.cancelamento', 'on', true);
  v := private.lead_restaurar_impl(p_trash_id);
  perform set_config('reviza.cancelamento', '', true);
  return v;
end $$;
