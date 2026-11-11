-- =====================================================================
-- 50 — Realtime da cobrança (dono 18/09: "dashboard atualizado em tempo real").
-- A publication supabase_realtime estava VAZIA → nenhum postgres_changes chegava.
-- Publica as tabelas que alimentam painel/gestão/financeiro/ciclos pra que o app
-- (channel no useRealtimeCobranca, só na Reviza) invalide a query e o número mude
-- na hora — inclusive quando OUTRA pessoa mexe (ex.: financeiro confirma entrada).
-- Realtime respeita RLS: cada usuário só recebe evento de linha que ele já podia
-- LER (mesma RLS do SELECT que já carrega o painel) — sem nova exposição.
-- Volume baixíssimo (time pequeno) → replicação irrelevante. Idempotente.
-- REPLICA IDENTITY: default basta — o app só precisa saber QUE mudou (invalida e
-- refaz o SELECT via RLS), não dos valores antigos do evento.
-- =====================================================================

do $$
declare
  t text;
  alvo text[] := array[
    'leads', 'pagamentos', 'entradas', 'mov_fin',
    'ciclos_datas', 'ciclos_abertos', 'cobranca_prefs', 'ciclos'
  ];
begin
  foreach t in array alvo loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
