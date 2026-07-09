-- ============================================================================
-- BOT DE ATENDIMENTO INICIAL — B2 (motor: estado + outbox + RPCs)
-- Modo seguro: NENHUM disparo automático. Runner só é chamado manualmente
-- (x-bot-secret), dry_run por padrão, master global segue OFF, webhook não chama.
-- Não toca em health check, alertas, Relatórios, Ficha, Cobranças, distribuição.
-- Kanban: apenas CHAMA garantir_oportunidade_entrada (idempotente) + update de campos.
-- ============================================================================

-- ===== 1) bot_conversa_estado =====
create table if not exists public.bot_conversa_estado (
  conversa_id         uuid primary key references public.conversas(id) on delete cascade,
  organizacao_id      uuid not null references public.organizacoes(id) on delete cascade,
  canal_id            uuid references public.canais(id) on delete set null,
  contato_id          uuid references public.contatos(id) on delete cascade,
  fluxo_slug          text not null default 'atendimento_inicial_descontos',
  etapa               text not null default 'inicio'
    check (etapa in ('inicio','aguardando_beneficio','aguardando_agibank_bmg','aguardando_banco',
                     'aguardando_nome','aguardando_cpf','aguardando_preferencia',
                     'concluido','pausado_humano','pausado_audio')),
  pausado             boolean not null default false,
  motivo_pausa        text,
  dados_qualificacao  jsonb not null default '{}',
  lead_quente         boolean not null default false,
  lead_quente_motivos text[] not null default '{}',
  oportunidade_id     uuid references public.oportunidades(id) on delete set null,
  reprompts           int not null default 0,
  resumo              jsonb,
  ultimo_inbound_msg_id uuid,
  iniciado_em         timestamptz not null default now(),
  ultima_atividade_em timestamptz not null default now(),
  concluido_em        timestamptz,
  atualizado_em       timestamptz not null default now()
);
create index if not exists idx_bot_estado_org on public.bot_conversa_estado(organizacao_id);
create index if not exists idx_bot_estado_vivo on public.bot_conversa_estado(etapa) where not pausado;

-- ===== 2) bot_mensagens_saida (outbox) =====
create table if not exists public.bot_mensagens_saida (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  conversa_id    uuid not null references public.conversas(id) on delete cascade,
  canal_id       uuid references public.canais(id) on delete set null,
  etapa          text,
  ordem          int not null,
  texto          text not null,
  enviar_apos    timestamptz not null default now(),
  status         text not null default 'pendente'
    check (status in ('pendente','enviando','enviada','falhou','simulada','cancelada')),
  tentativas     int not null default 0,
  mensagem_id    uuid references public.mensagens(id) on delete set null,
  id_externo     text,
  erro           text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (conversa_id, etapa, ordem)
);
create index if not exists idx_bot_saida_drain on public.bot_mensagens_saida(status, enviar_apos) where status='pendente';
create index if not exists idx_bot_saida_conversa on public.bot_mensagens_saida(conversa_id);

drop trigger if exists trg_bot_estado_upd on public.bot_conversa_estado;
create trigger trg_bot_estado_upd before update on public.bot_conversa_estado
  for each row execute function public.set_atualizado_em();
drop trigger if exists trg_bot_saida_upd on public.bot_mensagens_saida;
create trigger trg_bot_saida_upd before update on public.bot_mensagens_saida
  for each row execute function public.set_atualizado_em();

