-- Relacionamento — Fase 1 (Bloco A: modelo de dados).
-- Módulo NATIVO do Atenvo (não é sistema paralelo). Réguas de relacionamento/nutrição
-- ativadas MANUALMENTE por cliente, enviadas pelos NÚMEROS NORMAIS (transporte='evolution').
-- Sem Cloud API / templates / janela 24h.
--
-- Decisões travadas com o dono:
--   * 1 régua ATIVA por contato (unique parcial).
--   * CRUD de régua = somente admin.
--   * Ativação/pausa/desativação: admin/supervisor em qualquer contato; atendente só nos próprios.
--
-- Reuso: os passos são MATERIALIZADOS como linhas em public.mensagens_agendadas
-- (mesmo processador + evolution-send). Aqui só o modelo; o motor/cron vem em bloco posterior (inerte).
--
-- Escrita: RLS só de SELECT; todo write pelos RPCs SECURITY DEFINER (Bloco B). Espelha mensagens_agendadas.
-- Isolamento por org via FK composta (id, organizacao_id), no padrão de fichas_judiciais.

-- ============================================================================
-- 0) Pré-requisito p/ FKs compostas a partir de reguas
-- ============================================================================
-- (contatos/canais/conversas/oportunidades já possuem o unique (id, organizacao_id)
--  criado em migrations anteriores; aqui garantimos o de reguas ao criá-la.)

-- ============================================================================
-- 1) Helper de papel para gestão de régua (CRUD = somente admin)
-- ============================================================================
create or replace function public.relacionamento_admin(p_org uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce(
    public.is_platform_admin()
    or (public.org_operacional(p_org) and public.org_papel(p_org) = 'admin'),
  false);
$$;
revoke all on function public.relacionamento_admin(uuid) from public, anon;
grant execute on function public.relacionamento_admin(uuid) to authenticated;

-- Janela permitida: próximo instante >= p_from que cai em dia permitido e dentro do horário.
-- dow: 0=domingo .. 6=sábado (compatível com extract(dow)). Timezone da régua.
create or replace function public.relacionamento_snap(
  p_dias int[], p_ini time, p_fim time, p_tz text, p_from timestamptz
) returns timestamptz
  language plpgsql immutable set search_path = public as $$
declare d timestamptz := p_from; loc timestamp; dow int; i int := 0;
begin
  if p_dias is null or array_length(p_dias,1) is null then return p_from; end if;
  loop
    loc := (d at time zone p_tz);
    dow := extract(dow from loc)::int;
    if p_dias @> array[dow] then
      if loc::time < p_ini then
        return (date_trunc('day', loc) + p_ini) at time zone p_tz;
      elsif loc::time <= p_fim then
        return d;
      end if;
    end if;
    d := (date_trunc('day', loc) + interval '1 day') at time zone p_tz;
    i := i + 1;
    if i > 14 then return d; end if;  -- guarda anti-loop
  end loop;
end $$;
revoke all on function public.relacionamento_snap(int[],time,time,text,timestamptz) from public, anon;
grant execute on function public.relacionamento_snap(int[],time,time,text,timestamptz) to authenticated, service_role;

-- ============================================================================
-- 2) reguas — definição da régua/campanha (reutilizável)
-- ============================================================================
create table public.reguas (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  nome text not null,
  objetivo text not null check (objetivo in (
    'relacionamento_cliente','nutricao_lead','reativacao',
    'documentacao','pos_reuniao','data_comemorativa','conteudo')),
  status text not null default 'rascunho' check (status in ('rascunho','ativa','arquivada')),
  publico_sugerido text,
  pausar_se_responder boolean not null default true,
  teto_semana int not null default 3 check (teto_semana between 1 and 21),
  intervalo_min_horas int not null default 48 check (intervalo_min_horas >= 0),
  dias_semana int[] not null default '{1,2,3,4,5}',        -- 0=dom..6=sáb
  hora_inicio time not null default '08:00',
  hora_fim    time not null default '18:00',
  timezone text not null default 'America/Sao_Paulo',
  canal_padrao_id uuid,                                     -- opcional; escolhido de fato na ativação
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint reguas_id_org_uniq unique (id, organizacao_id),
  constraint chk_regua_janela check (hora_inicio < hora_fim),
  constraint chk_regua_dias check (dias_semana <@ array[0,1,2,3,4,5,6]),
  constraint fk_regua_org   foreign key (organizacao_id) references public.organizacoes(id) on delete cascade,
  -- SET NULL com lista de colunas (PG15+): anula só canal_padrao_id, preserva organizacao_id (NOT NULL).
  -- Sem a lista, o SET NULL tentaria anular organizacao_id também e ABORTARIA a exclusão do canal.
  constraint fk_regua_canal foreign key (canal_padrao_id, organizacao_id) references public.canais(id, organizacao_id) on delete set null (canal_padrao_id),
  constraint fk_regua_criadopor foreign key (criado_por) references public.usuarios(id)
);
create index ix_reguas_org_status on public.reguas (organizacao_id, status);

