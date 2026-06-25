-- PostgREST exige GRANT de tabela além do RLS. funis/funil_colunas foram
-- criadas sem privilégios para authenticated/service_role -> "permission denied".
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funis TO authenticated;
GRANT ALL ON public.funis TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funil_colunas TO authenticated;
GRANT ALL ON public.funil_colunas TO service_role;
