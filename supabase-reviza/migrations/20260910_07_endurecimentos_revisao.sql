-- Reviza — endurecimentos apontados pela revisão adversarial (10/09)
-- Aplicada 2026-09-10 via MCP como "reviza_07_endurecimentos_revisao".

-- (a) competências: qualquer papel ATIVO pode materializar um mês novo
drop policy if exists comp_ins on public.competencias;
create policy comp_ins on public.competencias for insert to authenticated
  with check (public.current_papel() is not null);

-- (b) entradas: comercial não forja estado/decisão no INSERT
drop policy if exists ent_ins on public.entradas;
create policy ent_ins on public.entradas for insert to authenticated
  with check (public.tem_papel('comercial','gestor','admin')
              and por_id = auth.uid()
              and estado = 'pendente'
              and resolvido_por is null and resolvido_em is null);

-- (c) bucket de comprovantes: teto de tamanho + só imagem/PDF
update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','application/pdf']
 where id = 'comprovantes';

-- (d) storage: cobre owner_id (novo) além de owner (legado)
drop policy if exists comprov_sel on storage.objects;
create policy comprov_sel on storage.objects for select to authenticated
  using (bucket_id='comprovantes'
         and (public.is_at_least('financeiro') or owner = auth.uid() or owner_id = auth.uid()::text));

-- (e) set_senha: comercial NÃO sobrescreve nem limpa senha já guardada (só preenche vazio)
create or replace function public.set_senha(p_lead uuid, p_tipo text, p_valor text) returns void
  language plpgsql volatile security definer set search_path = public, private, extensions, vault, pg_temp as $$
declare v_papel text := public.current_papel()::text; v_ver smallint; v_key text; v_enc bytea; v_acao text; v_existe boolean;
begin
  if v_papel is null or v_papel not in ('admin','gestor','comercial') then raise exception 'sem permissao' using errcode='42501'; end if;
  if p_tipo not in ('inss','reclame') then raise exception 'tipo invalido' using errcode='22023'; end if;
  if p_valor is null then return; end if;

  select case when p_tipo='inss' then senha_inss_enc is not null else reclame_senha_enc is not null end
    into v_existe from private.lead_segredos where lead_id = p_lead;
  if coalesce(v_existe,false) and v_papel = 'comercial' then
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
