-- ============================================================================
-- MATURAÇÃO DE NÚMEROS — Bloco A (banco)
--
-- Subsistema PARALELO e ISOLADO para aquecer chips de WhatsApp antes de usá-los
-- em atendimento real.
--
-- ISOLAMENTO É REQUISITO DE PROJETO, NÃO DETALHE:
--   O tráfego de aquecimento NUNCA toca contatos/conversas/mensagens/oportunidades.
--   O `evolution-webhook` dispara `garantir_oportunidade_lead_novo`, `bot_remarketing_inbound`
--   e alimenta o SLA em todo inbound — se o aquecimento entrasse por lá, criaria contatos
--   falsos, oportunidades fantasma no Kanban, alertas de SLA infinitos e contaminaria os
--   Relatórios ("pessoas que chamaram"). Por isso os chips daqui:
--     • NÃO são linhas de `canais` (e portanto não consomem `limite_whatsapps`, que é
--       coluna gerada e amarrada à cobrança);
--     • usam instâncias Evolution com prefixo próprio `aquec_*`;
--     • apontam para um webhook dedicado (`maturacao-webhook`, Bloco B).
--
-- Segurança: RLS por org e visível SÓ para admin (atendente não vê aquecimento).
-- Escrita exclusivamente via RPC security definer — o cliente nunca faz INSERT direto.
-- Nasce INERTE: `maturacao_config.modo` = 'dry_run' (mesmo padrão do bot-remarketing).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- CHIPS — o pool de números em maturação
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.maturacao_chips (
  id                 uuid primary key default gen_random_uuid(),
  organizacao_id     uuid not null references public.organizacoes(id) on delete cascade,
  apelido            text not null,
  operadora          text,
  -- instância Evolution dedicada: 'aquec_<id sem hifen>' (prefixo distingue de 'atenvo_*')
  instancia_externa  text unique,
  numero_conectado   text,
  status_integracao  text not null default 'desconectado'
                       check (status_integracao in ('desconectado','sincronizando','conectado','erro')),
  -- ciclo de vida da maturação
  status_maturacao   text not null default 'novo'
                       check (status_maturacao in ('novo','aquecendo','pausado','maduro','banido','erro')),
  dia_rampa          int  not null default 0,
  iniciado_em        timestamptz,
  concluido_em       timestamptz,
  -- perfil (foto/nome/recado) preenchido no celular ANTES de começar. Chip "careca" é suspeito.
  perfil_ok          boolean not null default false,
  pausado_motivo     text,
  observacao         text,
  conectado_em       timestamptz,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint mchip_apelido_nao_vazio check (length(trim(apelido)) > 0)
);

comment on table public.maturacao_chips is
  'Chips de WhatsApp em maturação (aquecimento). NÃO são canais de atendimento: não consomem limite_whatsapps nem aparecem no Inbox.';
comment on column public.maturacao_chips.perfil_ok is
  'Foto, nome e recado preenchidos. Bloqueia o início da rampa enquanto false.';

create index if not exists mchip_org_idx    on public.maturacao_chips (organizacao_id, status_maturacao);
create index if not exists mchip_numero_idx on public.maturacao_chips (numero_conectado);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFIG por organização — curva de rampa, janela e mix. Uma linha por org.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.maturacao_config (
  organizacao_id  uuid primary key references public.organizacoes(id) on delete cascade,
  -- 'dry_run': o planner planeja e o runner registra, mas NADA sai de verdade.
  modo            text not null default 'dry_run' check (modo in ('dry_run','ativo')),
  timezone        text not null default 'America/Sao_Paulo',
  hora_inicio     int  not null default 8  check (hora_inicio between 0 and 23),
  hora_fim        int  not null default 21 check (hora_fim    between 0 and 23),
  -- 0=domingo … 6=sábado. Padrão: seg–sáb (humano não conversa igual no domingo).
  dias_semana     int[] not null default '{1,2,3,4,5,6}',
  -- Curva conservadora. Faixas por dia de rampa; o planner sorteia entre min/max.
  rampa           jsonb not null default '[
    {"ate_dia":7,   "min":4,  "max":10, "tipos":["texto"]},
    {"ate_dia":14,  "min":12, "max":25, "tipos":["texto","figurinha","audio"]},
    {"ate_dia":21,  "min":25, "max":40, "tipos":["texto","figurinha","audio","imagem"]},
    {"ate_dia":28,  "min":40, "max":60, "tipos":["texto","figurinha","audio","imagem"]},
    {"ate_dia":9999,"min":30, "max":50, "tipos":["texto","figurinha","audio","imagem"]}
  ]'::jsonb,
  -- sementes externas quebram o cluster fechado; entram a partir de `dia_sementes`
  dia_sementes    int not null default 15,
  min_sementes    int not null default 2,
  -- fração do volume diário que deve ir para sementes externas depois de `dia_sementes`
  pct_sementes    int not null default 25 check (pct_sementes between 0 and 100),
  -- dias sem novidade antes de considerar o chip maduro
  dias_para_maduro int not null default 45,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references public.usuarios(id),
  constraint mcfg_janela check (hora_fim > hora_inicio)
);

