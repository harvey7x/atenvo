-- Contenção operacional de canal com restrição de conta no WhatsApp (não é erro da Evolution).
-- Bloqueia SÓ o envio; recebimento e histórico seguem intactos. Preserva canal_id/conversas/contatos.
alter table public.canais
  add column if not exists envio_restrito boolean not null default false,
  add column if not exists envio_restrito_em timestamptz,
  add column if not exists envio_restrito_por uuid,
  add column if not exists envio_restrito_motivo text;
