-- ============================================================================
-- CENTRAL DE REMARKETING — F1: FUNDAÇÃO (banco + motor INERTE)
--
-- Nasce DESLIGADA (padrão da casa): remarketing_config.ativo default false,
-- NENHUM cron é agendado aqui e nenhuma org é semeada como ativa. Ligar (F3)
-- = upsert do config com ativo=true + ativo_desde=now() + cron.schedule.
--
-- Fluxos (decisões do dono em 2026-08-02):
--   F1  cliente entrou pelo anúncio, bot iniciou e ele ficou fluxo1_min (15)
--       sem responder → etapa 'remarketing_1' + tarefa (equipe) + notificação.
--       Timer só dispara em horário comercial (seg-sáb 09-18 SP).
--   F2  cliente respondeu o fluxo e parou pendencia_dias (2, corridos) →
--       etapa 'pendencia' + tarefa com mensagem sugerida + notificação.
--   F3  sem resposta → recuperacao_1/2/3, transferindo o responsável pela
--       FILA CONFIGURÁVEL (fila_recuperacao, ordem definida pelo dono) a cada
--       recuperacao_dias (3, corridos); esgotou → PERDIDO: fecha a opp na
--       coluna resultado='perdido' com motivo 'nao_respondeu'.
--   Resposta do cliente em QUALQUER etapa → status 'recuperado' (métrica),
--       tarefas pendentes expiram, notificação. Detecção por
--       conversas.ultima_entrada_em (SEM tocar nos webhooks vivos).
--
-- O motor clona o padrão do sla_avaliar: set-based, corte ativo_desde,
-- idempotente (1 lead ativo por oportunidade), auto-transições por leitura
-- de estado. Transferência usa contatos.responsavel_id — o sync total
-- (20260731120000) propaga para conversa/kanban/fichas/cobranças sozinho.
--
-- notificacoes é GENÉRICA (primeira infra persistida de notificação do
-- sistema). Broadcast (usuario_id null) tem semântica de caixa da EQUIPE:
-- marcar como lida limpa para todos (leitura por usuário fica para depois).
-- ============================================================================

-- ===== 1) Config por org (opt-in; espelho do sla_config) ====================
create table if not exists public.remarketing_config (
  organizacao_id   uuid primary key references public.organizacoes(id) on delete cascade,
  ativo            boolean not null default false,
  ativo_desde      timestamptz,               -- corte de backlog; carimbar now() ao ligar
  fluxo1_min       int not null default 15,
  pendencia_dias   int not null default 2,
  recuperacao_dias int not null default 3,
  fila_recuperacao uuid[] not null default '{}',  -- ordem dos atendentes (Central > Config)
  atualizado_em    timestamptz not null default now()
);

-- ===== 2) Estado do lead na Central (1 ativo por oportunidade) ==============
create table if not exists public.remarketing_leads (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  oportunidade_id uuid not null references public.oportunidades(id) on delete cascade,
  conversa_id     uuid references public.conversas(id) on delete set null,
  contato_id      uuid not null references public.contatos(id) on delete cascade,
  etapa           text not null check (etapa in ('remarketing_1','pendencia','recuperacao_1','recuperacao_2','recuperacao_3')),
  origem_fluxo    text not null check (origem_fluxo in ('fluxo1_sem_resposta_bot','fluxo2_abandono_atendimento')),
  status          text not null default 'ativo' check (status in ('ativo','recuperado','perdido','cancelado')),
  tentativas      int not null default 0,     -- tarefas concluídas (tentativas humanas)
  responsavel_id  uuid references public.usuarios(id) on delete set null,
  proxima_acao    text,
  proxima_acao_em timestamptz,
  entrou_etapa_em timestamptz not null default now(),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  encerrado_em    timestamptz
);
create unique index if not exists uq_rmkt_lead_ativo
  on public.remarketing_leads (oportunidade_id) where status = 'ativo';
