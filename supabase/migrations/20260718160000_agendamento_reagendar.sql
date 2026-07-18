-- ============================================================================
-- AGENDAMENTO DE MENSAGENS — Fase 2B: reagendar (falhou / bloqueada / expirada → agendada)
--
-- Reaproveita a MESMA linha: volta para 'agendada' com novo canal + horário, zera tentativas
-- e limpa os erros. Só age em estados que não saíram por decisão do usuário (falhou/bloqueada/
-- expirada); 'cancelada' (deliberada), 'enviada' (concluída), 'agendada' (use editar) e
-- 'processando' (em voo) NÃO são reagendáveis. Mesma segurança/atomicidade das RPCs 2A.
-- ============================================================================
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
  if v_row.tipo <> 'texto' then
    raise exception 'reagendar_indisponivel_tipo' using hint = 'reagendar mídia chega na Fase 3';
  end if;

  -- horário no futuro (sem teto)
  if p_executar_em is null or p_executar_em <= now() + interval '30 seconds' then
    raise exception 'horario_invalido' using hint = 'agende para o futuro';
  end if;

  -- canal precisa existir NA MESMA ORG e estar válido para envio
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
