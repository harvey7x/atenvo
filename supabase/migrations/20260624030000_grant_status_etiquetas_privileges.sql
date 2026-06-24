-- CORREÇÃO (homologação): conversa_status_def e etiquetas foram criadas na migration
-- 20260624020643 com RLS e policies, porém SEM GRANT para os papéis da Data API.
-- O default do Supabase cloud NÃO auto-expõe tabelas novas (ver config.toml [api]),
-- então o PostgREST responde 403 e os recursos de Status/Etiquetas ficam inacessíveis
-- ao frontend (role authenticated). Mesmo padrão já aplicado a funis/funil_colunas
-- na migration 20260623105051. Aditivo e não destrutivo.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversa_status_def TO authenticated;
GRANT ALL ON public.conversa_status_def TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.etiquetas TO authenticated;
GRANT ALL ON public.etiquetas TO service_role;