create index if not exists idx_rmkt_leads_org_ativo
  on public.remarketing_leads (organizacao_id, etapa) where status = 'ativo';
create index if not exists idx_rmkt_leads_resp
  on public.remarketing_leads (responsavel_id) where status = 'ativo';

-- ===== 3) Tarefas (primeira infra de tarefas do sistema) ====================
create table if not exists public.remarketing_tarefas (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  remarketing_id  uuid not null references public.remarketing_leads(id) on delete cascade,
  conversa_id     uuid references public.conversas(id) on delete set null,
  contato_id      uuid references public.contatos(id) on delete set null,
  responsavel_id  uuid references public.usuarios(id) on delete set null,  -- null = fila da equipe
  titulo          text not null,
  instrucoes      text,
  sugestao_mensagem text,
  status          text not null default 'pendente' check (status in ('pendente','concluida','expirada','cancelada')),
  vence_em        timestamptz,
  criado_em       timestamptz not null default now(),
  concluida_em    timestamptz,
  concluida_por   uuid references public.usuarios(id) on delete set null
);
-- 1 tarefa pendente por lead: a "próxima ação" é sempre única e inequívoca
create unique index if not exists uq_rmkt_tarefa_pendente
  on public.remarketing_tarefas (remarketing_id) where status = 'pendente';
create index if not exists idx_rmkt_tarefas_resp
  on public.remarketing_tarefas (organizacao_id, responsavel_id) where status = 'pendente';

-- ===== 4) Notificações persistidas (genérica — central de notificações) =====
create table if not exists public.notificacoes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  usuario_id     uuid references public.usuarios(id) on delete cascade,  -- null = equipe toda
  tipo           text not null,
  titulo         text not null,
  corpo          text,
  rota           text,       -- deep-link no app (ex.: /whatsapp?conversa=…)
  ref_id         uuid,       -- referência genérica (lead/tarefa/conversa)
  lida_em        timestamptz,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_notif_org_criado on public.notificacoes (organizacao_id, criado_em desc);
create index if not exists idx_notif_nao_lidas on public.notificacoes (organizacao_id, criado_em desc) where lida_em is null;

-- realtime p/ o sino (F2). Padrão idempotente da casa (20260730180000):
-- tabela FORA da publication derruba o channel inteiro em silêncio.
do $pub$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificacoes'
  ) then
    execute 'alter publication supabase_realtime add table public.notificacoes';
  end if;
exception when others then null;
end $pub$;

-- ===== 5) Linha do tempo imutável ===========================================
create table if not exists public.remarketing_eventos (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  remarketing_id  uuid not null references public.remarketing_leads(id) on delete cascade,
  oportunidade_id uuid,
  tipo            text not null,   -- entrou_remarketing_1|entrou_pendencia|escalado|transferido|tarefa_criada|tarefa_concluida|respondeu|recuperado|perdido
  detalhe         jsonb not null default '{}',
  usuario_id      uuid,            -- preenchido quando a ação foi humana
  criado_em       timestamptz not null default now()
);
create index if not exists idx_rmkt_eventos_lead on public.remarketing_eventos (remarketing_id, criado_em);
create index if not exists idx_rmkt_eventos_org on public.remarketing_eventos (organizacao_id, criado_em desc);

-- ===== 6) Helper: horário comercial (seg-sáb 09-18, SP) =====================
create or replace function public.rmkt_horario_comercial(p_ts timestamptz default now())
returns boolean language sql stable as $$
  select extract(dow  from (p_ts at time zone 'America/Sao_Paulo')) between 1 and 6
     and extract(hour from (p_ts at time zone 'America/Sao_Paulo')) between 9 and 17;
$$;

