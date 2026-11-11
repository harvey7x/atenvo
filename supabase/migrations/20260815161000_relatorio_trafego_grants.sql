-- Relatório diário de tráfego — acesso a fichas_judiciais.
--
-- A RPC quebrava com "permission denied for table fichas_judiciais": é a ÚNICA tabela
-- do relatório sem grant para service_role (todas as outras já têm). Sem RLS envolvida —
-- é grant de tabela mesmo, o mesmo tropeço do alerta de lead quente.
--
-- A saída NÃO é abrir a tabela: ela guarda CPF, RG e número de benefício, e um
-- `grant select ... to service_role` daria isso a QUALQUER edge function. Em vez disso a
-- função vira SECURITY DEFINER — só ela atravessa, e o que sai dali é contagem por
-- banco_nome, sem uma linha de dado pessoal.
--
-- Como definer ignora RLS, o execute fica só com service_role (o cron). Tirar
-- `authenticated` evita que um usuário logado leia agregado de outra organização
-- passando p_org na mão. Se algum dia o painel precisar disso, o caminho é uma função
-- separada que trave p_org na org do chamador.

alter function public.relatorio_trafego_diario(date, uuid) security definer;

revoke all on function public.relatorio_trafego_diario(date, uuid) from public, authenticated;
grant execute on function public.relatorio_trafego_diario(date, uuid) to service_role;
