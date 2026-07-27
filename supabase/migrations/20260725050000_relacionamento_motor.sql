-- Relacionamento — Motor de materialização (INERTE por padrão).
-- Materializa o próximo passo de cada ativação ATIVA como linha em public.mensagens_agendadas;
-- quem ENVIA continua sendo o processador existente (cron 'mensagens-agendadas-processar' + evolution-send).
-- Nada envia até `relacionamento_config.motor_ativo=true` para a organização (default FALSE).
--
-- Cadência pelo próprio passo: agendamento_tipo 'semanal' recorre (ex.: "boa segunda"); 'relativo'/'data_fixa'
-- disparam uma vez (dedup por regua_envios). Todas as travas anti-spam via relacionamento_pode_enviar.
--
-- IMPORTANTE (correção da revisão): materializa SÓ QUANDO A OCORRÊNCIA VENCE (não pré-materializa à frente).
-- Assim now() == instante do envio e as travas (teto/intervalo/horário) valem no momento certo; e não sobra
-- envio futuro pendurado que o "pausar" precisaria cancelar. NÃO cria conversa (reagenda se não houver aberta).

-- ============================================================================
-- 1) Config por organização (interruptor mestre)
-- ============================================================================
create table public.relacionamento_config (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  motor_ativo boolean not null default false,
  horizonte_dias int not null default 2 check (horizonte_dias between 1 and 30),  -- reservado (uso futuro)
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.usuarios(id)
);
revoke all on table public.relacionamento_config from anon, authenticated;
grant select on table public.relacionamento_config to authenticated;
alter table public.relacionamento_config enable row level security;
create policy relconf_sel on public.relacionamento_config for select using (
  public.is_platform_admin() or (public.is_member(organizacao_id) and public.org_operacional(organizacao_id))
);

-- liga/desliga o motor (somente admin)
create or replace function public.relacionamento_motor_config(p_org uuid, p_ativo boolean, p_horizonte int default null)
  returns public.relacionamento_config language plpgsql security definer set search_path = public as $$
declare v public.relacionamento_config;
begin
  if auth.uid() is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if not public.relacionamento_admin(p_org) then raise exception 'sem_permissao'; end if;
  insert into public.relacionamento_config(organizacao_id, motor_ativo, horizonte_dias, atualizado_por)
    values (p_org, p_ativo, coalesce(p_horizonte, 2), auth.uid())
    on conflict (organizacao_id) do update set
      motor_ativo = excluded.motor_ativo,
      horizonte_dias = coalesce(p_horizonte, public.relacionamento_config.horizonte_dias),
      atualizado_em = now(), atualizado_por = auth.uid()
    returning * into v;
  return v;
end $$;
revoke all on function public.relacionamento_motor_config(uuid,boolean,int) from public, anon;
grant execute on function public.relacionamento_motor_config(uuid,boolean,int) to authenticated;

-- ============================================================================
-- 2) Helpers (variáveis, saudação, próxima ocorrência semanal)
-- ============================================================================
create or replace function public._relacionamento_saudacao(p_ts timestamptz, p_tz text) returns text
  language sql immutable set search_path = public as $$
  select case
    when extract(hour from (p_ts at time zone p_tz)) < 12 then 'Bom dia'
    when extract(hour from (p_ts at time zone p_tz)) < 18 then 'Boa tarde'
    else 'Boa noite' end;
$$;

create or replace function public._relacionamento_preencher(p_texto text, p_primeiro text, p_nome text, p_atendente text, p_saudacao text) returns text
  language sql immutable set search_path = public as $$
  select case when p_texto is null then null else
    replace(replace(replace(replace(replace(p_texto,
      '{{primeiro_nome}}', coalesce(nullif(btrim(p_primeiro), ''), '')),
      '{{nome_cliente}}', coalesce(p_nome, '')),
      '{{saudacao}}', coalesce(p_saudacao, '')),
      '{{nome_atendente}}', coalesce(p_atendente, '')),
      '{{empresa}}', 'CAF')
  end;