-- ===== 3) bot_pode_atuar: adiciona a trava bot_pausado =====
create or replace function public.bot_pode_atuar(p_conversa uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_recencia constant interval := interval '48 hours';
  c record; cc record; cn record; v_uid uuid := auth.uid();
begin
  select id, organizacao_id, contato_id, canal_id, atendente_id, status, arquivada_em, criado_em
    into c from public.conversas where id = p_conversa;
  if not found then return jsonb_build_object('elegivel', false, 'motivo', 'conversa_inexistente'); end if;

  if v_uid is not null and not (public.is_platform_admin() or public.is_member(c.organizacao_id)) then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.bot_config b where b.organizacao_id = c.organizacao_id and b.ativo) then
    return jsonb_build_object('elegivel', false, 'motivo', 'master_desligado');
  end if;

  select * into cc from public.bot_canal_config where canal_id = c.canal_id;
  if cc.canal_id is null or not cc.bot_enabled then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_nao_habilitado', 'canal', c.canal_id);
  end if;

  -- trava do B2: bot já pausado nesta conversa (humano/áudio)
  if exists (select 1 from public.bot_conversa_estado e where e.conversa_id = c.id and e.pausado) then
    return jsonb_build_object('elegivel', false, 'motivo', 'bot_pausado');
  end if;

  select status_integracao, envio_restrito, health_check_status into cn from public.canais where id = c.canal_id;
  if cn.status_integracao is distinct from 'conectado' then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_desconectado', 'canal', c.canal_id);
  end if;
  if coalesce(cn.envio_restrito, false) then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_restrito', 'canal', c.canal_id);
  end if;
  if cn.health_check_status in ('restrito','falha') then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_health_ruim', 'canal', c.canal_id);
  end if;

  if c.atendente_id is not null then
    return jsonb_build_object('elegivel', false, 'motivo', 'ja_tem_atendente');
  end if;
  if c.arquivada_em is not null then
    return jsonb_build_object('elegivel', false, 'motivo', 'conversa_arquivada');
  end if;
  if c.status is distinct from 'aberta' then
    return jsonb_build_object('elegivel', false, 'motivo', 'conversa_em_andamento');
  end if;
  if c.criado_em < now() - v_recencia then
    return jsonb_build_object('elegivel', false, 'motivo', 'conversa_antiga');
  end if;

  if exists (
    select 1 from public.mensagens m
    where m.conversa_id = c.id and m.direcao = 'saida'
      and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
           or (m.autor_id is null and m.origem = 'telefone'))
  ) then
    return jsonb_build_object('elegivel', false, 'motivo', 'atendente_ja_respondeu');
  end if;

  if exists (
    select 1 from public.oportunidades o
    join public.funil_colunas fc on fc.id = o.coluna_id
    where o.contato_id = c.contato_id and o.status = 'em_andamento'
      and coalesce(fc.entrada, false) = false
  ) then
    return jsonb_build_object('elegivel', false, 'motivo', 'oportunidade_avancada');
  end if;

  if not exists (
    select 1 from public.contato_identidades ci
    where ci.contato_id = c.contato_id and ci.tipo = 'whatsapp' and ci.valor_normalizado is not null
  ) then
    return jsonb_build_object('elegivel', false, 'motivo', 'sem_destino_envio');
  end if;

  return jsonb_build_object('elegivel', true, 'motivo', 'ok', 'canal', c.canal_id, 'fluxo', cc.fluxo_slug);
end $$;

-- ===== 4) RPCs de estado / coleta / pausa / conclusão / outbox =====

-- get or create estado (deriva org/canal/contato da conversa)
create or replace function public.bot_estado_get_or_create(p_conversa uuid)
returns public.bot_conversa_estado language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.bot_conversa_estado; c record;
begin
  select id, organizacao_id, canal_id, contato_id into c from public.conversas where id = p_conversa;
  if not found then raise exception 'conversa_inexistente'; end if;
  insert into public.bot_conversa_estado (conversa_id, organizacao_id, canal_id, contato_id)
  values (p_conversa, c.organizacao_id, c.canal_id, c.contato_id)
  on conflict (conversa_id) do nothing;
  select * into v from public.bot_conversa_estado where conversa_id = p_conversa;
  return v;
end $$;

