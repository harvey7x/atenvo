-- 2026-10-20 — SLA: parar de reescrever todos os alertas ativos a cada minuto
--              + ler as mensagens de cada conversa UMA vez só (passo 2 do plano de lentidão).
--
-- BASE: pg_get_functiondef VIVO de public.sla_avaliar(uuid), lido em produção em 2026-10-20 ~21:05 UTC:
--   md5(pg_get_functiondef) = 074677ad531f1a5d6d5bdc12ed525cda (9.429 chars)
--   md5(prosrc)             = aa31909ca35fc69120e29a3ae50e0509 (9.237 chars)
--   NÃO é a cópia do repo (20260801120000_janela_guardia.sql): a viva é a mesma lógica sem os
--   comentários "Regra N". Antes de aplicar, conferir que o md5 vivo AINDA é 074677ad... — se mudou,
--   NÃO aplicar: refazer este arquivo a partir da nova versão viva.
--   Depois de aplicar, o esperado é:
--   md5(pg_get_functiondef) = fbf9177f1a011a302fa6240d9c3accf4 · md5(prosrc) = 072fbe531be2dcfcd9d75df6469a6ecb
--
-- SINTOMA: sla_alertas = 99,3% de todos os UPDATEs do banco (306 M desde 21/09) e o
--   sla_avaliar_tick gerou ~184 GB dos 217 GB de WAL (4,7 MB por tick). O Realtime decodifica
--   esse WAL inteiro (realtime.list_changes ~1.057 s/dia), mesmo com sla_alertas FORA da publication.
--
-- CAUSA: o INSERT ... ON CONFLICT DO UPDATE não tinha WHERE: todo alerta ativo (~9,7 mil) era
--   reescrito a cada minuto só pra avançar atualizado_em (+ gatilho trg_sla_alertas_upd por linha).
--
-- MUDANÇAS (só estas duas; o resto do corpo é byte-idêntico à versão viva):
--   (1) Upsert só do que é NOVO ou MUDOU, comparando TODAS as colunas do SET
--       (severidade, titulo, detalhe, responsavel_id, vence_em):
--       a) NOT EXISTS no SELECT de origem: alerta ativo idêntico nem entra no INSERT. Necessário
--          porque o ON CONFLICT DO UPDATE TRAVA a linha conflitante (heap lock + WAL + página suja)
--          mesmo quando o WHERE do DO UPDATE dá falso — só a guarda deixaria ~9,7 mil locks/min;
--       b) WHERE ... IS DISTINCT FROM no DO UPDATE: mesma guarda no árbitro do conflito (rede pra
--          corrida com sla_registrar/bot_pausar).
--   (2) _conv: as duas LATERAL (ult_in / ult_humano) viram UMA, com FILTER nos agregados.
--
-- VALIDADO EM PRODUÇÃO, SÓ LEITURA (transação READ ONLY), em 2026-10-20:
--   - _conv antigo × novo, EXCEPT ALL nos dois sentidos: 0 e 0 linhas (4.527 linhas cada;
--     2.473 aguardando nos dois). Buffers 284.515 → 155.883 (−128.632); 298 → 232 ms.
--   - Emulação do _vig + comparação com sla_alertas: no instante do último tick, 9.755 de 9.755
--     ativos idênticos (prova que a emulação reproduz a função); no tick seguinte (t0+60 s) só 152
--     linhas mudariam de fato (95 título, 57 detalhe; 0 severidade/responsável/vence_em) — hoje são
--     9.755 reescritas por minuto (−98,4%).
--   - Corpo novo compila (DO em transação read-only falha só no 1º DROP, não em sintaxe) e o
--     INSERT novo planeja com "Conflict Filter" nas 5 colunas (EXPLAIN sem ANALYZE).
--   - Pré-filtro NOT EXISTS: 9.757 sondagens em uq_sla_alerta_ativo, ~39 ms e ~43 mil buffers (hit).
--
-- EFEITOS COLATERAIS (conferidos):
--   - atualizado_em deixa de avançar em alerta inalterado. Ninguém lê esse campo: sla_alertas_ativos
--     não o devolve (ordena por severidade/criado_em) e o front só lê esse RPC (src/data/sla.ts:24).
--     As demais funções (sla_mensagem_humano, sla_conversa_atendente, sla_contato_assumido) só
--     ESCREVEM atualizado_em ao resolver; merge_contatos só mexe em contato_id.
--   - 'upsertados' no retorno do cron passa a contar só inseridos + alterados (é só log).
--   - contato_id continua fora do SET (como sempre foi); tipo/conversa_id/oportunidade_id são
--     determinados pela dedup_key.
--   - ACL/owner preservados pelo CREATE OR REPLACE (postgres, authenticated, service_role: EXECUTE).
--
-- NÃO MEXE em sla_registrar (RETURNING id INTO v_id viraria NULL para o bot_pausar com a guarda),
--   nem em sla_avaliar_tick, no lock 42917001, na frequência do cron ou na publication.
--
-- APLICAÇÃO: supabase db query --linked -f <este arquivo> (o MCP de SQL está negado). Roda bem dentro
--   de transação (db push também serve). Rollback = CREATE OR REPLACE com o pg_get_functiondef salvo
--   antes de aplicar (ver aplicar-banco.md).

