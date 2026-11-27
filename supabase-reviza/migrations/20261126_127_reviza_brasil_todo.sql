-- 127 · A REVIZA ATENDE O BRASIL TODO (26/11, dono: "aquela regra do RS pode desligar… eles trabalham com todos os estados").
-- A regra veio do CAF (que só atende o RS) e, na Reviza, faria dois estragos (39% dos clientes são de fora do RS):
--   • trg_lead_fora_rs: o lead novo com DDD de fora do RS virava "não elegível" (motivo nao_mora_rs) sozinho;
--   • iris_motivo_nao_tocar: a Iris (retomada, recuperação, áudio, objeção, agendamento) não tocava em cliente de fora.
-- Os dois perguntam a public.fn_ddd_fora_rs: aqui ela passa a responder sempre "não" (ninguém está "fora"), e o gatilho sai.
-- O motivo "Não mora no RS" continua existindo para quem quiser marcar à mão. Nenhum card tinha esse motivo (conferido).
-- DESFAZER: recriar fn_ddd_fora_rs como era (está no repositório do Atenvo) e o gatilho trg_lead_fora_rs.

create or replace function public.fn_ddd_fora_rs(p_contato uuid)
returns boolean language sql stable security definer set search_path = 'public' as $$
  select false   -- 26/11: a Reviza atende todos os estados (o CAF é que só atende o RS)
$$;

drop trigger if exists trg_lead_fora_rs on public.oportunidades;
