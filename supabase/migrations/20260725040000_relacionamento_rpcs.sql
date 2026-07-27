-- Relacionamento — Fase 1 (Bloco B: RPCs).
-- Toda escrita passa por aqui (RLS das tabelas é só SELECT). Padrão: SECURITY DEFINER,
-- set search_path=public, checagem auth.uid(), gate de papel, revoke/grant.
--
-- Gates:
--   * CRUD de régua/passo → public.relacionamento_admin(org)  (somente admin)
--   * Ativação/pausa/desativação/troca/bloqueio → _relacionamento_pode_gerir_contato(org, contato)
--     (admin/supervisor em qualquer contato; atendente só nos próprios)
--
-- O MOTOR (materializar/pode_enviar/inbound) fica INERTE nesta fase: não há cron nem hook de webhook
-- criados aqui. Serão ligados num bloco posterior. Nada dispara envio ao aplicar esta migration.

-- ============================================================================
-- 0) Gate de gestão por contato (ativação e ações no cliente)
-- ============================================================================
create or replace function public._relacionamento_pode_gerir_contato(p_org uuid, p_contato uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select case
    when public.is_platform_admin() then true
    when not (public.is_member(p_org) and public.org_operacional(p_org)) then false
    -- o contato PRECISA pertencer à org p_org (fecha escrita cross-tenant, ex.: relacionamento_bloquear via ON CONFLICT)
    when not exists (select 1 from public.contatos c where c.id = p_contato and c.organizacao_id = p_org) then false
    -- admin/supervisor em qualquer contato da org; atendente só nos próprios
    else public.org_papel(p_org) in ('admin','supervisor')
      or exists (select 1 from public.contatos c
                 where c.id = p_contato and c.organizacao_id = p_org and c.responsavel_id = auth.uid())
  end;
$$;
revoke all on function public._relacionamento_pode_gerir_contato(uuid,uuid) from public, anon;
grant execute on function public._relacionamento_pode_gerir_contato(uuid,uuid) to authenticated;

-- ============================================================================
-- 1) CRUD de régua (somente admin) — upsert tipado
-- ============================================================================
create or replace function public.regua_salvar(
  p_org uuid,
  p_id uuid default null,
  p_nome text default null,
  p_objetivo text default null,
  p_status text default null,
  p_publico text default null,
  p_pausar_se_responder boolean default null,
  p_teto_semana int default null,
  p_intervalo_min_horas int default null,
  p_dias_semana int[] default null,
  p_hora_inicio time default null,
  p_hora_fim time default null,
  p_timezone text default null,
  p_canal_padrao uuid default null
) returns public.reguas
  language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v public.reguas;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.relacionamento_admin(p_org) then raise exception 'sem_permissao'; end if;

  if p_id is null then
    if coalesce(btrim(p_nome),'') = '' then raise exception 'nome_obrigatorio'; end if;
    if p_objetivo is null then raise exception 'objetivo_obrigatorio'; end if;
    insert into public.reguas(
      organizacao_id, nome, objetivo, status, publico_sugerido, pausar_se_responder,
      teto_semana, intervalo_min_horas, dias_semana, hora_inicio, hora_fim, timezone,
      canal_padrao_id, criado_por
    ) values (
      p_org, btrim(p_nome), p_objetivo, coalesce(p_status,'rascunho'), p_publico,
      coalesce(p_pausar_se_responder, true), coalesce(p_teto_semana,3), coalesce(p_intervalo_min_horas,48),
      coalesce(p_dias_semana, '{1,2,3,4,5}'), coalesce(p_hora_inicio,'08:00'), coalesce(p_hora_fim,'18:00'),
      coalesce(p_timezone,'America/Sao_Paulo'), p_canal_padrao, uid
    ) returning * into v;
  else
    update public.reguas set
      nome = coalesce(nullif(btrim(p_nome),''), nome),
      objetivo = coalesce(p_objetivo, objetivo),
      status = coalesce(p_status, status),
      publico_sugerido = coalesce(p_publico, publico_sugerido),
      pausar_se_responder = coalesce(p_pausar_se_responder, pausar_se_responder),
      teto_semana = coalesce(p_teto_semana, teto_semana),
      intervalo_min_horas = coalesce(p_intervalo_min_horas, intervalo_min_horas),
      dias_semana = coalesce(p_dias_semana, dias_semana),
      hora_inicio = coalesce(p_hora_inicio, hora_inicio),
      hora_fim = coalesce(p_hora_fim, hora_fim),
      timezone = coalesce(p_timezone, timezone),
      canal_padrao_id = coalesce(p_canal_padrao, canal_padrao_id),
      atualizado_em = now()
    where id = p_id and organizacao_id = p_org
    returning * into v;
    if v.id is null then raise exception 'regua_nao_encontrada'; end if;
  end if;
  return v;
