grant select, insert, update, delete on whatsapp_webhook_events to service_role;
grant select, insert, update, delete on webhook_config to service_role;
grant usage, select on all sequences in schema public to service_role;
