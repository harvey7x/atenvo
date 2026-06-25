-- Rastreamento técnico de todo evento de webhook (camada 6 do runbook)
create table if not exists whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid,
  canal_id uuid,
  instance_name text,
  instance_id text,
  event text,
  provider_message_id text,
  remote_jid text,
  addressing_mode text,
  from_me boolean,
  payload jsonb,
  recebido_em timestamptz not null default now(),
  status_processamento text not null default 'recebido',
  ignorado_motivo text,
  erro text,
  processado_em timestamptz
);
create index if not exists idx_wwe_recebido on whatsapp_webhook_events (recebido_em desc);
create index if not exists idx_wwe_msg on whatsapp_webhook_events (provider_message_id);
create index if not exists idx_wwe_event on whatsapp_webhook_events (event);
alter table whatsapp_webhook_events enable row level security;

-- Config do webhook (secret rotacionável fora do env, sob controle do backend)
create table if not exists webhook_config (
  chave text primary key,
  secret text not null,
  atualizado_em timestamptz not null default now()
);
alter table webhook_config enable row level security;

insert into webhook_config (chave, secret)
values ('whatsapp', 'whk_a7F3kP9qL2mZ8vR4tN6sW1dY5bH0cJ4G')
on conflict (chave) do update set secret = excluded.secret, atualizado_em = now();
