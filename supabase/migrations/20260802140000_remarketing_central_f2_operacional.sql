-- ============================================================================
-- CENTRAL DE REMARKETING — F2.5: operação (refação a pedido do dono)
-- "Nenhum lead sem tarefa": concluir gera a próxima automaticamente.
-- Ações rápidas da fila: transferir, reagendar, registrar ligação/áudio/zap.
-- Realtime: leads e tarefas entram na publication (o front assina e a fila
-- atualiza sem F5). Motor segue INERTE (sem cron).
-- ============================================================================

-- tarefas ganham tipo: 'acao' (fazer algo) x 'acompanhamento' (aguardar resposta)
alter table public.remarketing_tarefas
  add column if not exists tipo text not null default 'acao'
  check (tipo in ('acao','acompanhamento'));

-- realtime (padrão idempotente da casa; fora da publication o channel morre em silêncio)
do $pub$
declare t text;
begin
  foreach t in array array['remarketing_leads','remarketing_tarefas'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception when others then null;
end $pub$;

-- ===== Concluir tarefa = registrar tentativa E manter o lead com tarefa viva =====
create or replace function public.remarketing_tarefa_concluir(p_tarefa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_t public.remarketing_tarefas%rowtype;
  v_rl public.remarketing_leads%rowtype;
  v_escala timestamptz;
begin
  select * into v_t from public.remarketing_tarefas where id = p_tarefa for update;
  if v_t.id is null then raise exception 'tarefa_nao_encontrada'; end if;
  if not public.is_member(v_t.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_t.status <> 'pendente' then return; end if;

  update public.remarketing_tarefas
    set status = 'concluida', concluida_em = now(), concluida_por = auth.uid()
    where id = p_tarefa;

  select * into v_rl from public.remarketing_leads where id = v_t.remarketing_id for update;

  -- tentativa só conta quando a tarefa era de AÇÃO (acompanhar não é tentativa)
  if v_t.tipo = 'acao' then
    update public.remarketing_leads set tentativas = tentativas + 1, atualizado_em = now()
      where id = v_t.remarketing_id;
  end if;

  insert into public.remarketing_eventos (organizacao_id, remarketing_id, tipo, detalhe, usuario_id)
    values (v_t.organizacao_id, v_t.remarketing_id, 'tarefa_concluida',
            jsonb_build_object('tarefa_id', p_tarefa, 'titulo', v_t.titulo, 'tipo', v_t.tipo), auth.uid());

  -- NENHUM lead sem tarefa: nasce o acompanhamento, vencendo na hora em que o
  -- motor escalaria (entrou_etapa_em + recuperacao_dias) — o atendente vê o prazo
  -- real e o sistema escala sozinho se o cliente seguir mudo.
  if v_rl.id is not null and v_rl.status = 'ativo' then
    select v_rl.entrou_etapa_em + make_interval(days => coalesce(rc.recuperacao_dias, 3))
      into v_escala from public.remarketing_config rc where rc.organizacao_id = v_rl.organizacao_id;
    insert into public.remarketing_tarefas (organizacao_id, remarketing_id, conversa_id, contato_id, responsavel_id, tipo, titulo, instrucoes, vence_em)
    values (v_rl.organizacao_id, v_rl.id, v_rl.conversa_id, v_rl.contato_id, v_rl.responsavel_id, 'acompanhamento',
            'Aguardar resposta do cliente',
            'Tentativa registrada. Se o cliente não responder até o prazo, o sistema escala a etapa sozinho.',
            coalesce(v_escala, now() + interval '3 days'))
    on conflict do nothing;
    update public.remarketing_leads
      set proxima_acao = 'Aguardar resposta do cliente', proxima_acao_em = coalesce(v_escala, now() + interval '3 days')
      where id = v_rl.id;
  end if;
end $$;

-- ===== Transferência manual (da fila) =====
create or replace function public.remarketing_transferir(p_lead uuid, p_usuario uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_rl public.remarketing_leads%rowtype; v_nome text;
begin
  select * into v_rl from public.remarketing_leads where id = p_lead for update;
  if v_rl.id is null then raise exception 'lead_nao_encontrado'; end if;
  if not public.is_member(v_rl.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_rl.status <> 'ativo' then raise exception 'lead_encerrado'; end if;

  update public.remarketing_leads set responsavel_id = p_usuario, atualizado_em = now() where id = p_lead;
  update public.remarketing_tarefas set responsavel_id = p_usuario
    where remarketing_id = p_lead and status = 'pendente';
  -- transferência REAL: sync total propaga p/ conversa, kanban, fichas, cobranças
  update public.contatos set responsavel_id = p_usuario where id = v_rl.contato_id;

  select nome into v_nome from public.usuarios where id = p_usuario;
  insert into public.remarketing_eventos (organizacao_id, remarketing_id, oportunidade_id, tipo, detalhe, usuario_id)
    values (v_rl.organizacao_id, p_lead, v_rl.oportunidade_id, 'transferido',
            jsonb_build_object('manual', true, 'para', p_usuario, 'para_nome', v_nome), auth.uid());
  insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
    values (v_rl.organizacao_id, p_usuario, 'remarketing', 'Lead transferido para você',
            'Um lead do remarketing foi transferido para você. Veja a próxima ação na Central.',
            case when v_rl.conversa_id is not null then '/whatsapp?conversa=' || v_rl.conversa_id else '/remarketing' end, p_lead);
end $$;

-- ===== Reagendar o prazo da tarefa pendente =====
create or replace function public.remarketing_reagendar(p_tarefa uuid, p_quando timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.remarketing_tarefas%rowtype;
begin
  select * into v_t from public.remarketing_tarefas where id = p_tarefa for update;
  if v_t.id is null then raise exception 'tarefa_nao_encontrada'; end if;
  if not public.is_member(v_t.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_t.status <> 'pendente' then raise exception 'tarefa_nao_pendente'; end if;
  if p_quando is null or p_quando < now() - interval '1 hour' then raise exception 'prazo_invalido'; end if;

  update public.remarketing_tarefas set vence_em = p_quando where id = p_tarefa;
  update public.remarketing_leads set proxima_acao_em = p_quando, atualizado_em = now()
    where id = v_t.remarketing_id;
  insert into public.remarketing_eventos (organizacao_id, remarketing_id, tipo, detalhe, usuario_id)
    values (v_t.organizacao_id, v_t.remarketing_id, 'reagendado',
            jsonb_build_object('tarefa_id', p_tarefa, 'para', p_quando), auth.uid());
end $$;

-- ===== Registrar ação rápida (ligação / áudio / whatsapp) — conta tentativa =====
create or replace function public.remarketing_registrar_acao(p_lead uuid, p_acao text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rl public.remarketing_leads%rowtype; v_tipo text;
begin
  if p_acao not in ('ligacao','audio','whatsapp') then raise exception 'acao_invalida'; end if;
  select * into v_rl from public.remarketing_leads where id = p_lead for update;
  if v_rl.id is null then raise exception 'lead_nao_encontrado'; end if;
  if not public.is_member(v_rl.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_rl.status <> 'ativo' then raise exception 'lead_encerrado'; end if;

  v_tipo := case p_acao when 'ligacao' then 'ligacao_realizada' when 'audio' then 'audio_enviado' else 'whatsapp_enviado' end;
  update public.remarketing_leads set tentativas = tentativas + 1, atualizado_em = now() where id = p_lead;
  insert into public.remarketing_eventos (organizacao_id, remarketing_id, oportunidade_id, tipo, detalhe, usuario_id)
    values (v_rl.organizacao_id, p_lead, v_rl.oportunidade_id, v_tipo, '{}'::jsonb, auth.uid());
end $$;

-- ===== dashboard: + recuperados_hoje (indicador pequeno do topo) =====
create or replace function public.remarketing_dashboard(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_member(p_org) and not public.is_platform_admin() then null else jsonb_build_object(
    'por_etapa', coalesce((
      select jsonb_object_agg(etapa, n) from (
        select etapa, count(*) as n from public.remarketing_leads
        where organizacao_id = p_org and status = 'ativo' group by etapa
      ) s), '{}'::jsonb),
    'por_atendente', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'n', s.n) order by s.n desc) from (
        select responsavel_id, count(*) as n from public.remarketing_leads
        where organizacao_id = p_org and status = 'ativo' and responsavel_id is not null
        group by responsavel_id
      ) s join public.usuarios u on u.id = s.responsavel_id), '[]'::jsonb),
    'sem_responsavel', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'ativo' and responsavel_id is null),
    'ativos', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'ativo'),
    'recuperados_hoje', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'recuperado'
        and (encerrado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date),
    'recuperados_30d', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'recuperado' and encerrado_em >= now() - interval '30 days'),
    'perdidos_30d', (select count(*) from public.remarketing_leads where organizacao_id = p_org and status = 'perdido' and encerrado_em >= now() - interval '30 days'),
    'taxa_recuperacao', (
      select case when (rec + per) = 0 then null else round(rec::numeric / (rec + per) * 100, 1) end from (
        select
          count(*) filter (where status = 'recuperado' and encerrado_em >= now() - interval '30 days') as rec,
          count(*) filter (where status = 'perdido'    and encerrado_em >= now() - interval '30 days') as per
        from public.remarketing_leads where organizacao_id = p_org
      ) t),
    'tempo_medio_recuperacao_h', (
      select round(avg(extract(epoch from (encerrado_em - criado_em)) / 3600)::numeric, 1)
      from public.remarketing_leads
      where organizacao_id = p_org and status = 'recuperado' and encerrado_em >= now() - interval '30 days'),
    'tempo_medio_sem_resposta_h', (
      select round(avg(extract(epoch from (now() - cv.ultima_entrada_em)) / 3600)::numeric, 1)
      from public.remarketing_leads rl join public.conversas cv on cv.id = rl.conversa_id
      where rl.organizacao_id = p_org and rl.status = 'ativo' and cv.ultima_entrada_em is not null),
    'tarefas_pendentes', (select count(*) from public.remarketing_tarefas where organizacao_id = p_org and status = 'pendente'),
    'tarefas_vencidas', (select count(*) from public.remarketing_tarefas where organizacao_id = p_org and status = 'pendente' and vence_em < now())
  ) end;
$$;

do $g$
declare fn text;
begin
  foreach fn in array array[
    'remarketing_tarefa_concluir(uuid)', 'remarketing_transferir(uuid, uuid)',
    'remarketing_reagendar(uuid, timestamptz)', 'remarketing_registrar_acao(uuid, text)',
    'remarketing_dashboard(uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated, service_role;', fn);
  end loop;
end $g$;