-- avança etapa + merge de dados + inbound id (idempotência de reprocesso)
create or replace function public.bot_avancar_etapa(
  p_conversa uuid, p_etapa text, p_dados jsonb default '{}'::jsonb,
  p_reprompts int default null, p_inbound_msg uuid default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.bot_conversa_estado set
    etapa = coalesce(p_etapa, etapa),
    dados_qualificacao = dados_qualificacao || coalesce(p_dados, '{}'::jsonb),
    reprompts = coalesce(p_reprompts, reprompts),
    ultimo_inbound_msg_id = coalesce(p_inbound_msg, ultimo_inbound_msg_id),
    ultima_atividade_em = now()
  where conversa_id = p_conversa;
end $$;

-- coleta de nome: sobrescrita segura + Kanban idempotente + eventos
create or replace function public.bot_coletar_nome(p_conversa uuid, p_nome text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare c record; v_nome_atual text; v_fonte text; v_generico boolean;
        v_sobrescreve boolean; v_funil uuid; v_opp uuid; v_criou boolean := false; v_nome text := btrim(p_nome);
begin
  select organizacao_id, contato_id, canal_id into c from public.conversas where id = p_conversa;
  if not found then raise exception 'conversa_inexistente'; end if;

  -- sempre guarda o nome informado
  update public.bot_conversa_estado
    set dados_qualificacao = dados_qualificacao || jsonb_build_object('nome_completo', v_nome),
        ultima_atividade_em = now()
    where conversa_id = p_conversa;

  select nome, nome_fonte into v_nome_atual, v_fonte from public.contatos where id = c.contato_id;
  v_generico := v_nome_atual is null or btrim(v_nome_atual) = ''
                or v_nome_atual !~ '[A-Za-zÀ-ÿ]'                       -- só dígitos/formatação
                or lower(btrim(v_nome_atual)) in ('cliente','identidade protegida');
  v_sobrescreve := v_generico or v_fonte is null or v_fonte in ('whatsapp','sistema');

  if v_sobrescreve then
    update public.contatos set nome = v_nome, nome_fonte = 'bot' where id = c.contato_id;
  else
    -- nome manual do atendente: NÃO sobrescreve; registra divergência
    update public.bot_conversa_estado
      set dados_qualificacao = dados_qualificacao || jsonb_build_object('nome_divergente', true, 'nome_manual', v_nome_atual)
      where conversa_id = p_conversa;
  end if;

  -- Kanban idempotente
  v_funil := coalesce((select funil_id from public.bot_config where organizacao_id = c.organizacao_id),
                      (select id from public.funis where organizacao_id = c.organizacao_id and not arquivado
                         order by padrao desc, ordem asc nulls last limit 1));
  if v_funil is not null then
    v_opp := public.garantir_oportunidade_entrada(c.contato_id, v_funil, 'Bot WhatsApp', p_conversa, c.canal_id);
    update public.oportunidades set
      titulo = v_nome || ' - Análise de descontos',
      tipo_servico = 'analise_inicial',
      metadados = coalesce(metadados,'{}'::jsonb) || jsonb_build_object('bot_etapa','nome','bot_status','em_qualificacao_bot')
      where id = v_opp;
    update public.bot_conversa_estado set oportunidade_id = v_opp where conversa_id = p_conversa;
    insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
    values (null, 'oportunidade_atualizada_por_bot', 'oportunidades', v_opp,
            jsonb_build_object('titulo', v_nome || ' - Análise de descontos'), c.organizacao_id);
  end if;

  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (null, 'bot_nome_coletado', 'contatos', c.contato_id,
          jsonb_build_object('sobrescreveu', v_sobrescreve, 'divergencia', not v_sobrescreve), c.organizacao_id);

  return jsonb_build_object('ok', true, 'oportunidade_id', v_opp, 'sobrescreveu', v_sobrescreve, 'divergencia', not v_sobrescreve);
end $$;

-- coleta de CPF: guarda completo em contatos.cpf (PII), MASCARADO no estado; atualiza opp
create or replace function public.bot_registrar_cpf(p_conversa uuid, p_cpf_digits text, p_cpf_mascarado text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c record; v_opp uuid;
begin
  select organizacao_id, contato_id into c from public.conversas where id = p_conversa;
  update public.contatos set cpf = p_cpf_digits where id = c.contato_id;   -- completo só no campo próprio
  update public.bot_conversa_estado
    set dados_qualificacao = dados_qualificacao || jsonb_build_object('cpf_mascarado', p_cpf_mascarado),
        oportunidade_id = oportunidade_id, ultima_atividade_em = now()
    where conversa_id = p_conversa
    returning oportunidade_id into v_opp;
  if v_opp is not null then
    update public.oportunidades set
      metadados = coalesce(metadados,'{}'::jsonb) || jsonb_build_object('bot_etapa','cpf','cpf_coletado',true)
      where id = v_opp;
  end if;
  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (null, 'bot_cpf_coletado', 'contatos', c.contato_id, jsonb_build_object('cpf_mascarado', p_cpf_mascarado), c.organizacao_id);
end $$;

-- lead quente: estado + prioridade na oportunidade
create or replace function public.bot_marcar_lead_quente(p_conversa uuid, p_motivos text[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_opp uuid;
begin
  update public.bot_conversa_estado
    set lead_quente = true, lead_quente_motivos = coalesce(p_motivos,'{}'), ultima_atividade_em = now()
    where conversa_id = p_conversa returning oportunidade_id into v_opp;
  if v_opp is not null then
    update public.oportunidades set prioridade = 'alta' where id = v_opp;
  end if;
end $$;

-- pausa: cancela outbox pendente, seta etapa/pausa, grava nota_interna com resumo
create or replace function public.bot_pausar(p_conversa uuid, p_motivo text,
  p_resumo_texto text default null, p_resumo_json jsonb default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c record; v_etapa text;
begin
  select organizacao_id into c from public.conversas where id = p_conversa;
  v_etapa := case p_motivo when 'audio' then 'pausado_audio'
                           when 'humano_assumiu' then 'pausado_humano' else null end;
  update public.bot_conversa_estado set
    pausado = true, motivo_pausa = p_motivo,
    etapa = coalesce(v_etapa, etapa),
    resumo = coalesce(p_resumo_json, resumo),
    ultima_atividade_em = now()
    where conversa_id = p_conversa;
  update public.bot_mensagens_saida set status = 'cancelada'
    where conversa_id = p_conversa and status = 'pendente';
  if p_resumo_texto is not null then
    insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, conteudo, autor_id, origem, status)
    values (c.organizacao_id, p_conversa, 'saida', 'nota_interna', p_resumo_texto, null, 'bot', 'enviada');
  end if;
  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (null, 'bot_pausado', 'conversas', p_conversa, jsonb_build_object('motivo', p_motivo), c.organizacao_id);
end $$;

-- conclusão: etapa concluido + nota_interna com resumo
create or replace function public.bot_concluir(p_conversa uuid, p_resumo_texto text, p_resumo_json jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare c record;
begin
  select organizacao_id into c from public.conversas where id = p_conversa;
  update public.bot_conversa_estado set
    etapa = 'concluido', concluido_em = now(), resumo = p_resumo_json, ultima_atividade_em = now()
    where conversa_id = p_conversa;
  if p_resumo_texto is not null then
    insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, conteudo, autor_id, origem, status)
    values (c.organizacao_id, p_conversa, 'saida', 'nota_interna', p_resumo_texto, null, 'bot', 'enviada');
  end if;
  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (null, 'bot_concluido', 'conversas', p_conversa, '{}'::jsonb, c.organizacao_id);
end $$;

-- enfileira um burst no outbox (delays_ms[i] = gap ANTES da msg i; [1]=0 => imediata). Idempotente.
create or replace function public.bot_enfileirar(
  p_conversa uuid, p_canal uuid, p_etapa text, p_textos text[], p_delays_ms int[])
returns setof public.bot_mensagens_saida language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.conversas where id = p_conversa;
  return query
  insert into public.bot_mensagens_saida (organizacao_id, conversa_id, canal_id, etapa, ordem, texto, enviar_apos)
  select v_org, p_conversa, p_canal, p_etapa, t.ord, t.txt,
         now() + ((select coalesce(sum(d),0) from unnest(p_delays_ms[1:t.ord::int]) d) || ' milliseconds')::interval
  from unnest(p_textos) with ordinality as t(txt, ord)
  on conflict (conversa_id, etapa, ordem) do nothing
  returning *;
end $$;

-- registra resultado do envio (real ou simulado) de uma linha do outbox
create or replace function public.bot_registrar_envio(
  p_saida uuid, p_status text, p_mensagem uuid default null, p_id_externo text default null, p_erro text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.bot_mensagens_saida set
    status = p_status, mensagem_id = coalesce(p_mensagem, mensagem_id),
    id_externo = coalesce(p_id_externo, id_externo), erro = p_erro, tentativas = tentativas + 1
    where id = p_saida;
end $$;

-- ===== 5) RLS + grants =====
alter table public.bot_conversa_estado enable row level security;
alter table public.bot_mensagens_saida enable row level security;
drop policy if exists bot_estado_sel on public.bot_conversa_estado;
create policy bot_estado_sel on public.bot_conversa_estado for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));
drop policy if exists bot_saida_sel on public.bot_mensagens_saida;
create policy bot_saida_sel on public.bot_mensagens_saida for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));

grant select on public.bot_conversa_estado, public.bot_mensagens_saida to authenticated;
grant select, insert, update, delete on public.bot_conversa_estado, public.bot_mensagens_saida to service_role;

do $g$
declare fn text;
begin
  foreach fn in array array[
    'bot_estado_get_or_create(uuid)',
    'bot_avancar_etapa(uuid, text, jsonb, int, uuid)',
    'bot_coletar_nome(uuid, text)',
    'bot_registrar_cpf(uuid, text, text)',
    'bot_marcar_lead_quente(uuid, text[])',
    'bot_pausar(uuid, text, text, jsonb)',
    'bot_concluir(uuid, text, jsonb)',
    'bot_enfileirar(uuid, uuid, text, text[], int[])',
    'bot_registrar_envio(uuid, text, uuid, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon;', fn);
    execute format('grant execute on function public.%s to authenticated, service_role;', fn);
  end loop;
end $g$;

-- ===== 6) secret do bot-runner (padrão webhook_config) =====
insert into public.webhook_config (chave, secret)
values ('bot_runner', gen_random_uuid()::text)
on conflict (chave) do nothing;

