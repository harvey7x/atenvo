-- ============================================================================
-- SLA — S3: o bot alimenta o SLA. Áudio => precisa_humano + alerta imediato;
-- conclusão => precisa_humano (qualificado); humano assume => limpa precisa_humano.
-- Novo sla_registrar (upsert idempotente, mesmo dedup do cron). Não liga B3/webhook,
-- não envia real, não mexe em front/e-mail/push/health/GlobalWhatsAppAlert/Relatórios/
-- Ficha/Cobranças/distribuição. dry_run segue padrão no bot-runner.
-- ============================================================================

-- ===== 1) sla_registrar: cria/atualiza 1 alerta idempotente (mesmo dedup do sla_avaliar) =====
create or replace function public.sla_registrar(
  p_org uuid, p_tipo text, p_severidade text,
  p_conversa uuid default null, p_oportunidade uuid default null, p_contato uuid default null,
  p_responsavel uuid default null, p_titulo text default null, p_detalhe text default null,
  p_vence timestamptz default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_dedup text; v_id uuid;
begin
  v_dedup := p_tipo || ':' || coalesce(p_conversa::text, p_oportunidade::text, p_contato::text);
  insert into public.sla_alertas
    (organizacao_id, tipo, severidade, conversa_id, oportunidade_id, contato_id, responsavel_id, titulo, detalhe, vence_em, dedup_key)
  values (p_org, p_tipo, p_severidade, p_conversa, p_oportunidade, p_contato, p_responsavel,
          coalesce(p_titulo, p_tipo), p_detalhe, p_vence, v_dedup)
  on conflict (organizacao_id, dedup_key) where resolvido_em is null do update set
    severidade = excluded.severidade, titulo = excluded.titulo, detalhe = excluded.detalhe,
    responsavel_id = excluded.responsavel_id, vence_em = excluded.vence_em, atualizado_em = now()
  returning id into v_id;
  return v_id;
end $$;

-- ===== 2) bot_pausar: audio => precisa_humano + alerta imediato; humano => limpa precisa_humano =====
create or replace function public.bot_pausar(p_conversa uuid, p_motivo text,
  p_resumo_texto text default null, p_resumo_json jsonb default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
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
  if p_resumo_texto is not null then
    insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, conteudo, autor_id, origem, status)
    values (c.organizacao_id, p_conversa, 'saida', 'nota_interna', p_resumo_texto, null, 'bot', 'enviada');
  end if;

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
end $$;

-- ===== 3) bot_concluir: marca precisa_humano do qualificado (alerta fica p/ o cron aos 10min) =====
create or replace function public.bot_concluir(p_conversa uuid, p_resumo_texto text, p_resumo_json jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c record;
begin
  select organizacao_id into c from public.conversas where id = p_conversa;
  update public.bot_conversa_estado set
    etapa = 'concluido', concluido_em = now(), resumo = p_resumo_json, ultima_atividade_em = now()
    where conversa_id = p_conversa;
  update public.conversas set precisa_humano = true, precisa_humano_motivo = 'cliente_qualificado_bot', precisa_humano_em = now()
    where id = p_conversa;
  if p_resumo_texto is not null then
    insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, conteudo, autor_id, origem, status)
    values (c.organizacao_id, p_conversa, 'saida', 'nota_interna', p_resumo_texto, null, 'bot', 'enviada');
  end if;
  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (null, 'bot_concluido', 'conversas', p_conversa, '{}'::jsonb, c.organizacao_id);
end $$;

