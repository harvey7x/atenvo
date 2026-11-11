-- ============================================================================
-- Reviza · mig 64 — comissao_aplicar/desfazer SEGUROS (revisão adversarial 29/09 da mig 63)
--
-- (1) Concorrência: a aplicação TRAVA entradas → pagamentos (a ordem do confirmar_entrada)
--     em SHARE ROW EXCLUSIVE: quem confirma/lança pagamento no meio espera e depois lê o
--     valor já refeito; os UPDATEs rechecam estado/valor (nada muda em linha que mudou).
-- (2) Desfazer usa o estado ANTERIOR lido no banco (não o cache do navegador) e é
--     tudo-ou-nada: recusa com mensagem clara se a % do comercial mudou depois, ou se algum
--     pagamento/informe dele (do mês escolhido em diante) foi lançado/alterado depois.
-- (3) Lixeira: pagamentos guardados de clientes do comercial também são refeitos (e voltam).
-- (4) % validada DEPOIS do arredondamento (99,995 → 100 é recusado); registro com vírgula.
-- (5) Caminhos paralelos fechados: comissao_definir/comissao_restaurar só por dentro das
--     RPCs; escrita direta em comissoes (policies ins/upd/del) removida — a % só muda pela
--     aplicação, que refaz os valores. (Front antigo ao salvar % passa a dar erro de permissão.)
-- (6) A versão da planilha sobe sempre (as outras telas releem a % e os valores).
-- ============================================================================

-- lista estável do histórico (compara "como estava" × "como está")
create or replace function private.comissao_hist_json(p_nome text) returns jsonb
  language sql stable security definer set search_path = ''
as $$ select coalesce(jsonb_agg(jsonb_build_object('desde', h.desde, 'pct', h.pct) order by h.desde), '[]'::jsonb)
        from public.comissoes_hist h where h.comercial = p_nome $$;
revoke all on function private.comissao_hist_json(text) from public, anon, authenticated;

create or replace function private.pct_txt(p numeric) returns text
  language sql immutable set search_path = ''
as $$ select replace(trim_scale(p)::text, '.', ',') || '%' $$;

drop function if exists public.comissao_desfazer_aplicar(text, jsonb, numeric, jsonb, jsonb);

create or replace function public.comissao_aplicar(p_comercial text, p_pct numeric, p_desde text)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text := upper(btrim(coalesce(p_comercial, '')));
  v_pct numeric := round(p_pct, 2);
  v_t timestamptz := now();
  v_hist_antes jsonb; v_pct_antes numeric; v_hist_depois jsonb;
  v_pags jsonb; v_ents jsonb; v_lix jsonb; v_n int; v_nlix int; v_antes numeric; v_depois numeric;
