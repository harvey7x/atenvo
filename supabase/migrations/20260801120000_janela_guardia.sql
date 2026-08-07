-- ═══════════════════════════════════════════════════════════════════════════
-- JANELA-GUARDIÃ — não deixar a janela de 24h da Cloud API fechar em conversa quente.
--
-- Duas etapas, deliberadamente separadas:
--   ETAPA 1 (alerta humano) — Regra 8 DENTRO de sla_avaliar. É 100% interno (nenhuma
--     mensagem sai pra Meta), então NASCE VIVO com o resto do SLA. Faltando ≤8h da janela
--     (amarelo) → ≤4h (vermelho), avisa o dono da conversa. Reusa dedup + auto-resolução do
--     sla_alertas: some sozinho quando o cliente responde (a janela reseta) ou quando ela fecha
--     de vez (>24h sai da faixa).
--   ETAPA 2 (nudge automático) — RPCs abaixo alimentam a edge `janela-guardia`, que dispara UM
--     texto contextual faltando ≤4h. INERTE por default (JANELA_NUDGE_ATIVO=nao + dry_run), igual
--     ao bot-remarketing. O nudge SÓ dispara quando o NEGÓCIO está esperando o cliente (última
--     mensagem foi de saída) — se o cliente é que está sem resposta, quem age é o humano pelo
--     alerta, não um robô.
--
-- HONESTIDADE (Meta): a mensagem do negócio NÃO estende a janela — só a resposta do cliente
--   estende. O nudge é uma aposta de reengajamento dentro da janela, nunca uma "renovação".
--   Por isso: 1 por janela, contextual (não "oi, tá aí? 👀"), respeitando opt-out.
--
-- Sem alteração em wa_janela_registrar: a checagem `nudge_em < ultima_entrada_em` reabre o ciclo
--   automaticamente quando chega um inbound novo (a janela nova permite um nudge novo).
--
-- ⚠️ sla_avaliar aqui é a recriação FIEL da versão VIVA (S4/5: 20260709180000) + Regra 8. NÃO é
--   a S1 — a viva usa tem_humano, responsavel_id de contatos, ativo_desde e sc.ativo (inner join).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) sla_alertas: novo tipo 'janela_expirando'
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.sla_alertas drop constraint if exists sla_alertas_tipo_check;
alter table public.sla_alertas add constraint sla_alertas_tipo_check check (tipo in (
  'atendimento_sem_resposta','cliente_qualificado_aguardando_atendimento','lead_quente_aguardando',
  'audio_recebido_precisa_humano','parado_ha_muito_tempo','prazo_2_dias_em_risco','prazo_2_dias_estourado',
  'janela_expirando'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) canal_janela: marca do nudge (dedup de 1 por janela)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.canal_janela add column if not exists nudge_em timestamptz;
comment on column public.canal_janela.nudge_em is
  'Quando a janela-guardiã disparou o nudge nesta janela. Elegível de novo quando nudge_em < ultima_entrada_em (o cliente reabriu a janela com um inbound novo).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) sla_avaliar: versão VIVA (S4/5) + Regra 8 (janela de 24h perto de expirar).
-- ─────────────────────────────────────────────────────────────────────────────
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

  -- Regra 8: janela de 24h da Cloud API perto de expirar, em conversa QUENTE.
  --   amarelo faltando ≤8h (ultima_entrada 16–20h atrás) → vermelho ≤4h (20–24h atrás).
  --   Só canal cloud_api (a janela de 24h é conceito da Meta; Evolution não tem). Sai da faixa
  --   sozinho quando o cliente responde (ultima_entrada_em pula p/ agora) ou quando fecha (>24h),
  --   e a auto-resolução abaixo baixa o alerta. "Tem dono" = atendente OU responsável (contatos).
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) janela_guardia_due — fila do NUDGE (etapa 2). Faltando ≤4h, conversa quente,
--    negócio esperando o cliente (última msg de saída), sem opt-out, 1 por janela.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.janela_guardia_due(p_limit int default 20)
returns table (
  conversa_id uuid, contato_id uuid, canal_id uuid, organizacao_id uuid,
  contato_nome text, destino text, horas_restantes numeric
)
language sql
stable
security definer
set search_path = public
as $fn$
  select c.id, c.contato_id, c.canal_id, c.organizacao_id,
         ct.nome,
         idn.valor_normalizado,
         round(extract(epoch from (cj.ultima_entrada_em + interval '24 hours' - now()))/3600.0, 2)
  from public.conversas c
  join public.canais ca on ca.id = c.canal_id
       and ca.transporte = 'cloud_api' and coalesce(ca.ativo, true) and not coalesce(ca.envio_restrito, false)
  join public.canal_janela cj on cj.canal_id = c.canal_id and cj.contato_id = c.contato_id
  join public.contatos ct on ct.id = c.contato_id
  left join public.bot_conversa_estado e on e.conversa_id = c.id
  left join public.sla_config sc on sc.organizacao_id = c.organizacao_id
  left join lateral (
    select valor_normalizado from public.contato_identidades
    where contato_id = c.contato_id and tipo = 'whatsapp' and valor_normalizado is not null
    order by principal desc limit 1) idn on true
  left join lateral (select max(coalesce(m.recebida_em, m.criado_em)) t
                     from public.mensagens m where m.conversa_id = c.id and m.direcao = 'entrada') mi on true
  left join lateral (select max(coalesce(m.enviada_em, m.criado_em)) t
                     from public.mensagens m where m.conversa_id = c.id and m.direcao = 'saida') mo on true
  where c.arquivada_em is null and c.status in ('aberta','em_atendimento','pendente')
    and coalesce(sc.ativo, true)
    and (c.atendente_id is not null or ct.responsavel_id is not null or coalesce(e.lead_quente, false))  -- quente
    and cj.ultima_entrada_em <= now() - interval '20 hours'                     -- faltando ≤4h
    and cj.ultima_entrada_em >  now() - interval '24 hours'                     -- ainda aberta
    and (cj.nudge_em is null or cj.nudge_em < cj.ultima_entrada_em)             -- 1 nudge por janela
    and mo.t is not null and (mi.t is null or mo.t > mi.t)                      -- NEGÓCIO esperando o cliente
    and idn.valor_normalizado is not null                                      -- tem destino WhatsApp
    and not public.wa_optout_ativo(c.contato_id, c.canal_id)                    -- opt-out Meta
  order by cj.ultima_entrada_em asc
  limit greatest(coalesce(p_limit, 0), 0);
