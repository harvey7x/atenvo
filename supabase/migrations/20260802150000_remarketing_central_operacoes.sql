-- ============================================================================
-- CENTRAL DE REMARKETING — Central de Operações (evolução a pedido do dono)
-- Mudar etapa manual, observações na timeline, produtividade por atendente e
-- alerta de SLA estourado no motor. Motor segue INERTE (sem cron).
-- ============================================================================

-- ===== Alterar etapa manualmente (do painel lateral) =====
create or replace function public.remarketing_mudar_etapa(p_lead uuid, p_etapa text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rl public.remarketing_leads%rowtype;
begin
  if p_etapa not in ('remarketing_1','pendencia','recuperacao_1','recuperacao_2','recuperacao_3') then
    raise exception 'etapa_invalida';
  end if;
  select * into v_rl from public.remarketing_leads where id = p_lead for update;
  if v_rl.id is null then raise exception 'lead_nao_encontrado'; end if;
  if not public.is_member(v_rl.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_rl.status <> 'ativo' then raise exception 'lead_encerrado'; end if;
  if v_rl.etapa = p_etapa then return; end if;

  -- a cerimônia padrão (expira tarefa, cria a nova, notifica, evento)
  perform public.rmkt_transicionar(p_lead, p_etapa, null,
    case when p_etapa like 'recuperacao%' then 'Recuperação: ligar + WhatsApp + áudio' else 'Retomar contato com o cliente' end,
    'Etapa alterada manualmente pelo atendente.',
    null,
    'Etapa alterada',
    'A etapa do lead foi alterada manualmente para ' || p_etapa || '.',
    'etapa_alterada',
    jsonb_build_object('manual', true, 'de', v_rl.etapa));
  -- registra QUEM alterou (rmkt_transicionar não recebe usuário)
  update public.remarketing_eventos set usuario_id = auth.uid()
    where remarketing_id = p_lead and tipo = 'etapa_alterada' and usuario_id is null
      and criado_em > now() - interval '5 seconds';
end $$;

-- ===== Observação na timeline =====
create or replace function public.remarketing_observacao(p_lead uuid, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rl public.remarketing_leads%rowtype;
begin
  if coalesce(trim(p_texto), '') = '' then raise exception 'texto_vazio'; end if;
  select * into v_rl from public.remarketing_leads where id = p_lead;
  if v_rl.id is null then raise exception 'lead_nao_encontrado'; end if;
  if not public.is_member(v_rl.organizacao_id) then raise exception 'sem_permissao'; end if;
  insert into public.remarketing_eventos (organizacao_id, remarketing_id, oportunidade_id, tipo, detalhe, usuario_id)
    values (v_rl.organizacao_id, p_lead, v_rl.oportunidade_id, 'observacao',
            jsonb_build_object('texto', left(trim(p_texto), 800)), auth.uid());
end $$;

-- ===== Produtividade por atendente (gestão da equipe) =====
create or replace function public.remarketing_produtividade(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_member(p_org) and not public.is_platform_admin() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', u.id, 'nome', u.nome,
      'tarefas', coalesce(t.pendentes, 0),
      'vencidas', coalesce(t.vencidas, 0),
      'concluidas_hoje', coalesce(c.hoje, 0),
      'recuperados_30d', coalesce(r.recuperados, 0),
      'tempo_medio_conclusao_h', c.tempo_medio_h,
      'tempo_medio_recuperacao_h', r.tempo_medio_h
    ) order by coalesce(t.vencidas, 0) desc, coalesce(t.pendentes, 0) desc)
    from public.organizacao_usuarios ou
    join public.usuarios u on u.id = ou.usuario_id
    left join (
      select responsavel_id, count(*) as pendentes, count(*) filter (where vence_em < now()) as vencidas
      from public.remarketing_tarefas where organizacao_id = p_org and status = 'pendente'
      group by responsavel_id
    ) t on t.responsavel_id = u.id
    left join (
      select concluida_por,
             count(*) filter (where (concluida_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date) as hoje,
             round(avg(extract(epoch from (concluida_em - criado_em)) / 3600)::numeric, 1) as tempo_medio_h
      from public.remarketing_tarefas
      where organizacao_id = p_org and status = 'concluida' and concluida_em >= now() - interval '30 days'
      group by concluida_por
    ) c on c.concluida_por = u.id
    left join (
      select responsavel_id, count(*) as recuperados,
             round(avg(extract(epoch from (encerrado_em - criado_em)) / 3600)::numeric, 1) as tempo_medio_h
      from public.remarketing_leads
      where organizacao_id = p_org and status = 'recuperado' and encerrado_em >= now() - interval '30 days'
      group by responsavel_id
    ) r on r.responsavel_id = u.id
    where ou.organizacao_id = p_org and ou.status = 'ativo'
  ), '[]'::jsonb) end;
$$;

-- ===== Motor: alerta de SLA estourado (tarefa venceu sem conclusão) =====
-- Roda dentro do remarketing_avaliar (uma seção extra); dedup por evento.
create or replace function public.rmkt_sla_estourado(p_org uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int := 0; r record;
begin
  for r in
    select t.id, t.organizacao_id, t.remarketing_id, t.responsavel_id, t.titulo, t.vence_em, rl.conversa_id
    from public.remarketing_tarefas t
    join public.remarketing_config rc on rc.organizacao_id = t.organizacao_id and rc.ativo
    join public.remarketing_leads rl on rl.id = t.remarketing_id and rl.status = 'ativo'
    where t.status = 'pendente' and t.vence_em < now()
      and (p_org is null or t.organizacao_id = p_org)
      and not exists (
        select 1 from public.remarketing_eventos e
        where e.remarketing_id = t.remarketing_id and e.tipo = 'sla_estourado'
          and e.detalhe->>'tarefa_id' = t.id::text
      )
  loop
    insert into public.remarketing_eventos (organizacao_id, remarketing_id, tipo, detalhe)
      values (r.organizacao_id, r.remarketing_id, 'sla_estourado',
              jsonb_build_object('tarefa_id', r.id, 'titulo', r.titulo, 'vencia_em', r.vence_em));
    -- notifica o responsável (ou a equipe) E o supervisor (broadcast sempre)
    insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
      values (r.organizacao_id, r.responsavel_id, 'remarketing', 'SLA estourado — aja agora',
              'A tarefa "' || r.titulo || '" venceu sem conclusão. O lead está no topo da fila.',
              case when r.conversa_id is not null then '/whatsapp?conversa=' || r.conversa_id else '/remarketing' end,
              r.remarketing_id);
    if r.responsavel_id is not null then
      insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
        values (r.organizacao_id, null, 'remarketing', 'SLA estourado na equipe',
                'Tarefa vencida sem conclusão: "' || r.titulo || '". Supervisione a fila.',
                '/remarketing', r.remarketing_id);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- injeta a seção de SLA no fim do motor (recria a função com a chamada extra)
-- (mantém o corpo de 20260802120000 e adiciona a etapa E: SLA)
create or replace function public.remarketing_avaliar_com_sla(p_org uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare base jsonb; slas int;
begin
  base := public.remarketing_avaliar(p_org);
  slas := public.rmkt_sla_estourado(p_org);
  return base || jsonb_build_object('slas_estourados', slas);
end $$;

do $g$
declare fn text;
begin
  foreach fn in array array[
    'remarketing_mudar_etapa(uuid, text)', 'remarketing_observacao(uuid, text)',
    'remarketing_produtividade(uuid)', 'rmkt_sla_estourado(uuid)', 'remarketing_avaliar_com_sla(uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated, service_role;', fn);
  end loop;
end $g$;

-- F3 agendará: cron 'remarketing-avaliar' chamando remarketing_avaliar_com_sla(null).