-- ===== 7) Interna: transição de etapa (evento + tarefa + notificação) =======
-- Concentra a cerimônia de toda transição para o motor ficar legível.
create or replace function public.rmkt_transicionar(
  p_lead uuid, p_etapa text, p_responsavel uuid,
  p_titulo_tarefa text, p_instrucoes text, p_sugestao text,
  p_titulo_notif text, p_corpo_notif text, p_tipo_evento text, p_detalhe jsonb default '{}'
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_rl public.remarketing_leads%rowtype;
  v_dias int;
begin
  select * into v_rl from public.remarketing_leads where id = p_lead for update;
  if v_rl.id is null or v_rl.status <> 'ativo' then return; end if;

  select recuperacao_dias into v_dias from public.remarketing_config where organizacao_id = v_rl.organizacao_id;
  v_dias := coalesce(v_dias, 3);

  update public.remarketing_tarefas set status = 'expirada'
    where remarketing_id = p_lead and status = 'pendente';

  update public.remarketing_leads set
    etapa = p_etapa,
    responsavel_id = coalesce(p_responsavel, responsavel_id),
    proxima_acao = p_titulo_tarefa,
    proxima_acao_em = now(),
    entrou_etapa_em = now(),
    atualizado_em = now()
  where id = p_lead;

  insert into public.remarketing_tarefas (organizacao_id, remarketing_id, conversa_id, contato_id, responsavel_id, titulo, instrucoes, sugestao_mensagem, vence_em)
  values (v_rl.organizacao_id, p_lead, v_rl.conversa_id, v_rl.contato_id, coalesce(p_responsavel, v_rl.responsavel_id), p_titulo_tarefa, p_instrucoes, p_sugestao, now() + make_interval(days => v_dias));

  insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  values (v_rl.organizacao_id, coalesce(p_responsavel, v_rl.responsavel_id), 'remarketing', p_titulo_notif, p_corpo_notif,
          case when v_rl.conversa_id is not null then '/whatsapp?conversa=' || v_rl.conversa_id else '/remarketing' end, p_lead);

  insert into public.remarketing_eventos (organizacao_id, remarketing_id, oportunidade_id, tipo, detalhe)
  values (v_rl.organizacao_id, p_lead, v_rl.oportunidade_id, p_tipo_evento,
          p_detalhe || jsonb_build_object('etapa', p_etapa, 'responsavel_id', p_responsavel));
end $$;

-- ===== 8) O MOTOR ===========================================================
create or replace function public.remarketing_avaliar(p_org uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_recuperados int := 0; v_f1 int := 0; v_f2 int := 0; v_escalados int := 0; v_perdidos int := 0;
  r record; v_fila uuid[]; v_novo_resp uuid; v_prox text; v_idx int;
  v_col_perdido uuid;
begin
  -- ---------- (A) RESPOSTA: cliente falou depois da entrada na etapa → recuperado ----------
  for r in
    select rl.id, rl.organizacao_id, rl.conversa_id, rl.oportunidade_id, rl.responsavel_id, rl.etapa
    from public.remarketing_leads rl
    join public.remarketing_config rc on rc.organizacao_id = rl.organizacao_id and rc.ativo
    join public.conversas cv on cv.id = rl.conversa_id
    where rl.status = 'ativo'
      and (p_org is null or rl.organizacao_id = p_org)
      and cv.ultima_entrada_em is not null
      and cv.ultima_entrada_em > rl.entrou_etapa_em
  loop
    update public.remarketing_leads
      set status = 'recuperado', encerrado_em = now(), atualizado_em = now(),
          proxima_acao = null, proxima_acao_em = null
      where id = r.id;
    update public.remarketing_tarefas set status = 'expirada'
      where remarketing_id = r.id and status = 'pendente';
    insert into public.remarketing_eventos (organizacao_id, remarketing_id, oportunidade_id, tipo, detalhe)
      values (r.organizacao_id, r.id, r.oportunidade_id, 'recuperado', jsonb_build_object('etapa_final', r.etapa));
    insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
      values (r.organizacao_id, r.responsavel_id, 'remarketing', 'Cliente respondeu — recuperado! 🎉',
              'O cliente voltou a responder e saiu do remarketing. Continue o atendimento.',
              '/whatsapp?conversa=' || r.conversa_id, r.id);
    v_recuperados := v_recuperados + 1;
  end loop;

  -- ---------- (B) FLUXO 1: bot iniciou e o cliente ficou mudo (só em horário comercial) ----------
  if public.rmkt_horario_comercial() then
    for r in
      select cv.id as conversa_id, cv.organizacao_id, cv.contato_id, o.id as oportunidade_id
      from public.conversas cv
      join public.remarketing_config rc on rc.organizacao_id = cv.organizacao_id and rc.ativo
      join public.bot_conversa_estado bce on bce.conversa_id = cv.id
      join lateral (
        select m.direcao, m.criado_em from public.mensagens m
        where m.conversa_id = cv.id and m.tipo not in ('sistema','nota_interna')
        order by m.criado_em desc limit 1
      ) ult on true
      join lateral (
        select o2.id from public.oportunidades o2
        where o2.contato_id = cv.contato_id and o2.organizacao_id = cv.organizacao_id
          and o2.status = 'em_andamento'
        order by o2.criado_em desc limit 1
      ) o on true
      where (p_org is null or cv.organizacao_id = p_org)
        and cv.status in ('aberta','pendente')
        and cv.atendente_id is null
        and (rc.ativo_desde is null or cv.criado_em >= rc.ativo_desde)
        and ult.direcao = 'saida'
        and ult.criado_em <= now() - make_interval(mins => rc.fluxo1_min)
        and coalesce(cv.ultima_entrada_em, cv.criado_em) <= ult.criado_em
        and not exists (select 1 from public.remarketing_leads rl where rl.oportunidade_id = o.id and rl.status = 'ativo')
    loop
      insert into public.remarketing_leads (organizacao_id, oportunidade_id, conversa_id, contato_id, etapa, origem_fluxo, proxima_acao, proxima_acao_em)
      values (r.organizacao_id, r.oportunidade_id, r.conversa_id, r.contato_id, 'remarketing_1', 'fluxo1_sem_resposta_bot', 'Contato imediato: mensagem personalizada + áudio', now())
      on conflict do nothing;
      if found then
        perform public.rmkt_pos_entrada(r.oportunidade_id, 'remarketing_1',
          'Recuperar lead — Remarketing 1',
          'Envie uma mensagem personalizada, mande um áudio e tente recuperar o cliente.',
          null,
          'Novo lead entrou no Remarketing 1',
          'O cliente ficou ' || (select fluxo1_min from public.remarketing_config where organizacao_id = r.organizacao_id) || ' minutos sem responder o fluxo inicial. Faça contato imediatamente.',
          'entrou_remarketing_1');
        v_f1 := v_f1 + 1;
      end if;
    end loop;
  end if;

  -- ---------- (C) FLUXO 2: respondeu o fluxo e abandonou há pendencia_dias ----------
  for r in
    select cv.id as conversa_id, cv.organizacao_id, cv.contato_id, cv.atendente_id, o.id as oportunidade_id
    from public.conversas cv
    join public.remarketing_config rc on rc.organizacao_id = cv.organizacao_id and rc.ativo
    join lateral (
      select m.direcao, m.criado_em from public.mensagens m
      where m.conversa_id = cv.id and m.tipo not in ('sistema','nota_interna')
      order by m.criado_em desc limit 1
    ) ult on true
    join lateral (
      select min(m.criado_em) as primeira_saida from public.mensagens m
      where m.conversa_id = cv.id and m.direcao = 'saida' and m.tipo not in ('sistema','nota_interna')
    ) ps on true
    join lateral (
      select o2.id from public.oportunidades o2
      where o2.contato_id = cv.contato_id and o2.organizacao_id = cv.organizacao_id
        and o2.status = 'em_andamento'
      order by o2.criado_em desc limit 1
    ) o on true
    where (p_org is null or cv.organizacao_id = p_org)
      and cv.status in ('aberta','em_atendimento','pendente')
      and (rc.ativo_desde is null or cv.criado_em >= rc.ativo_desde)
      and ps.primeira_saida is not null
      and cv.ultima_entrada_em is not null
      and cv.ultima_entrada_em > ps.primeira_saida            -- respondeu o fluxo em algum momento
      and ult.direcao = 'saida'                               -- a bola está com o cliente
      and cv.ultima_entrada_em <= now() - make_interval(days => rc.pendencia_dias)
      and not exists (select 1 from public.remarketing_leads rl where rl.oportunidade_id = o.id and rl.status = 'ativo')
  loop
    insert into public.remarketing_leads (organizacao_id, oportunidade_id, conversa_id, contato_id, etapa, origem_fluxo, responsavel_id, proxima_acao, proxima_acao_em)
    values (r.organizacao_id, r.oportunidade_id, r.conversa_id, r.contato_id, 'pendencia', 'fluxo2_abandono_atendimento', r.atendente_id, 'Retomar contato: atendimento pendente', now())
    on conflict do nothing;
    if found then
      perform public.rmkt_pos_entrada(r.oportunidade_id, 'pendencia',
        'Retomar atendimento pendente',
        'Cliente demonstrou interesse e parou de responder. Retome o contato com a mensagem sugerida.',
        'Olá, tudo bem? Vi que sua análise ficou pendente. Falta muito pouco para concluirmos seu atendimento. Podemos finalizar agora?',
        'Lead com atendimento pendente',
        'Cliente está há ' || (select pendencia_dias from public.remarketing_config where organizacao_id = r.organizacao_id) || ' dias sem responder. Retome o contato.',
        'entrou_pendencia');
      v_f2 := v_f2 + 1;
    end if;
  end loop;

  -- ---------- (D) ESCALADA: etapa venceu sem resposta → próxima etapa / perdido ----------
  for r in
    select rl.*, rc.fila_recuperacao, rc.recuperacao_dias
    from public.remarketing_leads rl
    join public.remarketing_config rc on rc.organizacao_id = rl.organizacao_id and rc.ativo
    where rl.status = 'ativo'
      and (p_org is null or rl.organizacao_id = p_org)
      and rl.entrou_etapa_em <= now() - make_interval(days => rc.recuperacao_dias)
  loop
    v_fila := coalesce(r.fila_recuperacao, '{}');
    v_prox := case r.etapa
      when 'remarketing_1' then 'recuperacao_1'
      when 'pendencia'     then 'recuperacao_1'
      when 'recuperacao_1' then 'recuperacao_2'
      when 'recuperacao_2' then 'recuperacao_3'
      when 'recuperacao_3' then 'perdido'
      else null end;
    if v_prox is null then continue; end if;

    if v_prox = 'perdido' then
      update public.remarketing_leads
        set status = 'perdido', encerrado_em = now(), atualizado_em = now(),
            proxima_acao = null, proxima_acao_em = null
        where id = r.id;
      update public.remarketing_tarefas set status = 'expirada'
        where remarketing_id = r.id and status = 'pendente';
      -- fecha a opp na coluna de resultado 'perdido' do funil (por RESULTADO, não por nome)
      v_col_perdido := null;  -- select into não zera em miss — sem isso vazaria o valor do lead anterior
      select fc.id into v_col_perdido
        from public.funil_colunas fc
        join public.oportunidades o on o.funil_id = fc.funil_id and o.id = r.oportunidade_id
        where fc.resultado = 'perdido' and fc.arquivada = false
        order by fc.ordem limit 1;
      if v_col_perdido is not null then
        update public.oportunidades
          set coluna_id = v_col_perdido, motivo_perda = coalesce(motivo_perda, 'nao_respondeu')
          where id = r.oportunidade_id and status = 'em_andamento';
      end if;
      insert into public.remarketing_eventos (organizacao_id, remarketing_id, oportunidade_id, tipo, detalhe)
        values (r.organizacao_id, r.id, r.oportunidade_id, 'perdido', jsonb_build_object('apos_etapa', r.etapa, 'tentativas', r.tentativas));
      insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
        values (r.organizacao_id, null, 'remarketing', 'Lead perdido',
                'Sem resposta após todas as tentativas de recuperação. A oportunidade foi fechada como perdida (não respondeu).',
                '/remarketing', r.id);
      v_perdidos := v_perdidos + 1;
      continue;
    end if;

    -- transferência pela fila configurável: recuperacao_N usa fila[N]
    v_idx := case v_prox when 'recuperacao_1' then 1 when 'recuperacao_2' then 2 else 3 end;
    v_novo_resp := case when array_length(v_fila, 1) >= v_idx then v_fila[v_idx] else null end;

    perform public.rmkt_transicionar(r.id, v_prox, v_novo_resp,
      'Recuperação (' || v_idx || 'ª tentativa): ligar + WhatsApp + áudio',
      'Faça uma ligação, envie WhatsApp e mande um áudio. Lead sem resposta desde a etapa anterior.',
      null,
      case when v_novo_resp is not null and v_novo_resp is distinct from r.responsavel_id
           then 'Lead transferido para você — recuperação'
           else 'Hora da ' || v_idx || 'ª tentativa de recuperação' end,
      'O lead não respondeu na etapa anterior. Faça ligação, WhatsApp e áudio.',
      case when v_novo_resp is not null and v_novo_resp is distinct from r.responsavel_id then 'transferido' else 'escalado' end,
      jsonb_build_object('de', r.etapa, 'para', v_prox));

    -- transferência REAL do lead: sync total propaga p/ conversa, kanban, fichas, cobranças
    if v_novo_resp is not null and v_novo_resp is distinct from r.responsavel_id then
      update public.contatos set responsavel_id = v_novo_resp where id = r.contato_id;
    end if;
    v_escalados := v_escalados + 1;
  end loop;

  return jsonb_build_object('recuperados', v_recuperados, 'fluxo1', v_f1, 'pendencias', v_f2, 'escalados', v_escalados, 'perdidos', v_perdidos);
end $$;

-- ===== 8b) Interna: cerimônia pós-entrada (tarefa + notificação + evento) ====
create or replace function public.rmkt_pos_entrada(
  p_opp uuid, p_etapa text,
  p_titulo_tarefa text, p_instrucoes text, p_sugestao text,
  p_titulo_notif text, p_corpo_notif text, p_tipo_evento text
) returns void language plpgsql security definer set search_path = public as $$
declare v_rl public.remarketing_leads%rowtype; v_dias int;
begin
  select * into v_rl from public.remarketing_leads
    where oportunidade_id = p_opp and status = 'ativo' limit 1;
  if v_rl.id is null then return; end if;

  select recuperacao_dias into v_dias from public.remarketing_config where organizacao_id = v_rl.organizacao_id;

  insert into public.remarketing_tarefas (organizacao_id, remarketing_id, conversa_id, contato_id, responsavel_id, titulo, instrucoes, sugestao_mensagem, vence_em)
  values (v_rl.organizacao_id, v_rl.id, v_rl.conversa_id, v_rl.contato_id, v_rl.responsavel_id, p_titulo_tarefa, p_instrucoes, p_sugestao, now() + make_interval(days => coalesce(v_dias, 3)))
  on conflict do nothing;

  insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  values (v_rl.organizacao_id, v_rl.responsavel_id, 'remarketing', p_titulo_notif, p_corpo_notif,
          case when v_rl.conversa_id is not null then '/whatsapp?conversa=' || v_rl.conversa_id else '/remarketing' end, v_rl.id);

  insert into public.remarketing_eventos (organizacao_id, remarketing_id, oportunidade_id, tipo, detalhe)
  values (v_rl.organizacao_id, v_rl.id, p_opp, p_tipo_evento, jsonb_build_object('etapa', p_etapa));
