-- ============================================================================
-- SLA — S1.1: corte de data (ativo_desde). O SLA automático só vale para
-- conversas/oportunidades criadas/entradas A PARTIR de sla_config.ativo_desde.
-- ativo_desde NULL = avaliar tudo (backlog). Carimba now() para a org agora.
-- NÃO liga cron (S2), não mexe em front nem no bot. Evita avalanche de casos antigos.
-- ============================================================================

alter table public.sla_config
  add column if not exists ativo_desde timestamptz;

-- Recria o motor com os 2 filtros de corte (conversas por criado_em; oportunidades por entrada_em).
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
  left join public.bot_conversa_estado e on e.conversa_id = c.id
  left join public.sla_config sc on sc.organizacao_id = c.organizacao_id
  left join lateral (select max(coalesce(m.recebida_em,m.criado_em)) as ult_in
                     from public.mensagens m where m.conversa_id=c.id and m.direcao='entrada') ui on true
  left join lateral (select max(coalesce(m.enviada_em,m.criado_em)) as ult_humano
                     from public.mensagens m where m.conversa_id=c.id and m.direcao='saida'
                       and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
                            or (m.autor_id is null and m.origem='telefone'))) uh on true
  where c.arquivada_em is null and c.status in ('aberta','em_atendimento','pendente')
    and coalesce(sc.ativo,true) and (p_org is null or c.organizacao_id = p_org)
    and (sc.ativo_desde is null or c.criado_em >= sc.ativo_desde);   -- S1.1: corte de data (conversas)

  create temp table _opp on commit drop as
  select o.id, o.organizacao_id, o.contato_id, o.responsavel_id, o.entrada_em, o.movimentado_em,
         coalesce(sc.kanban_sem_avanco_horas,24) as th_kanban,
         coalesce(sc.prazo_risco_horas,40)       as th_risco,
         coalesce(sc.prazo_fechamento_horas,48)  as th_prazo
  from public.oportunidades o
  left join public.sla_config sc on sc.organizacao_id = o.organizacao_id
  where o.status = 'em_andamento' and coalesce(sc.ativo,true) and (p_org is null or o.organizacao_id = p_org)
    and (sc.ativo_desde is null or o.entrada_em >= sc.ativo_desde);  -- S1.1: corte de data (oportunidades)

  create temp table _vig (
    organizacao_id uuid, tipo text, severidade text, conversa_id uuid, oportunidade_id uuid,
    contato_id uuid, responsavel_id uuid, titulo text, detalhe text, vence_em timestamptz, dedup_key text
  ) on commit drop;

  -- Regra 1: lead novo sem resposta humana (>5min) — leve
  insert into _vig select organizacao_id,'atendimento_sem_resposta','leve',id,null,contato_id,null,
    '⚠️ Lead novo sem resposta há '||floor(extract(epoch from (now()-ult_in))/60)::int||' min.',
    'Lead novo aguardando a primeira resposta humana.', null,'atendimento_sem_resposta:'||id
  from _conv where atendente_id is null and aguardando and not lead_quente
    and bot_etapa is distinct from 'concluido' and ult_in < now() - make_interval(mins => th_novo);

  -- Regra 5: em atendimento sem avanço (>2h) — amarelo (mesmo tipo, alvo exclusivo por ter atendente)
  insert into _vig select organizacao_id,'atendimento_sem_resposta','amarelo',id,null,contato_id,atendente_id,
    '⚠️ Atendimento sem avanço há '||floor(extract(epoch from (now()-ult_in))/3600)::int||' h.',
    'Cliente em atendimento aguardando retorno.', null,'atendimento_sem_resposta:'||id
  from _conv where atendente_id is not null and aguardando and ult_in < now() - make_interval(hours => th_atend_h);

  -- Regra 2: qualificado pelo bot aguardando atendente (>10min) — amarelo
  insert into _vig select organizacao_id,'cliente_qualificado_aguardando_atendimento','amarelo',id,null,contato_id,null,
    '🟡 Lead qualificado aguardando atendimento há '||floor(extract(epoch from (now()-concluido_em))/60)::int||' min.',
    'Bot concluiu a triagem; nenhum humano assumiu.', null,'cliente_qualificado_aguardando_atendimento:'||id
  from _conv where bot_etapa='concluido' and atendente_id is null and concluido_em is not null
    and concluido_em < now() - make_interval(mins => th_qual);

  -- Regra 3: lead quente sem resposta (>15min) — vermelho
  insert into _vig select organizacao_id,'lead_quente_aguardando','vermelho',id,null,contato_id,null,
    '🚨 Lead quente parado há '||floor(extract(epoch from (now()-ult_in))/60)::int||' min. Chamar agora.',
    'Lead quente sem resposta humana.', null,'lead_quente_aguardando:'||id
  from _conv where lead_quente and atendente_id is null and aguardando and ult_in < now() - make_interval(mins => th_quente);

  -- Regra 4: áudio recebido durante o bot — imediato
  insert into _vig select organizacao_id,'audio_recebido_precisa_humano','imediato',id,null,contato_id,atendente_id,
    '🎧 Cliente enviou áudio durante a triagem. Atendimento humano necessário.',
    'Cliente mandou áudio; o bot pausou e pediu texto.', null,'audio_recebido_precisa_humano:'||id
  from _conv where precisa_humano and precisa_humano_motivo = 'audio';

  -- Regra 6: Kanban sem movimento (>24h) — vermelho
  insert into _vig select organizacao_id,'parado_ha_muito_tempo','vermelho',null,id,contato_id,responsavel_id,
    '⏳ Oportunidade parada há '||floor(extract(epoch from (now()-movimentado_em))/3600)::int||' h no Kanban.',
    'Card sem avanço de coluna.', null,'parado_ha_muito_tempo:'||id
  from _opp where movimentado_em < now() - make_interval(hours => th_kanban);

  -- Regra 7a: prazo de 2 dias em risco (>=40h e <48h) — vermelho
  insert into _vig select organizacao_id,'prazo_2_dias_em_risco','vermelho',null,id,contato_id,responsavel_id,
    '⏰ Cliente perto de 2 dias sem fechamento.',
    'Entrada há '||floor(extract(epoch from (now()-entrada_em))/3600)::int||' h; prazo de 48h se aproximando.',
    entrada_em + make_interval(hours => th_prazo),'prazo_2_dias_em_risco:'||id
  from _opp where entrada_em <= now() - make_interval(hours => th_risco)
             and entrada_em >  now() - make_interval(hours => th_prazo);

  -- Regra 7b: prazo de 2 dias estourado (>=48h) — crítico
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

-- Carimba a ativação AGORA para a org (corte inicial). Re-carimbado no S2 na ativação do cron.
update public.sla_config set ativo_desde = now()
  where organizacao_id = 'de300000-0000-4000-8000-000000000001';

notify pgrst, 'reload schema';
