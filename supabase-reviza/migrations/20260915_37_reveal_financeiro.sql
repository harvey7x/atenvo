-- Financeiro precisa VER as credenciais dos clientes (senha INSS / Reclame Aqui).
-- Dono (15/09): "financeiro vê tudo de todo mundo". Antes só admin/gestor revelavam,
-- então quando o financeiro ia olhar a senha que o comercial cadastrou, vinha em branco.
-- Segue auditado em private.segredo_acessos (ator_papel). Ver [[reviza-matriz-acessos-v2]].
create or replace function public.reveal_senha(p_lead uuid, p_tipo text)
returns text
language plpgsql
security definer
set search_path to 'public','private','extensions','vault','pg_temp'
as $function$
declare v_papel text := public.current_papel()::text; v_enc bytea; v_kv smallint;
begin
  if v_papel is null or v_papel not in ('admin','gestor','financeiro') then raise exception 'sem permissao' using errcode='42501'; end if;
  if p_tipo not in ('inss','reclame') then raise exception 'tipo invalido' using errcode='22023'; end if;
  select case when p_tipo='inss' then senha_inss_enc else reclame_senha_enc end,
         case when p_tipo='inss' then senha_inss_kv else reclame_senha_kv end
    into v_enc, v_kv from private.lead_segredos where lead_id=p_lead;
  insert into private.segredo_acessos (lead_id,tipo,acao,ator,ator_papel) values (p_lead,p_tipo,'revelou',auth.uid(),v_papel);
  if v_enc is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_enc, private.chave(v_kv));
end $function$;