-- ============================================================================
-- 3) regua_passos — passos da sequência
-- ============================================================================
create table public.regua_passos (
  id uuid primary key default gen_random_uuid(),
  regua_id uuid not null,
  organizacao_id uuid not null,                            -- denormalizado p/ RLS/consistência
  ordem smallint not null,
  titulo_interno text not null,                            -- rótulo interno (não enviado)
  tipo text not null check (tipo in ('texto','imagem','audio','video','documento','texto_midia')),
  texto text,
  storage_path text,
  mime_type text,
  nome_arquivo text,
  tamanho_bytes bigint,
  agendamento_tipo text not null check (agendamento_tipo in ('relativo','semanal','data_fixa')),
  offset_horas int,                                        -- 'relativo' (D+X → horas)
  dia_semana int check (dia_semana between 0 and 6),       -- 'semanal'
  hora time,                                               -- 'semanal' / 'data_fixa'
  data date,                                               -- 'data_fixa'
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint uq_passo_ordem unique (regua_id, ordem),
  constraint chk_passo_conteudo check (texto is not null or storage_path is not null),
  constraint chk_passo_agraw check (
    (agendamento_tipo = 'relativo'  and offset_horas is not null)
    or (agendamento_tipo = 'semanal'   and dia_semana is not null and hora is not null)
    or (agendamento_tipo = 'data_fixa' and data is not null and hora is not null)
  ),
  constraint fk_passo_regua foreign key (regua_id, organizacao_id) references public.reguas(id, organizacao_id) on delete cascade
);
create index ix_passos_regua on public.regua_passos (regua_id, ordem);

-- ============================================================================
-- 4) regua_ativacoes — 1 por (contato) ativa; estado do relacionamento
-- ============================================================================
create table public.regua_ativacoes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  regua_id uuid not null,
  contato_id uuid not null,
  conversa_id uuid,                                        -- conversa não-fechada usada p/ enviar
  canal_id uuid,                                           -- número normal escolhido
  responsavel_id uuid,
  status text not null default 'ativo' check (status in ('ativo','pausado','desativado','bloqueada')),
  passo_atual smallint not null default 0,
  proximo_em timestamptz,
  motivo_saida text,
  ativado_por uuid,
  ativado_em timestamptz not null default now(),
  pausado_em timestamptz,
  desativado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  constraint reguas_ativ_id_org_uniq unique (id, organizacao_id),
  constraint fk_ativ_org      foreign key (organizacao_id) references public.organizacoes(id) on delete cascade,
  constraint fk_ativ_regua    foreign key (regua_id, organizacao_id)    references public.reguas(id, organizacao_id) on delete restrict,
  constraint fk_ativ_contato  foreign key (contato_id, organizacao_id)  references public.contatos(id, organizacao_id) on delete cascade,
  -- SET NULL só em conversa_id (PG15+): preserva organizacao_id NOT NULL; sem a lista, excluir/dedup de
  -- conversa (merge de contatos) abortaria por violar o NOT NULL de organizacao_id.
  constraint fk_ativ_conversa foreign key (conversa_id, organizacao_id) references public.conversas(id, organizacao_id) on delete set null (conversa_id),
  constraint fk_ativ_canal    foreign key (canal_id, organizacao_id)    references public.canais(id, organizacao_id) on delete restrict,
  constraint fk_ativ_resp     foreign key (responsavel_id) references public.usuarios(id),
  constraint fk_ativ_ativpor  foreign key (ativado_por)    references public.usuarios(id)
);
-- 1 régua ativa/pausada por contato (o "Trocar régua" desativa a atual antes de criar a nova)
create unique index uq_ativ_contato_ativa on public.regua_ativacoes (organizacao_id, contato_id)
  where status in ('ativo','pausado');
create index ix_ativ_org_status on public.regua_ativacoes (organizacao_id, status);
create index ix_ativ_due on public.regua_ativacoes (proximo_em) where status = 'ativo';
create index ix_ativ_regua on public.regua_ativacoes (regua_id);
create index ix_ativ_resp on public.regua_ativacoes (organizacao_id, responsavel_id);

