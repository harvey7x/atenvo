-- =====================================================================
-- 51 — Ajuste do realtime (revisão adversarial da mig 50): TIRA `entradas`
-- da publication. A policy ent_sel é `current_papel() IS NOT NULL` (QUALQUER
-- autenticado lê TODAS as entradas), então publicar entradas no realtime
-- transmitiria pelo websocket dados financeiros de um comercial pra outro —
-- inconsistente com leads/pagamentos, que são escopados por comercial.
-- O painel NÃO precisa de entradas em tempo real: quando o financeiro confirma
-- uma entrada, quem muda é `pagamentos` (que continua no realtime) e o número
-- do painel atualiza por ali. A aba Financeiro segue no polling de 30s.
-- =====================================================================

do $$ begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entradas'
  ) then
    alter publication supabase_realtime drop table public.entradas;
  end if;
end $$;