comment on table public.maturacao_config is
  'Parâmetros de aquecimento por org. Nasce em dry_run: nada é enviado até um admin ativar.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SEMENTES — números EXTERNOS ao pool (celulares pessoais, chips já maduros).
-- São o que impede a malha de virar um cluster fechado de 5 números.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.maturacao_sementes (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  apelido         text not null,
  numero          text not null,           -- só dígitos, com DDI+DDD
  ativo           boolean not null default true,
  observacao      text,
  criado_em       timestamptz not null default now(),
  constraint msem_numero_digitos check (numero ~ '^[0-9]{12,15}$'),
  unique (organizacao_id, numero)
);

comment on table public.maturacao_sementes is
  'Números externos ao pool usados para quebrar o padrão de cluster fechado durante o aquecimento.';

-- ─────────────────────────────────────────────────────────────────────────────
-- CONTEÚDO — biblioteca variada. Repetir frase é o jeito mais rápido de ser pego.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.maturacao_conteudo (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  tipo            text not null default 'texto'
                    check (tipo in ('texto','figurinha','audio','imagem')),
  -- 'abertura' inicia troca; 'resposta' responde a uma abertura (reciprocidade)
  categoria       text not null default 'abertura'
                    check (categoria in ('abertura','resposta','conversa')),
  texto           text,
  storage_path    text,
  mime_type       text,
  usos            int not null default 0,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  constraint mcont_tem_conteudo check (texto is not null or storage_path is not null)
);

comment on table public.maturacao_conteudo is
  'Biblioteca de mensagens/mídias sorteadas pelo planner. Variedade é requisito anti-detecção.';

create index if not exists mcont_org_idx on public.maturacao_conteudo (organizacao_id, tipo, categoria)
  where ativo;

-- ─────────────────────────────────────────────────────────────────────────────
-- AGENDA — a fila planejada do dia. Espelha `mensagens_agendadas` (padrão provado).
-- O planner popula; o runner consome. Determinística e auditável.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.maturacao_agenda (
  id                uuid primary key default gen_random_uuid(),
  organizacao_id    uuid not null references public.organizacoes(id)     on delete cascade,
  chip_origem_id    uuid not null references public.maturacao_chips(id)  on delete cascade,
  destino_tipo      text not null check (destino_tipo in ('chip','semente')),
  chip_destino_id   uuid references public.maturacao_chips(id)           on delete cascade,
  semente_id        uuid references public.maturacao_sementes(id)        on delete cascade,
  numero_destino    text not null,                 -- snapshot resolvido no planejamento
  executar_em       timestamptz not null,
  tipo              text not null default 'texto'
                      check (tipo in ('texto','figurinha','audio','imagem')),
  conteudo_id       uuid references public.maturacao_conteudo(id) on delete set null,
  texto_snapshot    text,                          -- o que sai de fato (imune a edição posterior)
  -- reciprocidade: esta linha é a RESPOSTA planejada de um envio anterior
  responde_a_id     uuid references public.maturacao_agenda(id) on delete cascade,
  status            text not null default 'agendada'
                      check (status in ('agendada','processando','enviada','falhou','cancelada','expirada','pulada')),
  tentativas        int not null default 0,
  max_tentativas    int not null default 2,
  ultimo_erro       text,
  id_externo        text,                          -- id da mensagem na Evolution
  enviada_em        timestamptz,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  metadados         jsonb not null default '{}'::jsonb,
  -- destino coerente: ou chip, ou semente — nunca ambos, nunca nenhum
  constraint mag_destino_coerente check (
    (destino_tipo = 'chip'    and chip_destino_id is not null and semente_id is null) or
    (destino_tipo = 'semente' and semente_id      is not null and chip_destino_id is null)
  ),
  -- um chip não fala consigo mesmo
  constraint mag_sem_autoenvio check (chip_destino_id is null or chip_destino_id <> chip_origem_id)
);