-- ============================================================================
-- 5) regua_envios — histórico (liga ativação → passo → mensagem real)
-- ============================================================================
create table public.regua_envios (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  ativacao_id uuid not null,
  passo_id uuid,
  mensagem_agendada_id uuid,
  status text not null check (status in (
    'agendado','enviado','falhou','cancelado','bloqueado_teto','bloqueado_horario','bloqueado_optout')),
  executar_em timestamptz,
  enviado_em timestamptz,
  erro text,
  resposta_em timestamptz,                                 -- medição de resposta
  criado_em timestamptz not null default now(),
  constraint fk_env_org   foreign key (organizacao_id) references public.organizacoes(id) on delete cascade,
  constraint fk_env_ativ  foreign key (ativacao_id, organizacao_id) references public.regua_ativacoes(id, organizacao_id) on delete cascade,
  constraint fk_env_passo foreign key (passo_id) references public.regua_passos(id) on delete set null,
  constraint fk_env_msg   foreign key (mensagem_agendada_id) references public.mensagens_agendadas(id) on delete set null
);
create index ix_env_ativ on public.regua_envios (ativacao_id, criado_em desc);
create index ix_env_org_status on public.regua_envios (organizacao_id, status);
create index ix_env_msg on public.regua_envios (mensagem_agendada_id) where mensagem_agendada_id is not null;

-- ============================================================================
-- 6) relacionamento_bloqueio — "não incomodar" GLOBAL por contato
--    (distinto de wa_optout, que é nível-Meta/canal)
-- ============================================================================
create table public.relacionamento_bloqueio (
  contato_id uuid primary key,
  organizacao_id uuid not null,
  motivo text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  constraint fk_blq_contato foreign key (contato_id, organizacao_id) references public.contatos(id, organizacao_id) on delete cascade,
  constraint fk_blq_org foreign key (organizacao_id) references public.organizacoes(id) on delete cascade,
  constraint fk_blq_criadopor foreign key (criado_por) references public.usuarios(id)
);
create index ix_blq_org on public.relacionamento_bloqueio (organizacao_id);

-- ============================================================================
-- 7) mensagens_agendadas: marca de origem (aditivo e não-quebrante)
--    Coluna NULLABLE ao fim; RPCs agendar_* usam lista explícita → default NULL.
-- ============================================================================
alter table public.mensagens_agendadas
  add column regua_ativacao_id uuid references public.regua_ativacoes(id) on delete set null;
create index mag_regua_idx on public.mensagens_agendadas (regua_ativacao_id)
  where regua_ativacao_id is not null;

-- ============================================================================
-- 8) Privilégios de tabela — SELECT p/ authenticated; writes só via RPC (Bloco B).
--    Espelha mensagens_agendadas (nada de INSERT/UPDATE/DELETE direto no client).
-- ============================================================================
revoke all on table public.reguas, public.regua_passos, public.regua_ativacoes,
  public.regua_envios, public.relacionamento_bloqueio from anon, authenticated;
grant select on table public.reguas, public.regua_passos, public.regua_ativacoes,
  public.regua_envios, public.relacionamento_bloqueio to authenticated;

-- ============================================================================
-- 9) RLS — só SELECT (writes pelos RPCs SECURITY DEFINER que bypassam RLS)
-- ============================================================================
alter table public.reguas                  enable row level security;
alter table public.regua_passos            enable row level security;
alter table public.regua_ativacoes         enable row level security;
alter table public.regua_envios            enable row level security;
alter table public.relacionamento_bloqueio enable row level security;

-- Réguas e passos: todo membro operacional enxerga (precisa listar p/ ativar).
create policy reguas_sel on public.reguas for select using (
  public.is_platform_admin() or (public.is_member(organizacao_id) and public.org_operacional(organizacao_id))
);
create policy passos_sel on public.regua_passos for select using (
  public.is_platform_admin() or (public.is_member(organizacao_id) and public.org_operacional(organizacao_id))
);

-- Ativações: admin/supervisor tudo; atendente só as suas (dono do contato / conversa).
create policy ativ_sel on public.regua_ativacoes for select using (
  public.is_platform_admin() or (public.is_member(organizacao_id) and (
    public.org_papel(organizacao_id) in ('admin','supervisor')
    or responsavel_id = auth.uid()
    or exists (select 1 from public.contatos c  where c.id = contato_id  and c.responsavel_id = auth.uid())
    or exists (select 1 from public.conversas cv where cv.id = conversa_id and cv.atendente_id  = auth.uid())
  ))
);

-- Histórico: mesma visibilidade da ativação correspondente.
create policy env_sel on public.regua_envios for select using (
  public.is_platform_admin() or (public.is_member(organizacao_id) and (
    public.org_papel(organizacao_id) in ('admin','supervisor')
    or exists (
      select 1 from public.regua_ativacoes a
      where a.id = ativacao_id and (
        a.responsavel_id = auth.uid()
        or exists (select 1 from public.contatos c where c.id = a.contato_id and c.responsavel_id = auth.uid())
      ))
  ))
);

-- Bloqueio "não incomodar": visível a qualquer membro operacional.
create policy blq_sel on public.relacionamento_bloqueio for select using (
  public.is_platform_admin() or (public.is_member(organizacao_id) and public.org_operacional(organizacao_id))
);

-- Nada de policies de INSERT/UPDATE/DELETE: escrita exclusiva via RPC (20260725040000_relacionamento_rpcs.sql).