$$;

-- próxima data/hora do dia da semana p_dia (0=dom..6=sáb) estritamente após p_apos, no fuso p_tz
create or replace function public._relacionamento_prox_semanal(p_dia int, p_hora time, p_tz text, p_apos timestamptz) returns timestamptz
  language plpgsql immutable set search_path = public as $$
declare loc timestamp := (p_apos at time zone p_tz); d date := loc::date; cand timestamp; i int := 0;
begin
  loop
    if extract(dow from d)::int = p_dia then
      cand := d + p_hora;
      if cand > loc then return cand at time zone p_tz; end if;
    end if;
    d := d + 1; i := i + 1;
    if i > 8 then return (d + p_hora) at time zone p_tz; end if;  -- guarda anti-loop
  end loop;
end $$;

revoke all on function public._relacionamento_saudacao(timestamptz,text) from public, anon;
revoke all on function public._relacionamento_preencher(text,text,text,text,text) from public, anon;
revoke all on function public._relacionamento_prox_semanal(int,time,text,timestamptz) from public, anon;
grant execute on function public._relacionamento_saudacao(timestamptz,text),
  public._relacionamento_preencher(text,text,text,text,text),
  public._relacionamento_prox_semanal(int,time,text,timestamptz) to service_role;

-- ============================================================================
-- 3) Materializador (service_role; chamado pelo cron). INERTE se motor_ativo=false.
--    Materializa SÓ quando a ocorrência VENCE (executar_em = now()); nada de pré-agendar à frente.
-- ============================================================================
create or replace function public.regua_materializar_proximo(p_limite int default 200)
  returns int language plpgsql security definer set search_path = public as $$
declare
  a public.regua_ativacoes; r public.reguas; p public.regua_passos;
  v_melhor_passo public.regua_passos; v_canal record;
  cfg record; n int := 0;
  v_quando timestamptz; v_melhor timestamptz; v_pode jsonb; v_conv uuid;
  v_nome text; v_atend text; v_texto text; v_msg uuid; v_base timestamptz; v_ult timestamptz;
