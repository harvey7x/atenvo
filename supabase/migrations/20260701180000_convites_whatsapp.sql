-- Envio do convite por WhatsApp: estado do envio no convite (NUNCA o link em texto puro).
alter table public.convites
  add column if not exists telefone text,
  add column if not exists canal_id uuid,
  add column if not exists whatsapp_status text,
  add column if not exists whatsapp_key_id text,
  add column if not exists whatsapp_enviado_em timestamptz,
  add column if not exists whatsapp_erro text;
-- equipe_listar expõe telefone + whatsapp_status dos convites (ver corpo aplicado na migration remota).
notify pgrst, 'reload schema';
