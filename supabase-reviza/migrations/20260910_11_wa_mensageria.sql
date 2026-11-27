-- Reviza — Fase 1 da mensageria WhatsApp (Evolution API, QR).
-- Canais (instâncias), conversas, mensagens, envios em massa e régua.
-- Dados 100% isolados no banco da Reviza; o servidor Evolution só faz a ponte.
-- NÃO aplicada ainda (conector Supabase caiu em 2026-09-10) — aplicar via MCP
-- como "reviza_11_wa_mensageria" assim que reconectar. (regra P2: .sql versionado)

-- ---------- enums ----------
do $$ begin create type public.wa_estado_canal as enum ('desconectado','conectando','conectado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.wa_direcao       as enum ('entrada','saida'); exception when duplicate_object then null; end $$;
do $$ begin create type public.wa_tipo_msg      as enum ('texto','imagem','audio','video','documento','sticker','outro'); exception when duplicate_object then null; end $$;
do $$ begin create type public.wa_status_msg    as enum ('pendente','enviada','entregue','lida','erro'); exception when duplicate_object then null; end $$;
do $$ begin create type public.wa_estado_envio  as enum ('rascunho','enviando','concluido','cancelado'); exception when duplicate_object then null; end $$;
do $$ begin create type public.wa_status_alvo   as enum ('pendente','enviado','erro'); exception when duplicate_object then null; end $$;
do $$ begin create type public.wa_gatilho_regua as enum ('antes_cobranca','dia_cobranca','apos_atraso'); exception when duplicate_object then null; end $$;

-- ---------- canais (uma instância Evolution = um número) ----------
create table public.wa_canais (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null default 'WhatsApp',
  instancia   text not null unique,                 -- nome da instância na Evolution
  numero      text,                                  -- telefone conectado (E.164), preenchido ao conectar
  estado      public.wa_estado_canal not null default 'desconectado',
  qr          text,                                  -- dataURL do QR corrente (transitório, some ao conectar)
  ultimo_erro text,
  criado_por  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger wa_canais_updated_at before update on public.wa_canais for each row execute function public.tg_set_updated_at();

-- ---------- conversas (uma por contato, por canal) ----------
create table public.wa_conversas (
  id            uuid primary key default gen_random_uuid(),
  canal_id      uuid not null references public.wa_canais(id) on delete cascade,
  telefone      text not null,                       -- número do contato (só dígitos, com DDI)
  nome_contato  text,
  lead_id       uuid references public.leads(id) on delete set null,
  ultima_previa text,
  ultima_em     timestamptz,
  nao_lidas     int not null default 0,
  arquivada     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (canal_id, telefone)
);
create index wa_conversas_ordem_idx on public.wa_conversas(ultima_em desc nulls last);
create index wa_conversas_lead_idx  on public.wa_conversas(lead_id);
create trigger wa_conversas_updated_at before update on public.wa_conversas for each row execute function public.tg_set_updated_at();

-- ---------- mensagens ----------
create table public.wa_mensagens (
  id         uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.wa_conversas(id) on delete cascade,
  canal_id   uuid not null references public.wa_canais(id) on delete cascade,
  direcao    public.wa_direcao not null,
  tipo       public.wa_tipo_msg not null default 'texto',
  conteudo   text,
  midia_path text,                                   -- caminho no bucket (mídia inbound/outbound)
  wa_id      text,                                   -- id da mensagem na Evolution (dedup + status)
  status     public.wa_status_msg not null default 'enviada',
  autor_id   uuid references public.profiles(id) on delete set null,  -- quem enviou (saída manual)
  erro       text,
  created_at timestamptz not null default now()
);
create unique index wa_mensagens_waid_idx on public.wa_mensagens(canal_id, wa_id) where wa_id is not null;
create index wa_mensagens_conversa_idx on public.wa_mensagens(conversa_id, created_at);

-- mídia inbound/outbound do WhatsApp fica em bucket próprio (separado dos comprovantes)
insert into storage.buckets (id, name, public) values ('wa-midia','wa-midia', false) on conflict (id) do nothing;

-- trigger: toda mensagem atualiza a prévia/relógio da conversa; inbound incrementa não-lidas
create or replace function public.wa_after_msg() returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.wa_conversas c set
    ultima_previa = left(coalesce(new.conteudo, '[' || new.tipo::text || ']'), 140),
    ultima_em     = new.created_at,
    nao_lidas     = case when new.direcao='entrada' then c.nao_lidas + 1 else c.nao_lidas end,
    arquivada     = false
  where c.id = new.conversa_id;
  return new;
end $$;
create trigger wa_mensagens_after_ins after insert on public.wa_mensagens for each row execute function public.wa_after_msg();

-- ---------- régua de mensagens (cadência automática de lembretes) ----------
create table public.wa_regua_regras (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  gatilho    public.wa_gatilho_regua not null,
  offset_dias smallint not null default 0,            -- p/ antes_cobranca e apos_atraso
  modelo     text not null,                           -- texto com {{nome}}, {{valor}}, {{dia}}
  ativo      boolean not null default true,
  ordem      smallint not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger wa_regua_updated_at before update on public.wa_regua_regras for each row execute function public.tg_set_updated_at();

-- ---------- envios em massa ----------
create table public.wa_envios (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  canal_id   uuid references public.wa_canais(id) on delete set null,
  modelo     text not null,
  estado     public.wa_estado_envio not null default 'rascunho',
  total      int not null default 0,
  enviados   int not null default 0,
  erros      int not null default 0,
  criado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger wa_envios_updated_at before update on public.wa_envios for each row execute function public.tg_set_updated_at();

create table public.wa_envio_alvos (
  id         uuid primary key default gen_random_uuid(),
  envio_id   uuid not null references public.wa_envios(id) on delete cascade,
  telefone   text not null,
  nome       text,
  lead_id    uuid references public.leads(id) on delete set null,
  status     public.wa_status_alvo not null default 'pendente',
  erro       text,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (envio_id, telefone)
);
create index wa_envio_alvos_pend_idx on public.wa_envio_alvos(envio_id) where status='pendente';

-- ---------- RLS ----------
alter table public.wa_canais       enable row level security;
alter table public.wa_conversas    enable row level security;
alter table public.wa_mensagens    enable row level security;
alter table public.wa_regua_regras enable row level security;
alter table public.wa_envios       enable row level security;
alter table public.wa_envio_alvos  enable row level security;

-- leitura: qualquer usuário ATIVO (current_papel() not null). Escrita de conversas/mensagens
-- é SEMPRE pelo service_role (edge functions), que ignora RLS — por isso não há policy de
-- insert/update para 'authenticated' nessas duas. Canais/régua/envios: gestão por gestor+.

create policy wa_canais_sel on public.wa_canais for select to authenticated using (public.current_papel() is not null);
-- (canais são criados/alterados pelo edge de instância via service_role)

create policy wa_conversas_sel on public.wa_conversas for select to authenticated using (public.current_papel() is not null);
-- marcar como lida: qualquer operador ativo pode zerar não-lidas da sua visão
create policy wa_conversas_upd on public.wa_conversas for update to authenticated
  using (public.current_papel() is not null) with check (public.current_papel() is not null);

create policy wa_mensagens_sel on public.wa_mensagens for select to authenticated using (public.current_papel() is not null);

create policy wa_regua_sel on public.wa_regua_regras for select to authenticated using (public.current_papel() is not null);
create policy wa_regua_ins on public.wa_regua_regras for insert to authenticated with check (public.is_at_least('gestor'));
create policy wa_regua_upd on public.wa_regua_regras for update to authenticated using (public.is_at_least('gestor')) with check (public.is_at_least('gestor'));
create policy wa_regua_del on public.wa_regua_regras for delete to authenticated using (public.is_at_least('gestor'));

create policy wa_envios_sel on public.wa_envios for select to authenticated using (public.current_papel() is not null);
create policy wa_envios_ins on public.wa_envios for insert to authenticated with check (public.is_at_least('gestor'));
create policy wa_envios_upd on public.wa_envios for update to authenticated using (public.is_at_least('gestor')) with check (public.is_at_least('gestor'));

create policy wa_alvos_sel on public.wa_envio_alvos for select to authenticated using (public.current_papel() is not null);
create policy wa_alvos_ins on public.wa_envio_alvos for insert to authenticated with check (public.is_at_least('gestor'));
create policy wa_alvos_upd on public.wa_envio_alvos for update to authenticated using (public.is_at_least('gestor')) with check (public.is_at_least('gestor'));

-- ---------- RPC: marcar conversa como lida (zera não-lidas) ----------
create or replace function public.wa_marcar_lida(p_conversa uuid) returns void
  language sql security definer set search_path=public as $$
  update public.wa_conversas set nao_lidas = 0 where id = p_conversa and public.current_papel() is not null;
$$;
revoke all on function public.wa_marcar_lida(uuid) from public;
grant execute on function public.wa_marcar_lida(uuid) to authenticated;