end $$;

-- ===== 9) RPCs de uso (front) ===============================================
-- Concluir tarefa = registrar uma TENTATIVA humana.
create or replace function public.remarketing_tarefa_concluir(p_tarefa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t public.remarketing_tarefas%rowtype;
begin
  select * into v_t from public.remarketing_tarefas where id = p_tarefa for update;
  if v_t.id is null then raise exception 'tarefa_nao_encontrada'; end if;
  if not public.is_member(v_t.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_t.status <> 'pendente' then return; end if;

  update public.remarketing_tarefas
    set status = 'concluida', concluida_em = now(), concluida_por = auth.uid()
    where id = p_tarefa;
  update public.remarketing_leads
    set tentativas = tentativas + 1, atualizado_em = now()
    where id = v_t.remarketing_id;
  insert into public.remarketing_eventos (organizacao_id, remarketing_id, tipo, detalhe, usuario_id)
    values (v_t.organizacao_id, v_t.remarketing_id, 'tarefa_concluida',
            jsonb_build_object('tarefa_id', p_tarefa, 'titulo', v_t.titulo), auth.uid());
end $$;

-- Marcar notificação como lida (broadcast = caixa da equipe: limpa p/ todos).
create or replace function public.notificacao_marcar_lida(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.notificacoes where id = p_id;
  if v_org is null then return; end if;
  if not public.is_member(v_org) then raise exception 'sem_permissao'; end if;
  update public.notificacoes set lida_em = now() where id = p_id and lida_em is null;
end $$;

create or replace function public.notificacoes_marcar_todas(p_org uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_org) then raise exception 'sem_permissao'; end if;
  update public.notificacoes set lida_em = now()
    where organizacao_id = p_org and lida_em is null
      and (usuario_id is null or usuario_id = auth.uid());
end $$;

-- ===== 10) RLS + grants (padrão sla: leitura membro; escrita via RPC/motor) ==
alter table public.remarketing_config  enable row level security;
alter table public.remarketing_leads   enable row level security;
alter table public.remarketing_tarefas enable row level security;
alter table public.notificacoes        enable row level security;
alter table public.remarketing_eventos enable row level security;

drop policy if exists rmkt_config_sel on public.remarketing_config;
create policy rmkt_config_sel on public.remarketing_config for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));
drop policy if exists rmkt_leads_sel on public.remarketing_leads;
create policy rmkt_leads_sel on public.remarketing_leads for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));
drop policy if exists rmkt_tarefas_sel on public.remarketing_tarefas;
create policy rmkt_tarefas_sel on public.remarketing_tarefas for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));
drop policy if exists notificacoes_sel on public.notificacoes;
create policy notificacoes_sel on public.notificacoes for select to authenticated
  using ((public.is_platform_admin() or public.is_member(organizacao_id))
     and (usuario_id is null or usuario_id = auth.uid()));
drop policy if exists rmkt_eventos_sel on public.remarketing_eventos;
create policy rmkt_eventos_sel on public.remarketing_eventos for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));

grant select on public.remarketing_config, public.remarketing_leads, public.remarketing_tarefas, public.notificacoes, public.remarketing_eventos to authenticated;
-- pegadinha da casa (maturação): service_role SEM grant = PostgREST devolve vazio em silêncio
grant select, insert, update, delete on public.remarketing_config, public.remarketing_leads, public.remarketing_tarefas, public.notificacoes, public.remarketing_eventos to service_role;

do $g$
declare fn text;
begin
  foreach fn in array array[
    'remarketing_avaliar(uuid)', 'remarketing_tarefa_concluir(uuid)',
    'notificacao_marcar_lida(uuid)', 'notificacoes_marcar_todas(uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated, service_role;', fn);
  end loop;
end $g$;

-- NADA de cron aqui e NENHUMA org ativa: F1 é 100% inerte por construção.
