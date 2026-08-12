-- ─────────────────────────────────────────────────────────────────────────────
-- LEAD QUENTE — liga o vigia (cron 1min). Migration separada de propósito:
-- a anterior (20260812150000) entrou primeiro, os aceites rodaram em dry-run
-- (alerta_lead_quente_avaliar com p_agora simulado) e só então isto liga o
-- relógio. cron.schedule é upsert por jobname (idempotente ao reaplicar).
-- A função já se auto-limita: só horário comercial, janela máx 60 min e
-- 1 alerta por conversa — rodar o job fora do horário é no-op barato.
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'alerta-lead-quente',
  '* * * * *',
  $cron$ select public.alerta_lead_quente_avaliar(); $cron$
);
