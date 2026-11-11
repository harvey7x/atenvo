-- Reviza — claim atômico por alvo da fila de envios (revisão do motor da régua).
-- Problema: duas rodadas do motor sobrepostas (cron por minuto + "Processar fila
-- agora") liam os mesmos alvos 'pendente' e podiam enviar a MESMA mensagem 2x.
-- Fix: novo status 'enviando' — o motor reivindica o alvo com
-- update ... where status='pendente' antes de enviar; claim_em permite soltar
-- alvos presos se uma rodada morrer no meio (reset após 10 min).
-- Aplicada 2026-09-12 via MCP como "reviza_24_alvo_claim".

alter type public.wa_status_alvo add value if not exists 'enviando';
alter table public.wa_envio_alvos add column claim_em timestamptz;
