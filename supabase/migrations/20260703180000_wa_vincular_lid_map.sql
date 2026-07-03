-- Vínculo manual (Caso D) passa a gravar o mapa LID↔PN por canal, marcar o estado de identidade
-- do contato e corrigir o nome placeholder — para reutilizar o vínculo em mensagens futuras.
-- Mesma assinatura (não muda callers). Mantém os bloqueios de conflito existentes.
create or replace function public.wa_vincular_numero(p_conversa uuid, p_numero text, p_jid text, p_usuario uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid; v_contato uuid; v_canal uuid; v_norm text; v_tel text;
begin
  select cv.organizacao_id, cv.contato_id, cv.canal_id into v_org, v_contato, v_canal
  from conversas cv where cv.id = p_conversa;
  if v_contato is null then raise exception 'conversa_nao_encontrada'; end if;

  if not exists (select 1 from organizacao_usuarios ou
                 where ou.organizacao_id = v_org and ou.usuario_id = coalesce(auth.uid(), p_usuario) and ou.status = 'ativo') then
    raise exception 'sem_permissao';
  end if;

  v_norm := regexp_replace(coalesce(p_numero,''), '[^0-9]', '', 'g');
  if length(v_norm) < 12 then raise exception 'numero_invalido'; end if;

  -- CONFLITO: PN já é identidade de OUTRO contato → não faz merge automático (alerta p/ revisão manual).
  if exists (select 1 from contato_identidades i
             where i.organizacao_id = v_org and i.tipo = 'whatsapp' and i.valor_normalizado = v_norm and i.contato_id <> v_contato) then
    raise exception 'pn_em_outro_contato';
  end if;
  if exists (select 1 from contato_identidades i
             where i.contato_id = v_contato and i.tipo = 'whatsapp' and i.valor_normalizado <> v_norm) then
    raise exception 'pn_confirmado_diferente_existe';
  end if;

  if not exists (select 1 from contato_identidades i
                 where i.contato_id = v_contato and i.tipo = 'whatsapp' and i.valor_normalizado = v_norm) then
    insert into contato_identidades (contato_id, organizacao_id, tipo, provedor, valor, valor_normalizado, principal, metadados)
    values (v_contato, v_org, 'whatsapp', 'evolution', coalesce(p_jid, v_norm || '@s.whatsapp.net'), v_norm, true,
            jsonb_build_object('origem','manual','vinculado_por', coalesce(auth.uid(), p_usuario), 'em', now()::text, 'canal_id', v_canal));
  end if;

  select telefone into v_tel from contatos where id = v_contato;
  if v_tel is null or btrim(v_tel) = '' then
    update contatos set telefone = v_norm where id = v_contato;
  end if;

  -- Estado de identidade + corrige nome placeholder (vínculo manual não tem pushName → usa o número).
  update contatos set identidade_tipo = 'resolvido_manual', identidade_resolvida_em = now(), identidade_fonte = 'manual'
   where id = v_contato;
  update contatos set nome = v_norm where id = v_contato and nome = 'Identidade protegida';

  -- Mapa LID↔PN por canal: confirma os existentes e insere os que faltam (reuso futuro).
  update wa_lid_map m set telefone_normalizado = v_norm, jid_telefone = coalesce(p_jid, v_norm || '@s.whatsapp.net'),
         confirmado = true, fonte = 'manual'
    from contato_identidades ci
   where ci.contato_id = v_contato and ci.provedor = 'evolution_lid'
     and m.organizacao_id = v_org and m.lid = ci.valor_normalizado
     and (m.canal_id = v_canal or (m.canal_id is null and v_canal is null));
  insert into wa_lid_map (organizacao_id, canal_id, lid, jid_telefone, telefone_normalizado, fonte, confirmado)
    select v_org, v_canal, ci.valor_normalizado, coalesce(p_jid, v_norm || '@s.whatsapp.net'), v_norm, 'manual', true
    from contato_identidades ci
   where ci.contato_id = v_contato and ci.provedor = 'evolution_lid'
     and not exists (select 1 from wa_lid_map m where m.organizacao_id = v_org and m.lid = ci.valor_normalizado
         and (m.canal_id = v_canal or (m.canal_id is null and v_canal is null)));

  return jsonb_build_object('ok', true, 'contato', v_contato, 'numero_norm', v_norm);
end $$;
notify pgrst, 'reload schema';
