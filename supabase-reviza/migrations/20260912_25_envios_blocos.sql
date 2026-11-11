-- Reviza — envios com BLOCOS (compositor completo: texto/áudio/foto/vídeo/documento
-- na ordem, com delay entre as partes). O gerador da régua grava os blocos da
-- mensagem no envio; o motor, quando blocos existe, envia parte a parte por alvo
-- (variáveis aplicadas por cliente, presença, delays). Envios sem blocos seguem
-- o caminho antigo (modelo + mídia única).
-- Aplicada 2026-09-12 via MCP como "reviza_25_envios_blocos".

alter table public.wa_envios add column blocos jsonb;