begin
  if not public.is_at_least('gestor') then raise exception 'Definir comissão é com o gestor ou o administrador.' using errcode = '42501'; end if;
  if v_nome = '' then raise exception 'comercial sem nome' using errcode = '22023'; end if;
  if v_pct is null or v_pct < 0 or v_pct >= 100 then raise exception 'A porcentagem precisa ser de 0 a 99,99 (com 100%% não sobra nada pro escritório).' using errcode = '22023'; end if;
  if p_desde is null or p_desde !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Mês inválido (AAAA-MM).' using errcode = '22023'; end if;

  -- (1) quem grava informe/pagamento agora espera esta operação terminar
  lock table public.entradas in share row exclusive mode;
  lock table public.pagamentos in share row exclusive mode;

  -- (2) estado anterior, do banco
  v_hist_antes := private.comissao_hist_json(v_nome);
  select pct into v_pct_antes from public.comissoes where upper(btrim(comercial)) = v_nome;

  -- pagamentos pagos (líquido do escritório) dos clientes que HOJE são do comercial
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
     where p.id = a.id and p.status = 'pago' and p.valor = a.valor and a.novo is distinct from a.valor and a.novo > 0
    returning p.lead_id, p.comp, a.valor as antes, a.novo as depois
  )
  select coalesce(jsonb_agg(jsonb_build_object('l', lead_id, 'c', comp, 'a', antes, 'd', depois)), '[]'::jsonb),
         count(*), coalesce(sum(antes), 0), coalesce(sum(depois), 0)
    into v_pags, v_n, v_antes, v_depois
    from upd;

  -- informes ainda pendentes
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
     where e.id = a.id and e.estado = 'pendente' and e.valor = a.valor and a.novo is distinct from a.valor and a.novo > 0
    returning e.id, a.valor as antes, a.novo as depois
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'a', antes, 'd', depois)), '[]'::jsonb)
    into v_ents from upd;

  -- (3) Lixeira: pagamentos guardados dos clientes do comercial (voltam refeitos se restaurados)
  with alvo as (
    select x.id, x.pagamentos as antes,
           (select jsonb_agg(case
                    when e->>'status' = 'pago' and coalesce((e->>'valor')::numeric, 0) > 0 and e->>'comp' >= p_desde
                         and private.comissao_pct_em(v_nome, e->>'comp') < 100
                    then jsonb_set(e, '{valor}', to_jsonb(round((e->>'valor')::numeric * (100 - v_pct) / (100 - private.comissao_pct_em(v_nome, e->>'comp')), 2)))
                    else e end order by o)
              from jsonb_array_elements(x.pagamentos) with ordinality t(e, o)) as depois
      from private.leads_lixeira x
     where x.restaurado_em is null and jsonb_typeof(x.pagamentos) = 'array'
       and upper(btrim(coalesce(x.lead->>'comercial', ''))) = v_nome
  ), upd as (
    update private.leads_lixeira x set pagamentos = a.depois
      from alvo a
     where x.id = a.id and a.depois is not null and a.depois is distinct from a.antes
    returning x.id, a.antes, a.depois
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'a', antes, 'd', depois)), '[]'::jsonb), count(*)
    into v_lix, v_nlix from upd;

  -- histórico + % (só por aqui)
  perform public.comissao_definir(v_nome, v_pct, p_desde);
  v_hist_depois := private.comissao_hist_json(v_nome);

  -- (6) as outras telas releem valores e %
  perform private.pl_versao_bump();
  perform private.registrar('recalculou', 'comissão', v_nome, v_nome,
    private.pct_txt(v_pct) || ' ' || case when p_desde = '2000-01' then 'em todos os meses' else 'a partir de ' || public.comp_rotulo(p_desde) end
    || ' — ' || v_n || ' pagamento(s) refeito(s): líquido do escritório ' || private.brl(v_antes) || ' → ' || private.brl(v_depois)
    || case when jsonb_array_length(v_ents) > 0 then ' (+' || jsonb_array_length(v_ents) || ' informe(s) pendente(s))' else '' end
    || case when v_nlix > 0 then ' (+' || v_nlix || ' cliente(s) na Lixeira)' else '' end);

  return jsonb_build_object('n', v_n, 'pagamentos', v_pags, 'entradas', v_ents, 'lixeira', v_lix, 'n_lixeira', v_nlix,
    'desde', p_desde, 'em', v_t, 'pct', v_pct, 'hist_antes', v_hist_antes, 'pct_antes', v_pct_antes, 'hist_depois', v_hist_depois);
end $$;
revoke all on function public.comissao_aplicar(text, numeric, text) from public, anon;
grant execute on function public.comissao_aplicar(text, numeric, text) to authenticated;

-- Desfazer: recebe o objeto que o comissao_aplicar devolveu. Tudo-ou-nada.
create or replace function public.comissao_desfazer_aplicar(p_comercial text, p_aplicacao jsonb)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text := upper(btrim(coalesce(p_comercial, '')));
  a jsonb := p_aplicacao; v_desde text; v_t timestamptz; v_mudou int; v_n int := 0; v_e int := 0; v_l int := 0;