end $$;

create or replace function public.regua_arquivar(p_org uuid, p_id uuid) returns public.reguas
  language plpgsql security definer set search_path = public as $$
declare v public.reguas;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.relacionamento_admin(p_org) then raise exception 'sem_permissao'; end if;
  update public.reguas set status='arquivada', atualizado_em=now()
    where id=p_id and organizacao_id=p_org returning * into v;
  if v.id is null then raise exception 'regua_nao_encontrada'; end if;
  return v;
end $$;

create or replace function public.regua_excluir(p_org uuid, p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.relacionamento_admin(p_org) then raise exception 'sem_permissao'; end if;
  -- fk_ativ_regua é ON DELETE RESTRICT (preserva histórico): régua com QUALQUER ativação (inclusive
  -- desativada/histórica) não é excluível — nesse caso, arquive (regua_arquivar) em vez de excluir.
  if exists (select 1 from public.regua_ativacoes
             where regua_id=p_id and organizacao_id=p_org) then
    raise exception 'regua_possui_historico';
  end if;
  delete from public.reguas where id=p_id and organizacao_id=p_org;
  if not found then raise exception 'regua_nao_encontrada'; end if;
end $$;

-- ============================================================================
-- 2) Passos (somente admin) — upsert / remover
-- ============================================================================
create or replace function public.regua_passo_salvar(
  p_org uuid, p_regua uuid, p_id uuid,
  p_ordem smallint, p_titulo text, p_tipo text,
  p_texto text, p_storage_path text, p_mime text, p_nome text, p_tamanho bigint,
  p_agendamento_tipo text, p_offset_horas int, p_dia_semana int, p_hora time, p_data date
) returns public.regua_passos
  language plpgsql security definer set search_path = public as $$
declare v public.regua_passos;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.relacionamento_admin(p_org) then raise exception 'sem_permissao'; end if;
  if not exists (select 1 from public.reguas where id=p_regua and organizacao_id=p_org) then
    raise exception 'regua_nao_encontrada';
  end if;

  if p_id is null then
    insert into public.regua_passos(
      regua_id, organizacao_id, ordem, titulo_interno, tipo, texto, storage_path, mime_type,
      nome_arquivo, tamanho_bytes, agendamento_tipo, offset_horas, dia_semana, hora, data
    ) values (
      p_regua, p_org, p_ordem, p_titulo, p_tipo, p_texto, p_storage_path, p_mime,
      p_nome, p_tamanho, p_agendamento_tipo, p_offset_horas, p_dia_semana, p_hora, p_data
    ) returning * into v;
  else
    update public.regua_passos set
      ordem=p_ordem, titulo_interno=p_titulo, tipo=p_tipo, texto=p_texto, storage_path=p_storage_path,
      mime_type=p_mime, nome_arquivo=p_nome, tamanho_bytes=p_tamanho, agendamento_tipo=p_agendamento_tipo,
      offset_horas=p_offset_horas, dia_semana=p_dia_semana, hora=p_hora, data=p_data, atualizado_em=now()
    where id=p_id and regua_id=p_regua and organizacao_id=p_org returning * into v;
    if v.id is null then raise exception 'passo_nao_encontrado'; end if;
  end if;
  return v;
end $$;

create or replace function public.regua_passo_remover(p_org uuid, p_id uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.relacionamento_admin(p_org) then raise exception 'sem_permissao'; end if;
  delete from public.regua_passos where id=p_id and organizacao_id=p_org;
  if not found then raise exception 'passo_nao_encontrado'; end if;
end $$;

-- ============================================================================
-- 3) Ativação por cliente — ativar / pausar / retomar / desativar / trocar
-- ============================================================================
create or replace function public.regua_ativar(
  p_org uuid, p_regua uuid, p_contato uuid, p_canal uuid, p_conversa uuid default null
) returns public.regua_ativacoes
  language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); v_reg record; v_cont record; v_can record; v_conv uuid; v public.regua_ativacoes;