comment on table public.maturacao_agenda is
  'Fila planejada de trocas de aquecimento. Populada pelo maturacao-planner, consumida pelo maturacao-runner.';

-- hot path do cron: vencidas ainda agendadas
create index if not exists magd_due_idx    on public.maturacao_agenda (executar_em)
  where status = 'agendada';
create index if not exists magd_org_idx    on public.maturacao_agenda (organizacao_id, status);
create index if not exists magd_origem_idx on public.maturacao_agenda (chip_origem_id, executar_em);
-- controle de rotação: evita martelar o mesmo par
create index if not exists magd_par_idx    on public.maturacao_agenda (chip_origem_id, chip_destino_id, executar_em);

-- ─────────────────────────────────────────────────────────────────────────────
-- EVENTOS — telemetria por chip. É daqui que sai o semáforo de saúde do painel
-- (ERROR de envio é o sinal precoce de restrição — foi o que antecipou a LUIZA).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.maturacao_eventos (
  id                 uuid primary key default gen_random_uuid(),
  organizacao_id     uuid not null references public.organizacoes(id)    on delete cascade,
  chip_id            uuid not null references public.maturacao_chips(id) on delete cascade,
  agenda_id          uuid references public.maturacao_agenda(id)         on delete set null,
  tipo               text not null check (tipo in ('envio','ack','leitura','recebimento','erro','conexao')),
  direcao            text check (direcao in ('entrada','saida')),
  status             text,
  id_externo         text,
  numero_contraparte text,
  erro               text,
  ocorrido_em        timestamptz not null default now(),
  dados              jsonb not null default '{}'::jsonb
);

comment on table public.maturacao_eventos is
  'Telemetria de aquecimento por chip (envio/ACK/leitura/erro). Base do painel de saúde.';

create index if not exists mev_chip_idx on public.maturacao_eventos (chip_id, ocorrido_em desc);
create index if not exists mev_org_idx  on public.maturacao_eventos (organizacao_id, tipo, ocorrido_em desc);

-- ============================================================================
-- RLS — visível SÓ para admin da org (aquecimento não é assunto de atendente).
-- Escrita sempre via RPC security definer.
-- ============================================================================
alter table public.maturacao_chips    enable row level security;
alter table public.maturacao_config   enable row level security;
alter table public.maturacao_sementes enable row level security;
alter table public.maturacao_conteudo enable row level security;
alter table public.maturacao_agenda   enable row level security;
alter table public.maturacao_eventos  enable row level security;

drop policy if exists mchip_sel on public.maturacao_chips;
create policy mchip_sel on public.maturacao_chips
  for select using (public._eh_admin_org(organizacao_id));

drop policy if exists mcfg_sel on public.maturacao_config;
create policy mcfg_sel on public.maturacao_config
  for select using (public._eh_admin_org(organizacao_id));

drop policy if exists msem_sel on public.maturacao_sementes;
create policy msem_sel on public.maturacao_sementes
  for select using (public._eh_admin_org(organizacao_id));

drop policy if exists mcont_sel on public.maturacao_conteudo;
create policy mcont_sel on public.maturacao_conteudo
  for select using (public._eh_admin_org(organizacao_id));

drop policy if exists magd_sel on public.maturacao_agenda;
create policy magd_sel on public.maturacao_agenda
  for select using (public._eh_admin_org(organizacao_id));

