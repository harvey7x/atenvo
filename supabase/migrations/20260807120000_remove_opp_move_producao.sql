-- Remove a automação ficha → coluna Documentos (papel='producao').
-- Criar ficha NÃO move mais a oportunidade; mover para Documentos é ato manual do atendente.
-- (A automação bot → Lead Qualificado, criada na mesma migration 20260803180000, permanece.)

drop trigger if exists trg_opp_move_producao on public.fichas_judiciais;
drop function if exists public.fn_opp_move_producao();