begin
  if not public.is_at_least('gestor') then raise exception 'Definir comissão é com o gestor ou o administrador.' using errcode = '42501'; end if;
  if v_nome = '' then raise exception 'comercial sem nome' using errcode = '22023'; end if;
  if jsonb_typeof(a) <> 'object' or jsonb_typeof(a->'pagamentos') <> 'array' or jsonb_typeof(a->'hist_depois') <> 'array' then
    raise exception 'Dados do Desfazer inválidos.' using errcode = '22023'; end if;
  v_desde := a->>'desde'; v_t := (a->>'em')::timestamptz;
  if v_desde is null or v_desde !~ '^\d{4}-(0[1-9]|1[0-2])$' or v_t is null then raise exception 'Dados do Desfazer inválidos.' using errcode = '22023'; end if;

  lock table public.entradas in share row exclusive mode;
  lock table public.pagamentos in share row exclusive mode;

  -- a % tem que estar como a aplicação deixou
  if private.comissao_hist_json(v_nome) is distinct from a->'hist_depois' then
    raise exception 'A comissão de % mudou depois dessa alteração — o Desfazer não é mais seguro. Ajuste a %% de novo pela tela Atendentes.', v_nome using errcode = '55000';
  end if;
  -- nada do comercial (desse mês em diante) pode ter sido lançado/alterado depois
  select count(*) into v_mudou
    from public.pagamentos p join public.leads l on l.id = p.lead_id
   where upper(btrim(coalesce(l.comercial, ''))) = v_nome and p.comp >= v_desde and p.updated_at > v_t;
  select v_mudou + count(*) into v_mudou
    from jsonb_array_elements(a->'pagamentos') j
    left join public.pagamentos p on p.lead_id = (j->>'l')::uuid and p.comp = j->>'c'
   where p.id is null or p.status <> 'pago' or p.valor is distinct from (j->>'d')::numeric;
  select v_mudou + count(*) into v_mudou
    from public.entradas e join public.leads l on l.id = e.lead_id
   where upper(btrim(coalesce(l.comercial, ''))) = v_nome and e.comp >= v_desde
     and (e.created_at > v_t or coalesce(e.resolvido_em, '-infinity') > v_t);
  select v_mudou + count(*) into v_mudou
    from jsonb_array_elements(coalesce(a->'entradas', '[]'::jsonb)) j
    left join public.entradas e on e.id = (j->>'id')::uuid
   where e.id is null or e.estado <> 'pendente' or e.valor is distinct from (j->>'d')::numeric;
  if v_mudou > 0 then
    raise exception '% lançamento(s) de % mudaram depois dessa alteração (pagamento confirmado, digitado ou informado) — o Desfazer foi cancelado para não misturar divisões. Ajuste a %% de novo pela tela Atendentes.', v_mudou, v_nome using errcode = '55000';
  end if;

  with x as (
    select (j->>'l')::uuid as l, j->>'c' as c, (j->>'a')::numeric as va
      from jsonb_array_elements(a->'pagamentos') j
  ), upd as (
    update public.pagamentos p set valor = x.va from x where p.lead_id = x.l and p.comp = x.c returning 1
  ) select count(*) into v_n from upd;
  with x as (
    select (j->>'id')::uuid as id, (j->>'a')::numeric as va from jsonb_array_elements(coalesce(a->'entradas', '[]'::jsonb)) j
  ), upd as (
    update public.entradas e set valor = x.va from x where e.id = x.id returning 1
  ) select count(*) into v_e from upd;
  with x as (
    select (j->>'id')::uuid as id, j->'a' as va, j->'d' as vd from jsonb_array_elements(coalesce(a->'lixeira', '[]'::jsonb)) j
  ), upd as (
    update private.leads_lixeira z set pagamentos = x.va from x
     where z.id = x.id and z.restaurado_em is null and z.pagamentos = x.vd returning 1
  ) select count(*) into v_l from upd;

  perform public.comissao_restaurar(v_nome, a->'hist_antes', nullif(a->>'pct_antes', '')::numeric);
  perform private.pl_versao_bump();
  perform private.registrar('desfez', 'comissão', v_nome, v_nome,
    'voltou à divisão anterior: ' || v_n || ' pagamento(s)' || case when v_e > 0 then ', ' || v_e || ' informe(s)' else '' end
    || case when v_l > 0 then ', ' || v_l || ' cliente(s) na Lixeira' else '' end);
  return jsonb_build_object('restaurados', v_n, 'entradas', v_e, 'lixeira', v_l);
end $$;
revoke all on function public.comissao_desfazer_aplicar(text, jsonb) from public, anon;
grant execute on function public.comissao_desfazer_aplicar(text, jsonb) to authenticated;

-- (5) só pelas RPCs
revoke execute on function public.comissao_definir(text, numeric, text) from authenticated;
revoke execute on function public.comissao_restaurar(text, jsonb, numeric) from authenticated;
drop policy if exists comissoes_ins on public.comissoes;
drop policy if exists comissoes_upd on public.comissoes;
drop policy if exists comissoes_del on public.comissoes;
