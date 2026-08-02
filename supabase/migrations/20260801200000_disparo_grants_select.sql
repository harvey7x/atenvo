-- Correção flagrada na validação e2e: a org tem default privileges enxutos (auditoria
-- 2026-07-15), então RLS sem GRANT deixa o SELECT do painel em 403. Leitura para
-- authenticated (as policies continuam decidindo QUAIS linhas); escrita segue só service_role/RPC.
grant select on public.disparo_campanhas to authenticated;
grant select on public.disparo_alvos to authenticated;
