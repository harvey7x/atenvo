-- ============================================================================
-- CONTABILIDADE DO TOQUE — idempotente por (fila, toque) e com testemunha do envio.
--
-- A TERCEIRA direção do padrão "a testemunha só testemunha quando não precisa dela":
--   A e B eram "ação falhou, status diz que deu certo".
--   Esta é o INVERSO: "ação deu certo, contabilidade falhou".
--
-- CENÁRIO REAL, com dinheiro: template sai, a Meta COBRA, e então
-- bot_remarketing_registrar_toque falha (rede, timeout, deploy no meio). `toque`,
-- `ultimo_toque_em` e `proximo_em` não avançam ⇒ no ciclo seguinte a MESMA linha volta em
-- bot_remarketing_due, com o MESMO toque ⇒ MESMO template para o MESMO lead.
-- Resultado: pago duas vezes, e mensagem repetida — que é justamente o sinal que a Meta
-- pontua como spam, no número pago.
--
-- Pior: a RPC antiga fazia `toque = toque + 1` cego. Se o worker reexecutasse por segurança,
-- ela avançaria DUAS vezes e o lead pularia um passo da cadência em silêncio.
--
-- CORREÇÃO
--  1) `p_toque_esperado`: a RPC só avança se a fila ainda estiver NAQUELE toque. Chamar de novo
--     para o mesmo toque vira no-op que devolve o proximo_em já gravado — retry seguro.
--  2) `p_wamid`: guarda o id da mensagem que causou o avanço. É a testemunha independente —
--     dá para cruzar "o que a Meta cobrou" com "o que a cadência contabilizou".
--
-- Assinatura antiga REMOVIDA: com as duas vivas, um chamador esquecido continuaria avançando
-- às cegas, que é o bug que esta migration existe para fechar.
-- ============================================================================

alter table public.bot_remarketing
  add column if not exists ultimo_envio_id text;

comment on column public.bot_remarketing.ultimo_envio_id is
  'wamid/id externo da última mensagem que fez a cadência avançar. Testemunha independente: liga o toque contabilizado ao envio que a Meta cobrou.';

drop function if exists public.bot_remarketing_registrar_toque(uuid);

create or replace function public.bot_remarketing_registrar_toque(
  p_id uuid, p_toque_esperado int default null, p_wamid text default null
)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cadencia int[] := array[1,3,6,10,15];
  v_base timestamptz; v_toque int; v_novo int; v_prox timestamptz; v_status text;
begin
  select criado_em, toque, proximo_em, status into v_base, v_toque, v_prox, v_status
  from public.bot_remarketing where id = p_id for update;
  if not found then return null; end if;

  -- IDEMPOTÊNCIA: se a fila já saiu deste toque, alguém já contabilizou. Devolve o que está
  -- gravado em vez de avançar de novo — chamar duas vezes para o mesmo envio não pula passo.
  if p_toque_esperado is not null and v_toque <> p_toque_esperado then
    return v_prox;
  end if;

  v_novo := v_toque + 1;
  if v_novo >= array_length(cadencia, 1) then
    update public.bot_remarketing
      set toque = v_novo, ultimo_toque_em = now(), proximo_em = null, status = 'concluido',
          ultimo_envio_id = coalesce(p_wamid, ultimo_envio_id)
      where id = p_id;
    return null;
  end if;

  -- próximo toque é o índice (v_novo+1) da cadência 1-based; base = entrada na coluna
  v_prox := public.bot_rmkt_snap(v_base + (cadencia[v_novo + 1] || ' days')::interval);
  update public.bot_remarketing
    set toque = v_novo, ultimo_toque_em = now(), proximo_em = v_prox,
        ultimo_envio_id = coalesce(p_wamid, ultimo_envio_id)
    where id = p_id;
  return v_prox;
end $function$;

revoke all on function public.bot_remarketing_registrar_toque(uuid, int, text) from public, anon, authenticated;
grant execute on function public.bot_remarketing_registrar_toque(uuid, int, text) to service_role;
