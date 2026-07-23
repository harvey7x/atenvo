-- Bloco 1 — TRANSPORTE do canal: 'evolution' (QR/Baileys) ou 'cloud_api' (WhatsApp Cloud API).
-- Arquitetura híbrida: os dois convivem. Default 'evolution' => NENHUM canal muda de
-- comportamento com esta migration. Ela só abre espaço.
--
-- TOKEN NUNCA NO BANCO: META_WHATSAPP_TOKEN / META_WA_APP_SECRET / META_WA_VERIFY_TOKEN são
-- secrets de ambiente das Edge Functions. Aqui ficam só IDs públicos de roteamento.

alter table public.canais
  add column if not exists transporte             text not null default 'evolution',
  add column if not exists cloud_phone_number_id  text,
  add column if not exists cloud_waba_id          text;

alter table public.canais drop constraint if exists canais_transporte_check;
alter table public.canais add  constraint canais_transporte_check
  check (transporte in ('evolution','cloud_api'));

-- cloud_api EXIGE phone_number_id: é a chave pela qual o cloud-webhook descobre o canal
-- (a Meta entrega TODOS os eventos numa URL só).
alter table public.canais drop constraint if exists canais_cloud_requer_phone_number_id;
alter table public.canais add  constraint canais_cloud_requer_phone_number_id
  check (transporte <> 'cloud_api' or cloud_phone_number_id is not null);

-- cloud_api só vale para canal de WhatsApp. Blindagem explícita do canal "CAF"
-- (tipo=facebook, Messenger/anúncios, NO AR): ele nunca pode ser marcado como cloud_api.
alter table public.canais drop constraint if exists canais_cloud_so_whatsapp;
alter table public.canais add  constraint canais_cloud_so_whatsapp
  check (transporte <> 'cloud_api' or tipo = 'whatsapp');

-- Roteamento do webhook precisa ser NÃO-AMBÍGUO: dois canais com o mesmo phone_number_id
-- fariam a mensagem cair no canal errado. Unique parcial (não afeta as linhas existentes).
create unique index if not exists uq_canais_cloud_phone_number_id
  on public.canais (cloud_phone_number_id) where cloud_phone_number_id is not null;

comment on column public.canais.transporte is
  'Como a mensagem sai: evolution (QR/Baileys) ou cloud_api (WhatsApp Cloud API oficial da Meta). Default evolution.';
comment on column public.canais.cloud_phone_number_id is
  'Phone Number ID da Cloud API. Chave de roteamento do cloud-webhook. Público, não é segredo.';
comment on column public.canais.cloud_waba_id is
  'WhatsApp Business Account ID. NUNCA guardar token aqui: o access token vive em secret de ambiente.';
