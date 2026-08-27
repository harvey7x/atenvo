-- Rede de segurança: nenhum lead fica "passando batido" quando o bot pausa sem sinalizar humano.
--
-- Problema (27/08): o bot pode PAUSAR (handoff/escalonamento) sem setar precisa_humano — aí o lead
-- some do radar (sem alerta, sem IA, sem humano) e fica esperando em silêncio. Foi o caso da Daiane
-- (CPF válido travado, "??!" 37min sem resposta).
--
-- Este vigia roda de tempos em tempos e RESGATA o órfão: conversa não arquivada, bot pausado, SEM
-- IA ativa, opp AINDA em_andamento (mid-fluxo — exclui concluídos/não-elegíveis como o Danilo),
-- última mensagem é do CLIENTE, NENHUM humano respondeu, e já esperou p_minutos. Ação: seta
-- precisa_humano (entra na fila + dispara o alerta de SLA). Idempotente: ao setar a flag, sai do
-- alvo no próximo ciclo. Janela de 24h evita ressuscitar conversas antigas.

create or replace function public.fn_resgatar_leads_orfaos(p_minutos int default 8)
 returns int
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_n int;
begin
  with cand as (
    -- filtra as conversas candidatas ANTES de olhar mensagem (barato)
    select c.id, c.contato_id, c.organizacao_id
    from public.conversas c
    where c.arquivada_em is null
      and c.precisa_humano = false
      and exists (select 1 from public.bot_conversa_estado b where b.conversa_id = c.id and b.pausado)
      and not exists (select 1 from public.ia_sessoes s where s.conversa_id = c.id and s.status = 'ativa')
      and exists (select 1 from public.oportunidades o
                  where o.contato_id = c.contato_id and o.organizacao_id = c.organizacao_id
                    and o.status = 'em_andamento')
  ),
  orfaos as (
    select cand.id
    from cand
    where not exists (
            select 1 from public.mensagens m
            where m.conversa_id = cand.id and m.direcao = 'saida'
              and (m.autor_id is not null or m.origem = 'telefone')   -- nenhum humano respondeu
          )
      and (select m.direcao from public.mensagens m where m.conversa_id = cand.id
           order by m.criado_em desc limit 1) = 'entrada'              -- cliente falou por último
      and (select max(m.criado_em) from public.mensagens m where m.conversa_id = cand.id)
            between now() - interval '24 hours' and now() - make_interval(mins => p_minutos)
  )
  update public.conversas c
     set precisa_humano = true,
         precisa_humano_motivo = 'orfao_bot_pausou',
         precisa_humano_em = now()
  from orfaos o
  where c.id = o.id;

  get diagnostics v_n = row_count;
  return v_n;
end $function$;

grant execute on function public.fn_resgatar_leads_orfaos(int) to service_role;
