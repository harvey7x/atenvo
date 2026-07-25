-- Relacionamento — ajustes de segurança do motor (achados da revisão adversarial).
-- Corrige duas funções da Fase 1 (já em prod) via CREATE OR REPLACE.

-- (1) HIGH — regua_pausar deve INTERROMPER envios já materializados.
-- Antes só trocava o status da ativação; agora cancela mensagens_agendadas 'agendada' + regua_envios 'agendado'
-- (espelhando regua_desativar/regua_inbound). Sem isso, um envio já materializado dispararia mesmo após pausar.
create or replace function public.regua_pausar(p_ativacao uuid) returns public.regua_ativacoes
  language plpgsql security definer set search_path = public as $$
declare a public.regua_ativacoes; v public.regua_ativacoes;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  a := public._relacionamento_ativacao_gerivel(p_ativacao);
  if a.status <> 'ativo' then raise exception 'ativacao_nao_ativa'; end if;
  update public.mensagens_agendadas set status='cancelada', cancelada_em=now(), cancelada_por=auth.uid()
    where regua_ativacao_id=p_ativacao and status='agendada';
  update public.regua_envios set status='cancelado' where ativacao_id=p_ativacao and status='agendado';
  update public.regua_ativacoes set status='pausado', pausado_em=now(), proximo_em=null, atualizado_em=now()
    where id=p_ativacao returning * into v;
  return v;
end $$;

-- (2) MEDIUM — trava de intervalo mínimo deve considerar também mensagens já materializadas ('agendada'),
-- não só as enviadas. Sem isso, sob backlog do canal, uma mensagem ainda não enviada não bloqueia a próxima
-- e o espaçamento mínimo pode ser furado (rajada até o teto). Alinha o conjunto de status ao da trava de teto.
create or replace function public.relacionamento_pode_enviar(p_ativacao uuid) returns jsonb
  language plpgsql security definer set search_path = public as $$
declare a public.regua_ativacoes; r public.reguas; n_semana int; ultimo timestamptz; can record;
begin
  select * into a from public.regua_ativacoes where id=p_ativacao;
  if a.id is null then return jsonb_build_object('ok', false, 'motivo','ativacao_nao_encontrada'); end if;
  if a.status <> 'ativo' then return jsonb_build_object('ok', false, 'motivo','nao_ativa'); end if;
  if exists (select 1 from public.relacionamento_bloqueio where contato_id=a.contato_id) then
    return jsonb_build_object('ok', false, 'motivo','bloqueado_optout');
  end if;
  select * into r from public.reguas where id=a.regua_id;

  select ativo, (status_integracao::text) si, envio_restrito, conflito_com, transporte, papel
    into can from public.canais where id=a.canal_id;
  if can is null or not (can.ativo and can.si='conectado' and not can.envio_restrito
      and can.conflito_com is null and can.transporte='evolution' and can.papel in ('atendimento','ambos')) then
    return jsonb_build_object('ok', false, 'motivo','canal_indisponivel');
  end if;

  -- teto por semana (mensagens de relacionamento deste contato nos últimos 7 dias)
  select count(*) into n_semana from public.mensagens_agendadas m
    join public.regua_ativacoes a2 on a2.id = m.regua_ativacao_id
   where a2.contato_id = a.contato_id
     and m.status in ('agendada','processando','enviada')
     and coalesce(m.enviada_em, m.executar_em) between now() - interval '7 days' and now();
  if n_semana >= r.teto_semana then return jsonb_build_object('ok', false, 'motivo','bloqueado_teto'); end if;

  -- intervalo mínimo desde o último envio (inclui 'agendada' — já materializada porém ainda não enviada)
  select max(coalesce(m.enviada_em, m.executar_em)) into ultimo from public.mensagens_agendadas m
    join public.regua_ativacoes a2 on a2.id = m.regua_ativacao_id
   where a2.contato_id = a.contato_id and m.status in ('agendada','processando','enviada');
  if ultimo is not null and ultimo > now() - make_interval(hours => r.intervalo_min_horas) then
    return jsonb_build_object('ok', false, 'motivo','intervalo_minimo');
  end if;

  -- horário/dia permitido
  if public.relacionamento_snap(r.dias_semana, r.hora_inicio, r.hora_fim, r.timezone, now()) > now() then
    return jsonb_build_object('ok', false, 'motivo','bloqueado_horario');
  end if;

  return jsonb_build_object('ok', true);
end $$;