begin
  if uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public._relacionamento_pode_gerir_contato(p_org, p_contato) then raise exception 'sem_permissao'; end if;

  select id, status into v_reg from public.reguas where id=p_regua and organizacao_id=p_org;
  if v_reg.id is null then raise exception 'regua_nao_encontrada'; end if;
  if v_reg.status <> 'ativa' then raise exception 'regua_nao_ativa'; end if;

  select id, responsavel_id into v_cont from public.contatos where id=p_contato and organizacao_id=p_org;
  if v_cont.id is null then raise exception 'contato_nao_encontrado'; end if;

  if exists (select 1 from public.relacionamento_bloqueio where contato_id=p_contato) then
    raise exception 'contato_bloqueado';
  end if;

  -- canal NORMAL enviável (transporte evolution, papel atendimento/ambos, conectado)
  select ativo, (status_integracao::text) as si, envio_restrito, conflito_com, transporte, papel
    into v_can from public.canais where id=p_canal and organizacao_id=p_org;
  if v_can is null then raise exception 'canal_nao_encontrado'; end if;
  if not (v_can.ativo and v_can.si='conectado' and not v_can.envio_restrito
          and v_can.conflito_com is null and v_can.transporte='evolution'
          and v_can.papel in ('atendimento','ambos')) then
    raise exception 'canal_nao_enviavel';
  end if;

  -- conversa não-fechada (informada ou resolvida); pode ficar null (motor resolve/cria depois)
  if p_conversa is not null then
    select id into v_conv from public.conversas
      where id=p_conversa and organizacao_id=p_org and contato_id=p_contato
        and status <> 'fechada' and arquivada_em is null;   -- exige conversa não-fechada (igual ao ramo automático)
    if v_conv is null then raise exception 'conversa_invalida'; end if;
  else
    select id into v_conv from public.conversas
      where organizacao_id=p_org and contato_id=p_contato and status <> 'fechada' and arquivada_em is null
      order by ultima_interacao_em desc nulls last limit 1;
  end if;

  -- 1 régua ativa/pausada por contato
  if exists (select 1 from public.regua_ativacoes
             where organizacao_id=p_org and contato_id=p_contato and status in ('ativo','pausado')) then
    raise exception 'ja_tem_relacionamento_ativo';
  end if;

  insert into public.regua_ativacoes(
    organizacao_id, regua_id, contato_id, conversa_id, canal_id, responsavel_id,
    status, passo_atual, proximo_em, ativado_por, ativado_em, atualizado_em
  ) values (
    p_org, p_regua, p_contato, v_conv, p_canal, coalesce(v_cont.responsavel_id, uid),
    'ativo', 0, now(), uid, now(), now()
  ) returning * into v;
  return v;
end $$;

-- helper interno p/ ações sobre uma ativação existente (resolve org+contato e checa gate)
create or replace function public._relacionamento_ativacao_gerivel(p_ativacao uuid)
  returns public.regua_ativacoes
  language plpgsql security definer set search_path = public as $$
declare a public.regua_ativacoes;
begin
  select * into a from public.regua_ativacoes where id=p_ativacao;
  if a.id is null then raise exception 'ativacao_nao_encontrada'; end if;
  if not public._relacionamento_pode_gerir_contato(a.organizacao_id, a.contato_id) then
    raise exception 'sem_permissao';
  end if;
  return a;
end $$;

create or replace function public.regua_pausar(p_ativacao uuid) returns public.regua_ativacoes
  language plpgsql security definer set search_path = public as $$
declare a public.regua_ativacoes; v public.regua_ativacoes;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  a := public._relacionamento_ativacao_gerivel(p_ativacao);
  if a.status <> 'ativo' then raise exception 'ativacao_nao_ativa'; end if;
  update public.regua_ativacoes set status='pausado', pausado_em=now(), atualizado_em=now()
    where id=p_ativacao returning * into v;
  return v;
end $$;

create or replace function public.regua_retomar(p_ativacao uuid) returns public.regua_ativacoes
  language plpgsql security definer set search_path = public as $$
