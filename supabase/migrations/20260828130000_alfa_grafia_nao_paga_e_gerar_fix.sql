-- ============================================================
-- FASE 1.2 Alfa — grafia única de não pagamento + fixes na geração
--
-- Grafia: o front do modo Cobrança inteiro fala 'nao_paga' (tipo
-- ParcelaStatus, labels, botões Pagar/Reabrir, métricas aReceber,
-- relatorios.ts, RPC alterar_status_parcela, fn_cobranca_recalc);
-- 'nao_pagou' existia só nas 162 linhas importadas da Alfa (M3 a
-- introduziu por briefing, sem saber do legado). VENCE 'nao_paga':
-- converge as linhas e o check volta a aceitar UMA grafia só.
--
-- gerar_pagamentos_competencia — dois consertos:
-- 1) prevista CANCELADA não pode contar como "já existe" (senão
--    cancelar a previsão de um mês impede recriar quando a
--    mensalidade for definida);
-- 2) cobrança SEM valor_mensal não gera previsão (era a origem das
--    34 previstas com valor null); e o filtro de status vira
--    <> 'cancelado' — cobrança que o recalc marcou 'finalizado' por
--    ficar sem prevista volta a gerar quando a mensalidade chegar
--    (o insert dispara o recalc, que a devolve a 'ativo' sozinho).
-- ============================================================

-- o UPDATE dispara fn_cobranca_recalc -> UPDATE em cobrancas ->
-- fn_cobranca_before, que sem auth.uid() exige a flag de serviço
-- (mesmo caminho do fan-out de responsabilidade; criado_por é
-- preservado no UPDATE)
select set_config('atenvo.sync_resp', '1', true);

update public.cobranca_pagamentos set status = 'nao_paga' where status = 'nao_pagou';

alter table public.cobranca_pagamentos drop constraint if exists chk_pag_coerencia;
alter table public.cobranca_pagamentos add constraint chk_pag_coerencia check (
  (status = 'paga' and valor_pago is not null and data_pagamento is not null)
  or (status in ('prevista', 'nao_paga', 'cancelada', 'nao_aplicavel', 'sem_registro')
      and valor_pago is null and data_pagamento is null)
);

create or replace function public.gerar_pagamentos_competencia(p_organizacao uuid, p_competencia date)
returns int
language plpgsql security definer set search_path = public as $$
declare v_comp date := date_trunc('month', p_competencia)::date; v_n int := 0; r record;
begin
  if auth.uid() is not null and not public.cobranca_gestor(p_organizacao) then
    raise exception 'sem_permissao';
  end if;
  for r in
    select c.id as cobranca_id, c.organizacao_id, c.valor_mensal, cvc.vencimento
      from public.cobrancas c
      join public.ciclo_vencimento_competencias cvc
        on cvc.ciclo_vencimento_id = c.ciclo_vencimento_id and cvc.competencia = v_comp
     where c.organizacao_id = p_organizacao
       and c.status <> 'cancelado'
       and c.ciclo_vencimento_id is not null
       and c.valor_mensal is not null
       and not exists (select 1 from public.cobranca_pagamentos p
                        where p.cobranca_id = c.id and p.competencia = v_comp
                          and p.status <> 'cancelada')
  loop
    insert into public.cobranca_pagamentos
      (organizacao_id, cobranca_id, ciclo, valor, data_prevista, competencia, status)
    values
      (r.organizacao_id, r.cobranca_id,
       (select coalesce(max(ciclo), 0) + 1 from public.cobranca_pagamentos where cobranca_id = r.cobranca_id),
       r.valor_mensal, r.vencimento, v_comp, 'prevista');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
