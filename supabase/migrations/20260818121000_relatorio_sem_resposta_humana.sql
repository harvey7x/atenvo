-- Relatório de tráfego — métrica "sem resposta humana".
--
-- Com o varredor distribuir_leads_sem_dono no ar (20 min → dono automático), o
-- "Sem dono" do relatório vira sempre ~0 e deixa de apontar problema. A métrica
-- que passa a importar: quantos leads NOVOS do período não receberam NENHUMA
-- resposta humana (saída com autor_id — mensagem de bot tem autor_id null).
--
-- Helper separado em vez de re-criar as duas RPCs gigantes: a edge function chama
-- este count junto com a RPC principal. Janela = [p_ini, p_ini + p_dias) em
-- America/Sao_Paulo — diário usa p_dias=1, semanal p_dias=7.

create or replace function public.relatorio_trafego_sem_resposta(
  p_org uuid,
  p_ini date,
  p_dias int default 1
) returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from conversas c
  where c.organizacao_id = p_org
    and c.criado_em >= (p_ini)::timestamp at time zone 'America/Sao_Paulo'
    and c.criado_em <  (p_ini + p_dias)::timestamp at time zone 'America/Sao_Paulo'
    and not exists (
      select 1 from mensagens m
      where m.conversa_id = c.id
        and m.direcao = 'saida'
        and m.autor_id is not null
        and m.criado_em >= (p_ini)::timestamp at time zone 'America/Sao_Paulo'
        and m.criado_em <  (p_ini + p_dias)::timestamp at time zone 'America/Sao_Paulo'
    );
$$;

comment on function public.relatorio_trafego_sem_resposta(uuid, date, int) is
  'Leads novos do período sem nenhuma resposta humana (saída com autor_id). Para o relatório de tráfego.';

revoke all on function public.relatorio_trafego_sem_resposta(uuid, date, int) from public, authenticated;
grant execute on function public.relatorio_trafego_sem_resposta(uuid, date, int) to service_role;
