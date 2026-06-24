-- ===== Renomeia percentual_caf -> percentual_honorarios =====
-- Idempotente: em banco novo a coluna ja nasce como percentual_honorarios (no-op);
-- em ambientes que aplicaram o 0006 antigo, renomeia.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='cobrancas' and column_name='percentual_caf'
  ) then
    alter table public.cobrancas rename column percentual_caf to percentual_honorarios;
  end if;
end $$;
