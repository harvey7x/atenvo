-- IA SDR (Gemini) — Fase 1: banco.
-- A IA assume o atendimento no canal EMPRÉSTIMO DEPOIS do fluxo determinístico caf_emprestimo_v1
-- completar (fecho no CPF). Tudo nasce DESLIGADO: ia_enabled=false em todo canal; o worker ia-sdr
-- roda no cron mas não encontra nada para fazer.
--
-- Desenho (ver supabase/functions/ia-sdr/README.md):
--  * ia_sessoes — 1 por conversa (unique). status: ativa|pausada|handoff|concluida|encerrada.
--  * ia_eventos — auditoria + custo (tokens). Leva organizacao_id (fora do spec original) porque a
--    RLS da casa é `organizacao_id in (select orgs_visiveis())` — sem a coluna a policy viraria
--    subselect em tabela com RLS (o anti-padrão que derrubou o inbox em 24/08).
--  * ia_canal_locks — lease serial POR CANAL (nunca duas conversas do mesmo chip ao mesmo tempo).
--    Advisory lock de verdade não sobrevive às fronteiras de statement do PostgREST; lease com TTL
--    é o mesmo padrão do bot_claim_conversa.
--  * trigger em mensagens — debounce re-agendável (entrada => processar_apos = now()+15s) e pausa
--    automática quando um HUMANO responde (painel: autor_id; celular: origem='telefone'). Bot e IA
--    (origem='bot', autor_id null) não pausam.

-- ---------- ia_sessoes ----------
create table public.ia_sessoes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id),
  canal_id uuid not null references public.canais(id),
  conversa_id uuid not null unique references public.conversas(id),
  contato_id uuid not null references public.contatos(id),
  oportunidade_id uuid references public.oportunidades(id),
  etapa text not null default 'qualificacao_inss',
  dados jsonb not null default '{}'::jsonb,
  docs jsonb not null default '{}'::jsonb,
  cobertura_extratos jsonb not null default '{}'::jsonb,
  tentativas_erro integer not null default 0,
  ultima_msg_cliente_em timestamptz,
  processar_apos timestamptz,
  status text not null default 'ativa'
    check (status in ('ativa','pausada','handoff','concluida','encerrada')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index ia_sessoes_status_processar on public.ia_sessoes (status, processar_apos);
create index ia_sessoes_canal on public.ia_sessoes (canal_id);

-- ---------- ia_eventos ----------
create table public.ia_eventos (
  id uuid primary key default gen_random_uuid(),
  sessao_id uuid not null references public.ia_sessoes(id) on delete cascade,
  conversa_id uuid references public.conversas(id),
  organizacao_id uuid not null references public.organizacoes(id),
  tipo text not null,
  detalhe jsonb not null default '{}'::jsonb,
  tokens_in integer,
  tokens_out integer,
  criado_em timestamptz not null default now()
);
create index ia_eventos_sessao_criado on public.ia_eventos (sessao_id, criado_em);
create index ia_eventos_tipo_criado on public.ia_eventos (tipo, criado_em);

-- ---------- ia_canal_locks (serial por canal) ----------
create table public.ia_canal_locks (
  canal_id uuid primary key references public.canais(id),
  lock_until timestamptz not null default now()
);

-- ---------- bot_canal_config: chaves da IA ----------
alter table public.bot_canal_config
  add column if not exists ia_enabled boolean not null default false,
  add column if not exists ia_modo_teste boolean not null default true,
  add column if not exists ia_config jsonb not null default '{}'::jsonb;
comment on column public.bot_canal_config.ia_config is
  'Chaves: video_meuinss_path (URL ou path no bucket público bot-midia), max_chamadas_dia (default 500), janela_inicio (default 07:30), janela_fim (default 21:30)';

-- ---------- RLS (padrão orgs_visiveis, ver [[rls-hashed-subplan]]) ----------
alter table public.ia_sessoes enable row level security;
alter table public.ia_eventos enable row level security;
alter table public.ia_canal_locks enable row level security;  -- sem policy: só service_role toca
create policy ia_sessoes_sel on public.ia_sessoes for select to authenticated
  using (organizacao_id in (select public.orgs_visiveis()));
create policy ia_eventos_sel on public.ia_eventos for select to authenticated
  using (organizacao_id in (select public.orgs_visiveis()));
-- escrita só via service_role (bypassa RLS). Grants explícitos: a pegadinha da casa é o
-- service_role sem grant em tabela nova (403 REST que não é RLS).
grant select on public.ia_sessoes, public.ia_eventos to authenticated;
grant all on public.ia_sessoes, public.ia_eventos, public.ia_canal_locks to service_role;

-- ---------- lease por canal ----------
create or replace function public.ia_canal_lock(p_canal uuid, p_ttl_seg integer default 90)
returns boolean
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
begin
  insert into public.ia_canal_locks (canal_id, lock_until)
  values (p_canal, now() + make_interval(secs => greatest(coalesce(p_ttl_seg, 90), 5)))
  on conflict (canal_id) do update set lock_until = excluded.lock_until
    where ia_canal_locks.lock_until < now();
  return found;
end $fn$;

create or replace function public.ia_canal_unlock(p_canal uuid)
returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
begin
  update public.ia_canal_locks set lock_until = now() where canal_id = p_canal;
end $fn$;

-- ---------- trigger: debounce de entrada + pausa por humano ----------
-- Cobre TODOS os caminhos de escrita (webhook Evolution/Cloud, evolution-send do painel, fromMe do
-- celular) sem redeploy de webhook. Early-exit barato: probe no unique de conversa_id.
create or replace function public.fn_ia_sessao_mensagem()
returns trigger
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare v_sessao uuid;
begin
  select id into v_sessao from public.ia_sessoes
    where conversa_id = new.conversa_id and status = 'ativa';
  if v_sessao is null then return new; end if;

  if new.direcao = 'entrada' then
    -- debounce RE-AGENDÁVEL: 3 áudios seguidos = 1 processamento com tudo junto
    update public.ia_sessoes
      set ultima_msg_cliente_em = now(), processar_apos = now() + interval '15 seconds',
          atualizado_em = now()
      where id = v_sessao;
  elsif new.direcao = 'saida'
    and new.tipo not in ('sistema','nota_interna')
    and (new.autor_id is not null or new.origem = 'telefone') then
    -- humano assumiu (mesma régua do bot-runner/bot-fila): a IA não disputa a conversa
    update public.ia_sessoes set status = 'pausada', atualizado_em = now() where id = v_sessao;
    insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
    values (v_sessao, new.conversa_id, new.organizacao_id, 'pausada_humano',
            jsonb_build_object('mensagem_id', new.id, 'origem', new.origem));
  end if;
  return new;
end $fn$;

drop trigger if exists trg_ia_sessao_mensagem on public.mensagens;
create trigger trg_ia_sessao_mensagem
  after insert on public.mensagens
  for each row execute function public.fn_ia_sessao_mensagem();

-- ---------- secret do worker (padrão webhook_config dos crons) ----------
insert into public.webhook_config (chave, secret)
select 'ia_sdr', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (select 1 from public.webhook_config where chave = 'ia_sdr');

-- ---------- cron: worker a cada 1 minuto (com ia_enabled=false ele no-opa barato) ----------
select cron.schedule('ia-sdr', '* * * * *', $cron$
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/ia-sdr',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ia-secret', (select secret from public.webhook_config where chave = 'ia_sdr')
    )
  );
$cron$);
