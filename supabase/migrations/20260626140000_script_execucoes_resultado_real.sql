-- Auditoria do disparo deve refletir o RESULTADO REAL do provedor (não o HTTP 200 da função).
-- enviadas = etapas com confirmação válida do provedor; entregues = ack de entrega/leitura;
-- pendentes = ainda sem confirmação; ultima_etapa_ok = última etapa confirmada; erro = motivo.
alter table public.script_execucoes
  add column if not exists entregues int not null default 0,
  add column if not exists pendentes int not null default 0,
  add column if not exists ultima_etapa_ok int not null default 0,
  add column if not exists erro text;
