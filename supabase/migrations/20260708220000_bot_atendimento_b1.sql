-- ============================================================================
-- BOT DE ATENDIMENTO INICIAL — B1 (modelo seguro: config + elegibilidade)
-- Autorização SEMPRE explícita POR CANAL (nunca por origem_tipo). Master global
-- desligado. NENHUM disparo automático existe ainda (runner/webhook = B2/B3).
-- Não toca em: health check, alertas globais, Relatórios, Ficha, Cobranças,
-- distribuição de leads, Kanban (apenas LÊ para elegibilidade). RMKT/URA off.
-- ============================================================================

-- ===== 1) bot_config: kill-switch global + defaults, 1 linha por organização =====
create table if not exists public.bot_config (
  organizacao_id   uuid primary key references public.organizacoes(id) on delete cascade,
  ativo            boolean not null default false,          -- master on/off (regra #8)
  funil_id         uuid references public.funis(id) on delete set null,
  intervalo_min_ms int not null default 1800,
  intervalo_max_ms int not null default 3500,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

-- ===== 2) bot_canal_config: autorização + copy/pacing POR CANAL (fonte da verdade) =====
create table if not exists public.bot_canal_config (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid not null references public.organizacoes(id) on delete cascade,
  canal_id         uuid not null references public.canais(id) on delete cascade,
  bot_enabled      boolean not null default false,          -- regra #6/#7 (só LUIZA/ANDRIUS)
  fluxo_slug       text not null default 'atendimento_inicial_descontos',
  origem           text,                                    -- snapshot (metadado, NÃO gatilho)
  campanha         text,
  mensagens        jsonb,                                   -- copy própria (null = default do fluxo)
  intervalo_min_ms int,                                     -- override (null = herda bot_config)
  intervalo_max_ms int,
  ativo_em         timestamptz,
  ativo_por        uuid references public.usuarios(id) on delete set null,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  unique (canal_id)
);
create index if not exists idx_bot_canal_config_org on public.bot_canal_config(organizacao_id);
create index if not exists idx_bot_canal_config_enabled on public.bot_canal_config(canal_id) where bot_enabled;

-- touch atualizado_em (reusa helper existente do projeto)
drop trigger if exists trg_bot_config_upd on public.bot_config;
create trigger trg_bot_config_upd before update on public.bot_config
  for each row execute function public.set_atualizado_em();
drop trigger if exists trg_bot_canal_config_upd on public.bot_canal_config;
create trigger trg_bot_canal_config_upd before update on public.bot_canal_config
  for each row execute function public.set_atualizado_em();

-- ===== 3) contatos.nome_fonte: habilita regra de sobrescrita segura de nome =====
alter table public.contatos
  add column if not exists nome_fonte text
    check (nome_fonte in ('whatsapp','bot','manual','sistema'));
-- backfill: nomes atuais vieram do pushName/telefone => 'whatsapp' (o bot pode sobrescrever;
-- edições humanas passam a gravar 'manual' no B5, e aí o bot NÃO sobrescreve).
update public.contatos set nome_fonte = 'whatsapp' where nome_fonte is null;

