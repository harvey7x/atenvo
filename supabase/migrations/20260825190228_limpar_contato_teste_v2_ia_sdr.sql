-- limpar_contato_teste v2 — inclui as tabelas da IA SDR (fase 1.1).
-- A RPC de 2026-08-17 é anterior à IA: sem estes deletes, o FK de ia_sessoes/ia_eventos
-- (sem cascade p/ conversas) ABORTA a limpeza inteira. Mesma função, 3 acréscimos:
-- contagens ia_sessoes/ia_eventos no antes/depois + deletes antes do núcleo.

create or replace function public.limpar_contato_teste(p_sufixo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids uuid[]; v_contatos jsonb; v_antes jsonb; v_depois jsonb;
begin
  if length(regexp_replace(coalesce(p_sufixo, ''), '\D', '', 'g')) < 8 then
    raise exception 'sufixo_curto: informe pelo menos 8 dígitos do telefone';
  end if;

  select array_agg(distinct id) into v_ids from (
    select id from public.contatos where telefone like '%' || p_sufixo || '%'
    union
    select contato_id from public.contato_identidades where valor_normalizado like '%' || p_sufixo || '%'
  ) s(id);

  if v_ids is null then
    return jsonb_build_object('ok', false, 'motivo', 'nenhum_contato_encontrado', 'sufixo', p_sufixo);
  end if;
  if array_length(v_ids, 1) > 2 then
    raise exception 'sufixo % casa % contatos — abortando por segurança (esperado 1–2, o par com/sem 9)',
      p_sufixo, array_length(v_ids, 1);
  end if;

  select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'telefone', telefone))
    into v_contatos from public.contatos where id = any(v_ids);

  create temp table _cts   on commit drop as select unnest(v_ids) as id;
  create temp table _convs on commit drop as select id from public.conversas where contato_id in (select id from _cts);
  create temp table _opps  on commit drop as select id from public.oportunidades where contato_id in (select id from _cts) or conversa_origem_id in (select id from _convs);
  create temp table _msgs  on commit drop as select id from public.mensagens where conversa_id in (select id from _convs);
  create temp table _mags  on commit drop as select id from public.mensagens_agendadas where contato_id in (select id from _cts) or conversa_id in (select id from _convs);
  create temp table _ativs on commit drop as select id from public.regua_ativacoes where contato_id in (select id from _cts) or conversa_id in (select id from _convs);

  v_antes := jsonb_build_object(
    'mensagens', (select count(*) from public.mensagens where conversa_id in (select id from _convs)),
    'anexos_mensagem', (select count(*) from public.anexos_mensagem where mensagem_id in (select id from _msgs)),
    'bot_conversa_estado', (select count(*) from public.bot_conversa_estado where conversa_id in (select id from _convs) or contato_id in (select id from _cts)),
    'bot_mensagens_saida', (select count(*) from public.bot_mensagens_saida where conversa_id in (select id from _convs)),
    'bot_roteamentos', (select count(*) from public.bot_roteamentos where conversa_id in (select id from _convs) or contato_id in (select id from _cts)),
    'alertas_lead_quente', (select count(*) from public.alertas_lead_quente where conversa_id in (select id from _convs) or contato_id in (select id from _cts)),
    'sla_alertas', (select count(*) from public.sla_alertas where conversa_id in (select id from _convs) or contato_id in (select id from _cts) or oportunidade_id in (select id from _opps)),
    'conversa_atividades', (select count(*) from public.conversa_atividades where conversa_id in (select id from _convs)),
    'canal_janela', (select count(*) from public.canal_janela where contato_id in (select id from _cts)),
    'mensagens_agendadas', (select count(*) from _mags),
    'regua_envios', (select count(*) from public.regua_envios where ativacao_id in (select id from _ativs) or mensagem_agendada_id in (select id from _mags)),
    'oportunidade_eventos', (select count(*) from public.oportunidade_eventos where oportunidade_id in (select id from _opps)),
    'oportunidade_checklist', (select count(*) from public.oportunidade_checklist where oportunidade_id in (select id from _opps)),
    'oportunidades', (select count(*) from _opps),
    'conversa_unificacao_log', (select count(*) from public.conversa_unificacao_log where principal_id in (select id from _convs) or secundaria_id in (select id from _convs)),
    'contato_merges', (select count(*) from public.contato_merges where sobrevivente_id in (select id from _cts) or absorvido_id in (select id from _cts)),
    'contato_identidades', (select count(*) from public.contato_identidades where contato_id in (select id from _cts)),
    'wa_lid_map', (select count(*) from public.wa_lid_map where telefone_normalizado like '%' || p_sufixo || '%' or jid_telefone like '%' || p_sufixo || '%'),
    'wa_optout', (select count(*) from public.wa_optout where contato_id in (select id from _cts)),
    'disparo_alvos', (select count(*) from public.disparo_alvos where contato_id in (select id from _cts)),
    'disparo_envios', (select count(*) from public.disparo_envios where contato_id in (select id from _cts)),
    'bot_remarketing', (select count(*) from public.bot_remarketing where contato_id in (select id from _cts) or conversa_id in (select id from _convs) or oportunidade_id in (select id from _opps)),
    'script_execucoes', (select count(*) from public.script_execucoes where conversa_id in (select id from _convs)),
    'agendamentos', (select count(*) from public.agendamentos where contato_id in (select id from _cts) or oportunidade_id in (select id from _opps)),
    'cobrancas', (select count(*) from public.cobrancas where contato_id in (select id from _cts) or oportunidade_id in (select id from _opps)),
    'fichas_judiciais', (select count(*) from public.fichas_judiciais where contato_id in (select id from _cts) or conversa_id in (select id from _convs) or oportunidade_id in (select id from _opps)),
    'meta_contato_identidades', (select count(*) from public.meta_contato_identidades where contato_id in (select id from _cts)),
    'regua_ativacoes', (select count(*) from _ativs),
    'relacionamento_bloqueio', (select count(*) from public.relacionamento_bloqueio where contato_id in (select id from _cts)),
    'remarketing_leads', (select count(*) from public.remarketing_leads where contato_id in (select id from _cts) or conversa_id in (select id from _convs) or oportunidade_id in (select id from _opps)),
    'remarketing_tarefas', (select count(*) from public.remarketing_tarefas where contato_id in (select id from _cts) or conversa_id in (select id from _convs)),
    'conversa_higiene_adiamentos', (select count(*) from public.conversa_higiene_adiamentos where conversa_id in (select id from _convs)),
    'ia_sessoes', (select count(*) from public.ia_sessoes where conversa_id in (select id from _convs) or contato_id in (select id from _cts)),
    'ia_eventos', (select count(*) from public.ia_eventos where conversa_id in (select id from _convs) or sessao_id in (select id from public.ia_sessoes where contato_id in (select id from _cts))),
    'conversas', (select count(*) from _convs),
    'contatos', (select count(*) from public.contatos where id in (select id from _cts))
  );

  -- self-FKs: solta antes de deletar em massa
  update public.mensagens set respondida_a_id = null where conversa_id in (select id from _convs) and respondida_a_id is not null;
  update public.fichas_judiciais set ficha_anterior_id = null where ficha_anterior_id in (select id from public.fichas_judiciais where contato_id in (select id from _cts));
  update public.contatos set mesclado_para = null where mesclado_para in (select id from _cts);

  -- folhas / dependentes de mensagens e agendadas
  delete from public.regua_envios where ativacao_id in (select id from _ativs) or mensagem_agendada_id in (select id from _mags);
  delete from public.mensagens_agendadas where id in (select id from _mags);
  delete from public.anexos_mensagem where mensagem_id in (select id from _msgs);
  delete from public.bot_mensagens_saida where conversa_id in (select id from _convs);
  delete from public.bot_conversa_estado where conversa_id in (select id from _convs) or contato_id in (select id from _cts);
  delete from public.bot_roteamentos where conversa_id in (select id from _convs) or contato_id in (select id from _cts);
  delete from public.alertas_lead_quente where conversa_id in (select id from _convs) or contato_id in (select id from _cts);
  delete from public.sla_alertas where conversa_id in (select id from _convs) or contato_id in (select id from _cts) or oportunidade_id in (select id from _opps);
  delete from public.conversa_atividades where conversa_id in (select id from _convs);
  delete from public.script_execucoes where conversa_id in (select id from _convs);
  delete from public.conversa_higiene_adiamentos where conversa_id in (select id from _convs);
  delete from public.conversa_unificacao_log where principal_id in (select id from _convs) or secundaria_id in (select id from _convs);

  -- dependentes do contato
  delete from public.canal_janela where contato_id in (select id from _cts);
  delete from public.wa_optout where contato_id in (select id from _cts);
  delete from public.disparo_alvos where contato_id in (select id from _cts);
  delete from public.disparo_envios where contato_id in (select id from _cts);
  delete from public.meta_contato_identidades where contato_id in (select id from _cts);
  delete from public.relacionamento_bloqueio where contato_id in (select id from _cts);
  delete from public.contato_merges where sobrevivente_id in (select id from _cts) or absorvido_id in (select id from _cts);
  delete from public.wa_lid_map where telefone_normalizado like '%' || p_sufixo || '%' or jid_telefone like '%' || p_sufixo || '%';

  -- dependentes de oportunidades
  delete from public.bot_remarketing where contato_id in (select id from _cts) or conversa_id in (select id from _convs) or oportunidade_id in (select id from _opps);
  delete from public.remarketing_leads where contato_id in (select id from _cts) or conversa_id in (select id from _convs) or oportunidade_id in (select id from _opps);
  delete from public.remarketing_tarefas where contato_id in (select id from _cts) or conversa_id in (select id from _convs);
  delete from public.agendamentos where contato_id in (select id from _cts) or oportunidade_id in (select id from _opps);
  delete from public.cobrancas where contato_id in (select id from _cts) or oportunidade_id in (select id from _opps);
  delete from public.fichas_judiciais where contato_id in (select id from _cts) or conversa_id in (select id from _convs) or oportunidade_id in (select id from _opps);
  delete from public.oportunidade_eventos where oportunidade_id in (select id from _opps);
  delete from public.oportunidade_checklist where oportunidade_id in (select id from _opps);
  delete from public.regua_ativacoes where id in (select id from _ativs);

  -- IA SDR (fase 1.1): eventos primeiro (FK p/ conversas sem cascade), depois as sessões
  delete from public.ia_eventos where conversa_id in (select id from _convs)
    or sessao_id in (select id from public.ia_sessoes where conversa_id in (select id from _convs) or contato_id in (select id from _cts));
  delete from public.ia_sessoes where conversa_id in (select id from _convs) or contato_id in (select id from _cts);

  -- núcleo: mensagens -> oportunidades -> identidades -> conversas -> contato
  delete from public.mensagens where conversa_id in (select id from _convs);
  delete from public.oportunidades where id in (select id from _opps);
  delete from public.contato_identidades where contato_id in (select id from _cts);
  delete from public.conversas where id in (select id from _convs);
  delete from public.contatos where id in (select id from _cts);

  v_depois := jsonb_build_object(
    'mensagens', (select count(*) from public.mensagens where conversa_id in (select id from _convs)),
    'anexos_mensagem', (select count(*) from public.anexos_mensagem where mensagem_id in (select id from _msgs)),
    'bot_conversa_estado', (select count(*) from public.bot_conversa_estado where conversa_id in (select id from _convs) or contato_id in (select id from _cts)),
    'bot_mensagens_saida', (select count(*) from public.bot_mensagens_saida where conversa_id in (select id from _convs)),
    'bot_roteamentos', (select count(*) from public.bot_roteamentos where conversa_id in (select id from _convs) or contato_id in (select id from _cts)),
    'alertas_lead_quente', (select count(*) from public.alertas_lead_quente where conversa_id in (select id from _convs) or contato_id in (select id from _cts)),
    'sla_alertas', (select count(*) from public.sla_alertas where conversa_id in (select id from _convs) or contato_id in (select id from _cts) or oportunidade_id in (select id from _opps)),
    'conversa_atividades', (select count(*) from public.conversa_atividades where conversa_id in (select id from _convs)),
    'canal_janela', (select count(*) from public.canal_janela where contato_id in (select id from _cts)),
    'mensagens_agendadas', (select count(*) from public.mensagens_agendadas where id in (select id from _mags)),
    'regua_envios', (select count(*) from public.regua_envios where ativacao_id in (select id from _ativs) or mensagem_agendada_id in (select id from _mags)),
    'oportunidade_eventos', (select count(*) from public.oportunidade_eventos where oportunidade_id in (select id from _opps)),
    'oportunidade_checklist', (select count(*) from public.oportunidade_checklist where oportunidade_id in (select id from _opps)),
    'oportunidades', (select count(*) from public.oportunidades where id in (select id from _opps)),
    'conversa_unificacao_log', (select count(*) from public.conversa_unificacao_log where principal_id in (select id from _convs) or secundaria_id in (select id from _convs)),
    'contato_merges', (select count(*) from public.contato_merges where sobrevivente_id in (select id from _cts) or absorvido_id in (select id from _cts)),
    'contato_identidades', (select count(*) from public.contato_identidades where contato_id in (select id from _cts)),
    'wa_lid_map', (select count(*) from public.wa_lid_map where telefone_normalizado like '%' || p_sufixo || '%' or jid_telefone like '%' || p_sufixo || '%'),
    'wa_optout', (select count(*) from public.wa_optout where contato_id in (select id from _cts)),
    'disparo_alvos', (select count(*) from public.disparo_alvos where contato_id in (select id from _cts)),
    'disparo_envios', (select count(*) from public.disparo_envios where contato_id in (select id from _cts)),
    'bot_remarketing', (select count(*) from public.bot_remarketing where contato_id in (select id from _cts) or conversa_id in (select id from _convs) or oportunidade_id in (select id from _opps)),
    'script_execucoes', (select count(*) from public.script_execucoes where conversa_id in (select id from _convs)),
    'agendamentos', (select count(*) from public.agendamentos where contato_id in (select id from _cts) or oportunidade_id in (select id from _opps)),
    'cobrancas', (select count(*) from public.cobrancas where contato_id in (select id from _cts) or oportunidade_id in (select id from _opps)),
    'fichas_judiciais', (select count(*) from public.fichas_judiciais where contato_id in (select id from _cts) or conversa_id in (select id from _convs) or oportunidade_id in (select id from _opps)),
    'meta_contato_identidades', (select count(*) from public.meta_contato_identidades where contato_id in (select id from _cts)),
    'regua_ativacoes', (select count(*) from public.regua_ativacoes where id in (select id from _ativs)),
    'relacionamento_bloqueio', (select count(*) from public.relacionamento_bloqueio where contato_id in (select id from _cts)),
    'remarketing_leads', (select count(*) from public.remarketing_leads where contato_id in (select id from _cts) or conversa_id in (select id from _convs) or oportunidade_id in (select id from _opps)),
    'remarketing_tarefas', (select count(*) from public.remarketing_tarefas where contato_id in (select id from _cts) or conversa_id in (select id from _convs)),
    'conversa_higiene_adiamentos', (select count(*) from public.conversa_higiene_adiamentos where conversa_id in (select id from _convs)),
    'ia_sessoes', (select count(*) from public.ia_sessoes where conversa_id in (select id from _convs) or contato_id in (select id from _cts)),
    'ia_eventos', (select count(*) from public.ia_eventos where conversa_id in (select id from _convs) or sessao_id in (select id from public.ia_sessoes where contato_id in (select id from _cts))),
    'conversas', (select count(*) from public.conversas where id in (select id from _convs)),
    'contatos', (select count(*) from public.contatos where id in (select id from _cts))
  );

  return jsonb_build_object('ok', true, 'sufixo', p_sufixo, 'contatos_apagados', v_contatos,
                            'antes', v_antes, 'depois', v_depois,
                            'preservados', jsonb_build_array('audit_log', 'whatsapp_webhook_events'));
end $function$;

revoke all on function public.limpar_contato_teste(text) from public, anon, authenticated;
grant execute on function public.limpar_contato_teste(text) to service_role;

notify pgrst, 'reload schema';
