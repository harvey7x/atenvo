-- ============================================================================
-- AGENDAMENTO DE MENSAGENS — Fase 3: mídia (imagem/áudio/vídeo/documento)
--
-- O schema já tinha storage_path/mime_type/nome_arquivo/tamanho_bytes e a CHECK de tipo
-- (texto/imagem/audio/documento/texto_midia). Aqui: (1) adiciona 'video' à CHECK; (2) cria a
-- RPC agendar_midia (valida org/canal/contato + isolamento de path + mime/tamanho, espelhando o
-- evolution-send); (3) relaxa editar/reagendar para linhas de mídia SEM trocar o arquivo.
-- Legenda reaproveita a coluna `texto`; duração/origem do áudio ficam em metadados.
-- ============================================================================

alter table public.mensagens_agendadas drop constraint if exists mensagens_agendadas_tipo_check;
alter table public.mensagens_agendadas add constraint mensagens_agendadas_tipo_check
  check (tipo in ('texto','imagem','audio','video','documento','texto_midia'));

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: agendar mídia. Mesmas barreiras da agendar_mensagem + validação de mídia
-- (prefixo de org no path, mime por tipo, tamanho). Legenda opcional em `texto`.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.agendar_midia(
  p_conversa     uuid,
  p_canal        uuid,
  p_tipo         text,
  p_texto        text,
  p_storage_path text,
  p_mime         text,
  p_nome         text,
  p_tamanho      bigint,
  p_executar_em  timestamptz,
  p_origem_audio text default null
) returns public.mensagens_agendadas
language plpgsql security definer set search_path = public as $fn$
declare
  v_org uuid; v_contato uuid; v_tel text; v_canal public.canais%rowtype; v_row public.mensagens_agendadas;
  v_ext text; v_max bigint;
  doc_mimes text[] := array[
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain','text/csv','application/zip','application/x-zip-compressed'];
  doc_exts text[] := array['pdf','doc','docx','xls','xlsx','txt','csv','ppt','pptx','zip'];
begin
  if p_tipo not in ('imagem','audio','video','documento') then raise exception 'tipo_midia_invalido'; end if;
  if p_executar_em is null or p_executar_em <= now() + interval '30 seconds' then
    raise exception 'horario_invalido' using hint = 'agende para o futuro';
  end if;
  if p_texto is not null and length(p_texto) > 4096 then raise exception 'texto_muito_longo'; end if;

  select organizacao_id, contato_id into v_org, v_contato from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;

  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_org and usuario_id = auth.uid() and status = 'ativo'
  )) then raise exception 'sem_acesso'; end if;

  select telefone into v_tel from public.contatos where id = v_contato;
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then raise exception 'contato_sem_telefone'; end if;

  -- ISOLAMENTO por organização: o path precisa começar por "<org>/" (mesma barreira do evolution-send).
  if p_storage_path is null or left(p_storage_path, length(v_org::text) + 1) <> (v_org::text || '/') then
    raise exception 'midia_path_invalido';
  end if;

  -- MIME/extensão por tipo
  if p_tipo = 'imagem' and coalesce(p_mime,'') not like 'image/%' then raise exception 'mime_incompativel'; end if;
  if p_tipo = 'audio'  and coalesce(p_mime,'') not like 'audio/%' then raise exception 'mime_incompativel'; end if;
  if p_tipo = 'video'  and coalesce(p_mime,'') not like 'video/%' then raise exception 'mime_incompativel'; end if;
  if p_tipo = 'documento' then
    v_ext := lower(nullif(regexp_replace(coalesce(p_nome,''), '^.*\.', ''), ''));
    if coalesce(p_mime,'') <> all(doc_mimes) and (v_ext is null or v_ext <> all(doc_exts)) then
      raise exception 'mime_incompativel';
    end if;
  end if;

  -- Tamanho: documento 25MB; imagem/áudio/vídeo 16MB.
  v_max := case when p_tipo = 'documento' then 25 * 1024 * 1024 else 16 * 1024 * 1024 end;
  if p_tamanho is not null and p_tamanho > v_max then raise exception 'arquivo_muito_grande'; end if;

  -- Canal válido NA MESMA ORG.
  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_org;
  if v_canal.id is null then raise exception 'canal_invalido' using hint = 'canal de outra organização ou inexistente'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text = 'removido' then raise exception 'canal_removido'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;

  insert into public.mensagens_agendadas (
    organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, criado_por,
    tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, metadados
  ) values (
    v_org, p_conversa, v_contato, p_canal, v_canal.nome_interno, v_canal.numero_conectado, auth.uid(),
    p_tipo, nullif(trim(coalesce(p_texto, '')), ''), p_storage_path, p_mime, p_nome, p_tamanho, p_executar_em,
    jsonb_build_object('responsavel_no_agendamento', (select responsavel_id from public.contatos where id = v_contato))
      || case when p_tipo = 'audio' and p_origem_audio is not null then jsonb_build_object('origem_audio', p_origem_audio) else '{}'::jsonb end
  ) returning * into v_row;
  return v_row;
