-- ============================================================================
-- Reviza · mig 63 — mudar a % do comercial REFAZ os valores já lançados
-- (dono 29/09: "coloco Augusto 30%, tudo que for do Augusto vai ser calculado
-- 30%; tem que ver se é pro próximo mês ou todos os meses que ele já fez — e
-- tem que atualizar lá os valores")
--
-- A célula/pagamento guarda o LÍQUIDO DO ESCRITÓRIO (mig 62). Se a divisão muda,
-- o que o CLIENTE pagou continua o mesmo — muda quanto fica pro escritório:
--   novo líquido = líquido × (100 − % nova) ÷ (100 − % que valia naquele mês)
--   ex.: cliente pagou 100 → 50/50 vira 70 (escritório) / 30 (Augusto) com 30%.
--
-- · private.comissao_pct_em(comercial, comp) — a % que valia no mês (histórico;
--   sem histórico: a % configurada; sem nada: 50).
-- · comissao_aplicar(comercial, pct, desde) — gestor/admin, numa transação:
--   refaz os pagamentos PAGOS dos clientes do comercial com comp >= desde (o
--   gatilho da planilha reescreve a célula), os informes PENDENTES idem, grava o
--   histórico (comissao_definir), sobe a versão da planilha e registra. Devolve o
--   que mudou ({n, pagamentos:[{l,c,a,d}], entradas:[{id,a,d}]}) pro Desfazer.
--   "Só daqui pra frente" = desde no mês que vem (normalmente nada a refazer);
--   "todos os meses" = desde '2000-01'.
-- · comissao_desfazer_aplicar(...) — volta cada valor que ainda estiver como a
--   aplicação deixou (quem mudou depois não é pisado) + histórico e % atual.
-- ============================================================================

create or replace function private.comissao_pct_em(p_nome text, p_comp text) returns numeric
  language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select h.pct from public.comissoes_hist h where h.comercial = p_nome and h.desde <= p_comp order by h.desde desc limit 1),
    (select c.pct from public.comissoes c where upper(btrim(c.comercial)) = p_nome),
    50::numeric)
$$;
revoke all on function private.comissao_pct_em(text, text) from public, anon, authenticated;

create or replace function public.comissao_aplicar(p_comercial text, p_pct numeric, p_desde text)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text := upper(btrim(coalesce(p_comercial, '')));
  v_pct numeric := round(p_pct, 2);
  v_pags jsonb; v_ents jsonb; v_n int; v_antes numeric; v_depois numeric;
begin
  if not public.is_at_least('gestor') then raise exception 'Definir comissão é com o gestor ou o administrador.' using errcode = '42501'; end if;
  if v_nome = '' then raise exception 'comercial sem nome' using errcode = '22023'; end if;
  if p_pct is null or p_pct < 0 or p_pct >= 100 then raise exception 'A porcentagem precisa ser de 0 a 99,99 (com 100%% não sobra nada pro escritório).' using errcode = '22023'; end if;
  if p_desde is null or p_desde !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Mês inválido (AAAA-MM).' using errcode = '22023'; end if;

  -- 1) pagamentos já lançados (líquido do escritório) — ANTES de mexer no histórico
  with alvo as (
    select p.id, p.lead_id, p.comp, p.valor,
           round(p.valor * (100 - v_pct) / (100 - private.comissao_pct_em(v_nome, p.comp)), 2) as novo
      from public.pagamentos p
      join public.leads l on l.id = p.lead_id
     where upper(btrim(coalesce(l.comercial, ''))) = v_nome
       and p.status = 'pago' and p.valor > 0 and p.comp >= p_desde
       and private.comissao_pct_em(v_nome, p.comp) < 100
  ), upd as (
    update public.pagamentos p set valor = a.novo
      from alvo a
     where p.id = a.id and a.novo is distinct from p.valor and a.novo > 0
    returning p.lead_id, p.comp, a.valor as antes, a.novo as depois
  )
  select coalesce(jsonb_agg(jsonb_build_object('l', lead_id, 'c', comp, 'a', antes, 'd', depois)), '[]'::jsonb),
         count(*), coalesce(sum(antes), 0), coalesce(sum(depois), 0)
    into v_pags, v_n, v_antes, v_depois
    from upd;

  -- 2) informes ainda PENDENTES (o comercial informou o líquido na divisão antiga)
  with alvo as (
    select e.id, e.valor,
           round(e.valor * (100 - v_pct) / (100 - private.comissao_pct_em(v_nome, e.comp)), 2) as novo
      from public.entradas e
      join public.leads l on l.id = e.lead_id
     where upper(btrim(coalesce(l.comercial, ''))) = v_nome
       and e.estado = 'pendente' and e.valor > 0 and e.comp >= p_desde
       and private.comissao_pct_em(v_nome, e.comp) < 100
  ), upd as (
    update public.entradas e set valor = a.novo
      from alvo a
     where e.id = a.id and a.novo is distinct from e.valor and a.novo > 0
    returning e.id, a.valor as antes, a.novo as depois
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'a', antes, 'd', depois)), '[]'::jsonb)
    into v_ents from upd;

  -- 3) histórico + % atual (auditoria da tabela comissoes registra a troca)
  perform public.comissao_definir(v_nome, v_pct, p_desde);

  -- 4) a planilha relê (as células já foram reescritas pelo gatilho dos pagamentos)
  if v_n > 0 or jsonb_array_length(v_ents) > 0 then
    perform private.pl_versao_bump();
    perform private.registrar('recalculou', 'comissão', v_nome, v_nome,
      v_n || ' pagamento(s) de ' || case when p_desde = '2000-01' then 'todos os meses' else public.comp_rotulo(p_desde) || ' em diante' end
      || ' refeitos para ' || v_pct || '% — líquido do escritório ' || private.brl(v_antes) || ' → ' || private.brl(v_depois)
      || case when jsonb_array_length(v_ents) > 0 then ' (+' || jsonb_array_length(v_ents) || ' informe(s) pendente(s))' else '' end);
  end if;

  return jsonb_build_object('n', v_n, 'pagamentos', v_pags, 'entradas', v_ents);