-- ===== 4) sla_avaliar: alinhar regra 4 ao novo motivo ('audio_recebido_bot') =====
--   (recriação da função S2 com a única mudança na regra 4; mantém inner join opt-in e corte de data)
create or replace function public.sla_avaliar(p_org uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ativos int; v_resolvidos int; v_criados int;
begin
  drop table if exists _conv; drop table if exists _opp; drop table if exists _vig;

  create temp table _conv on commit drop as
  select c.id, c.organizacao_id, c.contato_id, c.atendente_id, c.status, c.criado_em,
         e.etapa as bot_etapa, coalesce(e.lead_quente,false) as lead_quente, e.concluido_em,
         coalesce(c.precisa_humano,false) as precisa_humano, c.precisa_humano_motivo,
         ui.ult_in, uh.ult_humano,
         (ui.ult_in is not null and (uh.ult_humano is null or uh.ult_humano < ui.ult_in)) as aguardando,
         coalesce(sc.lead_novo_sem_resposta_min,5)   as th_novo,
         coalesce(sc.qualificado_aguardando_min,10)  as th_qual,
         coalesce(sc.lead_quente_sem_resposta_min,15) as th_quente,
         coalesce(sc.atendimento_sem_avanco_horas,2) as th_atend_h
  from public.conversas c
  join public.sla_config sc on sc.organizacao_id = c.organizacao_id and sc.ativo
  left join public.bot_conversa_estado e on e.conversa_id = c.id
  left join lateral (select max(coalesce(m.recebida_em,m.criado_em)) as ult_in
                     from public.mensagens m where m.conversa_id=c.id and m.direcao='entrada') ui on true
  left join lateral (select max(coalesce(m.enviada_em,m.criado_em)) as ult_humano
                     from public.mensagens m where m.conversa_id=c.id and m.direcao='saida'
                       and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
                            or (m.autor_id is null and m.origem='telefone'))) uh on true
  where c.arquivada_em is null and c.status in ('aberta','em_atendimento','pendente')
    and (p_org is null or c.organizacao_id = p_org)
    and (sc.ativo_desde is null or c.criado_em >= sc.ativo_desde);

  create temp table _opp on commit drop as
  select o.id, o.organizacao_id, o.contato_id, o.responsavel_id, o.entrada_em, o.movimentado_em,
         coalesce(sc.kanban_sem_avanco_horas,24) as th_kanban,
         coalesce(sc.prazo_risco_horas,40)       as th_risco,
         coalesce(sc.prazo_fechamento_horas,48)  as th_prazo
  from public.oportunidades o
  join public.sla_config sc on sc.organizacao_id = o.organizacao_id and sc.ativo
  where o.status = 'em_andamento' and (p_org is null or o.organizacao_id = p_org)
    and (sc.ativo_desde is null or o.entrada_em >= sc.ativo_desde);

  create temp table _vig (
    organizacao_id uuid, tipo text, severidade text, conversa_id uuid, oportunidade_id uuid,
    contato_id uuid, responsavel_id uuid, titulo text, detalhe text, vence_em timestamptz, dedup_key text
  ) on commit drop;

  insert into _vig select organizacao_id,'atendimento_sem_resposta','leve',id,null,contato_id,null,
    '⚠️ Lead novo sem resposta há '||floor(extract(epoch from (now()-ult_in))/60)::int||' min.',
    'Lead novo aguardando a primeira resposta humana.', null,'atendimento_sem_resposta:'||id
  from _conv where atendente_id is null and aguardando and not lead_quente
    and bot_etapa is distinct from 'concluido' and ult_in < now() - make_interval(mins => th_novo);

  insert into _vig select organizacao_id,'atendimento_sem_resposta','amarelo',id,null,contato_id,atendente_id,
    '⚠️ Atendimento sem avanço há '||floor(extract(epoch from (now()-ult_in))/3600)::int||' h.',
    'Cliente em atendimento aguardando retorno.', null,'atendimento_sem_resposta:'||id
  from _conv where atendente_id is not null and aguardando and ult_in < now() - make_interval(hours => th_atend_h);

  insert into _vig select organizacao_id,'cliente_qualificado_aguardando_atendimento','amarelo',id,null,contato_id,null,
    '🟡 Lead qualificado aguardando atendimento há '||floor(extract(epoch from (now()-concluido_em))/60)::int||' min.',
    'Bot concluiu a triagem; nenhum humano assumiu.', null,'cliente_qualificado_aguardando_atendimento:'||id
  from _conv where bot_etapa='concluido' and atendente_id is null and concluido_em is not null
    and concluido_em < now() - make_interval(mins => th_qual);

  insert into _vig select organizacao_id,'lead_quente_aguardando','vermelho',id,null,contato_id,null,
    '🚨 Lead quente parado há '||floor(extract(epoch from (now()-ult_in))/60)::int||' min. Chamar agora.',
    'Lead quente sem resposta humana.', null,'lead_quente_aguardando:'||id
  from _conv where lead_quente and atendente_id is null and aguardando and ult_in < now() - make_interval(mins => th_quente);

  -- Regra 4 (S3): motivo alinhado ao bot ('audio_recebido_bot')
  insert into _vig select organizacao_id,'audio_recebido_precisa_humano','imediato',id,null,contato_id,atendente_id,
    '🎧 Cliente enviou áudio durante a triagem. Atendimento humano necessário.',
    'Cliente mandou áudio; o bot pausou e pediu texto.', null,'audio_recebido_precisa_humano:'||id
  from _conv where precisa_humano and precisa_humano_motivo = 'audio_recebido_bot';

  insert into _vig select organizacao_id,'parado_ha_muito_tempo','vermelho',null,id,contato_id,responsavel_id,
    '⏳ Oportunidade parada há '||floor(extract(epoch from (now()-movimentado_em))/3600)::int||' h no Kanban.',
    'Card sem avanço de coluna.', null,'parado_ha_muito_tempo:'||id
  from _opp where movimentado_em < now() - make_interval(hours => th_kanban);

  insert into _vig select organizacao_id,'prazo_2_dias_em_risco','vermelho',null,id,contato_id,responsavel_id,
    '⏰ Cliente perto de 2 dias sem fechamento.',
    'Entrada há '||floor(extract(epoch from (now()-entrada_em))/3600)::int||' h; prazo de 48h se aproximando.',
    entrada_em + make_interval(hours => th_prazo),'prazo_2_dias_em_risco:'||id
  from _opp where entrada_em <= now() - make_interval(hours => th_risco)
             and entrada_em >  now() - make_interval(hours => th_prazo);

  insert into _vig select organizacao_id,'prazo_2_dias_estourado','critico',null,id,contato_id,responsavel_id,
    '🚨 Cliente há 2 dias sem fechamento. Prioridade máxima.',
    'Entrada há '||floor(extract(epoch from (now()-entrada_em))/3600)::int||' h (>48h).',
    entrada_em + make_interval(hours => th_prazo),'prazo_2_dias_estourado:'||id
  from _opp where entrada_em <= now() - make_interval(hours => th_prazo);

  insert into public.sla_alertas
    (organizacao_id, tipo, severidade, conversa_id, oportunidade_id, contato_id, responsavel_id, titulo, detalhe, vence_em, dedup_key)
  select distinct on (organizacao_id, dedup_key)
    organizacao_id, tipo, severidade, conversa_id, oportunidade_id, contato_id, responsavel_id, titulo, detalhe, vence_em, dedup_key
  from _vig
  order by organizacao_id, dedup_key,
    case severidade when 'imediato' then 5 when 'critico' then 4 when 'vermelho' then 3 when 'amarelo' then 2 else 1 end desc
  on conflict (organizacao_id, dedup_key) where resolvido_em is null do update set
    severidade = excluded.severidade, titulo = excluded.titulo, detalhe = excluded.detalhe,
    responsavel_id = excluded.responsavel_id, vence_em = excluded.vence_em, atualizado_em = now();
  get diagnostics v_criados = row_count;

  update public.sla_alertas a set resolvido_em = now(), resolucao = 'auto', atualizado_em = now()
  where a.resolvido_em is null and (p_org is null or a.organizacao_id = p_org)
    and not exists (select 1 from _vig v where v.organizacao_id = a.organizacao_id and v.dedup_key = a.dedup_key);
  get diagnostics v_resolvidos = row_count;

  select count(*) into v_ativos from public.sla_alertas
    where resolvido_em is null and (p_org is null or organizacao_id = p_org);

  return jsonb_build_object('ativos', v_ativos, 'upsertados', v_criados, 'auto_resolvidos', v_resolvidos);
end $$;

-- ===== 5) grants da nova RPC =====
revoke all on function public.sla_registrar(uuid, text, text, uuid, uuid, uuid, uuid, text, text, timestamptz) from public, anon;
grant execute on function public.sla_registrar(uuid, text, text, uuid, uuid, uuid, uuid, text, text, timestamptz) to authenticated, service_role;

-- ===== 6) copy de áudio (versão completa aprovada) para LUIZA e ANDRIUS =====
update public.bot_canal_config bcc
  set mensagens = jsonb_set(coalesce(bcc.mensagens,'{}'::jsonb), '{audio}',
    to_jsonb('Recebi seu áudio. Para não atrasar sua análise, me manda essa informação por escrito, por favor. Assim eu já deixo tudo certo para o especialista verificar seu caso e te orientar ainda hoje.'::text))
  from public.canais c
  where c.id = bcc.canal_id and bcc.organizacao_id = 'de300000-0000-4000-8000-000000000001'
    and c.nome_interno in ('LUIZA','ANDRIUS');

notify pgrst, 'reload schema';
