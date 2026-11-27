-- Reviza — papel "cadastro", parte 2: rank + policies (aplicar DEPOIS da parte 1).

-- rank: cadastro fica ABAIXO de comercial — is_at_least('comercial') segue excluindo cadastro,
-- então nada que era restrito passa a ser permitido por acidente.
create or replace function public.papel_rank(p public.papel_usuario) returns int
  language sql immutable set search_path = '' as $$
  select case p when 'cadastro' then 1 when 'comercial' then 2 when 'financeiro' then 3 when 'gestor' then 4 when 'admin' then 5 else 0 end $$;

-- leads: cadastro cria e edita (cadastro do cliente, data da reclamação, débito parado);
-- excluir segue gestor+.
drop policy if exists leads_ins on public.leads;
create policy leads_ins on public.leads for insert to authenticated
  with check (public.tem_papel('cadastro','comercial','gestor','admin'));
drop policy if exists leads_upd on public.leads;
create policy leads_upd on public.leads for update to authenticated
  using (public.tem_papel('cadastro','comercial','gestor','admin'))
  with check (public.tem_papel('cadastro','comercial','gestor','admin'));

-- set_senha: cadastro PREENCHE senha vazia no cadastro do cliente;
-- sobrescrever/limpar senha guardada segue exigindo gestor (mesma trava do comercial).
create or replace function public.set_senha(p_lead uuid, p_tipo text, p_valor text) returns void
  language plpgsql volatile security definer set search_path = public, private, extensions, vault, pg_temp as $$
declare v_papel text := public.current_papel()::text; v_ver smallint; v_key text; v_enc bytea; v_acao text; v_existe boolean;
begin
  if v_papel is null or v_papel not in ('admin','gestor','comercial','cadastro') then raise exception 'sem permissao' using errcode='42501'; end if;
  if p_tipo not in ('inss','reclame') then raise exception 'tipo invalido' using errcode='22023'; end if;
  if p_valor is null then return; end if;

  select case when p_tipo='inss' then senha_inss_enc is not null else reclame_senha_enc is not null end
    into v_existe from private.lead_segredos where lead_id = p_lead;
  if coalesce(v_existe,false) and v_papel in ('comercial','cadastro') then
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