drop policy if exists mev_sel on public.maturacao_eventos;
create policy mev_sel on public.maturacao_eventos
  for select using (public._eh_admin_org(organizacao_id));

revoke insert, update, delete on public.maturacao_chips,    public.maturacao_config,
                                 public.maturacao_sementes, public.maturacao_conteudo,
                                 public.maturacao_agenda,   public.maturacao_eventos
  from anon, authenticated;

grant select on public.maturacao_chips,    public.maturacao_config,
                public.maturacao_sementes, public.maturacao_conteudo,
                public.maturacao_agenda,   public.maturacao_eventos
  to authenticated;

-- ============================================================================
-- RPCs — todas exigem admin da org. Nunca confiam em organizacao_id do cliente
-- sem revalidar o vínculo.
-- ============================================================================

-- ─── Config: lê criando o padrão na primeira vez ────────────────────────────
create or replace function public.maturacao_config_obter(p_org uuid)
returns public.maturacao_config
language plpgsql security definer set search_path = public as $fn$
declare v_row public.maturacao_config;
begin
  if not public._eh_admin_org(p_org) then raise exception 'sem_acesso'; end if;

  insert into public.maturacao_config (organizacao_id)
  values (p_org)
  on conflict (organizacao_id) do nothing;

  select * into v_row from public.maturacao_config where organizacao_id = p_org;
  return v_row;
end $fn$;

revoke execute on function public.maturacao_config_obter(uuid) from public, anon;
grant  execute on function public.maturacao_config_obter(uuid) to authenticated;

-- ─── Config: salvar (patch parcial via jsonb) ───────────────────────────────
create or replace function public.maturacao_config_salvar(p_org uuid, p_patch jsonb)
returns public.maturacao_config
language plpgsql security definer set search_path = public as $fn$
declare v_row public.maturacao_config;
begin
  if not public._eh_admin_org(p_org) then raise exception 'sem_acesso'; end if;

  perform public.maturacao_config_obter(p_org);

  update public.maturacao_config set
    modo             = coalesce(p_patch->>'modo', modo),
    hora_inicio      = coalesce((p_patch->>'hora_inicio')::int, hora_inicio),
    hora_fim         = coalesce((p_patch->>'hora_fim')::int, hora_fim),
    dias_semana      = coalesce(
                         (select array_agg(value::text::int)
                            from jsonb_array_elements(p_patch->'dias_semana')),
                         dias_semana),
    rampa            = coalesce(p_patch->'rampa', rampa),
    dia_sementes     = coalesce((p_patch->>'dia_sementes')::int, dia_sementes),
    min_sementes     = coalesce((p_patch->>'min_sementes')::int, min_sementes),
    pct_sementes     = coalesce((p_patch->>'pct_sementes')::int, pct_sementes),
    dias_para_maduro = coalesce((p_patch->>'dias_para_maduro')::int, dias_para_maduro),
    atualizado_em    = now(),
    atualizado_por   = auth.uid()
  where organizacao_id = p_org
  returning * into v_row;

  return v_row;
end $fn$;

revoke execute on function public.maturacao_config_salvar(uuid, jsonb) from public, anon;
grant  execute on function public.maturacao_config_salvar(uuid, jsonb) to authenticated;

-- ─── Chip: criar (a instância Evolution é nomeada aqui, conectada no Bloco B) ─
create or replace function public.maturacao_chip_criar(
  p_org       uuid,
  p_apelido   text,
  p_operadora text default null
) returns public.maturacao_chips
language plpgsql security definer set search_path = public as $fn$
declare v_row public.maturacao_chips;
begin
  if not public._eh_admin_org(p_org) then raise exception 'sem_acesso'; end if;
  if p_apelido is null or length(trim(p_apelido)) = 0 then raise exception 'apelido_vazio'; end if;

  insert into public.maturacao_chips (organizacao_id, apelido, operadora)
  values (p_org, trim(p_apelido), nullif(trim(coalesce(p_operadora,'')), ''))
  returning * into v_row;

  -- prefixo 'aquec_' separa das instâncias de atendimento ('atenvo_*')
  update public.maturacao_chips
     set instancia_externa = 'aquec_' || replace(v_row.id::text, '-', ''),
         atualizado_em     = now()
   where id = v_row.id
  returning * into v_row;

  return v_row;