declare a public.regua_ativacoes; v public.regua_ativacoes;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  a := public._relacionamento_ativacao_gerivel(p_ativacao);
  if a.status <> 'pausado' then raise exception 'ativacao_nao_pausada'; end if;
  update public.regua_ativacoes set status='ativo', pausado_em=null, proximo_em=now(), atualizado_em=now()
    where id=p_ativacao returning * into v;
  return v;
end $$;

-- desativa e CANCELA os envios futuros já materializados em mensagens_agendadas
create or replace function public.regua_desativar(p_ativacao uuid, p_motivo text default null)
  returns public.regua_ativacoes
  language plpgsql security definer set search_path = public as $$
declare a public.regua_ativacoes; v public.regua_ativacoes;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  a := public._relacionamento_ativacao_gerivel(p_ativacao);
  if a.status = 'desativado' then return a; end if;

  update public.mensagens_agendadas
     set status='cancelada', cancelada_em=now(), cancelada_por=auth.uid()
   where regua_ativacao_id=p_ativacao and status='agendada';
  update public.regua_envios set status='cancelado'
   where ativacao_id=p_ativacao and status='agendado';

  update public.regua_ativacoes
     set status='desativado', desativado_em=now(), proximo_em=null, motivo_saida=p_motivo, atualizado_em=now()
   where id=p_ativacao returning * into v;
  return v;
end $$;

-- troca: desativa a atual (cancela pendentes) e cria nova ativação na régua nova
create or replace function public.regua_trocar(p_ativacao uuid, p_nova_regua uuid)
  returns public.regua_ativacoes
  language plpgsql security definer set search_path = public as $$
declare a public.regua_ativacoes; nova public.regua_ativacoes;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  a := public._relacionamento_ativacao_gerivel(p_ativacao);
  perform public.regua_desativar(p_ativacao, 'troca_de_regua');
  -- conversa NULL: regua_ativar re-resolve a conversa não-fechada atual (a.conversa_id pode ter fechado desde a ativação original)
  nova := public.regua_ativar(a.organizacao_id, p_nova_regua, a.contato_id, a.canal_id, null);
  return nova;
end $$;

-- ============================================================================
-- 4) "Não incomodar" global
-- ============================================================================
create or replace function public.relacionamento_bloquear(p_org uuid, p_contato uuid, p_motivo text default null)
  returns void language plpgsql security definer set search_path = public as $$
declare a public.regua_ativacoes;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public._relacionamento_pode_gerir_contato(p_org, p_contato) then raise exception 'sem_permissao'; end if;
  insert into public.relacionamento_bloqueio(contato_id, organizacao_id, motivo, criado_por)
    values (p_contato, p_org, p_motivo, auth.uid())
    on conflict (contato_id) do update set motivo=excluded.motivo, criado_por=excluded.criado_por, criado_em=now();
  -- desativa relacionamento ativo do contato (cancela pendentes)
  for a in select id from public.regua_ativacoes
           where organizacao_id=p_org and contato_id=p_contato and status in ('ativo','pausado') loop
    perform public.regua_desativar(a.id, 'nao_incomodar');
  end loop;
end $$;

create or replace function public.relacionamento_desbloquear(p_org uuid, p_contato uuid)
  returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public._relacionamento_pode_gerir_contato(p_org, p_contato) then raise exception 'sem_permissao'; end if;
  delete from public.relacionamento_bloqueio where contato_id=p_contato and organizacao_id=p_org;
end $$;

-- ============================================================================
-- 5) MOTOR (INERTE nesta fase — sem cron/hook). Definido para o bloco seguinte.
-- ============================================================================
-- Guarda de frequência/horário/optout. Retorna {ok, motivo}. service_role (chamado pelo runner).
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

  -- canal ainda enviável?
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
     and coalesce(m.enviada_em, m.executar_em) between now() - interval '7 days' and now();  -- janela real; não conta futuros (data_fixa)
  if n_semana >= r.teto_semana then return jsonb_build_object('ok', false, 'motivo','bloqueado_teto'); end if;

  -- intervalo mínimo desde o último envio
  select max(coalesce(m.enviada_em, m.executar_em)) into ultimo from public.mensagens_agendadas m
    join public.regua_ativacoes a2 on a2.id = m.regua_ativacao_id
   where a2.contato_id = a.contato_id and m.status in ('processando','enviada');
  if ultimo is not null and ultimo > now() - make_interval(hours => r.intervalo_min_horas) then
    return jsonb_build_object('ok', false, 'motivo','intervalo_minimo');
  end if;

  -- horário/dia permitido
  if public.relacionamento_snap(r.dias_semana, r.hora_inicio, r.hora_fim, r.timezone, now()) > now() then
    return jsonb_build_object('ok', false, 'motivo','bloqueado_horario');
  end if;

  return jsonb_build_object('ok', true);