$fn$;

revoke all on function public.janela_guardia_due(int) from public, anon, authenticated;
grant execute on function public.janela_guardia_due(int) to service_role;

-- Marca o nudge da janela vigente (idempotente: só grava se ainda não marcou ESTA janela).
create or replace function public.janela_guardia_marcar_nudge(p_canal uuid, p_contato uuid)
returns void
language sql
security definer
set search_path = public
as $fn$
  update public.canal_janela
     set nudge_em = now(), atualizado_em = now()
   where canal_id = p_canal and contato_id = p_contato
     and (nudge_em is null or nudge_em < ultima_entrada_em);
$fn$;

revoke all on function public.janela_guardia_marcar_nudge(uuid, uuid) from public, anon, authenticated;
grant execute on function public.janela_guardia_marcar_nudge(uuid, uuid) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Secret do cron + agendamento (a cada 15 min). INERTE: body '{}' → dry_run=true,
--    e a edge nasce com JANELA_NUDGE_ATIVO=nao (só observa/loga; não envia).
--    Desligar: select cron.unschedule('janela-guardia');
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.webhook_config (chave, secret)
values ('janela_guardia',
        replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (chave) do nothing;

select cron.schedule(
  'janela-guardia',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/janela-guardia',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-bot-secret', (select secret from public.webhook_config where chave = 'janela_guardia')
      )
    );
  $$
);

notify pgrst, 'reload schema';