end $$;
revoke all on function public.comissao_aplicar(text, numeric, text) from public, anon;
grant execute on function public.comissao_aplicar(text, numeric, text) to authenticated;

create or replace function public.comissao_desfazer_aplicar(p_comercial text, p_hist jsonb, p_pct numeric, p_pagamentos jsonb, p_entradas jsonb)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_nome text := upper(btrim(coalesce(p_comercial, ''))); v_ok int := 0; v_tot int := 0; v_e int := 0;
begin
  if not public.is_at_least('gestor') then raise exception 'Definir comissão é com o gestor ou o administrador.' using errcode = '42501'; end if;
  if v_nome = '' then raise exception 'comercial sem nome' using errcode = '22023'; end if;
  if p_pagamentos is not null and jsonb_typeof(p_pagamentos) <> 'array' then raise exception 'lista inválida' using errcode = '22023'; end if;
  if p_entradas is not null and jsonb_typeof(p_entradas) <> 'array' then raise exception 'lista inválida' using errcode = '22023'; end if;
  v_tot := coalesce(jsonb_array_length(p_pagamentos), 0);
  -- só volta o que ainda está como a aplicação deixou (mudança posterior não é pisada)
  with x as (
    select (j->>'l')::uuid as l, j->>'c' as c, (j->>'a')::numeric as a, (j->>'d')::numeric as d
      from jsonb_array_elements(coalesce(p_pagamentos, '[]'::jsonb)) j
  ), upd as (
    update public.pagamentos p set valor = x.a
      from x where p.lead_id = x.l and p.comp = x.c and p.status = 'pago' and p.valor = x.d
    returning 1
  ) select count(*) into v_ok from upd;
  with x as (
    select (j->>'id')::uuid as id, (j->>'a')::numeric as a, (j->>'d')::numeric as d
      from jsonb_array_elements(coalesce(p_entradas, '[]'::jsonb)) j
  ), upd as (
    update public.entradas e set valor = x.a
      from x where e.id = x.id and e.estado = 'pendente' and e.valor = x.d
    returning 1
  ) select count(*) into v_e from upd;
  perform public.comissao_restaurar(v_nome, p_hist, p_pct);
  if v_ok > 0 or v_e > 0 then
    perform private.pl_versao_bump();
    perform private.registrar('desfez', 'comissão', v_nome, v_nome,
      'voltou ' || v_ok || ' de ' || v_tot || ' pagamento(s) ao valor anterior' || case when v_ok < v_tot then ' (os outros mudaram depois e ficaram como estão)' else '' end);
  end if;
  return jsonb_build_object('restaurados', v_ok, 'total', v_tot, 'entradas', v_e);
end $$;
revoke all on function public.comissao_desfazer_aplicar(text, jsonb, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.comissao_desfazer_aplicar(text, jsonb, numeric, jsonb, jsonb) to authenticated;