-- ===== 7) copy default do fluxo para LUIZA e ANDRIUS =====
update public.bot_canal_config bcc set mensagens = jsonb_build_object(
  'abertura', jsonb_build_array(
    'Oi, tudo bem? Vi que você pediu atendimento sobre descontos no benefício.',
    'Vou ser bem direto pra não te enrolar.',
    'Quando existe desconto irregular, cartão consignado, RMC/RCC ou juros abusivos, muitas vezes dá para analisar o cancelamento e verificar se existem valores a liberar.',
    'Pra te encaminhar certo, vou fazer uma triagem rápida.',
    'Você é aposentado, pensionista ou recebe algum benefício do INSS?'),
  'apos_beneficio', jsonb_build_array(
    'Entendi.',
    'Você lembra se tem algum desconto ou empréstimo ligado à Agibank ou BMG?',
    'Pode responder do seu jeito: Agibank, BMG, os dois ou ''não sei''.'),
  'apos_agibank_bmg', jsonb_build_array(
    'E qual banco você recebe o benefício hoje?',
    'Exemplo: Caixa, Bradesco, Itaú, Santander, Mercantil, Agibank ou outro.'),
  'apos_banco', jsonb_build_array(
    'Certo. Pra deixar seu atendimento separado aqui, me diga seu nome completo.'),
  'apos_nome', jsonb_build_array(
    'Obrigado, {primeiro_nome}.',
    'Agora me envie seu CPF para o especialista localizar sua análise sem confundir com outro atendimento.',
    'Pode mandar só os números.'),
  'apos_cpf', jsonb_build_array(
    'Pelo que você me passou, vale a pena um especialista olhar isso com prioridade.',
    'Você prefere continuar por mensagem ou pode receber uma ligação rápida?',
    'Se puder ligação, qual melhor horário?'),
  'fechamento', jsonb_build_array(
    'Perfeito, já vou te encaminhar para um especialista.'),
  'reprompt', jsonb_build_object(
    'nome', 'Só pra confirmar, pode me mandar seu nome completo? (nome e sobrenome)',
    'cpf', 'Esse CPF não parece completo. Pode mandar os 11 números?',
    'generico', 'Pode me responder pra eu seguir com a sua triagem?'),
  'audio', 'Recebi seu áudio. Vou encaminhar para um especialista ouvir e te responder certinho, combinado?'
)
from public.canais c
where c.id = bcc.canal_id
  and bcc.organizacao_id = 'de300000-0000-4000-8000-000000000001'
  and c.nome_interno in ('LUIZA','ANDRIUS')
  and bcc.mensagens is null;

notify pgrst, 'reload schema';
