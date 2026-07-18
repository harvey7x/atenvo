-- ============================================================================
-- AGENDAMENTO DE MENSAGENS — Fase 2A: editar / cancelar (antes do envio)
--
-- Só é permitido enquanto status = 'agendada'. As RPCs travam a linha (FOR UPDATE)
-- para serem ATÔMICAS contra o claim do cron (mensagens_agendadas_reivindicar):
--   • se o cron já reivindicou (status='processando'), o FOR UPDATE espera a transação
--     do cron e então vê status<>'agendada' → recusa (nao_editavel/nao_cancelavel);
--   • se a edição/cancelamento roda antes, o claim vê status<>'agendada' e não pega a linha.
-- Segurança idêntica à agendar_mensagem: só membro ATIVO da org da linha (ou platform admin);
-- escrita só via RPC (a tabela já revoga insert/update/delete de anon/authenticated).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Cancelar: marca 'cancelada' + auditoria (cancelada_em/por). Idempotência não se aplica
-- (só age em 'agendada'); a mensagem não sai.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.cancelar_agendamento(p_id uuid)
returns public.mensagens_agendadas
language plpgsql security definer set search_path = public as $fn$
declare v_row public.mensagens_agendadas;
begin
  select * into v_row from public.mensagens_agendadas where id = p_id for update;
  if v_row.id is null then raise exception 'agendamento_nao_encontrado'; end if;

  if not (is_platform_admin() or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_row.organizacao_id and usuario_id = auth.uid() and status = 'ativo'
  )) then raise exception 'sem_acesso'; end if;

  if v_row.status <> 'agendada' then
    raise exception 'nao_cancelavel' using hint = 'só é possível cancelar enquanto agendada';
  end if;

  update public.mensagens_agendadas
     set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid(), atualizado_em = now()
   where id = p_id
  returning * into v_row;
  return v_row;
end $fn$;

revoke execute on function public.cancelar_agendamento(uuid) from public, anon;
grant  execute on function public.cancelar_agendamento(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Editar (texto / data-hora / canal). Fase 2A: só linhas de texto. Revalida canal na
-- MESMA org e re-snapshota nome/número. Marca auditoria (editada_em/por).
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
  if v_row.tipo <> 'texto' then
    raise exception 'edicao_indisponivel_tipo' using hint = 'edição de mídia chega na Fase 3';
  end if;

  -- texto
  if p_texto is null or length(trim(p_texto)) = 0 then raise exception 'texto_vazio'; end if;
  if length(p_texto) > 4096 then raise exception 'texto_muito_longo'; end if;

  -- horário no futuro (sem teto — pode agendar para dias/semanas à frente)
  if p_executar_em is null or p_executar_em <= now() + interval '30 seconds' then
    raise exception 'horario_invalido' using hint = 'agende para o futuro';
  end if;

  -- canal precisa existir NA MESMA ORG da linha e estar válido para envio
  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_row.organizacao_id;
  if v_canal.id is null then raise exception 'canal_invalido' using hint = 'canal de outra organização ou inexistente'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text = 'removido' then raise exception 'canal_removido'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;

  update public.mensagens_agendadas
     set texto = p_texto,
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
