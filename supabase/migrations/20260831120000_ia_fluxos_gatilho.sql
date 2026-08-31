-- ============================================================================
-- IA Fluxos — GATILHO de ativação (31/08)
--
-- Nem toda mensagem inicial deve iniciar o fluxo. O gatilho controla SÓ o
-- começo do fluxo numa conversa (conversa já em andamento continua normal):
--   { "tipo": "sempre" }                              -> começa em toda conversa nova (padrão de hoje)
--   { "tipo": "palavra_chave", "palavras": ["juros"] } -> começa só se a 1ª mensagem contém uma palavra
--
-- O motor lê este campo no início do fluxo custom (bot-runner). Só coluna —
-- sem RPC nova; o vínculo/edição segue por ia_fluxo_salvar/RLS existentes.
-- ============================================================================

alter table public.ia_fluxos
  add column if not exists gatilho jsonb not null default '{"tipo":"sempre"}'::jsonb;

comment on column public.ia_fluxos.gatilho is
  'Quando o fluxo COMEÇA numa conversa: {"tipo":"sempre"} ou {"tipo":"palavra_chave","palavras":[...]}. Só controla o início; conversa em andamento continua.';
