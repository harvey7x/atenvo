-- Saúde de ENTREGA (outbound) separada da saúde de SESSÃO.
--
-- Motivo: um canal pode estar com sessão conectada (health_check_status='saudavel') e mesmo assim
-- o WhatsApp recusar a ENTREGA para clientes (messages.update status=ERROR). Era o caso da LUIZA:
-- Evolution aceitava o envio (SERVER_ACK), mas o ACK final voltava ERROR sem stub/reason.
--
-- Campos ADITIVOS (não alteram health_check_status nem envio_restrito):
--   entrega_status:        'ok' | 'instavel' | 'restrito' | 'desconhecido' (default)
--   entrega_ultimo_erro_em: quando ocorreu o último ERROR de entrega
--   entrega_erros_recentes: contador de ERROR de entrega desde a última entrega confirmada
--
-- Preenchidos pelo evolution-webhook a partir dos ACKs reais (messages.update). NÃO bloqueiam envio
-- (envio_restrito continua sendo o único hard-block; o atendente ainda pode tentar manualmente, com aviso).
alter table public.canais
  add column if not exists entrega_status text not null default 'desconhecido',
  add column if not exists entrega_ultimo_erro_em timestamptz,
  add column if not exists entrega_erros_recentes integer not null default 0;

comment on column public.canais.entrega_status is
  'Saúde de ENTREGA outbound (independente de health_check_status/sessão): ok|instavel|restrito|desconhecido. Preenchido pelo webhook via ACKs reais. NÃO bloqueia envio.';
comment on column public.canais.entrega_erros_recentes is
  'ERROR de entrega (messages.update) acumulados desde a última entrega confirmada (DELIVERY_ACK/READ externo).';