end $fn$;

revoke execute on function public.agendar_midia(uuid, uuid, text, text, text, text, text, bigint, timestamptz, text) from public, anon;
grant  execute on function public.agendar_midia(uuid, uuid, text, text, text, text, text, bigint, timestamptz, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- editar_agendamento: agora aceita linhas de MÍDIA (edita legenda/canal/horário;
-- NÃO troca o arquivo). Texto obrigatório só quando tipo='texto'.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.editar_agendamento(
  p_id          uuid,
  p_canal       uuid,
  p_texto       text,
  p_executar_em timestamptz
) returns public.mensagens_agendadas
language plpgsql security definer set search_path = public as $fn$
declare
  v_row   public.mensagens_agendadas;
  v_canal public.canais%rowtype;
begin
  select * into v_row from public.mensagens_agendadas where id = p_id for update;
  if v_row.id is null then raise exception 'agendamento_nao_encontrado'; end if;

  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_row.organizacao_id and usuario_id = auth.uid() and status = 'ativo'
  )) then raise exception 'sem_acesso'; end if;

  if v_row.status <> 'agendada' then
    raise exception 'nao_editavel' using hint = 'só é possível editar enquanto agendada';
  end if;

  -- texto: obrigatório em 'texto'; legenda opcional em mídia.
  if v_row.tipo = 'texto' then
    if p_texto is null or length(trim(p_texto)) = 0 then raise exception 'texto_vazio'; end if;
  end if;
  if p_texto is not null and length(p_texto) > 4096 then raise exception 'texto_muito_longo'; end if;

  if p_executar_em is null or p_executar_em <= now() + interval '30 seconds' then
    raise exception 'horario_invalido' using hint = 'agende para o futuro';
  end if;

  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_row.organizacao_id;
  if v_canal.id is null then raise exception 'canal_invalido' using hint = 'canal de outra organização ou inexistente'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text = 'removido' then raise exception 'canal_removido'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;

  update public.mensagens_agendadas
     set texto = case when v_row.tipo = 'texto' then p_texto else nullif(trim(coalesce(p_texto, '')), '') end,
         canal_id = p_canal,
         nome_canal_snapshot = v_canal.nome_interno,
         telefone_canal_snapshot = v_canal.numero_conectado,
         executar_em = p_executar_em,
         editada_em = now(), editada_por = auth.uid(), atualizado_em = now()
   where id = p_id
  returning * into v_row;
  return v_row;
end $fn$;

revoke execute on function public.editar_agendamento(uuid, uuid, text, timestamptz) from public, anon;
grant  execute on function public.editar_agendamento(uuid, uuid, text, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- reagendar_agendamento: passa a aceitar mídia também (mantém o arquivo; só volta
-- pra 'agendada' com novo canal/horário e zera tentativas/erros).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.reagendar_agendamento(
  p_id          uuid,
  p_canal       uuid,
  p_executar_em timestamptz
) returns public.mensagens_agendadas
language plpgsql security definer set search_path = public as $fn$
declare
  v_row   public.mensagens_agendadas;
  v_canal public.canais%rowtype;
begin
  select * into v_row from public.mensagens_agendadas where id = p_id for update;
  if v_row.id is null then raise exception 'agendamento_nao_encontrado'; end if;

  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_row.organizacao_id and usuario_id = auth.uid() and status = 'ativo'
  )) then raise exception 'sem_acesso'; end if;

  if v_row.status not in ('falhou', 'bloqueada', 'expirada') then
    raise exception 'nao_reagendavel' using hint = 'só reagenda mensagens que falharam/foram bloqueadas/expiraram';
  end if;

  if p_executar_em is null or p_executar_em <= now() + interval '30 seconds' then
    raise exception 'horario_invalido' using hint = 'agende para o futuro';
  end if;

  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_row.organizacao_id;
  if v_canal.id is null then raise exception 'canal_invalido' using hint = 'canal de outra organização ou inexistente'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text = 'removido' then raise exception 'canal_removido'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;

  update public.mensagens_agendadas
     set status = 'agendada',
         tentativas = 0,
         ultimo_erro = null,
         motivo_bloqueio = null,
         canal_id = p_canal,
         nome_canal_snapshot = v_canal.nome_interno,
         telefone_canal_snapshot = v_canal.numero_conectado,
         executar_em = p_executar_em,
         enviada_em = null,
         mensagem_id_enviada = null,
         editada_em = now(), editada_por = auth.uid(), atualizado_em = now()
   where id = p_id
  returning * into v_row;
  return v_row;
end $fn$;

revoke execute on function public.reagendar_agendamento(uuid, uuid, timestamptz) from public, anon;
grant  execute on function public.reagendar_agendamento(uuid, uuid, timestamptz) to authenticated;
