-- ============================================================================
-- AGENDAMENTO DE MENSAGENS — sequência (vários blocos num único agendamento)
--
-- O atendente monta N mensagens (texto/imagem/áudio/vídeo/documento) numa tela só. Cada bloco
-- vira UMA linha em mensagens_agendadas (status/ tentativa/ erro próprios — decisão do dono:
-- itens independentes), agrupadas por sequencia_id + ordem_na_sequencia.
--
-- ORDEM x ANTI-RAJADA: o claim envia no máx. 1 msg por canal por ciclo (1 min). Para preservar a
-- ordem e respeitar esse throttle, cada item é escalonado em +1 min (ordem 0,1,2… ⇒ base, +1, +2…).
-- Assim os itens saem em sequência, ~1 min entre eles, sem alterar o motor de claim.
-- ============================================================================

alter table public.mensagens_agendadas
  add column if not exists sequencia_id uuid,
  add column if not exists ordem_na_sequencia smallint;

create index if not exists mag_sequencia_idx on public.mensagens_agendadas (sequencia_id, ordem_na_sequencia)
  where sequencia_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: agenda uma sequência ATÔMICA (tudo ou nada). p_itens = jsonb array de blocos:
--   { tipo, texto, storage_path, mime, nome, tamanho, origem_audio }
-- Mídia já subiu ao bucket (o front passa o storage_path). Valida cada item (mesmas barreiras
-- de agendar_mensagem/agendar_midia). Se qualquer item for inválido, nada é criado.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.agendar_sequencia(
  p_conversa    uuid,
  p_canal       uuid,
  p_executar_em timestamptz,
  p_itens       jsonb
) returns setof public.mensagens_agendadas
language plpgsql security definer set search_path = public as $fn$
declare
  v_org uuid; v_contato uuid; v_tel text; v_canal public.canais%rowtype;
  v_seq uuid := gen_random_uuid();
  v_n int; v_i int := 0;
  v_item jsonb; v_tipo text; v_texto text; v_path text; v_mime text; v_nome text; v_tam bigint; v_orig text;
  v_ext text; v_max bigint;
  doc_mimes text[] := array[
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv','application/zip','application/x-zip-compressed'];
  doc_exts text[] := array['pdf','doc','docx','xls','xlsx','txt','csv','ppt','pptx','zip'];
begin
  if jsonb_typeof(p_itens) <> 'array' then raise exception 'sequencia_invalida'; end if;
  v_n := jsonb_array_length(p_itens);
  if v_n < 1 then raise exception 'sequencia_vazia'; end if;
  if v_n > 20 then raise exception 'sequencia_muito_longa'; end if;
  if p_executar_em is null or p_executar_em <= now() + interval '30 seconds' then
    raise exception 'horario_invalido' using hint = 'agende para o futuro';
  end if;

  select organizacao_id, contato_id into v_org, v_contato from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_org and usuario_id = auth.uid() and status = 'ativo'
  )) then raise exception 'sem_acesso'; end if;

  select telefone into v_tel from public.contatos where id = v_contato;
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then raise exception 'contato_sem_telefone'; end if;

  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_org;
  if v_canal.id is null then raise exception 'canal_invalido' using hint = 'canal de outra organização ou inexistente'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text = 'removido' then raise exception 'canal_removido'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_tipo := v_item->>'tipo';
    v_texto := nullif(trim(coalesce(v_item->>'texto','')), '');
    v_path := v_item->>'storage_path';
    v_mime := coalesce(v_item->>'mime','');
    v_nome := v_item->>'nome';
    v_tam := nullif(v_item->>'tamanho','')::bigint;
    v_orig := v_item->>'origem_audio';

    if v_tipo not in ('texto','imagem','audio','video','documento') then raise exception 'tipo_invalido'; end if;
    if v_texto is not null and length(v_texto) > 4096 then raise exception 'texto_muito_longo'; end if;

    if v_tipo = 'texto' then
      if v_texto is null then raise exception 'texto_vazio'; end if;
    else
      -- mídia: isolamento de path + mime/tamanho por tipo (espelha agendar_midia/evolution-send)
      if v_path is null or left(v_path, length(v_org::text) + 1) <> (v_org::text || '/') then raise exception 'midia_path_invalido'; end if;
      if v_tipo = 'imagem' and v_mime not like 'image/%' then raise exception 'mime_incompativel'; end if;
      if v_tipo = 'audio'  and v_mime not like 'audio/%' then raise exception 'mime_incompativel'; end if;
      if v_tipo = 'video'  and v_mime not like 'video/%' then raise exception 'mime_incompativel'; end if;
      if v_tipo = 'documento' then
        v_ext := lower(nullif(regexp_replace(coalesce(v_nome,''), '^.*\.', ''), ''));
        if v_mime <> all(doc_mimes) and (v_ext is null or v_ext <> all(doc_exts)) then raise exception 'mime_incompativel'; end if;
      end if;
      v_max := case when v_tipo = 'documento' then 25 * 1024 * 1024 else 16 * 1024 * 1024 end;
      if v_tam is not null and v_tam > v_max then raise exception 'arquivo_muito_grande'; end if;
    end if;

    return query
    insert into public.mensagens_agendadas (
      organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, criado_por,
      tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes,
      executar_em, sequencia_id, ordem_na_sequencia, metadados
    ) values (
      v_org, p_conversa, v_contato, p_canal, v_canal.nome_interno, v_canal.numero_conectado, auth.uid(),
      v_tipo, v_texto,
      case when v_tipo = 'texto' then null else v_path end,
      case when v_tipo = 'texto' then null else v_mime end,
      case when v_tipo = 'texto' then null else v_nome end,
      case when v_tipo = 'texto' then null else v_tam end,
      p_executar_em + (v_i * interval '1 minute'),  -- escalonamento p/ preservar ordem sob o throttle
      v_seq, v_i,
      jsonb_build_object('responsavel_no_agendamento', (select responsavel_id from public.contatos where id = v_contato))
        || case when v_tipo = 'audio' and v_orig is not null then jsonb_build_object('origem_audio', v_orig) else '{}'::jsonb end
    ) returning *;

    v_i := v_i + 1;
  end loop;
end $fn$;

revoke execute on function public.agendar_sequencia(uuid, uuid, timestamptz, jsonb) from public, anon;
grant  execute on function public.agendar_sequencia(uuid, uuid, timestamptz, jsonb) to authenticated;
