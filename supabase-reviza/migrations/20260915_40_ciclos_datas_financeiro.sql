-- =====================================================================
-- 40 — ciclos_datas: ins/upd baixam de gestor para FINANCEIRO.
-- Aplicada AO VIVO em 2026-09-15 18:36 via MCP (versão 20260915183646,
-- nome 'ciclos_datas_financeiro'); este arquivo foi reconstituído VERBATIM
-- de supabase_migrations.schema_migrations em 17/09 (o .sql não tinha sido
-- gravado no repo — achado da caçada de erros; sem ele, recriar o banco
-- pelo repo deixaria o undo/las datas do financeiro quebrados).
-- Contexto: o Financeiro (o "Administrador" da operação, dono 15/09) define
-- a data da cobrança no calendário; com gestor-only ele confirmava e NÃO
-- salvava. delete segue gestor (ciclo_del intocada).
-- Nota adjacente: em 2026-09-14 20:41 foi aplicada 'competencia_mes_corrente'
-- (pg_cron diário criando a competência do mês). Essa abordagem foi REVERTIDA
-- em 15/09 (cron desagendado; virou o botão manual "＋ Adicionar mês") — por
-- isso não há arquivo dela; o estado final do banco é sem o job agendado.
-- =====================================================================

drop policy if exists ciclo_ins on public.ciclos_datas;
create policy ciclo_ins on public.ciclos_datas for insert with check (is_at_least('financeiro'));
drop policy if exists ciclo_upd on public.ciclos_datas;
create policy ciclo_upd on public.ciclos_datas for update using (is_at_least('financeiro')) with check (is_at_least('financeiro'));