end $fn$;

revoke execute on function public.maturacao_chip_criar(uuid, text, text) from public, anon;
grant  execute on function public.maturacao_chip_criar(uuid, text, text) to authenticated;

-- ─── Chip: editar dados descritivos + marcar perfil pronto ──────────────────
create or replace function public.maturacao_chip_atualizar(
  p_chip      uuid,
  p_apelido   text default null,
  p_operadora text default null,
  p_observacao text default null,
  p_perfil_ok boolean default null
) returns public.maturacao_chips
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_row public.maturacao_chips;
begin
  select organizacao_id into v_org from public.maturacao_chips where id = p_chip;
  if v_org is null then raise exception 'chip_nao_encontrado'; end if;
  if not public._eh_admin_org(v_org) then raise exception 'sem_acesso'; end if;

  update public.maturacao_chips set
    apelido       = coalesce(nullif(trim(coalesce(p_apelido,'')), ''), apelido),
    operadora     = coalesce(p_operadora, operadora),
    observacao    = coalesce(p_observacao, observacao),
    perfil_ok     = coalesce(p_perfil_ok, perfil_ok),
    atualizado_em = now()
  where id = p_chip
  returning * into v_row;

  return v_row;
end $fn$;

revoke execute on function public.maturacao_chip_atualizar(uuid, text, text, text, boolean) from public, anon;
grant  execute on function public.maturacao_chip_atualizar(uuid, text, text, text, boolean) to authenticated;

-- ─── Chip: iniciar rampa ────────────────────────────────────────────────────
-- Só começa com perfil preenchido e sessão conectada. Chip sem foto/nome é suspeito,
-- e rampa em chip desconectado só gera falha acumulada.
create or replace function public.maturacao_chip_iniciar(p_chip uuid)
returns public.maturacao_chips
language plpgsql security definer set search_path = public as $fn$
declare v_chip public.maturacao_chips; v_row public.maturacao_chips;
begin
  select * into v_chip from public.maturacao_chips where id = p_chip;
  if v_chip.id is null then raise exception 'chip_nao_encontrado'; end if;
  if not public._eh_admin_org(v_chip.organizacao_id) then raise exception 'sem_acesso'; end if;

  if not v_chip.perfil_ok then
    raise exception 'perfil_incompleto' using hint = 'defina foto, nome e recado no celular antes de iniciar';
  end if;
  if v_chip.status_integracao <> 'conectado' then raise exception 'chip_desconectado'; end if;
  if v_chip.status_maturacao = 'banido' then raise exception 'chip_banido'; end if;

  update public.maturacao_chips set
    status_maturacao = 'aquecendo',
    -- retomar de pausa preserva o dia; começar do zero vai para o dia 1
    dia_rampa        = case when v_chip.status_maturacao = 'pausado' then greatest(v_chip.dia_rampa, 1) else 1 end,
    iniciado_em      = coalesce(v_chip.iniciado_em, now()),
    pausado_motivo   = null,
    atualizado_em    = now()
  where id = p_chip
  returning * into v_row;

  return v_row;
end $fn$;

revoke execute on function public.maturacao_chip_iniciar(uuid) from public, anon;
grant  execute on function public.maturacao_chip_iniciar(uuid) to authenticated;

-- ─── Chip: pausar (cancela o que ainda não saiu) ────────────────────────────
create or replace function public.maturacao_chip_pausar(p_chip uuid, p_motivo text default null)
returns public.maturacao_chips
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_row public.maturacao_chips;
begin
  select organizacao_id into v_org from public.maturacao_chips where id = p_chip;
  if v_org is null then raise exception 'chip_nao_encontrado'; end if;
  if not public._eh_admin_org(v_org) then raise exception 'sem_acesso'; end if;

  update public.maturacao_chips set
    status_maturacao = 'pausado',
    pausado_motivo   = nullif(trim(coalesce(p_motivo,'')), ''),
    atualizado_em    = now()
  where id = p_chip
  returning * into v_row;

  -- nada pendente deste chip deve sair depois da pausa
  update public.maturacao_agenda
     set status = 'cancelada', atualizado_em = now()
   where status = 'agendada'
     and (chip_origem_id = p_chip or chip_destino_id = p_chip);

  return v_row;
