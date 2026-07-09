-- ============================================================================
-- SLA — S4.5: limpar conversas.precisa_humano quando um HUMANO assume/responde,
-- resolver os alertas da conversa, e alinhar o "tem humano" do sla_avaliar para
-- considerar contatos.responsavel_id (fluxo de assumir grava aí, não em atendente_id).
-- Sem tocar layout, bot-runner, webhook/B3, e-mail/push. Regras SLA: só o sinal "tem humano".
-- ============================================================================

-- ===== 1) contato assumido (responsavel_id null -> not null) =====
create or replace function public.sla_contato_assumido()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_conv int; v_alertas int;
begin
  if not (new.responsavel_id is not null and old.responsavel_id is null) then return new; end if;

  update public.conversas set precisa_humano = false, precisa_humano_motivo = null, precisa_humano_em = null
    where contato_id = new.id and arquivada_em is null
      and status in ('aberta','em_atendimento','pendente') and precisa_humano;
  get diagnostics v_conv = row_count;

  update public.sla_alertas a set resolvido_em = now(), resolvido_por = coalesce(auth.uid(), new.responsavel_id),
         resolucao = 'humano', atualizado_em = now()
    where a.resolvido_em is null
      and a.conversa_id in (select id from public.conversas where contato_id = new.id);
  get diagnostics v_alertas = row_count;

  if v_conv > 0 or v_alertas > 0 then
    insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
    values (coalesce(auth.uid(), new.responsavel_id), 'precisa_humano_limpo', 'contatos', new.id,
            jsonb_build_object('motivo','atendente_assumiu','conversas',v_conv,'alertas_resolvidos',v_alertas), new.organizacao_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_sla_contato_assumido on public.contatos;
create trigger trg_sla_contato_assumido after update on public.contatos
  for each row execute function public.sla_contato_assumido();

-- ===== 2) resposta humana (mensagens: saída humana, não bot/sistema/nota) =====
create or replace function public.sla_mensagem_humano()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_conv int; v_alertas int; v_org uuid;
begin
  if not (new.direcao = 'saida' and new.autor_id is not null
          and new.tipo not in ('sistema','nota_interna') and coalesce(new.origem,'') <> 'bot') then
    return new;
  end if;
  select organizacao_id into v_org from public.conversas where id = new.conversa_id;

  update public.conversas set precisa_humano = false, precisa_humano_motivo = null, precisa_humano_em = null
    where id = new.conversa_id and precisa_humano;
  get diagnostics v_conv = row_count;

  update public.sla_alertas a set resolvido_em = now(), resolvido_por = new.autor_id, resolucao = 'humano', atualizado_em = now()
    where a.resolvido_em is null and a.conversa_id = new.conversa_id;
  get diagnostics v_alertas = row_count;

  if v_conv > 0 or v_alertas > 0 then
    insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
    values (new.autor_id, 'precisa_humano_limpo', 'conversas', new.conversa_id,
            jsonb_build_object('motivo','atendente_respondeu','conversas',v_conv,'alertas_resolvidos',v_alertas), v_org);
  end if;
  return new;
end $$;
drop trigger if exists trg_sla_mensagem_humano on public.mensagens;
create trigger trg_sla_mensagem_humano after insert on public.mensagens
  for each row execute function public.sla_mensagem_humano();

-- ===== 3) robustez futura: conversas.atendente_id null -> not null (BEFORE, sem recursão) =====
create or replace function public.sla_conversa_atendente()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_alertas int;
begin
  if not (new.atendente_id is not null and old.atendente_id is null) then return new; end if;
  if new.precisa_humano then
    new.precisa_humano := false; new.precisa_humano_motivo := null; new.precisa_humano_em := null;
  end if;
  update public.sla_alertas a set resolvido_em = now(), resolvido_por = new.atendente_id, resolucao = 'humano', atualizado_em = now()
    where a.resolvido_em is null and a.conversa_id = new.id;
  get diagnostics v_alertas = row_count;
  if v_alertas > 0 then
    insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
    values (new.atendente_id, 'precisa_humano_limpo', 'conversas', new.id,
            jsonb_build_object('motivo','atendente_atribuido','alertas_resolvidos',v_alertas), new.organizacao_id);
  end if;
  return new;
end $$;
drop trigger if exists trg_sla_conversa_atendente on public.conversas;
create trigger trg_sla_conversa_atendente before update on public.conversas
  for each row execute function public.sla_conversa_atendente();