end $$;

-- Inbound: se a régua pausa quem responde, pausa a ativação e cancela o próximo envio.
-- (Será chamado pelo webhook num bloco posterior; inerte por ora.)
create or replace function public.regua_inbound(p_conversa uuid, p_texto text) returns void
  language plpgsql security definer set search_path = public as $$
declare a public.regua_ativacoes; r public.reguas;
begin
  select * into a from public.regua_ativacoes
    where conversa_id=p_conversa and status='ativo' limit 1;
  if a.id is null then return; end if;
  select * into r from public.reguas where id=a.regua_id;
  if not coalesce(r.pausar_se_responder, true) then return; end if;

  update public.mensagens_agendadas
     set status='cancelada', cancelada_em=now()
   where regua_ativacao_id=a.id and status='agendada';
  -- cancela os passos ainda não enviados (consistente com regua_desativar)
  update public.regua_envios set status='cancelado'
   where ativacao_id=a.id and status='agendado';
  -- registra a resposta no ÚLTIMO passo de fato ENVIADO (não nos passos que nunca saíram)
  update public.regua_envios set resposta_em=now()
   where id = (select id from public.regua_envios
               where ativacao_id=a.id and status='enviado' and resposta_em is null
               order by enviado_em desc nulls last limit 1);
  update public.regua_ativacoes
     set status='pausado', pausado_em=now(), motivo_saida='respondeu', proximo_em=null, atualizado_em=now()
   where id=a.id;
end $$;

-- ============================================================================
-- 6) Privilégios das funções
-- ============================================================================
-- Ações de usuário (JWT): authenticated apenas.
revoke all on function
  public.regua_salvar(uuid,uuid,text,text,text,text,boolean,int,int,int[],time,time,text,uuid),
  public.regua_arquivar(uuid,uuid),
  public.regua_excluir(uuid,uuid),
  public.regua_passo_salvar(uuid,uuid,uuid,smallint,text,text,text,text,text,text,bigint,text,int,int,time,date),
  public.regua_passo_remover(uuid,uuid),
  public.regua_ativar(uuid,uuid,uuid,uuid,uuid),
  public.regua_pausar(uuid),
  public.regua_retomar(uuid),
  public.regua_desativar(uuid,text),
  public.regua_trocar(uuid,uuid),
  public.relacionamento_bloquear(uuid,uuid,text),
  public.relacionamento_desbloquear(uuid,uuid),
  public._relacionamento_ativacao_gerivel(uuid)
  from public, anon;

grant execute on function
  public.regua_salvar(uuid,uuid,text,text,text,text,boolean,int,int,int[],time,time,text,uuid),
  public.regua_arquivar(uuid,uuid),
  public.regua_excluir(uuid,uuid),
  public.regua_passo_salvar(uuid,uuid,uuid,smallint,text,text,text,text,text,text,bigint,text,int,int,time,date),
  public.regua_passo_remover(uuid,uuid),
  public.regua_ativar(uuid,uuid,uuid,uuid,uuid),
  public.regua_pausar(uuid),
  public.regua_retomar(uuid),
  public.regua_desativar(uuid,text),
  public.regua_trocar(uuid,uuid),
  public.relacionamento_bloquear(uuid,uuid,text),
  public.relacionamento_desbloquear(uuid,uuid)
  to authenticated;

-- Motor: service_role (runner/cron do bloco seguinte).
revoke all on function
  public.relacionamento_pode_enviar(uuid),
  public.regua_inbound(uuid,text)
  from public, anon;
grant execute on function
  public.relacionamento_pode_enviar(uuid),
  public.regua_inbound(uuid,text)
  to service_role;
