-- Reviza — senhas cifradas em repouso, em schema PRIVADO nao exposto pela API.
-- Aplicada 2026-09-10 via MCP como "reviza_03_cripto_senhas".
-- Chave AES-256 no Vault (reviza_leads_pwd_key_v1); NUNCA no git nem no client.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table private.cripto_config (
  singleton boolean primary key default true check (singleton),
  versao_atual smallint not null default 1
);
insert into private.cripto_config (singleton, versao_atual) values (true,1) on conflict (singleton) do nothing;

do $$ begin
  if not exists (select 1 from vault.secrets where name='reviza_leads_pwd_key_v1') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'base64'),'reviza_leads_pwd_key_v1','Reviza - chave AES-256 (v1) das senhas INSS/Reclame dos leads');
  end if;
end $$;

create table private.lead_segredos (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  senha_inss_enc bytea, senha_inss_kv smallint,
  reclame_senha_enc bytea, reclame_senha_kv smallint,
  atualizado_em timestamptz, atualizado_por uuid
);
alter table private.lead_segredos enable row level security;

create table private.segredo_acessos (
  id bigint generated always as identity primary key,
  lead_id uuid, tipo text, acao text, ator uuid, ator_papel text,
  em timestamptz not null default now()
);
alter table private.segredo_acessos enable row level security;

create or replace function private.chave(p_versao smallint) returns text
  language plpgsql stable security definer set search_path = vault, pg_temp as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name='reviza_leads_pwd_key_v'||p_versao::text;
  if v is null then raise exception 'chave de cifra v% ausente no Vault', p_versao using errcode='42704'; end if;
  return v;
end $$;

-- ESCRITA (cega): admin/gestor/comercial. NULL = nao mexe; '' = limpa; senao cifra.
create or replace function public.set_senha(p_lead uuid, p_tipo text, p_valor text) returns void
  language plpgsql volatile security definer set search_path = public, private, extensions, vault, pg_temp as $$
declare v_papel text := public.current_papel()::text; v_ver smallint; v_key text; v_enc bytea; v_acao text;
begin
  if v_papel is null or v_papel not in ('admin','gestor','comercial') then raise exception 'sem permissao' using errcode='42501'; end if;
  if p_tipo not in ('inss','reclame') then raise exception 'tipo invalido' using errcode='22023'; end if;
  if p_valor is null then return; end if;
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

-- LEITURA (revelar): SO admin/gestor; UM campo por chamada; auditado.
create or replace function public.reveal_senha(p_lead uuid, p_tipo text) returns text
  language plpgsql volatile security definer set search_path = public, private, extensions, vault, pg_temp as $$
declare v_papel text := public.current_papel()::text; v_enc bytea; v_kv smallint;
begin
  if v_papel is null or v_papel not in ('admin','gestor') then raise exception 'sem permissao' using errcode='42501'; end if;
  if p_tipo not in ('inss','reclame') then raise exception 'tipo invalido' using errcode='22023'; end if;
  select case when p_tipo='inss' then senha_inss_enc else reclame_senha_enc end,
         case when p_tipo='inss' then senha_inss_kv else reclame_senha_kv end
    into v_enc, v_kv from private.lead_segredos where lead_id=p_lead;
  insert into private.segredo_acessos (lead_id,tipo,acao,ator,ator_papel) values (p_lead,p_tipo,'revelou',auth.uid(),v_papel);
  raise log 'reveal_senha: lead=% tipo=% por=% papel=%', p_lead, p_tipo, auth.uid(), v_papel;
  if v_enc is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_enc, private.chave(v_kv));
end $$;

revoke all on function public.set_senha(uuid,text,text) from public, anon;
revoke all on function public.reveal_senha(uuid,text) from public, anon;
grant execute on function public.set_senha(uuid,text,text) to authenticated;
grant execute on function public.reveal_senha(uuid,text) to authenticated;
revoke all on function private.chave(smallint) from public, anon, authenticated;