begin
  for a in
    select * from public.regua_ativacoes
     where status = 'ativo' and proximo_em is not null and proximo_em <= now()
     order by proximo_em asc limit p_limite for update skip locked
  loop
    -- interruptor mestre por organização (INERTE se off)
    select motor_ativo into cfg from public.relacionamento_config where organizacao_id = a.organizacao_id;
    if not found or not coalesce(cfg.motor_ativo, false) then
      update public.regua_ativacoes set proximo_em = now() + interval '1 hour' where id = a.id; continue;
    end if;

    select * into r from public.reguas where id = a.regua_id;
    if r.id is null or r.status <> 'ativa' then
      update public.regua_ativacoes set proximo_em = now() + interval '6 hours' where id = a.id; continue;
    end if;

    -- próxima ocorrência mais cedo, ainda não materializada, entre todos os passos
    v_melhor := null; v_melhor_passo := null;
    for p in select * from public.regua_passos where regua_id = a.regua_id order by ordem loop
      if p.agendamento_tipo = 'relativo' then
        if exists (select 1 from public.regua_envios where ativacao_id = a.id and passo_id = p.id) then continue; end if;
        v_quando := a.ativado_em + make_interval(hours => coalesce(p.offset_horas, 0));
      elsif p.agendamento_tipo = 'data_fixa' then
        if exists (select 1 from public.regua_envios where ativacao_id = a.id and passo_id = p.id) then continue; end if;
        v_quando := (p.data + coalesce(p.hora, time '09:00')) at time zone r.timezone;
      else -- semanal (recorrente): próxima ocorrência após a última já registrada
        select max(executar_em) into v_ult from public.regua_envios where ativacao_id = a.id and passo_id = p.id;
        v_base := greatest(coalesce(v_ult, a.ativado_em), now() - interval '1 hour');
        v_quando := public._relacionamento_prox_semanal(coalesce(p.dia_semana, 1), coalesce(p.hora, time '09:00'), r.timezone, v_base);
      end if;
      v_quando := public.relacionamento_snap(r.dias_semana, r.hora_inicio, r.hora_fim, r.timezone, v_quando);
      if v_quando is not null and (v_melhor is null or v_quando < v_melhor) then v_melhor := v_quando; v_melhor_passo := p; end if;
    end loop;

    if v_melhor is null then
      update public.regua_ativacoes set proximo_em = null where id = a.id; continue;  -- nada mais a agendar
    end if;
    if v_melhor > now() then
      -- ainda não venceu: espera até a ocorrência (NÃO pré-materializa)
      update public.regua_ativacoes set proximo_em = v_melhor where id = a.id; continue;
    end if;

    -- VENCEU: as travas valem em now() (== instante do envio), executar_em = now()
    v_pode := public.relacionamento_pode_enviar(a.id);
    if not (v_pode->>'ok')::boolean then
      update public.regua_ativacoes set proximo_em =
        case (v_pode->>'motivo')
          when 'bloqueado_horario' then public.relacionamento_snap(r.dias_semana, r.hora_inicio, r.hora_fim, r.timezone, now() + interval '5 minutes')
          when 'bloqueado_teto' then now() + interval '1 day'
          when 'intervalo_minimo' then now() + make_interval(hours => r.intervalo_min_horas)
          when 'canal_indisponivel' then now() + interval '2 hours'
          else null  -- optout / nao_ativa: encerra a reavaliação
        end
      where id = a.id; continue;
    end if;

    -- conversa aberta do contato (NÃO cria conversa nesta versão)
    select id into v_conv from public.conversas
      where organizacao_id = a.organizacao_id and contato_id = a.contato_id and status <> 'fechada' and arquivada_em is null
      order by ultima_interacao_em desc nulls last limit 1;
    if v_conv is null then
      update public.regua_ativacoes set proximo_em = now() + interval '1 day' where id = a.id; continue;
    end if;

    select ativo, nome_interno, numero_conectado into v_canal from public.canais where id = a.canal_id;
    select nome into v_nome from public.contatos where id = a.contato_id;
    select nome into v_atend from public.usuarios where id = coalesce(a.responsavel_id, a.ativado_por);
    v_texto := public._relacionamento_preencher(
      v_melhor_passo.texto, split_part(coalesce(v_nome, ''), ' ', 1), v_nome, v_atend,
      public._relacionamento_saudacao(now(), r.timezone));

    insert into public.mensagens_agendadas(
      organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot,
      criado_por, tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, metadados, regua_ativacao_id
    ) values (
      a.organizacao_id, v_conv, a.contato_id, a.canal_id, v_canal.nome_interno, v_canal.numero_conectado,
      coalesce(a.responsavel_id, a.ativado_por), v_melhor_passo.tipo, v_texto,
      v_melhor_passo.storage_path, v_melhor_passo.mime_type, v_melhor_passo.nome_arquivo, v_melhor_passo.tamanho_bytes,
      now(), jsonb_build_object('origem', 'relacionamento', 'passo_id', v_melhor_passo.id, 'ocorrencia', v_melhor), a.id
    ) returning id into v_msg;

    insert into public.regua_envios(organizacao_id, ativacao_id, passo_id, mensagem_agendada_id, status, executar_em)
      values (a.organizacao_id, a.id, v_melhor_passo.id, v_msg, 'agendado', v_melhor);

    update public.regua_ativacoes set passo_atual = passo_atual + 1, proximo_em = now() + interval '1 minute', atualizado_em = now() where id = a.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.regua_materializar_proximo(int) from public, anon;
grant execute on function public.regua_materializar_proximo(int) to service_role;

-- ============================================================================
-- 4) Cron (a cada 15 min). INERTE de fato: com motor_ativo=false não materializa nada.
-- ============================================================================
select cron.schedule('relacionamento-materializar', '*/15 * * * *', $cron$select public.regua_materializar_proximo(200);$cron$);
