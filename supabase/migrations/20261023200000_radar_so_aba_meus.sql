-- ============================================================================
-- RADAR: avisos de "sem resposta" só para clientes que aparecem na aba "MEUS"
-- (pedido do dono 23/10: "não elegíveis não precisam aparecer — só os que estão em Meus").
--
-- Espelha a regra do inbox (passaTab + situacaoDaConversa + "ganho grudento" de
-- etapasDeOportunidades): o cliente SAI de "Meus" quando
--   - tem QUALQUER oportunidade ganha (FECHADO, mora na aba Fechados), ou
--   - não tem oportunidade em andamento e a mais recente é 'perdido' (NÃO ELEGÍVEL/
--     PERDIDO, mora na aba Perdidos).
-- (Arquivadas e cliente de outro dono já ficavam de fora.) O "📞 Ligar" já é mais
-- estrito (só cliente novo) e não muda. Avisos/estados ativos desses clientes são
-- encerrados pelo próprio motor no próximo tick (saem do _vac).
-- ============================================================================
do $$
declare
  d text := pg_get_functiondef('public.vacuo_avaliar(uuid)'::regprocedure);
  alvo text := 'and not coalesce(ia.ia_ativa, false)';
  novo text := 'and not coalesce(ia.ia_ativa, false)
      -- só clientes da aba "Meus": fora FECHADO (qualquer ganho) e PERDIDO/NE (sem
      -- oportunidade em andamento e a mais recente perdida) — mesma regra do inbox
      and not exists (select 1 from public.oportunidades og
                      where og.contato_id = c.contato_id and og.organizacao_id = c.organizacao_id
                        and og.status = ''ganho'')
      and not (
        not exists (select 1 from public.oportunidades oa
                    where oa.contato_id = c.contato_id and oa.organizacao_id = c.organizacao_id
                      and oa.status = ''em_andamento'')
        and coalesce((select ol.status::text from public.oportunidades ol
                      where ol.contato_id = c.contato_id and ol.organizacao_id = c.organizacao_id
                      order by ol.atualizado_em desc limit 1), '''') = ''perdido''
      )';
begin
  if position('só clientes da aba "Meus"' in d) > 0 then
    return; -- já aplicada
  end if;
  if (length(d) - length(replace(d, alvo, ''))) / length(alvo) <> 1 then
    raise exception 'vacuo_avaliar mudou: âncora não encontrada (ou ambígua) — remendar à mão';
  end if;
  execute replace(d, alvo, novo);
end $$;
