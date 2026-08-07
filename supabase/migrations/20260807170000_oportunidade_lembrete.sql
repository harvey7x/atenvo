-- Lembrete operacional fixado no card do kanban (nota curta, distinta do
-- "Resumo do caso"/observacoes). Aditiva: não altera dados nem políticas.
-- Já aplicada no remoto (C.A.F) em 2026-08-07 via MCP; este arquivo mantém
-- o histórico do repo em sincronia para `supabase db push` de ambientes novos.
alter table public.oportunidades add column if not exists lembrete text;
comment on column public.oportunidades.lembrete is 'Nota curta fixada no card do kanban (lembrete operacional visível no board).';