-- ===== 4) sla_avaliar: "tem humano" = atendente_id IS NOT NULL OR responsavel_id IS NOT NULL =====
create or replace function public.sla_avaliar(p_org uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ativos int; v_resolvidos int; v_criados int;
begin
  drop table if exists _conv; drop table if exists _opp; drop table if exists _vig;

  create temp table _conv on commit drop as
  select c.id, c.organizacao_id, c.contato_id, c.atendente_id, ct.responsavel_id, c.status, c.criado_em,
         (c.atendente_id is not null or ct.responsavel_id is not null) as tem_humano,
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
  left join public.contatos ct on ct.id = c.contato_id
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

  -- Regra 1: lead novo sem resposta (>5min) — leve  (sem humano)
  insert into _vig select organizacao_id,'atendimento_sem_resposta','leve',id,null,contato_id,null,
    '⚠️ Lead novo sem resposta há '||floor(extract(epoch from (now()-ult_in))/60)::int||' min.',
    'Lead novo aguardando a primeira resposta humana.', null,'atendimento_sem_resposta:'||id
  from _conv where not tem_humano and aguardando and not lead_quente
    and bot_etapa is distinct from 'concluido' and ult_in < now() - make_interval(mins => th_novo);

  -- Regra 5: em atendimento sem avanço (>2h) — amarelo  (tem humano)
  insert into _vig select organizacao_id,'atendimento_sem_resposta','amarelo',id,null,contato_id,coalesce(atendente_id,responsavel_id),
    '⚠️ Atendimento sem avanço há '||floor(extract(epoch from (now()-ult_in))/3600)::int||' h.',
    'Cliente em atendimento aguardando retorno.', null,'atendimento_sem_resposta:'||id
  from _conv where tem_humano and aguardando and ult_in < now() - make_interval(hours => th_atend_h);

  -- Regra 2: qualificado aguardando atendente (>10min) — amarelo  (sem humano)
  insert into _vig select organizacao_id,'cliente_qualificado_aguardando_atendimento','amarelo',id,null,contato_id,null,
    '🟡 Lead qualificado aguardando atendimento há '||floor(extract(epoch from (now()-concluido_em))/60)::int||' min.',
    'Bot concluiu a triagem; nenhum humano assumiu.', null,'cliente_qualificado_aguardando_atendimento:'||id
  from _conv where bot_etapa='concluido' and not tem_humano and concluido_em is not null
    and concluido_em < now() - make_interval(mins => th_qual);

  -- Regra 3: lead quente sem resposta (>15min) — vermelho  (sem humano)
  insert into _vig select organizacao_id,'lead_quente_aguardando','vermelho',id,null,contato_id,null,
    '🚨 Lead quente parado há '||floor(extract(epoch from (now()-ult_in))/60)::int||' min. Chamar agora.',
    'Lead quente sem resposta humana.', null,'lead_quente_aguardando:'||id
  from _conv where lead_quente and not tem_humano and aguardando and ult_in < now() - make_interval(mins => th_quente);

  -- Regra 4: áudio recebido durante o bot — imediato
  insert into _vig select organizacao_id,'audio_recebido_precisa_humano','imediato',id,null,contato_id,coalesce(atendente_id,responsavel_id),
    '🎧 Cliente enviou áudio durante a triagem. Atendimento humano necessário.',
    'Cliente mandou áudio; o bot pausou e pediu texto.', null,'audio_recebido_precisa_humano:'||id
  from _conv where precisa_humano and precisa_humano_motivo = 'audio_recebido_bot';

  -- Regra 6: Kanban sem movimento (>24h) — vermelho
  insert into _vig select organizacao_id,'parado_ha_muito_tempo','vermelho',null,id,contato_id,responsavel_id,
    '⏳ Oportunidade parada há '||floor(extract(epoch from (now()-movimentado_em))/3600)::int||' h no Kanban.',
    'Card sem avanço de coluna.', null,'parado_ha_muito_tempo:'||id
  from _opp where movimentado_em < now() - make_interval(hours => th_kanban);

  -- Regra 7a: prazo em risco (40-48h) — vermelho
  insert into _vig select organizacao_id,'prazo_2_dias_em_risco','vermelho',null,id,contato_id,responsavel_id,
    '⏰ Cliente perto de 2 dias sem fechamento.',
    'Entrada há '||floor(extract(epoch from (now()-entrada_em))/3600)::int||' h; prazo de 48h se aproximando.',
    entrada_em + make_interval(hours => th_prazo),'prazo_2_dias_em_risco:'||id
  from _opp where entrada_em <= now() - make_interval(hours => th_risco)
             and entrada_em >  now() - make_interval(hours => th_prazo);

  -- Regra 7b: prazo estourado (>=48h) — crítico
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

notify pgrst, 'reload schema';
