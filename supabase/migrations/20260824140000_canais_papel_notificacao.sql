-- Canal NOTIFICADOR (2026-08-24): o número pessoal do dono conecta só pra emitir os
-- relatórios/alertas no grupo. O webhook (v33) ignora TUDO de canal com
-- papel='notificacao' — mas o CHECK de canais.papel não aceitava o valor.
--
-- Aplicada às pressas em produção durante a conexão do chip (o QR foi escaneado antes
-- do update de papel; o CHECK barrou e esta migration destravou — auditoria pós-fato:
-- 0 conversas/mensagens vazaram).

alter table public.canais drop constraint canais_papel_check;
alter table public.canais add constraint canais_papel_check
  check (papel = any (array['atendimento'::text, 'disparo'::text, 'ambos'::text, 'notificacao'::text]));

update public.canais set papel = 'notificacao'
 where id = 'ce48aa0d-1cdb-4939-a7a8-aec5b0352d4a' and nome_interno = 'NOTIFICADOR';
