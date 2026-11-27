-- =====================================================================
-- 47 — cobranca_importar_no_ciclo v2 (revisão adversarial da mig 46):
-- (a) rejeita planilha SEM clientes (22023) — o front também bloqueia, mas
--     sem isso cada clique em "Importar 0 leads" gravava uma linha-histórico
--     órfã em public.ciclos;
-- (b) "próxima ocorrência do dia" calculada em BRT (America/Sao_Paulo), não
--     no current_date UTC do servidor — entre 21h e meia-noite BRT o UTC já
--     virou o dia seguinte e a data do histórico saía deslocada (o nome do
--     lote já usava BRT; agora as duas coisas concordam).
-- Resto idêntico à mig 46.
-- =====================================================================

create or replace function public.cobranca_importar_no_ciclo(
  p_situacao public.situacao_debito, p_dia smallint, p_comps jsonb, p_linhas jsonb
) returns jsonb
  language plpgsql security definer
  set search_path = public, private, extensions, vault, pg_temp
  set statement_timeout = '120s'
  as $$
declare
  v_papel text := public.current_papel()::text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ciclo uuid; v_key text; v_ver smallint;
  v_data date; v_mes date;
  r jsonb; v_lead uuid; i int; v_comp text; v_raw text; v_txt text; v_n numeric;
  v_qtd int := 0; v_ign int := 0;
begin
  if v_papel is null or v_papel not in ('gestor','admin') then raise exception 'sem permissao' using errcode='42501'; end if;
  if p_dia is null or p_dia < 1 or p_dia > 31 then raise exception 'dia invalido' using errcode='22023'; end if;
  if jsonb_array_length(coalesce(p_linhas,'[]'::jsonb)) = 0 then raise exception 'planilha sem clientes' using errcode='22023'; end if;

  -- data_cobranca do histórico = próxima data BRT com esse dia do mês (dia 31 pula mês curto)
  v_data := null; i := 0;
  while v_data is null and i <= 12 loop
    v_mes := (date_trunc('month', v_hoje) + make_interval(months => i))::date;
    begin
      v_data := make_date(extract(year from v_mes)::int, extract(month from v_mes)::int, p_dia);
      if v_data < v_hoje then v_data := null; end if;
    exception when others then v_data := null; end;
    i := i + 1;
  end loop;
  if v_data is null then v_data := v_hoje; end if;

  insert into public.ciclos (nome, data_cobranca, criado_por)
  values ('Import no ciclo D' || lpad(p_dia::text, 2, '0') || ' — ' || to_char(v_hoje, 'DD/MM/YYYY'), v_data, auth.uid())
  returning id into v_ciclo;
  insert into public.competencias (comp) select distinct value from jsonb_array_elements_text(coalesce(p_comps,'[]'::jsonb)) on conflict (comp) do nothing;
  select versao_atual into v_ver from private.cripto_config where singleton; v_key := private.chave(v_ver);
  for r in select * from jsonb_array_elements(coalesce(p_linhas,'[]'::jsonb)) loop
    insert into public.leads (nome, comercial, dia, ciclo_id, banco, nb, cpf, reclame_login, valor, salario,
      ultimo_pgto, fechamento, recebe, telefone, situacao, data_reclamacao, data_parou, parou, created_by)
    values (coalesce(r->>'nome',''), nullif(r->>'comercial',''), p_dia, v_ciclo, nullif(r->>'banco',''), nullif(r->>'nb',''),
      nullif(r->>'cpf',''), nullif(r->>'reclame_login',''), coalesce(nullif(r->>'valor','')::numeric,0), nullif(r->>'salario','')::numeric,
      nullif(r->>'ultimo_pgto',''), nullif(r->>'fechamento',''), nullif(r->>'recebe',''), nullif(r->>'telefone',''),
      p_situacao, nullif(r->>'data_reclamacao',''), nullif(r->>'data_parou',''), nullif(r->>'parou',''), auth.uid()) returning id into v_lead;
    if coalesce(r->>'senha','')<>'' or coalesce(r->>'reclame_senha','')<>'' then
      insert into private.lead_segredos (lead_id, senha_inss_enc, senha_inss_kv, reclame_senha_enc, reclame_senha_kv, atualizado_em, atualizado_por)
      values (v_lead,
        case when coalesce(r->>'senha','')<>'' then extensions.pgp_sym_encrypt(r->>'senha', v_key, 'cipher-algo=aes256, compress-algo=0, s2k-mode=3, s2k-digest-algo=sha256') end,
        case when coalesce(r->>'senha','')<>'' then v_ver end,
        case when coalesce(r->>'reclame_senha','')<>'' then extensions.pgp_sym_encrypt(r->>'reclame_senha', v_key, 'cipher-algo=aes256, compress-algo=0, s2k-mode=3, s2k-digest-algo=sha256') end,
        case when coalesce(r->>'reclame_senha','')<>'' then v_ver end, now(), auth.uid());
      insert into private.segredo_acessos (lead_id,tipo,acao,ator,ator_papel) values (v_lead,'import','gravou',auth.uid(),v_papel);
    end if;
    i := 0;
    for v_raw in select value from jsonb_array_elements_text(coalesce(r->'celulas','[]'::jsonb)) loop
      i := i + 1; v_comp := p_comps->>(i-1); if v_comp is null then exit; end if;
      v_txt := trim(coalesce(v_raw,''));
      if v_txt = '' or v_txt = '-' then null;
      elsif upper(v_txt) like '%NAO PAGOU%' or upper(v_txt) like '%NÃO PAGOU%' then
        insert into public.pagamentos (lead_id, comp, status) values (v_lead, v_comp, 'nao_pagou') on conflict (lead_id, comp) do update set status='nao_pagou', valor=null;
      elsif v_txt ~ '^\d{1,6}([.,]\d{1,2})?$' then
        v_n := replace(v_txt, ',', '.')::numeric;
        insert into public.pagamentos (lead_id, comp, status, valor, pago_em, confirmado_por) values (v_lead, v_comp, 'pago', v_n, now(), auth.uid())
        on conflict (lead_id, comp) do update set status='pago', valor=excluded.valor;
      else v_ign := v_ign + 1; end if;
    end loop;
    v_qtd := v_qtd + 1;
  end loop;
  return jsonb_build_object('ciclo_id', v_ciclo, 'dia', p_dia, 'leads', v_qtd, 'celulas_ignoradas', v_ign);
end $$;
