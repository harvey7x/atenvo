-- Complemento da 20260801150000: o CHECK da TABELA também precisa aceitar 'sair_texto'
-- (a 150000 só atualizou a whitelist da função — flagrado por teste e2e antes de ir ao ar).
alter table public.wa_optout drop constraint if exists wa_optout_motivo_check;
alter table public.wa_optout add constraint wa_optout_motivo_check
  check (motivo in ('erro_131050', 'user_preferences', 'manual', 'sair_texto'));
