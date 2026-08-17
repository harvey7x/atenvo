-- ═══════════════════════════════════════════════════════════════════════════
-- ALERTA DE ABANDONO cobre o fluxo de VÍDEO (caf_video_juros_v1 virou o fluxo
-- PADRÃO do canal de tráfego em 2026-08-16).
--
-- alerta_lead_quente_avaliar (cron 1min, tipo 'abandono') só olhava
-- dados_qualificacao.passo_botoes — lead do fluxo de vídeo que some no meio
-- (não responde SIM/NÃO, para no nome/CPF) ficava sem alerta. Recriação FIEL
-- da versão viva + passo_video no mesmo critério.
--
-- Passos terminais que NÃO alertam:
--  * botões: '', 'fim', 'suporte_fim' (como antes);
--  * vídeo:  'fim' (fecho feito), 'recusado' (disse NÃO — é alvo de
--    remarketing, não de ligação) e 'aguardando_resultado' (legado da etapa
--    diferida removida; o fecho da época já alertou).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.alerta_lead_quente_avaliar(p_minutos integer default 10, p_max_minutos integer default 60, p_hora_ini integer default 8, p_hora_fim integer default 18, p_agora timestamp with time zone default now())
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_sp timestamp := p_agora at time zone 'America/Sao_Paulo'; v_n int := 0;
begin
  -- horário comercial: seg–sex (isodow 1..5), [p_hora_ini, p_hora_fim) em SP
  if extract(isodow from v_sp) > 5
     or extract(hour from v_sp) < p_hora_ini
     or extract(hour from v_sp) >= p_hora_fim then
    return 0;
  end if;

  insert into public.alertas_lead_quente (organizacao_id, conversa_id, contato_id, passo, abandonado_em)
  select cv.organizacao_id, cv.id, cv.contato_id,
         coalesce(e.dados_qualificacao->>'passo_botoes', e.dados_qualificacao->>'passo_video'), cv.ultima_entrada_em
    from public.conversas cv
    join public.bot_conversa_estado e on e.conversa_id = cv.id
   where cv.atendente_id is null
     and cv.status in ('aberta','em_atendimento','pendente')
     and cv.ultima_entrada_em is not null
     and cv.ultima_entrada_em <= p_agora - make_interval(mins => p_minutos)
     and cv.ultima_entrada_em >= p_agora - make_interval(mins => p_max_minutos)
     and coalesce(e.pausado, false) = false
     and e.etapa is distinct from 'concluido'
     and (e.dados_qualificacao ? 'passo_botoes' or e.dados_qualificacao ? 'passo_video')
     and coalesce(e.dados_qualificacao->>'passo_botoes', e.dados_qualificacao->>'passo_video', '')
         not in ('', 'fim', 'suporte_fim', 'recusado', 'aguardando_resultado')
     -- nada aconteceu (nem cliente, nem bot) há p_minutos: se o bot ainda está
     -- conversando, ultima_atividade_em é recente e segura o alerta.
     and greatest(coalesce(e.ultima_atividade_em, cv.ultima_entrada_em), cv.ultima_entrada_em)
         <= p_agora - make_interval(mins => p_minutos)
  on conflict (conversa_id) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end $function$;
