-- ============================================================================
-- Reviza · mig 68 — aposenta a MENSALIDADE v1 (mig 66, 01/10)
--
-- A mig 66 criou um primeiro desenho da mensalidade da plataforma
-- (mensalidade_config/mensalidades/mensalidade_pix + cron reviza_mensalidade a
-- cada 5 min + edge reviza-mensalidade), com bloqueio "8h após o Pix". Em 03/10
-- o dono fixou a regra definitiva — fatura no dia 1º, bloqueio dia 5 às 14h —
-- implementada pela mig 67 (sistema_licenca/sistema_faturas + licenca_estado +
-- edge reviza-licenca). Dois sistemas de cobrança paralelos não podem existir:
-- este aqui nunca saiu do inerte (ativa=false, 0 faturas, 0 pix), então sai
-- inteiro. O arquivo da mig 66 fica no repo (histórico aplicado); a pasta da
-- edge antiga ganha aviso de aposentada e a função é removida do ar.
-- ============================================================================

select cron.unschedule('reviza_mensalidade')
 where exists (select 1 from cron.job where jobname = 'reviza_mensalidade');

drop function if exists public.mensalidade_estado();
drop function if exists public.mensalidade_confirmar_pix(text, int, text, text);
drop function if exists public.mensalidade_liberar(text, text);

drop table if exists public.mensalidade_pix;
drop table if exists public.mensalidades;
drop table if exists public.mensalidade_config;
