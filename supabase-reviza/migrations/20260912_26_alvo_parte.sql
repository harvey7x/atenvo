-- Reviza — progresso por PARTE no alvo (revisão do compositor de blocos).
-- Sequência de partes (texto/áudio/foto/vídeo/documento) pode atravessar rodadas
-- do motor: parte_atual guarda quantas partes já saíram pra este alvo, então uma
-- rodada cortada (orçamento/morte da função) RETOMA da parte seguinte em vez de
-- reenviar a sequência inteira (sem duplicar mensagem pro cliente).
-- Aplicada 2026-09-12 via MCP como "reviza_26_alvo_parte".

alter table public.wa_envio_alvos add column parte_atual smallint not null default 0;
