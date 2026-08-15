-- ═══════════════════════════════════════════════════════════════════════════
-- BOT VÍDEO (caf_video_juros_v1) — infraestrutura de MODO TESTE + fila agendada.
--
-- 1) bot_canal_config ganha um fluxo de TESTE por allowlist de números: com
--    numeros_teste não-vazio E o telefone do contato batendo (chave canônica,
--    cobre o 9º dígito), o bot-runner usa fluxo_slug_teste; todo o resto segue
--    no fluxo_slug normal. Produção intocada por construção.
-- 2) bot_mensagens_saida vira fila de verdade para mensagens DIFERIDAS:
--    * tipo texto|video + media_url/media_caption (vídeo por link na Cloud API);
--    * status novo 'agendada' — processado APENAS pelo worker bot-fila-processar
--      (cron), nunca pelo dreno em-processo do bot-runner (que segue dono
--      exclusivo do 'pendente'). Sem essa separação, o cron poderia duplicar
--      um burst que o runner está drenando naquele segundo.
-- 3) bot_pausar passa a cancelar também as 'agendada' (pausou = o resultado
--    diferido morre junto; o worker ainda re-checa as guardas antes de enviar).
-- 4) oportunidade_eventos aceita evento 'qualificado' — o fecho do fluxo de
--    vídeo registra o move Lead Novo → Lead Qualificado no padrão da casa.
-- 5) RPC bot_fila_reivindicar: claim atômico (agendada vencida OU lease de
--    'enviando' estourado) — espelho de mensagens_agendadas_reivindicar.
-- 6) Secret + cron do worker (a cada minuto), padrão janela-guardia.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) bot_canal_config: fluxo de teste por número
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.bot_canal_config
  add column if not exists fluxo_slug_teste text null,
  add column if not exists numeros_teste text[] not null default '{}';

comment on column public.bot_canal_config.fluxo_slug_teste is
  'Fluxo usado SÓ para os números em numeros_teste (allowlist). Null = sem modo teste.';
comment on column public.bot_canal_config.numeros_teste is
  'Números (dígitos, com DDI) cujo inbound roteia para fluxo_slug_teste. Comparação por chave canônica (DDD+8, cobre o 9º dígito).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) bot_mensagens_saida: tipo/mídia + status 'agendada'
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.bot_mensagens_saida
  add column if not exists tipo text not null default 'texto',
  add column if not exists media_url text null,
  add column if not exists media_caption text null;

alter table public.bot_mensagens_saida drop constraint if exists bot_mensagens_saida_tipo_check;
alter table public.bot_mensagens_saida add constraint bot_mensagens_saida_tipo_check
  check (tipo in ('texto','video'));

alter table public.bot_mensagens_saida drop constraint if exists bot_mensagens_saida_status_check;
alter table public.bot_mensagens_saida add constraint bot_mensagens_saida_status_check
  check (status = any (array['pendente'::text,'agendada'::text,'enviando'::text,'enviada'::text,'falhou'::text,'simulada'::text,'cancelada'::text]));

comment on column public.bot_mensagens_saida.tipo is
  'texto|video. Vídeo sai pela Cloud API por LINK público (media_url + media_caption).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) bot_pausar: cancela pendente E agendada (recriação fiel + 1 linha)
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- 'agendada' entra aqui: pausar mata também o resultado diferido do fluxo de vídeo.
  update public.bot_mensagens_saida set status = 'cancelada'
    where conversa_id = p_conversa and status in ('pendente','agendada');
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) oportunidade_eventos: evento 'qualificado' (fecho do bot registra o move)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.oportunidade_eventos drop constraint if exists oportunidade_eventos_evento_check;
alter table public.oportunidade_eventos add constraint oportunidade_eventos_evento_check
  check (evento = any (array['ganho'::text,'perdido'::text,'reaberto'::text,'qualificado'::text]));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) claim atômico da fila (worker) — espelho de mensagens_agendadas_reivindicar.
--    Pega 'agendada' vencida e 'enviando' com lease >5min (worker que morreu no meio).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.bot_fila_reivindicar(p_limite integer default 30)
returns setof public.bot_mensagens_saida
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  with cand as (
    select id
    from public.bot_mensagens_saida
    where (status = 'agendada' and enviar_apos <= now())
       or (status = 'enviando' and atualizado_em < now() - interval '5 minutes')
    order by conversa_id, ordem
    limit greatest(1, p_limite)
  )
  update public.bot_mensagens_saida m
     set status = 'enviando', atualizado_em = now()
    from cand
   where m.id = cand.id
     and (
       (m.status = 'agendada' and m.enviar_apos <= now())
       or (m.status = 'enviando' and m.atualizado_em < now() - interval '5 minutes')
     )
  returning m.*;
end $function$;

revoke all on function public.bot_fila_reivindicar(integer) from public, anon, authenticated;
grant execute on function public.bot_fila_reivindicar(integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Secret do cron + agendamento (a cada minuto). O worker só toca status
--    'agendada'/'enviando' — fila vazia = no-op barato, padrão dos outros crons.
--    Desligar: select cron.unschedule('bot-fila-processar');
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.webhook_config (chave, secret)
values ('bot_fila',
        replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (chave) do nothing;

select cron.schedule(
  'bot-fila-processar',
  '* * * * *',
  $$
    select net.http_post(
      url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/bot-fila-processar',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-bot-secret', (select secret from public.webhook_config where chave = 'bot_fila')
      )
    );
  $$
);

notify pgrst, 'reload schema';
