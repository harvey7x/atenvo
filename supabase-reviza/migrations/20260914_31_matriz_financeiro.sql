-- Reviza — MATRIZ DE ACESSOS v2 (áudio do dono 14/09): a pessoa do financeiro
-- (usuário "Admin", até aqui papel cadastro) vira papel FINANCEIRO e herda os
-- poderes do cadastro: cadastrar/editar leads (Novos + Gestão), marcar parada,
-- direcionar ciclo, preencher senha vazia — além do que o financeiro já tinha
-- (confirmar entradas, marcar células). Frontal: financeiro passa a ver
-- Novos+Financeiro+Gestão+Atendentes+Avisos; comercial perde Novos.
-- (1) leads_ins/leads_upd ganham 'financeiro' na lista;
-- (2) set_senha ganha 'financeiro' (mesmo degrau do comercial/cadastro:
--     só preenche senha vazia; sobrescrever/limpar segue exigindo gestor);
-- (3) o usuário f7bd87b0 (Admin/admin@reviza.local) muda cadastro→financeiro.
-- Aplicada 2026-09-14 via MCP como "reviza_31_matriz_financeiro".

drop policy leads_ins on public.leads;
create policy leads_ins on public.leads for insert to authenticated
  with check (public.tem_papel('cadastro','comercial','financeiro','gestor','admin'));
drop policy leads_upd on public.leads;
create policy leads_upd on public.leads for update to authenticated
  using (public.tem_papel('cadastro','comercial','financeiro','gestor','admin'))
  with check (public.tem_papel('cadastro','comercial','financeiro','gestor','admin'));

-- set_senha: corpo da mig 15 preservado; só as duas listas ganham 'financeiro'
create or replace function public.set_senha(p_lead uuid, p_tipo text, p_valor text) returns void
  language plpgsql volatile security definer set search_path = public, private, extensions, vault, pg_temp as $$
declare v_papel text := public.current_papel()::text; v_ver smallint; v_key text; v_enc bytea; v_acao text; v_existe boolean;
begin
  if v_papel is null or v_papel not in ('admin','gestor','comercial','cadastro','financeiro') then raise exception 'sem permissao' using errcode='42501'; end if;
  if p_tipo not in ('inss','reclame') then raise exception 'tipo invalido' using errcode='22023'; end if;
  if p_valor is null then return; end if;

  select case when p_tipo='inss' then senha_inss_enc is not null else reclame_senha_enc is not null end
    into v_existe from private.lead_segredos where lead_id = p_lead;
  if coalesce(v_existe,false) and v_papel in ('comercial','cadastro','financeiro') then
    raise exception 'sobrescrever ou limpar senha guardada exige gestor' using errcode='42501';
  end if;

  if length(p_valor)=0 then v_enc:=null; v_ver:=null; v_acao:='limpou';
  else
    select versao_atual into v_ver from private.cripto_config where singleton;
    v_key := private.chave(v_ver);
    v_enc := extensions.pgp_sym_encrypt(p_valor, v_key, 'cipher-algo=aes256, compress-algo=0, s2k-mode=3, s2k-digest-algo=sha256');
    v_acao := 'gravou';
  end if;
  insert into private.lead_segredos as s (lead_id, senha_inss_enc, senha_inss_kv, reclame_senha_enc, reclame_senha_kv, atualizado_em, atualizado_por)
  values (p_lead,
    case when p_tipo='inss' then v_enc end, case when p_tipo='inss' then v_ver end,
    case when p_tipo='reclame' then v_enc end, case when p_tipo='reclame' then v_ver end,
    now(), auth.uid())
  on conflict (lead_id) do update set
    senha_inss_enc = case when p_tipo='inss' then v_enc else s.senha_inss_enc end,
    senha_inss_kv = case when p_tipo='inss' then v_ver else s.senha_inss_kv end,
    reclame_senha_enc = case when p_tipo='reclame' then v_enc else s.reclame_senha_enc end,
    reclame_senha_kv = case when p_tipo='reclame' then v_ver else s.reclame_senha_kv end,
    atualizado_em=now(), atualizado_por=auth.uid();
  insert into private.segredo_acessos (lead_id,tipo,acao,ator,ator_papel) values (p_lead,p_tipo,v_acao,auth.uid(),v_papel);
end $$;

-- a pessoa do financeiro (login "admin") sai de cadastro e assume o papel financeiro
update public.profiles set papel = 'financeiro'
  where id = 'f7bd87b0-01ca-472b-85aa-96b035fc6877' and papel = 'cadastro';
