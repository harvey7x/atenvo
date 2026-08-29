-- ============================================================
-- MODO COBRANÇA — motor de envio (Fase C, 29/08). NASCE EM SIMULAÇÃO:
-- a fila é montada e processada, mas dry_run=true vira 'simulada' e o
-- caminho de envio REAL nem existe na função (falha com
-- envio_real_desligado) — ligar exige ordem explícita do dono.
-- Cadência v1 é POR TIPO de mensagem (antes=-3d, cobrança=0, depois=+2,
-- remarketing=+7, sempre 09:00 BRT); a régua fina (offsets por passo)
-- entra quando a UI de régua/passos for ligada.
-- ============================================================

-- segredo do cron (valor VIVO nasce aqui; a função lê da tabela)
insert into public.webhook_config (chave, secret)
values ('cobranca', 'cbr_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (chave) do nothing;

-- idempotência do enfileiramento: 1 disparo por cobrança × tipo × dia
create unique index if not exists uq_cobranca_fila_dia
  on public.cobranca_fila (cobranca_id, tipo, ((executar_em at time zone 'America/Sao_Paulo')::date));

-- crons: enfileira 06:05 BRT (09:05 UTC); processa a cada 10 min
select cron.schedule(
  'cobranca-enfileirar', '5 9 * * *',
  $job$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/cobranca-processar',
    body := '{"acao":"enfileirar"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cobranca-secret', (select secret from public.webhook_config where chave = 'cobranca')
    )
  );
  $job$
);
select cron.schedule(
  'cobranca-processar', '*/10 * * * *',
  $job$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/cobranca-processar',
    body := '{"acao":"processar"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cobranca-secret', (select secret from public.webhook_config where chave = 'cobranca')
    )
  );
  $job$
);
