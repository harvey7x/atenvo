-- IA SDR Fase 1.1 — latência alvo 15–35s por turno:
--  * debounce de entrada 15s → 8s (trigger);
--  * cron do worker 1min → a cada 15 SEGUNDOS (pg_cron 1.6 aceita 'N seconds');
--    timeout do pg_net em 120s — um turno com Gemini + presence passa fácil dos 5s default,
--    e o timeout do pg_net só corta a ESPERA da resposta (o worker continua rodando).

create or replace function public.fn_ia_sessao_mensagem()
returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_sessao uuid;
begin
  select id into v_sessao from public.ia_sessoes
    where conversa_id = new.conversa_id and status = 'ativa';
  if v_sessao is null then return new; end if;

  if new.direcao = 'entrada' then
    -- debounce RE-AGENDÁVEL (fase 1.1: 8s): 3 áudios seguidos = 1 processamento com tudo junto
    update public.ia_sessoes
      set ultima_msg_cliente_em = now(), processar_apos = now() + interval '8 seconds',
          atualizado_em = now()
      where id = v_sessao;
  elsif new.direcao = 'saida'
    and new.tipo not in ('sistema','nota_interna')
    and (new.autor_id is not null or new.origem = 'telefone') then
    update public.ia_sessoes set status = 'pausada', atualizado_em = now() where id = v_sessao;
    insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
    values (v_sessao, new.conversa_id, new.organizacao_id, 'pausada_humano',
            jsonb_build_object('mensagem_id', new.id, 'origem', new.origem));
  end if;
  return new;
end $fn$;

select cron.unschedule('ia-sdr');
select cron.schedule('ia-sdr', '15 seconds', $cron$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/ia-sdr',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ia-secret', (select secret from public.webhook_config where chave = 'ia_sdr')
    ),
    timeout_milliseconds := 120000
  );
$cron$);