-- ===== 4) bot_pode_atuar(conversa) -> jsonb {elegivel, motivo, canal} =====
-- Read-only. Cobre TODAS as travas estáticas/config. A trava de "bot pausado" (áudio/
-- humano) depende de bot_conversa_estado, criada no B2 — será somada aqui nesse momento.
create or replace function public.bot_pode_atuar(p_conversa uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_recencia constant interval := interval '48 hours';
  c record; cc record; cn record; v_uid uuid := auth.uid();
begin
  select id, organizacao_id, contato_id, canal_id, atendente_id, status, arquivada_em, criado_em
    into c from public.conversas where id = p_conversa;
  if not found then return jsonb_build_object('elegivel', false, 'motivo', 'conversa_inexistente'); end if;

  -- Acesso: backend (service role, uid nulo) OU membro da org OU platform admin.
  if v_uid is not null and not (public.is_platform_admin() or public.is_member(c.organizacao_id)) then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;

  -- (8) master global ligado?
  if not exists (select 1 from public.bot_config b where b.organizacao_id = c.organizacao_id and b.ativo) then
    return jsonb_build_object('elegivel', false, 'motivo', 'master_desligado');
  end if;

  -- (6/7) canal explicitamente habilitado?
  select * into cc from public.bot_canal_config where canal_id = c.canal_id;
  if cc.canal_id is null or not cc.bot_enabled then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_nao_habilitado', 'canal', c.canal_id);
  end if;

  -- (5) saúde do canal: conectado, sem restrição e sem health ruim
  select status_integracao, envio_restrito, health_check_status into cn
    from public.canais where id = c.canal_id;
  if cn.status_integracao is distinct from 'conectado' then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_desconectado', 'canal', c.canal_id);
  end if;
  if coalesce(cn.envio_restrito, false) then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_restrito', 'canal', c.canal_id);
  end if;
  if cn.health_check_status in ('restrito','falha') then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_health_ruim', 'canal', c.canal_id);
  end if;

  -- (2) sem atendente responsável
  if c.atendente_id is not null then
    return jsonb_build_object('elegivel', false, 'motivo', 'ja_tem_atendente');
  end if;

  -- (1) conversa nova: aberta, não arquivada, recente
  if c.arquivada_em is not null then
    return jsonb_build_object('elegivel', false, 'motivo', 'conversa_arquivada');
  end if;
  if c.status is distinct from 'aberta' then
    return jsonb_build_object('elegivel', false, 'motivo', 'conversa_em_andamento');
  end if;
  if c.criado_em < now() - v_recencia then
    return jsonb_build_object('elegivel', false, 'motivo', 'conversa_antiga');
  end if;

  -- (3) atendente humano já respondeu? (painel: autor_id; celular: origem='telefone')
  if exists (
    select 1 from public.mensagens m
    where m.conversa_id = c.id and m.direcao = 'saida'
      and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
           or (m.autor_id is null and m.origem = 'telefone'))
  ) then
    return jsonb_build_object('elegivel', false, 'motivo', 'atendente_ja_respondeu');
  end if;

  -- (4) oportunidade em etapa avançada (card aberto fora da coluna de entrada)
  if exists (
    select 1 from public.oportunidades o
    join public.funil_colunas fc on fc.id = o.coluna_id
    where o.contato_id = c.contato_id and o.status = 'em_andamento'
      and coalesce(fc.entrada, false) = false
  ) then
    return jsonb_build_object('elegivel', false, 'motivo', 'oportunidade_avancada');
  end if;

  -- (9) contato tem destino de envio (não pode ser LID-only)
  if not exists (
    select 1 from public.contato_identidades ci
    where ci.contato_id = c.contato_id and ci.tipo = 'whatsapp' and ci.valor_normalizado is not null
  ) then
    return jsonb_build_object('elegivel', false, 'motivo', 'sem_destino_envio');
  end if;

  return jsonb_build_object('elegivel', true, 'motivo', 'ok', 'canal', c.canal_id, 'fluxo', cc.fluxo_slug);
end $$;

