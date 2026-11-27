-- Reviza — endurecimentos da revisão do go-live (aplicada via MCP "reviza_09_import_hardening").
-- Fonte de verdade da função cobranca_importar (substitui a versão da 08).

-- usuário novo já nasce exigindo troca de senha
alter table public.profiles alter column deve_trocar_senha set default true;

-- import: +tempo (KDF da cifra é lento) + parsing de célula robusto + conta ignoradas
create or replace function public.cobranca_importar(
  p_situacao public.situacao_debito, p_ciclo_nome text, p_data_cobranca date, p_comps jsonb, p_linhas jsonb
) returns jsonb
  language plpgsql security definer
  set search_path = public, private, extensions, vault, pg_temp
  set statement_timeout = '120s'
  as $$
declare
  v_papel text := public.current_papel()::text;
  v_ciclo uuid; v_dia smallint; v_key text; v_ver smallint;
  r jsonb; v_lead uuid; i int; v_comp text; v_raw text; v_txt text; v_n numeric;
  v_qtd int := 0; v_ign int := 0;
begin
  if v_papel is null or v_papel not in ('gestor','admin') then raise exception 'sem permissao' using errcode='42501'; end if;
  if coalesce(trim(p_ciclo_nome),'') = '' or p_data_cobranca is null then
    raise exception 'nome do ciclo e data da cobranca sao obrigatorios' using errcode='22023'; end if;
  v_dia := extract(day from p_data_cobranca)::smallint;
  insert into public.ciclos (nome, data_cobranca, criado_por) values (trim(p_ciclo_nome), p_data_cobranca, auth.uid()) returning id into v_ciclo;
  insert into public.competencias (comp) select distinct value from jsonb_array_elements_text(coalesce(p_comps,'[]'::jsonb)) on conflict (comp) do nothing;
  select versao_atual into v_ver from private.cripto_config where singleton; v_key := private.chave(v_ver);
  for r in select * from jsonb_array_elements(coalesce(p_linhas,'[]'::jsonb)) loop
    insert into public.leads (nome, comercial, dia, ciclo_id, banco, nb, cpf, reclame_login, valor, salario,
      ultimo_pgto, fechamento, recebe, telefone, situacao, data_reclamacao, data_parou, parou, created_by)
    values (coalesce(r->>'nome',''), nullif(r->>'comercial',''), v_dia, v_ciclo, nullif(r->>'banco',''), nullif(r->>'nb',''),
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
  return jsonb_build_object('ciclo_id', v_ciclo, 'dia', v_dia, 'leads', v_qtd, 'celulas_ignoradas', v_ign);
end $$;
revoke all on function public.cobranca_importar(public.situacao_debito,text,date,jsonb,jsonb) from public, anon;
grant execute on function public.cobranca_importar(public.situacao_debito,text,date,jsonb,jsonb) to authenticated;
