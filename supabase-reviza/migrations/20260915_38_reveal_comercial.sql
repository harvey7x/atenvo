-- Comercial também pode VER a senha (dono 15/09), mas SÓ dos clientes DELE
-- (senha real de INSS/banco do cliente — não pode vazar entre comerciais).
-- Casa o nome do perfil do comercial com leads.comercial (case-insensitive), igual às comissões.
-- admin/gestor/financeiro seguem vendo todas. Auditado em private.segredo_acessos. Ver [[reviza-matriz-acessos-v2]].
create or replace function public.reveal_senha(p_lead uuid, p_tipo text)
returns text
language plpgsql
security definer
set search_path to 'public','private','extensions','vault','pg_temp'
as $function$
declare v_papel text := public.current_papel()::text; v_enc bytea; v_kv smallint;
begin
  if v_papel is null then raise exception 'sem permissao' using errcode='42501'; end if;
  if p_tipo not in ('inss','reclame') then raise exception 'tipo invalido' using errcode='22023'; end if;

  if v_papel = 'comercial' then
    -- comercial só revela dos clientes dele (comercial do lead = nome do perfil dele)
    if not exists (
      select 1 from public.leads l
      join public.profiles p on upper(btrim(p.nome)) = upper(btrim(l.comercial))
      where l.id = p_lead and p.id = auth.uid()
    ) then raise exception 'sem permissao' using errcode='42501'; end if;
  elsif v_papel not in ('admin','gestor','financeiro') then
    raise exception 'sem permissao' using errcode='42501';
  end if;

  select case when p_tipo='inss' then senha_inss_enc else reclame_senha_enc end,
         case when p_tipo='inss' then senha_inss_kv else reclame_senha_kv end
    into v_enc, v_kv from private.lead_segredos where lead_id=p_lead;
  insert into private.segredo_acessos (lead_id,tipo,acao,ator,ator_papel) values (p_lead,p_tipo,'revelou',auth.uid(),v_papel);
  if v_enc is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_enc, private.chave(v_kv));
end $function$;
