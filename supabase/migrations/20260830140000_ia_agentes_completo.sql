-- ============================================================================
-- IA configurável — "total completo" (30/08, pedido do dono):
--  (a) ia_agentes.conhecimento — o que o atendente SABE da empresa (injetado no
--      system prompt pelo motor; separado do prompt de personalidade).
--  (b) RPC ia_agente_metricas — atividade real do agente pro painel (sessões
--      ativas, chamadas de IA hoje, follow-ups hoje, handoffs 7d), somando os
--      canais vinculados. Leitura: qualquer membro da org (números, sem PII).
--  Demais opções novas (temas proibidos, emojis, digitação, tom, modelos
--  docs/pro) moram em ia_agentes.comportamentos (jsonb) — sem mudança de schema.
-- ============================================================================

alter table public.ia_agentes
  add column if not exists conhecimento text not null default '';

create or replace function public.ia_agente_metricas(p_agente uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_canais uuid[];
  v_inicio_dia timestamptz;
  v_sessoes_ativas int;
  v_chamadas_hoje int;
  v_nudges_hoje int;
  v_handoffs_7d int;
begin
  select organizacao_id into v_org from public.ia_agentes where id = p_agente;
  if v_org is null then
    raise exception 'Agente não encontrado';
  end if;
  if not (is_platform_admin() or is_member(v_org)) then
    raise exception 'Sem permissão';
  end if;

  select coalesce(array_agg(canal_id), '{}'::uuid[]) into v_canais
    from public.bot_canal_config where ia_agente_id = p_agente;

  -- começo do dia no relógio de SP, devolvido em UTC
  v_inicio_dia := (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');

  select count(*) into v_sessoes_ativas
    from public.ia_sessoes s
   where s.canal_id = any (v_canais) and s.status = 'ativa';

  select count(*) into v_chamadas_hoje
    from public.ia_eventos e
    join public.ia_sessoes s on s.id = e.sessao_id
   where s.canal_id = any (v_canais) and e.tipo = 'gemini_call' and e.criado_em >= v_inicio_dia;

  select count(*) into v_nudges_hoje
    from public.ia_eventos e
    join public.ia_sessoes s on s.id = e.sessao_id
   where s.canal_id = any (v_canais) and e.tipo = 'nudge_enviado' and e.criado_em >= v_inicio_dia;

  select count(*) into v_handoffs_7d
    from public.ia_sessoes s
   where s.canal_id = any (v_canais) and s.status = 'handoff'
     and s.atualizado_em >= now() - interval '7 days';

  return jsonb_build_object(
    'sessoes_ativas', v_sessoes_ativas,
    'chamadas_hoje', v_chamadas_hoje,
    'nudges_hoje', v_nudges_hoje,
    'handoffs_7d', v_handoffs_7d,
    'canais', coalesce(array_length(v_canais, 1), 0)
  );
end $$;

revoke all on function public.ia_agente_metricas(uuid) from public, anon;
grant execute on function public.ia_agente_metricas(uuid) to authenticated, service_role;
