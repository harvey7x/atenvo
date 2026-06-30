-- Caso D — vínculo manual de número (PN) a um contato originado por LID, validado no onWhatsApp pela
-- evolution-send antes de chamar esta RPC. Persiste o PN como identidade WhatsApp, mantém o LID, audita
-- a origem, e NUNCA sobrescreve um PN confirmado diferente. Não infere telefone a partir do LID.
alter table public.contato_identidades add column if not exists metadados jsonb not null default '{}'::jsonb;

create or replace function public.wa_vincular_numero(p_conversa uuid, p_numero text, p_jid text, p_usuario uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_contato uuid; v_canal uuid; v_norm text; v_tel text;
begin
  select cv.organizacao_id, cv.contato_id, cv.canal_id into v_org, v_contato, v_canal
  from conversas cv where cv.id = p_conversa;
  if v_contato is null then raise exception 'conversa_nao_encontrada'; end if;

  -- membership: vale auth.uid() (chamada direta) OU p_usuario (chamada pela edge function com service_role,
  -- que já validou o usuário). Bloqueia quem não pertence à organização.
  if not exists (select 1 from organizacao_usuarios ou
                 where ou.organizacao_id = v_org and ou.usuario_id = coalesce(auth.uid(), p_usuario) and ou.status = 'ativo') then
    raise exception 'sem_permissao';
  end if;

  v_norm := regexp_replace(coalesce(p_numero,''), '[^0-9]', '', 'g');
  if length(v_norm) < 12 then raise exception 'numero_invalido'; end if;

  -- não sobrescrever um PN confirmado DIFERENTE já existente (conflito -> revisão manual)
  if exists (select 1 from contato_identidades i
             where i.contato_id = v_contato and i.tipo = 'whatsapp' and i.valor_normalizado <> v_norm) then
    raise exception 'pn_confirmado_diferente_existe';
  end if;

  -- idempotente: cria a identidade WhatsApp só se ainda não existir (preserva o LID já gravado)
  if not exists (select 1 from contato_identidades i
                 where i.contato_id = v_contato and i.tipo = 'whatsapp' and i.valor_normalizado = v_norm) then
    insert into contato_identidades (contato_id, organizacao_id, tipo, provedor, valor, valor_normalizado, principal, metadados)
    values (v_contato, v_org, 'whatsapp', 'evolution', coalesce(p_jid, v_norm || '@s.whatsapp.net'), v_norm, true,
            jsonb_build_object('origem','manual','vinculado_por', coalesce(auth.uid(), p_usuario), 'em', now()::text, 'canal_id', v_canal));
  end if;

  -- telefone do CRM: preenche só se vazio (não sobrescreve um valor já existente)
  select telefone into v_tel from contatos where id = v_contato;
  if v_tel is null or btrim(v_tel) = '' then
    update contatos set telefone = v_norm where id = v_contato;
  end if;

  return jsonb_build_object('ok', true, 'contato', v_contato, 'numero_norm', v_norm);
end $$;

revoke all on function public.wa_vincular_numero(uuid, text, text, uuid) from public, anon;
grant execute on function public.wa_vincular_numero(uuid, text, text, uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
