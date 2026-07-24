-- ============================================================================
-- MATURAÇÃO DE NÚMEROS — Bloco B (cron + biblioteca inicial de conteúdo)
--
-- Os dois crons sobem LIGADOS, mas o subsistema continua INERTE: o runner só envia
-- de verdade quando MATURACAO_ATIVO='sim' (env) E maturacao_config.modo='ativo' (banco).
-- Com as duas travas desligadas, o planner planeja e o runner marca 'pulada' — nada sai.
-- Mesmo desenho do bot-remarketing, que sobe agendado e inofensivo.
--
-- A biblioteca de conteúdo é semeada porque SEM ELA o planner não produz nada
-- (ele pula a org com 'biblioteca_de_conteudo_vazia'). São frases curtas e variadas:
-- repetir a mesma mensagem é a forma mais rápida de ser detectado.
-- ============================================================================

create extension if not exists pg_cron;

-- ─────────────────────────────────────────────────────────────────────────────
-- Planner: 1x/dia às 07:00 de São Paulo (10:00 UTC), antes do expediente começar.
-- ─────────────────────────────────────────────────────────────────────────────
select cron.unschedule('maturacao-planner')
where exists (select 1 from cron.job where jobname = 'maturacao-planner');

select cron.schedule(
  'maturacao-planner',
  '0 10 * * *',
  $cron$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/maturacao-planner',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-maturacao-secret', (select secret from public.webhook_config where chave = 'maturacao')
    )
  );
  $cron$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Runner: a cada 2 minutos. O throttle real é na RPC (1 envio por chip por ciclo),
-- então esta frequência define a granularidade dos horários, não o volume.
-- ─────────────────────────────────────────────────────────────────────────────
select cron.unschedule('maturacao-runner')
where exists (select 1 from cron.job where jobname = 'maturacao-runner');

select cron.schedule(
  'maturacao-runner',
  '*/2 * * * *',
  $cron$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/maturacao-runner',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-maturacao-secret', (select secret from public.webhook_config where chave = 'maturacao')
    )
  );
  $cron$
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Biblioteca inicial — só para orgs que ainda não têm nada (não sobrescreve edições).
-- ─────────────────────────────────────────────────────────────────────────────
do $seed$
declare v_org uuid;
begin
  for v_org in select id from public.organizacoes loop
    if exists (select 1 from public.maturacao_conteudo where organizacao_id = v_org) then
      continue;
    end if;

    insert into public.maturacao_conteudo (organizacao_id, tipo, categoria, texto)
    select v_org, 'texto', 'abertura', t from unnest(array[
      'Oi, tudo bem?',
      'Bom dia! Como foi o fim de semana?',
      'E aí, beleza?',
      'Opa, tudo certo por aí?',
      'Cara, que calor hoje hein',
      'Bom dia :)',
      'Fala! Tudo tranquilo?',
      'Boa tarde! Como está o movimento aí?',
      'Ei, lembrei de te perguntar uma coisa',
      'Já almoçou?',
      'Que semana corrida essa',
      'Oi, consegue falar agora?',
      'Bom diaa',
      'E aí, novidades?',
      'Passando pra dar um oi',
      'Tudo bem contigo?',
      'Nossa, o tempo virou aqui',
      'Fala meu amigo, tudo certo?',
      'Boa noite! Ainda acordado?',
      'Desculpa, esqueci de te responder ontem',
      'Está conseguindo dar conta das coisas?',
      'Oi! Tudo em paz?',
      'E aí, como está indo?',
      'Bom dia, bom trabalho hoje!',
      'Ei, tudo certo?',
      'Que dia lindo hoje',
      'Oi, só passando pra saber se está tudo ok',
      'Sumiu, hein!',
      'Opa, chegou bem?',
      'Bom dia! Dormiu bem?'
    ]) as t;

    insert into public.maturacao_conteudo (organizacao_id, tipo, categoria, texto)
    select v_org, 'texto', 'resposta', t from unnest(array[
      'Oi! Tudo ótimo e você?',
      'Tudo sim, e por aí?',
      'Opa, tudo certo!',
      'Bem sim, obrigado!',
      'Tudo tranquilo, e contigo?',
      'Oi! Desculpa a demora',
      'Poxa, que bom saber',
      'Sim sim, tudo em ordem',
      'Estou bem, corrido mas bem haha',
      'Tudo ótimo por aqui',
      'Também estava pensando nisso',
      'Nossa, verdade',
      'Concordo demais',
      'Kkkk boa',
      'Pois é, né',
      'Isso aí!',
      'Perfeito, obrigado',
      'Beleza então',
      'Show, valeu!',
      'Entendi, faz sentido',
      'Vou dar uma olhada',
      'Boa! Depois te falo',
      'Tranquilo, sem pressa',
      'Tamo junto',
      'Combinado!',
      'Aqui está tudo calmo hoje',
      'Que bom! Fico feliz',
      'Verdade, nem tinha pensado por esse lado'
    ]) as t;

    insert into public.maturacao_conteudo (organizacao_id, tipo, categoria, texto)
    select v_org, 'texto', 'conversa', t from unnest(array[
      'Depois me conta como foi',
      'Vamos marcar alguma coisa qualquer dia desses',
      'Se precisar de algo é só falar',
      'Boa sorte aí!',
      'Qualquer coisa me avisa',
      'Fico te devendo essa',
      'Vou resolver isso hoje ainda',
      'Amanhã eu te dou um retorno',
      'Tenha um bom dia!',
      'Até mais!'
    ]) as t;
  end loop;
end $seed$;