-- ===== 5) bot_canal_configurar(...) — admin/supervisor, com audit_log =====
create or replace function public.bot_canal_configurar(
  p_canal uuid, p_enabled boolean,
  p_fluxo text default 'atendimento_inicial_descontos',
  p_origem text default null, p_campanha text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then raise exception 'canal_nao_encontrado'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org)
        and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[]))) then
    raise exception 'sem_permissao';
  end if;

  insert into public.bot_canal_config (organizacao_id, canal_id, bot_enabled, fluxo_slug, origem, campanha,
                                       ativo_em, ativo_por)
  values (v_org, p_canal, p_enabled, coalesce(p_fluxo,'atendimento_inicial_descontos'), p_origem, p_campanha,
          case when p_enabled then now() else null end, auth.uid())
  on conflict (canal_id) do update set
    bot_enabled = excluded.bot_enabled,
    fluxo_slug  = excluded.fluxo_slug,
    origem      = coalesce(excluded.origem, public.bot_canal_config.origem),
    campanha    = coalesce(excluded.campanha, public.bot_canal_config.campanha),
    ativo_em    = case when excluded.bot_enabled then now() else null end,
    ativo_por   = auth.uid();

  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(), 'bot_canal_configurado', 'canais', p_canal,
          jsonb_build_object('bot_enabled', p_enabled, 'fluxo', p_fluxo), v_org);

  return jsonb_build_object('ok', true, 'canal', p_canal, 'bot_enabled', p_enabled);
end $$;

-- ===== 6) RLS + grants (leitura p/ membros; escrita só via RPC security definer) =====
alter table public.bot_config enable row level security;
alter table public.bot_canal_config enable row level security;
drop policy if exists bot_config_sel on public.bot_config;
create policy bot_config_sel on public.bot_config for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));
drop policy if exists bot_canal_config_sel on public.bot_canal_config;
create policy bot_canal_config_sel on public.bot_canal_config for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));

grant select on public.bot_config to authenticated;
grant select on public.bot_canal_config to authenticated;
-- service_role (backend do B2) precisa ler config e config-por-canal
grant select on public.bot_config, public.bot_canal_config to service_role;

revoke all on function public.bot_pode_atuar(uuid) from public, anon;
revoke all on function public.bot_canal_configurar(uuid, boolean, text, text, text) from public, anon;
grant execute on function public.bot_pode_atuar(uuid) to authenticated, service_role;
grant execute on function public.bot_canal_configurar(uuid, boolean, text, text, text) to authenticated;

-- ===== 7) SEED inicial (org da bússola) — master OFF; LUIZA/ANDRIUS on; RMKT/URA off =====
do $seed$
declare v_org constant uuid := 'de300000-0000-4000-8000-000000000001';
        v_por constant uuid := '4ac197b4-9600-4756-81aa-1ac29280df09'; -- Matheus (admin)
        v_funil uuid;
begin
  select id into v_funil from public.funis
    where organizacao_id = v_org and not arquivado order by padrao desc, ordem asc nulls last limit 1;

  insert into public.bot_config (organizacao_id, ativo, funil_id)
  values (v_org, false, v_funil)
  on conflict (organizacao_id) do update set ativo = false, funil_id = coalesce(public.bot_config.funil_id, excluded.funil_id);

  -- Habilitados: LUIZA e ANDRIUS (origem/campanha copiados do cadastro atual do canal)
  insert into public.bot_canal_config (organizacao_id, canal_id, bot_enabled, fluxo_slug, origem, campanha, ativo_em, ativo_por)
  select c.organizacao_id, c.id, true, 'atendimento_inicial_descontos', c.origem_tipo, c.campanha, now(), v_por
  from public.canais c
  where c.organizacao_id = v_org and c.nome_interno in ('LUIZA','ANDRIUS')
  on conflict (canal_id) do update set
    bot_enabled = true, fluxo_slug = 'atendimento_inicial_descontos',
    origem = coalesce(public.bot_canal_config.origem, excluded.origem),
    campanha = coalesce(public.bot_canal_config.campanha, excluded.campanha),
    ativo_em = now(), ativo_por = v_por;

  -- Desativados explicitamente: RMKT e URA
  insert into public.bot_canal_config (organizacao_id, canal_id, bot_enabled, ativo_por)
  select c.organizacao_id, c.id, false, v_por
  from public.canais c
  where c.organizacao_id = v_org and c.nome_interno in ('RMKT','URA')
  on conflict (canal_id) do update set bot_enabled = false, ativo_em = null, ativo_por = v_por;
end $seed$;

notify pgrst, 'reload schema';