CREATE OR REPLACE FUNCTION public.sla_avaliar(p_org uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_ativos int; v_resolvidos int; v_criados int;
begin
  drop table if exists _conv; drop table if exists _opp; drop table if exists _vig;

  create temp table _conv on commit drop as
  select c.id, c.organizacao_id, c.contato_id, c.atendente_id, ct.responsavel_id, c.status, c.criado_em,
         (c.atendente_id is not null or ct.responsavel_id is not null) as tem_humano,
         e.etapa as bot_etapa, coalesce(e.lead_quente,false) as lead_quente, e.concluido_em,
         coalesce(c.precisa_humano,false) as precisa_humano, c.precisa_humano_motivo,
         um.ult_in, um.ult_humano,
         (um.ult_in is not null and (um.ult_humano is null or um.ult_humano < um.ult_in)) as aguardando,
         coalesce(sc.lead_novo_sem_resposta_min,5)   as th_novo,
         coalesce(sc.qualificado_aguardando_min,10)  as th_qual,
         coalesce(sc.lead_quente_sem_resposta_min,15) as th_quente,
         coalesce(sc.atendimento_sem_avanco_horas,2) as th_atend_h
  from public.conversas c
  join public.sla_config sc on sc.organizacao_id = c.organizacao_id and sc.ativo
  left join public.contatos ct on ct.id = c.contato_id
  left join public.bot_conversa_estado e on e.conversa_id = c.id
  -- [20261020200000] UMA passada pelas mensagens da conversa (antes: 2 LATERAL, uma por direção).
  -- Mesmos filtros de antes, agora como FILTER do agregado; sem linha casando o max dá NULL, igual.
  left join lateral (select max(coalesce(m.recebida_em,m.criado_em))
                              filter (where m.direcao='entrada') as ult_in,
                            max(coalesce(m.enviada_em,m.criado_em))
                              filter (where m.direcao='saida'
                                        and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
                                             or (m.autor_id is null and m.origem='telefone'))) as ult_humano
                     from public.mensagens m where m.conversa_id=c.id) um on true
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
  from _conv where not tem_humano and aguardando and not lead_quente
    and bot_etapa is distinct from 'concluido' and ult_in < now() - make_interval(mins => th_novo);

  insert into _vig select organizacao_id,'atendimento_sem_resposta','amarelo',id,null,contato_id,coalesce(atendente_id,responsavel_id),
    '⚠️ Atendimento sem avanço há '||floor(extract(epoch from (now()-ult_in))/3600)::int||' h.',
    'Cliente em atendimento aguardando retorno.', null,'atendimento_sem_resposta:'||id
  from _conv where tem_humano and aguardando and ult_in < now() - make_interval(hours => th_atend_h);

  insert into _vig select organizacao_id,'cliente_qualificado_aguardando_atendimento','amarelo',id,null,contato_id,null,
    '🟡 Lead qualificado aguardando atendimento há '||floor(extract(epoch from (now()-concluido_em))/60)::int||' min.',
    'Bot concluiu a triagem; nenhum humano assumiu.', null,'cliente_qualificado_aguardando_atendimento:'||id
  from _conv where bot_etapa='concluido' and not tem_humano and concluido_em is not null
    and concluido_em < now() - make_interval(mins => th_qual);

  insert into _vig select organizacao_id,'lead_quente_aguardando','vermelho',id,null,contato_id,null,
    '🚨 Lead quente parado há '||floor(extract(epoch from (now()-ult_in))/60)::int||' min. Chamar agora.',
    'Lead quente sem resposta humana.', null,'lead_quente_aguardando:'||id
  from _conv where lead_quente and not tem_humano and aguardando and ult_in < now() - make_interval(mins => th_quente);

  insert into _vig select organizacao_id,'audio_recebido_precisa_humano','imediato',id,null,contato_id,coalesce(atendente_id,responsavel_id),
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

  -- Regra 8: janela de 24h da Cloud API perto de expirar, em conversa QUENTE.
  insert into _vig
  select c.organizacao_id, 'janela_expirando',
    case when cj.ultima_entrada_em <= now() - interval '20 hours' then 'vermelho' else 'amarelo' end,
    c.id, null, c.contato_id, coalesce(c.atendente_id, ct.responsavel_id),
    '⏳ Janela de 24h fecha em ~'||greatest(0, floor(extract(epoch from (cj.ultima_entrada_em + interval '24 hours' - now()))/3600))::int
      ||'h — responda pra manter a conversa aberta sem template pago.',
    'Sem resposta do cliente há '||floor(extract(epoch from (now()-cj.ultima_entrada_em))/3600)::int
      ||'h. Depois de 24h só template aprovado (Meta) volta a alcançar este número.',
    cj.ultima_entrada_em + interval '24 hours', 'janela_expirando:'||c.id
  from public.conversas c
  join public.sla_config sc on sc.organizacao_id = c.organizacao_id and sc.ativo
  join public.canais ca on ca.id = c.canal_id and ca.transporte = 'cloud_api'
  join public.canal_janela cj on cj.canal_id = c.canal_id and cj.contato_id = c.contato_id
  left join public.contatos ct on ct.id = c.contato_id
  left join public.bot_conversa_estado e on e.conversa_id = c.id
  where c.arquivada_em is null and c.status in ('aberta','em_atendimento','pendente')
    and (c.atendente_id is not null or ct.responsavel_id is not null or coalesce(e.lead_quente, false))
    and cj.ultima_entrada_em <= now() - interval '16 hours'
    and cj.ultima_entrada_em >  now() - interval '24 hours'
    and (p_org is null or c.organizacao_id = p_org);

  -- [20261020200000] Só grava o que é NOVO ou MUDOU. Antes, todo alerta ativo (~9,7 mil) era
  -- reescrito a cada minuto só pra avançar atualizado_em (99% dos UPDATEs e ~94% do WAL do banco).
  -- (1) NOT EXISTS: alerta ativo idêntico nem entra no INSERT — não é travado nem reescrito
  --     (o ON CONFLICT trava a linha mesmo quando o WHERE do DO UPDATE dá falso).
  -- (2) WHERE do DO UPDATE: a mesma guarda no árbitro do conflito (rede pra corrida).
  -- As duas comparam TODAS as colunas do SET: severidade, titulo, detalhe, responsavel_id, vence_em.
  -- Coluna nova no SET => entra nas DUAS listas abaixo, senão a mudança dela se perde.
  insert into public.sla_alertas
    (organizacao_id, tipo, severidade, conversa_id, oportunidade_id, contato_id, responsavel_id, titulo, detalhe, vence_em, dedup_key)
  select v.organizacao_id, v.tipo, v.severidade, v.conversa_id, v.oportunidade_id, v.contato_id, v.responsavel_id,
         v.titulo, v.detalhe, v.vence_em, v.dedup_key
  from (
    select distinct on (organizacao_id, dedup_key)
      organizacao_id, tipo, severidade, conversa_id, oportunidade_id, contato_id, responsavel_id, titulo, detalhe, vence_em, dedup_key
    from _vig
    order by organizacao_id, dedup_key,
      case severidade when 'imediato' then 5 when 'critico' then 4 when 'vermelho' then 3 when 'amarelo' then 2 else 1 end desc
  ) v
  where not exists (
    select 1 from public.sla_alertas a
    where a.organizacao_id = v.organizacao_id and a.dedup_key = v.dedup_key and a.resolvido_em is null
      and (a.severidade, a.titulo, a.detalhe, a.responsavel_id, a.vence_em)
          is not distinct from (v.severidade, v.titulo, v.detalhe, v.responsavel_id, v.vence_em))
  on conflict (organizacao_id, dedup_key) where resolvido_em is null do update set
    severidade = excluded.severidade, titulo = excluded.titulo, detalhe = excluded.detalhe,
    responsavel_id = excluded.responsavel_id, vence_em = excluded.vence_em, atualizado_em = now()
  where (sla_alertas.severidade, sla_alertas.titulo, sla_alertas.detalhe, sla_alertas.responsavel_id, sla_alertas.vence_em)
        is distinct from (excluded.severidade, excluded.titulo, excluded.detalhe, excluded.responsavel_id, excluded.vence_em);
  get diagnostics v_criados = row_count;  -- agora = inseridos + realmente alterados (só log do cron)

  update public.sla_alertas a set resolvido_em = now(), resolucao = 'auto', atualizado_em = now()
  where a.resolvido_em is null and (p_org is null or a.organizacao_id = p_org)
    and not exists (select 1 from _vig v where v.organizacao_id = a.organizacao_id and v.dedup_key = a.dedup_key);
  get diagnostics v_resolvidos = row_count;

  select count(*) into v_ativos from public.sla_alertas
    where resolvido_em is null and (p_org is null or organizacao_id = p_org);

  return jsonb_build_object('ativos', v_ativos, 'upsertados', v_criados, 'auto_resolvidos', v_resolvidos);
end $function$;
