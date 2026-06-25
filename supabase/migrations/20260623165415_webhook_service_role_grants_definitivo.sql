-- GRANTs mínimos para o service_role (Edge Functions). NUNCA para anon/authenticated.
-- webhook: apenas leitura do segredo
grant select on table public.webhook_config to service_role;

-- rastreamento técnico: insert + update + select (RETURNING id)
grant select, insert, update on table public.whatsapp_webhook_events to service_role;

-- tabelas de domínio efetivamente usadas pelo webhook para criar contato/conversa/mensagem
grant select, insert, update on table public.contatos to service_role;
grant select, insert, update on table public.contato_identidades to service_role;
grant select, insert, update on table public.conversas to service_role;
grant select, insert, update on table public.mensagens to service_role;

-- canais/integracoes: o webhook lê e atualiza status (não insere)
grant select, update on table public.canais to service_role;
grant select, update on table public.integracoes to service_role;

-- sequências associadas, caso existam
grant usage, select on all sequences in schema public to service_role;