end $fn$;

revoke execute on function public.maturacao_chip_pausar(uuid, text) from public, anon;
grant  execute on function public.maturacao_chip_pausar(uuid, text) to authenticated;

-- ─── Chip: excluir de vez ───────────────────────────────────────────────────
-- Exclusão real (mesma decisão já tomada para remoção de conexões em Integrações).
-- A instância Evolution é derrubada pelo `maturacao-manage` antes de chamar isto.
create or replace function public.maturacao_chip_excluir(p_chip uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.maturacao_chips where id = p_chip;
  if v_org is null then raise exception 'chip_nao_encontrado'; end if;
  if not public._eh_admin_org(v_org) then raise exception 'sem_acesso'; end if;

  delete from public.maturacao_chips where id = p_chip;  -- agenda/eventos caem por cascade
end $fn$;

revoke execute on function public.maturacao_chip_excluir(uuid) from public, anon;
grant  execute on function public.maturacao_chip_excluir(uuid) to authenticated;

-- ─── Sementes ───────────────────────────────────────────────────────────────
create or replace function public.maturacao_semente_adicionar(
  p_org uuid, p_apelido text, p_numero text
) returns public.maturacao_sementes
language plpgsql security definer set search_path = public as $fn$
declare v_num text; v_row public.maturacao_sementes;
begin
  if not public._eh_admin_org(p_org) then raise exception 'sem_acesso'; end if;

  v_num := regexp_replace(coalesce(p_numero,''), '\D', '', 'g');
  if length(v_num) < 12 then
    raise exception 'numero_invalido' using hint = 'informe com DDI e DDD (ex.: 5551999998888)';
  end if;

  -- uma semente não pode ser um chip do próprio pool: isso recriaria o cluster fechado
  if exists (select 1 from public.maturacao_chips
              where organizacao_id = p_org and numero_conectado = v_num) then
    raise exception 'semente_e_chip_do_pool'
      using hint = 'sementes precisam ser números externos ao pool';
  end if;

  insert into public.maturacao_sementes (organizacao_id, apelido, numero)
  values (p_org, trim(p_apelido), v_num)
  returning * into v_row;

  return v_row;
end $fn$;

revoke execute on function public.maturacao_semente_adicionar(uuid, text, text) from public, anon;
grant  execute on function public.maturacao_semente_adicionar(uuid, text, text) to authenticated;

create or replace function public.maturacao_semente_excluir(p_semente uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.maturacao_sementes where id = p_semente;
  if v_org is null then raise exception 'semente_nao_encontrada'; end if;
  if not public._eh_admin_org(v_org) then raise exception 'sem_acesso'; end if;

  delete from public.maturacao_sementes where id = p_semente;
end $fn$;

revoke execute on function public.maturacao_semente_excluir(uuid) from public, anon;
grant  execute on function public.maturacao_semente_excluir(uuid) to authenticated;

-- ─── Conteúdo ───────────────────────────────────────────────────────────────
create or replace function public.maturacao_conteudo_adicionar(
  p_org       uuid,
  p_tipo      text,
  p_categoria text,
  p_texto     text default null,
  p_storage   text default null,
  p_mime      text default null
) returns public.maturacao_conteudo
language plpgsql security definer set search_path = public as $fn$
declare v_row public.maturacao_conteudo;
begin
  if not public._eh_admin_org(p_org) then raise exception 'sem_acesso'; end if;
  if p_texto is null and p_storage is null then raise exception 'conteudo_vazio'; end if;

  insert into public.maturacao_conteudo (organizacao_id, tipo, categoria, texto, storage_path, mime_type)
  values (p_org, coalesce(p_tipo,'texto'), coalesce(p_categoria,'abertura'),
          nullif(trim(coalesce(p_texto,'')), ''), p_storage, p_mime)
  returning * into v_row;

  return v_row;
end $fn$;

revoke execute on function public.maturacao_conteudo_adicionar(uuid, text, text, text, text, text) from public, anon;
grant  execute on function public.maturacao_conteudo_adicionar(uuid, text, text, text, text, text) to authenticated;

create or replace function public.maturacao_conteudo_excluir(p_conteudo uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.maturacao_conteudo where id = p_conteudo;
  if v_org is null then raise exception 'conteudo_nao_encontrado'; end if;
  if not public._eh_admin_org(v_org) then raise exception 'sem_acesso'; end if;

  delete from public.maturacao_conteudo where id = p_conteudo;
end $fn$;

revoke execute on function public.maturacao_conteudo_excluir(uuid) from public, anon;
grant  execute on function public.maturacao_conteudo_excluir(uuid) to authenticated;

-- ─── Runner: claim atômico do lote vencido (só service_role) ────────────────
-- DISTINCT ON (chip_origem_id) → no máximo 1 envio por chip por ciclo. Isso é o
-- anti-rajada: mesmo que o planner concentre horários, o chip nunca dispara em lote.
create or replace function public.maturacao_agenda_reivindicar(p_limite int default 20)
returns setof public.maturacao_agenda
language plpgsql security definer set search_path = public as $fn$
begin
  return query
  with cand as (
    select distinct on (a.chip_origem_id) a.id
      from public.maturacao_agenda a
      join public.maturacao_chips c on c.id = a.chip_origem_id
     where a.status = 'agendada'
       and a.executar_em <= now()
       and c.status_maturacao = 'aquecendo'
       and c.status_integracao = 'conectado'
     order by a.chip_origem_id, a.executar_em
     limit greatest(1, p_limite)
  )
  update public.maturacao_agenda m
     set status = 'processando', tentativas = tentativas + 1, atualizado_em = now()
    from cand
   where m.id = cand.id and m.status = 'agendada'   -- guarda atômica contra cron duplicado
  returning m.*;
end $fn$;

revoke execute on function public.maturacao_agenda_reivindicar(int) from public, anon, authenticated;
grant  execute on function public.maturacao_agenda_reivindicar(int) to service_role;

-- ─── Painel: resumo por chip para a aba ─────────────────────────────────────
create or replace function public.maturacao_painel(p_org uuid)
returns table (
  chip_id           uuid,
  apelido           text,
  numero_conectado  text,
  status_integracao text,
  status_maturacao  text,
  dia_rampa         int,
  perfil_ok         boolean,
  enviadas_7d       bigint,
  entregues_7d      bigint,
  lidas_7d          bigint,
  erros_7d          bigint,
  pendentes_hoje    bigint,
  ultimo_erro_em    timestamptz
)
language sql stable security definer set search_path = public as $fn$
  select
    c.id, c.apelido, c.numero_conectado, c.status_integracao, c.status_maturacao,
    c.dia_rampa, c.perfil_ok,
    count(*) filter (where e.tipo = 'envio'   and e.ocorrido_em > now() - interval '7 days'),
    count(*) filter (where e.tipo = 'ack'     and e.status = 'entregue'
                       and e.ocorrido_em > now() - interval '7 days'),
    count(*) filter (where e.tipo = 'leitura' and e.ocorrido_em > now() - interval '7 days'),
    count(*) filter (where e.tipo = 'erro'    and e.ocorrido_em > now() - interval '7 days'),
    (select count(*) from public.maturacao_agenda a
      where a.chip_origem_id = c.id and a.status = 'agendada'
        and a.executar_em::date = current_date),
    max(e.ocorrido_em) filter (where e.tipo = 'erro')
  from public.maturacao_chips c
  left join public.maturacao_eventos e on e.chip_id = c.id
  where c.organizacao_id = p_org
    and public._eh_admin_org(p_org)
  group by c.id
  order by c.criado_em;
$fn$;

revoke execute on function public.maturacao_painel(uuid) from public, anon;
grant  execute on function public.maturacao_painel(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Secrets do subsistema: gerados no banco (cron e Edge ficam auto-consistentes,
-- sem valor versionado no código). on conflict do nothing → não sobrescreve.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.webhook_config (chave, secret)
values ('maturacao', gen_random_uuid()::text)
on conflict (chave) do nothing;
