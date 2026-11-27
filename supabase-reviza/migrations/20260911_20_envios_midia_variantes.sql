-- Reviza — Envios com mídia + variações + anti-ban (pedido do dono 11/09):
-- áudio/imagem/vídeo/documento no envio, até 5 textos alternados por alvo,
-- intervalo de segurança configurável e presença "digitando/gravando".
alter table public.wa_envios
  add column if not exists variantes  jsonb,
  add column if not exists midia_path text,
  add column if not exists midia_tipo public.wa_tipo_msg,
  add column if not exists midia_nome text,
  add column if not exists delay_min  int not null default 20,
  add column if not exists delay_max  int not null default 45,
  add column if not exists presenca   boolean not null default true;

-- teto de 16MB no bucket de mídia (limite do WhatsApp p/ a maioria dos tipos)
update storage.buckets set file_size_limit = 16777216 where id = 'wa-midia';
