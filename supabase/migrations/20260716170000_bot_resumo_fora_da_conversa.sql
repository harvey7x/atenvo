-- ============================================================================
-- Resumo do bot NÃO vira mais mensagem da conversa.
--
-- Problema: bot_pausar() e bot_concluir() inseriam o resumo da triagem em public.mensagens
-- (direcao='saida', tipo='nota_interna', origem='bot'), o que virava um balão gigante
-- "📋 Resumo do bot (triagem inicial) / 💡 Sugestão: ..." no chat do atendimento.
--
-- Correção: removido APENAS o INSERT em mensagens das duas funções. Nada mais muda.
-- A informação NÃO se perde: o resumo continua persistido em bot_conversa_estado.resumo
-- (p_resumo_json), que é a fonte interna. O parâmetro p_resumo_texto é MANTIDO na assinatura
-- por compatibilidade com o bot-runner (que segue chamando igual), mas passa a ser ignorado.
--
-- Não reativa bot, não liga B3.5, não altera envio/ACK, não toca em SLA/Kanban/Relatórios/
-- merge/BRUNA/cobranças/contatos/oportunidades.
-- ============================================================================

create or replace function public.bot_concluir(p_conversa uuid, p_resumo_texto text, p_resumo_json jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare c record;
begin
  select organizacao_id into c from public.conversas where id = p_conversa;
  update public.bot_conversa_estado set
    etapa = 'concluido', concluido_em = now(), resumo = p_resumo_json, ultima_atividade_em = now()
    where conversa_id = p_conversa;
  update public.conversas set precisa_humano = true, precisa_humano_motivo = 'cliente_qualificado_bot', precisa_humano_em = now()
    where id = p_conversa;
  -- (REMOVIDO) o resumo NÃO vira mais nota_interna/mensagem na conversa.
  -- Fonte interna do resumo: bot_conversa_estado.resumo (p_resumo_json, gravado acima).
  -- p_resumo_texto é ignorado de propósito (assinatura mantida por compatibilidade).
  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (null, 'bot_concluido', 'conversas', p_conversa, '{}'::jsonb, c.organizacao_id);
end $function$;

create or replace function public.bot_pausar(p_conversa uuid, p_motivo text, p_resumo_texto text default null::text, p_resumo_json jsonb default null::jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare c record; v_etapa text;
begin
  select organizacao_id, contato_id, atendente_id into c from public.conversas where id = p_conversa;
  v_etapa := case p_motivo when 'audio' then 'pausado_audio'
                           when 'humano_assumiu' then 'pausado_humano' else null end;
  update public.bot_conversa_estado set
    pausado = true, motivo_pausa = p_motivo, etapa = coalesce(v_etapa, etapa),
    resumo = coalesce(p_resumo_json, resumo), ultima_atividade_em = now()
    where conversa_id = p_conversa;
  update public.bot_mensagens_saida set status = 'cancelada'
    where conversa_id = p_conversa and status = 'pendente';
  -- (REMOVIDO) o resumo NÃO vira mais nota_interna/mensagem na conversa.
  -- Fonte interna do resumo: bot_conversa_estado.resumo (p_resumo_json, gravado acima).

  if p_motivo = 'audio' then
    update public.conversas set precisa_humano = true, precisa_humano_motivo = 'audio_recebido_bot', precisa_humano_em = now()
      where id = p_conversa;
    perform public.sla_registrar(c.organizacao_id, 'audio_recebido_precisa_humano', 'imediato',
      p_conversa, null, c.contato_id, c.atendente_id,
      '🎧 Cliente enviou áudio durante a triagem. Atendimento humano necessário.',
      'Cliente mandou áudio; o bot pausou e pediu texto.', null);
  elsif p_motivo = 'humano_assumiu' then
    update public.conversas set precisa_humano = false, precisa_humano_motivo = null, precisa_humano_em = null
      where id = p_conversa;
  end if;

  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (null, 'bot_pausado', 'conversas', p_conversa, jsonb_build_object('motivo', p_motivo), c.organizacao_id);
end $function$;
