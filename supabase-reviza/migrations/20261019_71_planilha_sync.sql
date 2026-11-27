-- ============================================================================
-- Reviza · mig 71 — SINCRONIZAÇÃO Google Planilhas ⇄ sistema (Etapa 1 da
-- configuração inicial) — banco: tabelas, gatilhos, guardas e RPCs.
--
-- Decisões do dono (19/10, via Matheus): planilha MENSAIS no Google Planilhas,
-- sincronização automática NOS 2 SENTIDOS a cada 15 min + botão; "a planilha
-- manda em tudo"; aba "cancelados" tira da cobrança preservando o histórico
-- (Lixeira; voltar = restaurar NA PLANILHA); a chave da conta de serviço sobe
-- PELA TELA e fica CIFRADA (mesmo esquema pgp_sym_encrypt do set_senha, migs
-- 03/65). A sync NASCE DESLIGADA (automatico=false, sem credencial) e FALHA
-- FECHADO: sem credencial/config/teste nenhuma rodada roda nem escreve.
--
-- GUCs (transação-local, padrão da mig 57 — sempre salvar/restaurar):
-- · planilha.sync='1' (existente, mig 57): cala os reflexos sistema→célula;
-- · planilha.pull='1' (NOVO): origem própria da sync — cala os gatilhos da
--   OUTBOX e libera as guardas estruturais. sync_aplicar seta os DOIS.
--
-- Fluxo (a edge reviza-planilha-sync orquestra; ordem push → pull → aplicar):
-- · OUTBOX (push, sistema→planilha): gatilhos em planilha_celulas (só o TEXTO;
--   estilo não sincroniza; células de senha têm texto sempre nulo e nunca
--   entram) e em planilha_linhas (cliente novo nos NOVOS). O item guarda o
--   valor esperado da planilha: se a célula mudou lá desde o último pull, a
--   planilha manda — a edge descarta e registra conflito.
-- · PULL (planilha→sistema): a edge lê, faz o diff de 3 vias e chama
--   sync_aplicar (service-only, transacional, advisory lock) que REUSA os
--   núcleos vivos: planilha_salvar (células→lead/pagamentos/senha),
--   planilha_substituir (linha de cliente novo), aprovar_parado (mover com
--   débito parado pendente), lead_restaurar (voltar da Lixeira).
-- · BLOQUEIO ESTRUTURAL enquanto a sync está ligada ("a planilha manda em
--   tudo": estrutura muda NA planilha): ligada p/ bloqueio = configurada E
--   automatico (desligar o automático libera manutenção; religar passa pelo
--   freio). Gatilhos BEFORE no banco + guarda no topo das RPCs existentes
--   (corpos VIVOS reproduzidos: mover_turma mig 41, planilha_* mig 57,
--   lead_restaurar mig 57, restaurar_leads mig 49, aprovar_parado mig 52).
--   Efeitos colaterais ACEITOS com o bloqueio ativo: pl_reflete_pagamento não
--   auto-cria coluna de mês (o erro orienta criar a coluna na planilha) e
--   pl_bloco_para não cria bloco novo (o cabeçalho é uma linha nova).
--
-- Diferenças deliberadas dos núcleos reusados dentro do sync_aplicar
-- (registradas): sem gates de papel (service); sem notificações de "pago"
-- (seriam em massa); private.registrar não grava com auth.uid() nulo, então o
-- caso "cliente direto em cobrança" grava DIRETO em public.registros com
-- ator_nome 'Sincronização da planilha'.
--
-- Segurança: tabelas novas com RLS ligada e SEM policy (service_role e RPCs
-- definer são o único caminho — padrão sistema_licenca/mig 67); grants no
-- padrão da mig 65. NENHUMA tabela nova entra na publication do Realtime
-- (gotcha conhecido: tabela fora da publication derruba o channel em silêncio
-- — e estas não precisam de Realtime).
--
-- Ordem: aplicar DEPOIS da mig 70. Tudo idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1) Tabelas
-- ---------------------------------------------------------------------

-- configuração (singleton). Escrita: RPCs (link/automatico) e a edge (service).
create table if not exists public.sync_planilha_config (
  singleton         boolean primary key default true check (singleton),
  planilha_id       text,
  planilha_url      text,
  conta_email       text,                 -- e-mail da conta de serviço (a chave fica em private.sync_credencial)
  chave_enviada_em  timestamptz,
  teste             jsonb,                -- ResultadoTeste (shape do front), gravado pela edge
  aplicada_em       timestamptz,          -- última conferência aplicada
  configurada_em    timestamptz,          -- primeira aplicação: a sync EXISTE (não volta a null)
  exige_conferencia boolean not null default false,  -- trocou a planilha: rodadas pausam até conferir+aplicar
  automatico        boolean not null default false,  -- nasce DESLIGADA
  intervalo_min     smallint not null default 15 check (intervalo_min between 5 and 120),
  na_hora_segredo   text,                 -- segredo do ?acao=onedit (gerado no 1º ligar)
  na_hora_em        timestamptz,
  freio_saidas      smallint not null default 10,    -- freio: > N saídas por rodada
  freio_pct         smallint not null default 20,    -- freio: > N% das linhas de cliente mudando
  processando_ate   timestamptz,          -- lease da rodada (padrão wa_canais.processando_ate)
  ultima_rodada_em  timestamptz,
  atualizado_em     timestamptz not null default now()
);
insert into public.sync_planilha_config (singleton) values (true) on conflict (singleton) do nothing;

-- chave da conta de serviço, CIFRADA (mesmo esquema do set_senha: pgp_sym +
-- private.chave(versão) do Vault). Só as RPCs service-only tocam aqui.
create table if not exists private.sync_credencial (
  singleton   boolean primary key default true check (singleton),
  email       text,
  projeto     text,
  chave_enc   bytea,
  kv          smallint,
  enviada_em  timestamptz,
  enviada_por uuid
);

-- espelho da última leitura: UMA linha por LINHA da aba (hash sha256 calculado
-- na edge sobre os valores normalizados; senhas entram como 'sha256:<hex>',
-- NUNCA o texto). Sem FK: planilha_substituir trunca as planilha_* e o espelho
-- se reconstrói na rodada seguinte.
create table if not exists public.sync_espelho (
  aba     text not null,
  linha   int  not null,
  hash    text not null,
  valores text[] not null,
  tipo    text,
  lead_id uuid,
  primary key (aba, linha)
);
create index if not exists sync_espelho_lead_idx on public.sync_espelho (lead_id);

-- outbox do push (sistema→planilha). Sem FK (ver espelho). O item guarda o
-- valor esperado da planilha: mudou lá desde o último pull → conflito, descarta.
create table if not exists public.sync_outbox (
  id             uuid primary key default gen_random_uuid(),
  criado_em      timestamptz not null default now(),
  tipo           text not null check (tipo in ('celula', 'cliente_novo')),
  linha_id       uuid,
  coluna_id      uuid,
  lead_id        uuid,
  valor_novo     text,
  valor_esperado text,
  status         text not null default 'pendente' check (status in ('pendente', 'enviado', 'conflito', 'descartado')),
  processado_em  timestamptz,
  motivo         text
);
create unique index if not exists sync_outbox_pendente_uq on public.sync_outbox (linha_id, coluna_id) where status = 'pendente';
create index if not exists sync_outbox_status_idx on public.sync_outbox (status, criado_em);

-- log de rodadas — SEM PII (mensagem nunca carrega nome/CPF/telefone)
create table if not exists public.sync_rodadas (
  id           uuid primary key default gen_random_uuid(),
  quando       timestamptz not null default now(),
  origem       text not null check (origem in ('automatica', 'manual', 'na_hora', 'primeira')),
  resultado    text not null check (resultado in ('ok', 'sem_mudancas', 'erro', 'freio')),
  da_planilha  int not null default 0,
  para_planilha int not null default 0,
  duracao_ms   int,
  mensagem     text
);
create index if not exists sync_rodadas_quando_idx on public.sync_rodadas (quando desc);

-- conflitos ("a planilha mandou"): campo de senha grava '•••' nos dois valores;
-- o NOME do cliente sai do join com leads na leitura (sync_estado)
create table if not exists public.sync_conflitos (
  id             uuid primary key default gen_random_uuid(),
  quando         timestamptz not null default now(),
  lead_id        uuid,
  campo          text not null,
  valor_planilha text,
  valor_sistema  text
);
create index if not exists sync_conflitos_quando_idx on public.sync_conflitos (quando desc);

-- conferências (prévia do pull SEM aplicar) — grupos no shape GrupoMudanca[]
-- com itens truncados a 50 por grupo (total é o número real)
create table if not exists public.sync_conferencias (
  id          uuid primary key default gen_random_uuid(),
  gerada_em   timestamptz not null default now(),
  grupos      jsonb not null default '[]'::jsonb,
  total       int not null default 0,
  aplicada_em timestamptz
);
create index if not exists sync_conferencias_gerada_idx on public.sync_conferencias (gerada_em desc);

-- freio de segurança (no máximo 1 ativo: resolvido_em null)
create table if not exists public.sync_freio (
  id           uuid primary key default gen_random_uuid(),
  detectado_em timestamptz not null default now(),
  motivo       text not null,
  grupos       jsonb not null default '[]'::jsonb,
  resolvido_em timestamptz,
  resolvido_por uuid
);
create index if not exists sync_freio_ativo_idx on public.sync_freio (detectado_em desc) where resolvido_em is null;

-- RLS ligada e SEM policy: authenticated não lê nem escreve direto (tudo por
-- RPC); a edge escreve com service_role (default privileges + bypassrls, o
-- mesmo caminho de sistema_faturas na mig 67)
alter table public.sync_planilha_config enable row level security;
alter table private.sync_credencial     enable row level security;
alter table public.sync_espelho         enable row level security;
alter table public.sync_outbox          enable row level security;
alter table public.sync_rodadas         enable row level security;
alter table public.sync_conflitos       enable row level security;
alter table public.sync_conferencias    enable row level security;
alter table public.sync_freio           enable row level security;
revoke all on table
  public.sync_planilha_config, public.sync_espelho, public.sync_outbox,
  public.sync_rodadas, public.sync_conflitos, public.sync_conferencias, public.sync_freio
from public, anon, authenticated;
revoke all on table private.sync_credencial from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) Helpers de estado
-- ---------------------------------------------------------------------

-- a sincronização EXISTE (primeira conferência aplicada)?
create or replace function public.sync_ligada() returns boolean
  language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.sync_planilha_config where configurada_em is not null) $$;

-- estrutura bloqueada? ligada p/ bloqueio = configurada E automatico (desligar
-- o automático libera manutenção); o pull (origem própria) passa sempre
create or replace function public.sync_estrutura_bloqueada() returns boolean
  language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.sync_planilha_config where configurada_em is not null and automatico)
         and current_setting('planilha.pull', true) is distinct from '1' $$;

revoke all on function public.sync_ligada(), public.sync_estrutura_bloqueada() from public, anon;
grant execute on function public.sync_ligada(), public.sync_estrutura_bloqueada() to authenticated;

-- normalizações do casamento (porte fiel de cpf_chave/nome_chave/nb_chave do
-- scripts/reviza/planilha_substituir.py; sem unaccent: translate cobre o PT)
create or replace function private.sync_cpf_chave(p text) returns text
  language sql immutable set search_path = ''
as $$ select case when d.d = '' then null
                  when length(d.d) < 11 then lpad(d.d, 11, '0')
                  else d.d end
        from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) d $$;

create or replace function private.sync_nome_chave(p text) returns text
  language sql immutable set search_path = ''
as $$ select btrim(regexp_replace(regexp_replace(
         translate(upper(coalesce(p, '')),
                   'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
                   'AAAAAAEEEEIIIIOOOOOUUUUCNY'),
         '[^A-Z0-9 ]', ' ', 'g'), '\s+', ' ', 'g')) $$;

create or replace function private.sync_nb_chave(p text) returns text
  language sql immutable set search_path = ''
as $$ select case when d.d <> '' then coalesce(nullif(ltrim(d.d, '0'), ''), '0')
                  else private.sync_nome_chave(p) end
        from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) d $$;

-- núcleo do set_senha SEM gate de papel (a planilha manda; só o sync_aplicar usa)
create or replace function private.sync_set_senha(p_lead uuid, p_tipo text, p_valor text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_ver smallint; v_enc bytea;
begin
  if p_tipo not in ('inss', 'reclame') then raise exception 'tipo invalido' using errcode = '22023'; end if;
  if p_valor is null then return; end if;
  if length(p_valor) = 0 then
    v_enc := null; v_ver := null;
  else
    select versao_atual into v_ver from private.cripto_config where singleton;
    v_enc := extensions.pgp_sym_encrypt(p_valor, private.chave(v_ver),
               'cipher-algo=aes256, compress-algo=0, s2k-mode=3, s2k-digest-algo=sha256');
  end if;
  insert into private.lead_segredos as s (lead_id, senha_inss_enc, senha_inss_kv, reclame_senha_enc, reclame_senha_kv, atualizado_em, atualizado_por)
  values (p_lead,
    case when p_tipo = 'inss' then v_enc end, case when p_tipo = 'inss' then v_ver end,
    case when p_tipo = 'reclame' then v_enc end, case when p_tipo = 'reclame' then v_ver end,
    now(), auth.uid())
  on conflict (lead_id) do update set
    senha_inss_enc = case when p_tipo = 'inss' then v_enc else s.senha_inss_enc end,
    senha_inss_kv = case when p_tipo = 'inss' then v_ver else s.senha_inss_kv end,
    reclame_senha_enc = case when p_tipo = 'reclame' then v_enc else s.reclame_senha_enc end,
    reclame_senha_kv = case when p_tipo = 'reclame' then v_ver else s.reclame_senha_kv end,
    atualizado_em = now(), atualizado_por = auth.uid();
  insert into private.segredo_acessos (lead_id, tipo, acao, ator, ator_papel)
  values (p_lead, p_tipo, 'sync_pull', null, null);
end $$;

-- ---------------------------------------------------------------------
-- 3) OUTBOX (push): gatilhos. Só quando a sync existe e a mudança NÃO veio do
--    pull. Só TEXTO sincroniza (estilo não); só células de LINHA DE CLIENTE
--    empurram (o push localiza a linha na planilha pela chave do cliente);
--    células de senha têm texto sempre nulo e nunca entram.
-- ---------------------------------------------------------------------
create or replace function private.sync_tg_celula() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_linha uuid; v_coluna uuid; v_novo text; v_esp text; v_lead uuid;
begin
  if not public.sync_ligada() or current_setting('planilha.pull', true) = '1' then return null; end if;
  if tg_op = 'DELETE' then
    if old.texto is null then return null; end if;             -- célula só de estilo
    v_linha := old.linha_id; v_coluna := old.coluna_id; v_novo := null; v_esp := old.texto;
  elsif tg_op = 'INSERT' then
    if new.texto is null then return null; end if;             -- célula só de estilo
    v_linha := new.linha_id; v_coluna := new.coluna_id; v_novo := new.texto; v_esp := null;
  else
    v_linha := new.linha_id; v_coluna := new.coluna_id; v_novo := new.texto; v_esp := old.texto;
  end if;
  select l.lead_id into v_lead from public.planilha_linhas l where l.id = v_linha and l.tipo = 'cliente';
  if v_lead is null then return null; end if;                  -- cabeçalho/rótulo/Lixeira não empurram
  -- item pendente da mesma célula: atualiza SÓ o valor_novo (o valor_esperado
  -- original fica — é o que a planilha tinha no último pull)
  insert into public.sync_outbox as o (tipo, linha_id, coluna_id, lead_id, valor_novo, valor_esperado)
  values ('celula', v_linha, v_coluna, v_lead, v_novo, v_esp)
  on conflict (linha_id, coluna_id) where status = 'pendente'
  do update set valor_novo = excluded.valor_novo;
  return null;
end $$;
revoke all on function private.sync_tg_celula() from public, anon, authenticated;

drop trigger if exists planilha_celulas_sync_outbox_id on public.planilha_celulas;
create trigger planilha_celulas_sync_outbox_id after insert or delete on public.planilha_celulas
  for each row execute function private.sync_tg_celula();

drop trigger if exists planilha_celulas_sync_outbox_u on public.planilha_celulas;
create trigger planilha_celulas_sync_outbox_u after update on public.planilha_celulas
  for each row when (old.texto is distinct from new.texto) execute function private.sync_tg_celula();

-- cliente novo nos NOVOS (bloco situacao='ativo') → o push escreve a linha no
-- FIM da seção NOVOS da planilha
create or replace function private.sync_tg_linha_nova() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.sync_ligada() or current_setting('planilha.pull', true) = '1' then return null; end if;
  if new.lead_id is null then return null; end if;
  if not exists (select 1 from public.planilha_blocos b where b.id = new.bloco and b.situacao = 'ativo') then
    return null;
  end if;
  insert into public.sync_outbox (tipo, linha_id, lead_id)
  values ('cliente_novo', new.id, new.lead_id);
  return null;
end $$;
revoke all on function private.sync_tg_linha_nova() from public, anon, authenticated;

drop trigger if exists planilha_linhas_sync_outbox_ai on public.planilha_linhas;
create trigger planilha_linhas_sync_outbox_ai after insert on public.planilha_linhas
  for each row when (new.tipo = 'cliente') execute function private.sync_tg_linha_nova();

-- ---------------------------------------------------------------------
-- 4) BLOQUEIO ESTRUTURAL no banco (gatilhos BEFORE, mensagens claras)
-- ---------------------------------------------------------------------
create or replace function private.sync_tg_leads_saida() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if public.sync_estrutura_bloqueada() then
    raise exception 'Com a sincronização da planilha ligada, a saída de cliente é feita na planilha: mova a linha para a aba cancelados.'
      using errcode = '55000';
  end if;
  return old;
end $$;
revoke all on function private.sync_tg_leads_saida() from public, anon, authenticated;

drop trigger if exists leads_sync_saida_guard on public.leads;
create trigger leads_sync_saida_guard before delete on public.leads
  for each row execute function private.sync_tg_leads_saida();

create or replace function private.sync_tg_colunas_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if public.sync_estrutura_bloqueada() then
    raise exception 'Com a sincronização ligada, colunas (inclusive o novo mês) são criadas e removidas na planilha do Google.'
      using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function private.sync_tg_colunas_guard() from public, anon, authenticated;

drop trigger if exists planilha_colunas_sync_guard on public.planilha_colunas;
create trigger planilha_colunas_sync_guard before insert or delete on public.planilha_colunas
  for each row execute function private.sync_tg_colunas_guard();

-- linhas: INSERT de cliente em bloco 'ativo' (NOVOS) continua — o fluxo dos
-- Novos segue vivo e o push leva a linha para a planilha; o resto é lá
create or replace function private.sync_tg_linhas_guard() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.sync_estrutura_bloqueada() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' and new.tipo = 'cliente'
     and exists (select 1 from public.planilha_blocos b where b.id = new.bloco and b.situacao = 'ativo') then
    return new;
  end if;
  raise exception 'Com a sincronização ligada, linhas são inseridas e removidas na planilha do Google.'
    using errcode = '55000';
end $$;
revoke all on function private.sync_tg_linhas_guard() from public, anon, authenticated;

drop trigger if exists planilha_linhas_sync_guard on public.planilha_linhas;
create trigger planilha_linhas_sync_guard before insert or delete on public.planilha_linhas
  for each row execute function private.sync_tg_linhas_guard();

-- ---------------------------------------------------------------------
-- 5) Guarda no topo das RPCs existentes (corpos VIVOS reproduzidos; a única
--    mudança de cada uma é o bloco "sync_estrutura_bloqueada" indicado)
-- ---------------------------------------------------------------------

-- 5.1 mover_turma — corpo vivo da mig 41 + guarda
create or replace function public.mover_turma(p_de smallint, p_para smallint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_comp text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_destino_tinha boolean;
  v_movidos uuid[];
  v_origem_datas jsonb;
  v_destino_limpas int := 0;
begin
  if not public.is_at_least('financeiro') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  -- mig 71: com a sync ligada, o ciclo muda NA planilha
  if public.sync_estrutura_bloqueada() then
    raise exception 'Com a sincronização da planilha ligada, a mudança de dia da turma é feita na planilha do Google: mova as linhas para o bloco do novo dia.'
      using errcode = '55000';
  end if;
  if p_de is null or p_para is null or p_de < 1 or p_de > 31 or p_para < 1 or p_para > 31 or p_de = p_para then
    raise exception 'dias invalidos';
  end if;

  select exists(select 1 from public.leads where dia = p_para) into v_destino_tinha;

  with mv as (
    update public.leads set dia = p_para where dia = p_de returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) into v_movidos from mv;

  -- datas manuais do dia de ORIGEM (ficou vazio): órfãs → remove e devolve
  with del as (
    delete from public.ciclos_datas
    where dia = p_de and comp >= v_comp
    returning dia, comp, inicio, fim, cobranca
  )
  select coalesce(jsonb_agg(to_jsonb(del)), '[]'::jsonb) into v_origem_datas from del;

  -- destino estava VAZIO: resíduos de turma antiga não podem grudar na que chega
  if not v_destino_tinha then
    with del2 as (
      delete from public.ciclos_datas
      where dia = p_para and comp >= v_comp
      returning 1
    )
    select count(*) into v_destino_limpas from del2;
  end if;

  return jsonb_build_object(
    'movidos', coalesce(to_jsonb(v_movidos), '[]'::jsonb),
    'origem_datas', v_origem_datas,
    'destino_limpas', v_destino_limpas,
    'fusao', v_destino_tinha
  );
end $$;
revoke all on function public.mover_turma(smallint, smallint) from public, anon;
grant execute on function public.mover_turma(smallint, smallint) to authenticated;

-- 5.2 planilha_coluna_criar — corpo vivo da mig 57 + guarda
create or replace function public.planilha_coluna_criar(p_ref uuid, p_lado text, p_tipo text, p_titulo text, p_cab jsonb default null)
  returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_ref numeric; v_ordem numeric; v_col uuid; v_k int; r record; v_linha uuid;
begin
  if not public.is_at_least('financeiro') then raise exception 'Criar coluna é com o financeiro, gestor ou admin.' using errcode = '42501'; end if;
  -- mig 71: com a sync ligada, colunas nascem/somem na planilha do Google
  if public.sync_estrutura_bloqueada() then
    raise exception 'Com a sincronização ligada, colunas (inclusive o novo mês) são criadas e removidas na planilha do Google.'
      using errcode = '55000';
  end if;
  if p_tipo not in ('livre', 'mes') then raise exception 'tipo de coluna inválido' using errcode = '22023'; end if;
  if p_ref is not null then
    if coalesce(p_lado, '') not in ('esq', 'dir') then raise exception 'lado inválido (esq|dir)' using errcode = '22023'; end if;
    select ordem into v_ref from public.planilha_colunas where id = p_ref;
    if v_ref is null then raise exception 'Coluna de referência não encontrada — recarregue.' using errcode = 'P0002'; end if;
    v_ordem := private.pl_ordem_coluna(v_ref, p_lado = 'dir');
  end if;

  if p_tipo = 'livre' then
    if v_ordem is null then select coalesce(max(ordem), 0) + 1000 into v_ordem from public.planilha_colunas; end if;
    insert into public.planilha_colunas (ordem, titulo, tipo)
    values (v_ordem, coalesce(nullif(btrim(p_titulo), ''), 'Nova coluna'), 'livre')
    returning id into v_col;
  else
    -- só o PRÓXIMO mês
    select coalesce(max(mes_pos), -1) + 1 into v_k from public.planilha_colunas;
    v_col := private.pl_coluna_mes_nova(v_k, v_ordem);
    if nullif(btrim(p_titulo), '') is not null then
      update public.planilha_colunas set titulo = btrim(p_titulo) where id = v_col;
    end if;
    -- cabeçalho de cada bloco (ex. {"D24":"24/out"})
    if jsonb_typeof(p_cab) = 'object' then
      for r in select key, value from jsonb_each_text(p_cab) loop
        for v_linha in select id from public.planilha_linhas where bloco = r.key and tipo = 'cabecalho' loop
          perform private.pl_set_texto(v_linha, v_col, r.value);
        end loop;
      end loop;
    end if;
  end if;
  perform private.pl_versao_bump();
  return v_col;
end $$;

-- 5.3 planilha_coluna_excluir — corpo vivo da mig 57 + guarda
create or replace function public.planilha_coluna_excluir(p_coluna uuid)
  returns void language plpgsql security definer set search_path = ''
as $$
declare v_tipo text;
begin
  if not public.is_at_least('gestor') then raise exception 'Excluir coluna é com o gestor ou admin.' using errcode = '42501'; end if;
  -- mig 71: com a sync ligada, colunas nascem/somem na planilha do Google
  if public.sync_estrutura_bloqueada() then
    raise exception 'Com a sincronização ligada, colunas (inclusive o novo mês) são criadas e removidas na planilha do Google.'
      using errcode = '55000';
  end if;
  select tipo into v_tipo from public.planilha_colunas where id = p_coluna;
  if v_tipo is null then raise exception 'Coluna não encontrada — recarregue.' using errcode = 'P0002'; end if;
  if v_tipo <> 'livre' then
    raise exception 'Só colunas criadas na planilha (livres) podem ser excluídas — as da planilha original e os meses alimentam o sistema.' using errcode = '22023';
  end if;
  delete from public.planilha_colunas where id = p_coluna;
  perform private.pl_versao_bump();
end $$;

-- 5.4 planilha_linha_inserir — corpo vivo da mig 57 + guarda
--     (exceção combinada: cliente em NOVOS continua — o push leva a linha)
create or replace function public.planilha_linha_inserir(p_ref uuid, p_lado text, p_tipo text)
  returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_papel text := public.current_papel()::text;
  v_sync text := current_setting('planilha.sync', true);
  r public.planilha_linhas%rowtype; b public.planilha_blocos%rowtype;
  v_bloco text; v_ordem numeric; v_lead uuid; v_linha uuid;
begin
  if v_papel is null then raise exception 'sem permissao' using errcode = '42501'; end if;
  -- mig 71: com a sync ligada, só cliente novo em NOVOS entra por aqui
  if public.sync_estrutura_bloqueada() and coalesce(p_tipo, '') <> 'cliente' then
    raise exception 'Com a sincronização ligada, linhas são inseridas e removidas na planilha do Google.'
      using errcode = '55000';
  end if;
  if coalesce(p_lado, '') not in ('acima', 'abaixo') then raise exception 'lado inválido (acima|abaixo)' using errcode = '22023'; end if;
  if coalesce(p_tipo, '') not in ('cliente', 'cabecalho', 'vazia', 'rotulo') then raise exception 'tipo de linha inválido' using errcode = '22023'; end if;
  select * into r from public.planilha_linhas where id = p_ref;
  if not found then raise exception 'Linha de referência não encontrada — recarregue.' using errcode = 'P0002'; end if;
  v_bloco := r.bloco;

  if p_tipo = 'cliente' then
    -- acima do cabeçalho/rótulo a linha fica visualmente no bloco de CIMA, mas o cliente iria
    -- para o bloco da referência: recusa (abaixo do cabeçalho = 1ª linha do bloco, certo)
    if p_lado = 'acima' and r.tipo in ('cabecalho', 'rotulo') then
      raise exception 'Para incluir cliente num bloco, use "Inserir cliente abaixo" no cabeçalho ou numa linha do bloco.' using errcode = '22023';
    end if;
    if v_bloco is null then v_bloco := private.pl_bloco_vizinho(r.ordem); end if;
    if v_bloco is null then raise exception 'Escolha uma linha dentro de um bloco (ciclo ou NOVOS).' using errcode = '22023'; end if;
    select * into b from public.planilha_blocos where id = v_bloco;
    -- mig 71: cliente direto num bloco de cobrança, com a sync ligada, nasce na planilha
    if public.sync_estrutura_bloqueada() and b.situacao <> 'ativo' then
      raise exception 'Com a sincronização ligada, cliente novo entra em NOVOS — em bloco de cobrança a linha é criada na planilha do Google.'
        using errcode = '55000';
    end if;
    if b.situacao = 'cancelado' and not public.pode_aprovar_parado() then
      raise exception 'Cliente direto em cobrança (bloco %) precisa de aprovação: cadastre em NOVOS e marque "débito parado".', v_bloco using errcode = '42501';
    end if;
  elsif not public.is_at_least('financeiro') then
    raise exception 'Inserir linha em branco, rótulo ou cabeçalho é com o financeiro, gestor ou admin.' using errcode = '42501';
  end if;

  v_ordem := private.pl_ordem_linha(r.ordem, p_lado = 'abaixo');
  perform set_config('planilha.sync', '1', true);
  if p_tipo = 'cliente' then
    insert into public.leads (nome, comercial, situacao, dia, created_by)
    values ('', case when v_papel = 'comercial' then public.meu_nome() end, b.situacao, b.dia, auth.uid())
    returning id into v_lead;
  end if;
  insert into public.planilha_linhas (ordem, tipo, bloco, lead_id)
  values (v_ordem, p_tipo, v_bloco, v_lead)
  returning id into v_linha;
  if v_lead is not null then perform private.pl_preencher_linha(v_linha); end if;
  perform set_config('planilha.sync', coalesce(v_sync, ''), true);
  perform private.pl_versao_bump();
  return v_linha;
end $$;

-- 5.5 planilha_linha_excluir — corpo vivo da mig 57 + guarda
create or replace function public.planilha_linha_excluir(p_linha uuid)
  returns void language plpgsql security definer set search_path = ''
as $$
declare r public.planilha_linhas%rowtype;
begin
  if public.current_papel() is null then raise exception 'sem permissao' using errcode = '42501'; end if;
  select * into r from public.planilha_linhas where id = p_linha;
  if not found then return; end if;
  -- mig 71: com a sync ligada, linha some NA planilha (cliente: aba cancelados)
  if public.sync_estrutura_bloqueada() then
    if r.tipo = 'cliente' then
      raise exception 'Com a sincronização da planilha ligada, a saída de cliente é feita na planilha: mova a linha para a aba cancelados.'
        using errcode = '55000';
    end if;
    raise exception 'Com a sincronização ligada, linhas são inseridas e removidas na planilha do Google.'
      using errcode = '55000';
  end if;
  if r.tipo = 'cliente' then
    if not public.is_at_least('gestor') then
      raise exception 'Excluir cliente (vai para a Lixeira) é com o gestor ou admin.' using errcode = '42501';
    end if;
    if r.lead_id is null then return; end if;
    delete from public.leads where id = r.lead_id;   -- Lixeira pelo gatilho; a linha fica oculta (lead_id null)
  else
    if not public.is_at_least('financeiro') then
      raise exception 'Excluir linha é com o financeiro, gestor ou admin.' using errcode = '42501';
    end if;
    delete from public.planilha_linhas where id = p_linha;
  end if;
  perform private.pl_versao_bump();
end $$;

-- 5.6 planilha_linha_mover — corpo vivo da mig 57 + guarda
create or replace function public.planilha_linha_mover(p_linha uuid, p_ref uuid, p_lado text)
  returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_sync text := current_setting('planilha.sync', true);
  v_fluxo text;
  r public.planilha_linhas%rowtype; ref public.planilha_linhas%rowtype; b public.planilha_blocos%rowtype;
  ld public.leads%rowtype;
  v_ordem numeric; v_dest text; v_dia smallint;
begin
  if not public.is_at_least('financeiro') then raise exception 'Mover linha é com o financeiro, gestor ou admin.' using errcode = '42501'; end if;
  -- mig 71: com a sync ligada, mover linha (inclusive trocar o cliente de
  -- ciclo/seção) é feito na planilha do Google
  if public.sync_estrutura_bloqueada() then
    raise exception 'Com a sincronização ligada, mover linhas (inclusive trocar o cliente de ciclo) é feito na planilha do Google.'
      using errcode = '55000';
  end if;
  if coalesce(p_lado, '') not in ('acima', 'abaixo') then raise exception 'lado inválido (acima|abaixo)' using errcode = '22023'; end if;
  if p_linha = p_ref then return; end if;
  select * into r from public.planilha_linhas where id = p_linha;
  if not found then raise exception 'Linha não encontrada — recarregue.' using errcode = 'P0002'; end if;
  select * into ref from public.planilha_linhas where id = p_ref;
  if not found then raise exception 'Linha de referência não encontrada — recarregue.' using errcode = 'P0002'; end if;

  -- a ordem primeiro (pode reabrir o vão); o UPDATE da linha vem depois
  v_ordem := private.pl_ordem_linha(ref.ordem, p_lado = 'abaixo', p_linha);
  if r.tipo = 'cliente' then
    v_dest := coalesce(ref.bloco, private.pl_bloco_vizinho(v_ordem, p_linha));
  end if;

  if v_dest is null or v_dest is not distinct from r.bloco then
    update public.planilha_linhas set ordem = v_ordem where id = p_linha;
  else
    select * into b from public.planilha_blocos where id = v_dest;
    if r.lead_id is not null then
      select * into ld from public.leads where id = r.lead_id for update;
      perform set_config('planilha.sync', '1', true);
      if ld.situacao = 'ativo' and b.situacao = 'cancelado' then
        -- Novos → cobrança só pelo fluxo do débito parado (aprovação registrada e avisada a quem pediu)
        if not coalesce(ld.parado_pendente, false) then
          raise exception 'Para levar um cliente dos Novos para a cobrança, marque "débito parado" nos Novos — a aprovação coloca no ciclo.' using errcode = '22023';
        end if;
        v_fluxo := current_setting('reviza.fluxo_parado', true);
        perform public.aprovar_parado(r.lead_id, b.dia, null, null);
        perform set_config('reviza.fluxo_parado', coalesce(v_fluxo, ''), true);
      else
        -- dia/situação do bloco (o guard do débito parado vale: financeiro+ é aprovador); NOVOS mantém o dia
        v_dia := coalesce(b.dia, case when b.situacao = 'ativo' then ld.dia end);
        update public.leads set dia = v_dia, situacao = b.situacao
         where id = r.lead_id and (dia, situacao) is distinct from (v_dia, b.situacao);
      end if;
      perform set_config('planilha.sync', coalesce(v_sync, ''), true);
    end if;
    -- bloco + ordem escolhida; os meses acompanham o seu mês (e nada digitado em NOVOS some)
    perform private.pl_mover_para_bloco(p_linha, v_dest, v_ordem);
  end if;
  perform private.pl_versao_bump();
end $$;

-- 5.7 planilha_substituir — corpo vivo da mig 57 + guarda (a carga manual
--     TRUNCA as planilha_*: com a sync ligada ela atropelaria a planilha viva).
--     Mudança deliberada além da guarda: a carga também seta planilha.pull='1' —
--     ela VEM da planilha, então as linhas/células recarregadas não podem virar
--     itens de push na outbox (com a sync configurada e o automático desligado,
--     a recarga encheria a outbox com ~20 mil itens falsos).
create or replace function public.planilha_substituir(p jsonb)
  returns jsonb language plpgsql security definer set search_path = '' set statement_timeout = '300s'
as $$
declare
  v_uid uuid := auth.uid();
  v_sync text := current_setting('planilha.sync', true);
  v_pull text := current_setting('planilha.pull', true);
  v_sufixo text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD_HH24MISS');
  v_backup text;
  v_manter boolean := coalesce((p->>'manter_pendentes')::boolean, true);
  v_remover uuid[] := '{}'; v_vistos bigint; v_agora bigint;
  v_ref text; v_dia smallint;
  b jsonb; c jsonb; r jsonb; j bigint; i bigint;
  v_cols uuid[] := '{}'; v_idx jsonb := '{}'::jsonb; v_mes int[] := '{}'; v_mespos int[] := '{}';
  v_col uuid; v_linha uuid; v_lead uuid; v_tipo text; v_bloco text;
  bl public.planilha_blocos%rowtype;
  v_senha_i int; v_recl_i int;
  t_nome text; t_com text; t_nb text; t_banco text; t_cpf text; t_fech text; t_val text; t_parou text; t_recl text; t_tel text; t_senha text;
  n_nome text; n_com text; n_nb text; n_banco text; n_cpf text; n_fech text; n_val numeric; n_parou text; n_dparou text; n_drecl text; n_tel text;
  ld public.leads%rowtype;
  v_leads uuid[] := '{}'; v_repl uuid[] := '{}';
  v_pl uuid[] := '{}'; v_pc text[] := '{}'; v_ps text[] := '{}'; v_pv numeric[] := '{}'; v_pt text[] := '{}';
  v_t text; v_st text; m int;
  n_blocos int := 0; n_cols int := 0; n_linhas int := 0; n_cli int := 0; n_cas int := 0; n_cri int := 0;
  n_cel int := 0; n_sen int := 0; n_rem int := 0; n_mant int := 0; n_pdel int := 0; n_pgrav int := 0; v_rc int;
  v_por_bloco jsonb := '{}'::jsonb;
begin
  if public.current_papel() is distinct from 'admin' then raise exception 'sem permissao (só admin)' using errcode = '42501'; end if;
  -- mig 71: a carga manual fica só para quando a sync está desligada
  if public.sync_estrutura_bloqueada() then
    raise exception 'A sincronização com o Google Planilhas está ligada — a carga manual atropelaria a planilha viva. Desligue a sincronização (automático) antes da carga manual.'
      using errcode = '55000';
  end if;
  if jsonb_typeof(p) <> 'object' or jsonb_typeof(p->'blocos') <> 'array' or jsonb_typeof(p->'colunas') <> 'array'
     or jsonb_typeof(p->'linhas') <> 'array' then
    raise exception 'payload inválido (blocos, colunas e linhas)' using errcode = '22023';
  end if;
  if jsonb_array_length(p->'colunas') = 0 or jsonb_array_length(p->'linhas') = 0 then
    raise exception 'payload vazio' using errcode = '22023';
  end if;
  if p ? 'remover' and jsonb_typeof(p->'remover') not in ('array', 'null') then
    raise exception 'payload inválido ("remover" precisa ser uma lista de ids)' using errcode = '22023';
  end if;

  -- trava de recarga: recarregar TRUNCA a planilha (cores, notas, colunas novas da equipe)
  if exists (select 1 from public.planilha_linhas) and coalesce((p->>'recarregar')::boolean, false) is not true then
    raise exception 'A planilha já foi carregada. Recarregar apaga cores, notas e colunas criadas pela equipe — para isso envie "recarregar": true (script: --recarregar).' using errcode = '55000';
  end if;
  -- trava otimista: a base mudou entre a leitura do script e agora → rodar de novo
  v_vistos := nullif(p->>'leads_vistos', '')::bigint;
  if v_vistos is not null then
    select count(*) into v_agora from public.leads;
    if v_agora <> v_vistos then
      raise exception 'A base de clientes mudou desde a leitura (% vistos, % agora) — rode o script de novo.', v_vistos, v_agora using errcode = '40001';
    end if;
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_remover
    from jsonb_array_elements_text(case when jsonb_typeof(p->'remover') = 'array' then p->'remover' else '[]'::jsonb end) x;

  if coalesce((p->>'backup')::boolean, true) then v_backup := private.pl_backup(v_sufixo); end if;

  perform set_config('planilha.sync', '1', true);
  perform set_config('planilha.pull', '1', true);  -- mig 71: a carga vem DA planilha — não gera push
  truncate public.planilha_celulas, public.planilha_linhas, public.planilha_colunas, public.planilha_blocos;

  -- blocos
  for b in select value from jsonb_array_elements(p->'blocos') loop
    insert into public.planilha_blocos (id, dia, situacao, comp_base)
    values (b->>'id', (b->>'dia')::smallint, (b->>'situacao')::public.situacao_debito, nullif(b->>'comp_base', ''));
    n_blocos := n_blocos + 1;
  end loop;

  -- colunas (índice j-1 no array "c" das linhas)
  for c, j in select value, ordinality from jsonb_array_elements(p->'colunas') with ordinality loop
    insert into public.planilha_colunas (ordem, titulo, tipo, campo, mes_pos, largura, oculta)
    values (1000 * j, coalesce(c->>'titulo', ''), c->>'tipo', nullif(c->>'campo', ''), (c->>'mes_pos')::smallint,
            coalesce((c->>'largura')::smallint, 110), coalesce((c->>'oculta')::boolean, false))
    returning id into v_col;
    v_cols := v_cols || v_col;
    if nullif(c->>'campo', '') is not null then v_idx := v_idx || jsonb_build_object(c->>'campo', j - 1); end if;
    if c->>'tipo' = 'mes' then v_mes := v_mes || (j - 1)::int; v_mespos := v_mespos || (c->>'mes_pos')::int; end if;
    n_cols := n_cols + 1;
  end loop;
  v_senha_i := (v_idx->>'senha_inss')::int;
  v_recl_i := (v_idx->>'reclame')::int;

  -- linhas
  for r, i in select value, ordinality from jsonb_array_elements(p->'linhas') with ordinality loop
    v_tipo := r->>'tipo';
    v_bloco := nullif(r->>'bloco', '');
    v_lead := null;
    if v_tipo not in ('cliente', 'cabecalho', 'vazia', 'rotulo') then raise exception 'linha %: tipo inválido', i using errcode = '22023'; end if;

    if v_tipo = 'cliente' then
      select * into bl from public.planilha_blocos where id = v_bloco;
      if not found then raise exception 'linha %: cliente sem bloco válido', i using errcode = '22023'; end if;
      t_nome  := r->'c'->>((v_idx->>'nome')::int);
      t_com   := r->'c'->>((v_idx->>'comercial')::int);
      t_nb    := r->'c'->>((v_idx->>'nb')::int);
      t_banco := r->'c'->>((v_idx->>'banco')::int);
      t_cpf   := r->'c'->>((v_idx->>'cpf')::int);
      t_fech  := r->'c'->>((v_idx->>'fechamento')::int);
      t_val   := r->'c'->>((v_idx->>'valor')::int);
      t_parou := r->'c'->>((v_idx->>'parou')::int);
      t_recl  := r->'c'->>((v_idx->>'reclame')::int);
      t_tel   := r->'c'->>((v_idx->>'telefone')::int);

      -- referência da regra do ano (datas curtas sem ano): 1º mês PAGO da própria linha
      -- (bloco com mês-base); em NOVOS o mês é só texto → 1º pago que o cliente já tem
      v_ref := null;
      if bl.comp_base is not null then
        for m in 1 .. coalesce(array_length(v_mes, 1), 0) loop
          if private.pl_mes_estado(r->'c'->>v_mes[m]) = 'pago' then
            v_ref := least(v_ref, private.pl_comp_soma(bl.comp_base, v_mespos[m]));
          end if;
        end loop;
      elsif nullif(r->>'lead_id', '') is not null then
        v_ref := private.pl_mes_ref((r->>'lead_id')::uuid);
      end if;

      if nullif(r->>'lead_id', '') is not null then
        select * into ld from public.leads where id = (r->>'lead_id')::uuid for update;
        if not found then raise exception 'linha %: cliente % não existe mais', i, r->>'lead_id' using errcode = 'P0002'; end if;
        if ld.id = any(v_leads) then raise exception 'linha %: cliente casado com mais de uma linha', i using errcode = '22023'; end if;
        -- entrar num bloco de cobrança aprovaria o débito parado sem o fluxo (sem aprovador, sem aviso)
        if coalesce(ld.parado_pendente, false) and bl.situacao = 'cancelado' then
          raise exception 'linha %: o cliente aguarda aprovação de débito parado — aprove nos Novos (ou deixe a linha em NOVOS) antes de carregar.', i using errcode = '22023';
        end if;
        v_lead := ld.id;
        n_nome  := case when v_idx ? 'nome'      then coalesce(btrim(t_nome), '')  else ld.nome end;
        n_com   := case when v_idx ? 'comercial' then nullif(btrim(t_com), '')     else ld.comercial end;
        n_nb    := case when v_idx ? 'nb'        then nullif(btrim(t_nb), '')      else ld.nb end;
        n_banco := case when v_idx ? 'banco'     then nullif(btrim(t_banco), '')   else ld.banco end;
        n_cpf   := case when v_idx ? 'cpf'       then nullif(btrim(t_cpf), '')     else ld.cpf end;
        n_fech  := coalesce(private.pl_data(t_fech, v_ref), ld.fechamento);
        n_val   := coalesce(private.pl_valor(t_val), ld.valor);
        n_parou := case when v_idx ? 'parou'     then nullif(t_parou, '')          else ld.parou end;
        n_dparou := coalesce(private.pl_data_no_texto(t_parou, v_ref), ld.data_parou);
        n_drecl := coalesce(private.pl_data_no_texto(t_recl, v_ref), ld.data_reclamacao);
        n_tel   := coalesce(private.pl_tel(t_tel), ld.telefone);
        -- NOVOS (sem dia) mantém o dia que o cliente já tinha
        v_dia   := coalesce(bl.dia, case when bl.situacao = 'ativo' then ld.dia end);
        update public.leads set
          nome = n_nome, comercial = n_com, nb = n_nb, banco = n_banco, cpf = n_cpf, fechamento = n_fech, valor = n_val,
          parou = n_parou, data_parou = n_dparou, data_reclamacao = n_drecl, telefone = n_tel,
          dia = v_dia, situacao = bl.situacao
        where id = v_lead
          and (nome, comercial, nb, banco, cpf, fechamento, valor, parou, data_parou, data_reclamacao, telefone, dia, situacao)
              is distinct from (n_nome, n_com, n_nb, n_banco, n_cpf, n_fech, n_val, n_parou, n_dparou, n_drecl, n_tel, v_dia, bl.situacao);
        n_cas := n_cas + 1;
        v_por_bloco := jsonb_set(v_por_bloco, array[bl.id], coalesce(v_por_bloco->bl.id, '{"casados":0,"criados":0}'::jsonb)
                         || jsonb_build_object('casados', coalesce((v_por_bloco->bl.id->>'casados')::int, 0) + 1));
      else
        insert into public.leads (nome, comercial, nb, banco, cpf, fechamento, valor, parou, data_parou, data_reclamacao, telefone,
                                  dia, situacao, created_by)
        values (coalesce(btrim(t_nome), ''), nullif(btrim(t_com), ''), nullif(btrim(t_nb), ''), nullif(btrim(t_banco), ''),
                nullif(btrim(t_cpf), ''), private.pl_data(t_fech, v_ref), coalesce(private.pl_valor(t_val), 0), nullif(t_parou, ''),
                private.pl_data_no_texto(t_parou, v_ref), private.pl_data_no_texto(t_recl, v_ref), private.pl_tel(t_tel),
                bl.dia, bl.situacao, v_uid)
        returning id into v_lead;
        n_cri := n_cri + 1;
        v_por_bloco := jsonb_set(v_por_bloco, array[bl.id], coalesce(v_por_bloco->bl.id, '{"casados":0,"criados":0}'::jsonb)
                         || jsonb_build_object('criados', coalesce((v_por_bloco->bl.id->>'criados')::int, 0) + 1));
      end if;
      v_leads := v_leads || v_lead;
      n_cli := n_cli + 1;

      -- senhas (mesma lógica do set_senha; vazio = limpa; igual à guardada = não mexe)
      if v_senha_i is not null then
        t_senha := coalesce(r->'c'->>v_senha_i, '');
        if t_senha <> coalesce(private.pl_senha_atual(v_lead, 'inss'), '') then
          perform public.set_senha(v_lead, 'inss', t_senha); n_sen := n_sen + 1;
        end if;
      end if;
      if v_recl_i is not null then
        t_senha := coalesce(t_recl, '');
        if t_senha <> coalesce(private.pl_senha_atual(v_lead, 'reclame'), '') then
          perform public.set_senha(v_lead, 'reclame', t_senha); n_sen := n_sen + 1;
        end if;
      end if;

      -- pagamentos desejados (só blocos com mês-base; NOVOS não mexe nos pagamentos)
      if bl.comp_base is not null then
        v_repl := v_repl || v_lead;
        for m in 1 .. coalesce(array_length(v_mes, 1), 0) loop
          v_t := r->'c'->>v_mes[m];
          v_st := private.pl_mes_estado(v_t);
          v_pl := v_pl || v_lead;
          v_pc := v_pc || private.pl_comp_soma(bl.comp_base, v_mespos[m]);
          v_ps := v_ps || v_st;
          v_pv := v_pv || case when v_st = 'pago' then private.pl_valor(v_t) end;
          v_pt := v_pt || v_t;
        end loop;
      end if;
    end if;

    insert into public.planilha_linhas (ordem, tipo, bloco, lead_id, altura)
    values (1000 * i, v_tipo, v_bloco, v_lead, (r->>'altura')::smallint)
    returning id into v_linha;
    n_linhas := n_linhas + 1;

    insert into public.planilha_celulas (linha_id, coluna_id, texto, estilo, atualizado_por)
    select v_linha, v_cols[x.k::int], x.txt, x.est, v_uid
      from (
        select k, case when v_tipo = 'cliente' and (k - 1 = v_senha_i or k - 1 = v_recl_i) then null else nullif(t, '') end as txt,
               private.pl_estilo(r->'s'->((k - 1)::int)) as est
          from jsonb_array_elements_text(coalesce(r->'c', '[]'::jsonb)) with ordinality as e(t, k)
      ) x
     where x.k <= coalesce(array_length(v_cols, 1), 0) and (x.txt is not null or x.est is not null);
    get diagnostics v_rc = row_count;
    n_cel := n_cel + v_rc;
  end loop;

  -- pagamentos: a planilha manda (apaga os que não estão; célula vazia ou '-' mantém um "fora")
  insert into public.competencias (comp)
  select distinct d.comp from unnest(v_pc, v_ps) as d(comp, st) where d.st is not null
  on conflict do nothing;

  delete from public.pagamentos pg
   where pg.lead_id = any(v_repl)
     and not exists (
       select 1 from unnest(v_pl, v_pc, v_ps, v_pt) as d(lead_id, comp, st, txt)
        where d.lead_id = pg.lead_id and d.comp = pg.comp
          and (d.st is not null or (pg.status = 'fora' and coalesce(private.pl_trim(d.txt), '') in ('', '-'))));
  get diagnostics n_pdel = row_count;

  insert into public.pagamentos (lead_id, comp, status, valor, pago_em, confirmado_por)
  select d.lead_id, d.comp, d.st::public.status_pagamento, d.v, case when d.st = 'pago' then now() end, v_uid
    from unnest(v_pl, v_pc, v_ps, v_pv) as d(lead_id, comp, st, v)
   where d.st is not null
  on conflict (lead_id, comp) do update set
    status = excluded.status, valor = excluded.valor, pago_em = excluded.pago_em, confirmado_por = excluded.confirmado_por
  where (public.pagamentos.status, public.pagamentos.valor) is distinct from (excluded.status, excluded.valor);
  get diagnostics n_pgrav = row_count;

  -- Lixeira (reversível) SÓ para os ids de "remover" (o que o script viu e decidiu); quem aguarda
  -- aprovação fica. Lead que não está nem nas linhas nem em "remover" (criado depois da leitura,
  -- pendente) ganha linha no fim do bloco dele.
  delete from public.leads lx
   where lx.id = any(v_remover)
     and not (lx.id = any(v_leads))
     and not (v_manter and coalesce(lx.parado_pendente, false));
  get diagnostics n_rem = row_count;
  for v_lead in select id from public.leads where not (id = any(v_leads)) order by id loop
    perform private.pl_garantir_linha(v_lead);
    n_mant := n_mant + 1;
  end loop;

  perform private.registrar('substituiu planilha', 'planilha', null, 'Gestão de cobranças',
    n_linhas || ' linhas · ' || n_cas || ' casados · ' || n_cri || ' criados · ' || n_rem || ' para a Lixeira');

  perform private.pl_versao_bump();
  perform set_config('planilha.sync', coalesce(v_sync, ''), true);
  perform set_config('planilha.pull', coalesce(v_pull, ''), true);
  return jsonb_build_object('ok', true,
    'blocos', n_blocos, 'colunas', n_cols, 'linhas', n_linhas, 'celulas', n_cel,
    'clientes', n_cli, 'casados', n_cas, 'criados', n_cri, 'removidos', n_rem, 'mantidos', n_mant,
    'pagamentos_gravados', n_pgrav, 'pagamentos_apagados', n_pdel, 'senhas_alteradas', n_sen,
    'por_bloco', v_por_bloco, 'backup', v_backup);
end $$;

-- 5.8 lead_restaurar: o corpo vivo (mig 57) vira private.lead_restaurar_impl
--     (SEM gate de papel — o sync_aplicar restaura pela planilha); o público
--     mantém o gate is_at_least('gestor') + a guarda nova e chama o impl.
create or replace function private.lead_restaurar_impl(p_trash_id uuid) returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare x private.leads_lixeira%rowtype; v_sync text := current_setting('planilha.sync', true); v_n int;
begin
  select * into x from private.leads_lixeira where id = p_trash_id;
  if not found then raise exception 'item da lixeira inexistente'; end if;
  if x.restaurado_em is not null then raise exception 'este cliente ja foi restaurado'; end if;
  if exists (select 1 from public.leads where id = x.lead_id) then raise exception 'o cliente ja esta na base'; end if;

  -- a planilha religa a linha ORIGINAL (com os textos/cores) — os gatilhos reversos não criam outra
  perform set_config('planilha.sync', '1', true);

  -- ciclo apagado depois da exclusão: volta sem ciclo_id (senão a FK barra e o item nunca volta)
  insert into public.leads select * from jsonb_populate_record(null::public.leads,
    x.lead || case when nullif(x.lead->>'ciclo_id', '') is not null
                    and not exists (select 1 from public.ciclos c where c.id = (x.lead->>'ciclo_id')::uuid)
                   then '{"ciclo_id": null}'::jsonb else '{}'::jsonb end);
  if x.segredos is not null then
    insert into private.lead_segredos select * from jsonb_populate_record(null::private.lead_segredos, x.segredos);
  end if;
  insert into public.pagamentos select * from jsonb_populate_recordset(null::public.pagamentos, coalesce(x.pagamentos,'[]'::jsonb))
    on conflict (lead_id, comp) do nothing;

  insert into public.wa_regua_msgs select * from jsonb_populate_recordset(null::public.wa_regua_msgs, coalesce(x.cascata->'wa_regua_msgs','[]'::jsonb))
    on conflict (id) do nothing;
  insert into public.wa_regua_disparos select * from jsonb_populate_recordset(null::public.wa_regua_disparos, coalesce(x.cascata->'wa_regua_disparos','[]'::jsonb))
    on conflict (id) do nothing;

  update public.entradas       t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'entradas','[]'::jsonb)))::uuid)       and t.lead_id is null;
  update public.mov_fin        t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'mov_fin','[]'::jsonb)))::uuid)        and t.lead_id is null;
  update public.wa_conversas   t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'wa_conversas','[]'::jsonb)))::uuid)   and t.lead_id is null;
  update public.wa_envio_alvos t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'wa_envio_alvos','[]'::jsonb)))::uuid) and t.lead_id is null;
  update public.planilha_linhas t set lead_id = x.lead_id where t.id in (select (jsonb_array_elements_text(coalesce(x.vinculos->'planilha_linhas','[]'::jsonb)))::uuid) and t.lead_id is null;
  get diagnostics v_n = row_count;

  perform set_config('planilha.sync', coalesce(v_sync, ''), true);
  -- item antigo (sem vínculo) ou linha que não existe mais: linha nova no fim do bloco
  if v_n = 0 then perform private.pl_garantir_linha(x.lead_id); end if;

  update private.leads_lixeira set restaurado_em = now() where id = p_trash_id;
  return x.lead_id;
end $$;
revoke all on function private.lead_restaurar_impl(uuid) from public, anon, authenticated;

create or replace function public.lead_restaurar(p_trash_id uuid) returns uuid
  language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_at_least('gestor') then raise exception 'sem permissao' using errcode = '42501'; end if;
  -- mig 71: com a sync ligada, restaurar = tirar da aba cancelados NA planilha
  if public.sync_estrutura_bloqueada() then
    raise exception 'Com a sincronização ligada, restaurar é feito na planilha: tire a linha da aba cancelados (ou recoloque o cliente na aba CLIENTES MENSAL).'
      using errcode = '55000';
  end if;
  return private.lead_restaurar_impl(p_trash_id);
end $$;
revoke all on function public.lead_restaurar(uuid) from public, anon;
grant execute on function public.lead_restaurar(uuid) to authenticated;

-- 5.9 restaurar_leads — corpo vivo da mig 49 + guarda
create or replace function public.restaurar_leads(p_lead_ids uuid[])
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid; v_n int := 0; v_trash uuid;
begin
  if not public.is_at_least('gestor') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  -- mig 71: com a sync ligada, restaurar = tirar da aba cancelados NA planilha
  if public.sync_estrutura_bloqueada() then
    raise exception 'Com a sincronização ligada, restaurar é feito na planilha: tire a linha da aba cancelados (ou recoloque o cliente na aba CLIENTES MENSAL).'
      using errcode = '55000';
  end if;
  foreach v_id in array coalesce(p_lead_ids, '{}'::uuid[]) loop
    -- registro mais recente NÃO restaurado desse lead
    select id into v_trash from private.leads_lixeira
      where lead_id = v_id and restaurado_em is null
      order by deletado_em desc limit 1;
    if v_trash is null then continue; end if;                         -- nada pra restaurar
    if exists (select 1 from public.leads where id = v_id) then continue; end if; -- já voltou
    begin
      perform public.lead_restaurar(v_trash);   -- caminho COMPLETO: cascade + re-link
      v_n := v_n + 1;
    exception when others then
      continue;                                 -- um item ruim não derruba o lote
    end;
  end loop;
  return jsonb_build_object('restaurados', v_n);
end $$;
revoke all on function public.restaurar_leads(uuid[]) from public, anon;
grant execute on function public.restaurar_leads(uuid[]) to authenticated;

-- 5.10 aprovar_parado: o corpo vivo (mig 52) vira private.aprovar_parado_impl
--      (SEM gate — a planilha manda quando o ciclo muda LÁ com pedido pendente);
--      o público mantém o gate pode_aprovar_parado() e chama o impl.
create or replace function private.aprovar_parado_impl(p_lead uuid, p_dia smallint, p_valor numeric, p_data_parou text)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
declare l public.leads%rowtype; v_nome text;
begin
  if p_dia is null or p_dia < 1 or p_dia > 31 then raise exception 'escolha o ciclo (dia de 1 a 31)' using errcode = '22023'; end if;
  if p_valor is not null and p_valor < 0 then raise exception 'valor invalido' using errcode = '22023'; end if;
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'cliente nao encontrado' using errcode = 'P0002'; end if;
  if not l.parado_pendente or l.situacao <> 'ativo' then
    raise exception 'este cliente nao esta aguardando aprovacao' using errcode = '22023';
  end if;
  select nome into v_nome from public.profiles where id = auth.uid();
  perform set_config('reviza.fluxo_parado', 'on', true);
  update public.leads set
    situacao = 'cancelado', dia = p_dia,
    -- entrar em cobrança é um COMEÇO: carimba o dia pra régua nunca cobrar
    -- atraso retroativo de vencimento anterior à aprovação (mesma lógica do mover)
    dia_alterado_em = now(),
    valor = coalesce(p_valor, valor),
    data_parou = coalesce(nullif(btrim(coalesce(p_data_parou, '')), ''), data_parou),
    parado_pendente = false,
    parado_aprovado_por = auth.uid(), parado_aprovado_nome = v_nome, parado_aprovado_em = now()
  where id = p_lead;
  perform public.notificar(l.parado_solicitado_por, 'parado_aprovado', 'Débito parado aprovado',
    l.nome || ' entrou na Gestão no ciclo D' || lpad(p_dia::text, 2, '0') || coalesce(' — aprovado por ' || v_nome, '') || '.', '/cobrancas/planilha');
  return jsonb_build_object('ok', true, 'dia', p_dia);
end $$;
revoke all on function private.aprovar_parado_impl(uuid, smallint, numeric, text) from public, anon, authenticated;

create or replace function public.aprovar_parado(p_lead uuid, p_dia smallint, p_valor numeric, p_data_parou text)
  returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not public.pode_aprovar_parado() then raise exception 'sem permissao' using errcode = '42501'; end if;
  return private.aprovar_parado_impl(p_lead, p_dia, p_valor, p_data_parou);
end $$;
revoke all on function public.aprovar_parado(uuid, smallint, numeric, text) from public, anon;
grant execute on function public.aprovar_parado(uuid, smallint, numeric, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6) RPCs service-only (grant SÓ service_role; a edge é a única chamadora)
-- ---------------------------------------------------------------------

-- grava a chave da conta de serviço CIFRADA (a chave nunca aparece em log,
-- retorno ou erro) e atualiza a config (e-mail + carimbo; teste zera)
create or replace function public.sync_credencial_gravar(p_chave text, p_email text, p_projeto text) returns void
  language plpgsql security definer set search_path = ''
as $$
declare v_ver smallint; v_enc bytea;
begin
  if coalesce(p_chave, '') = '' or coalesce(btrim(p_email), '') = '' then
    raise exception 'chave ou e-mail ausente' using errcode = '22023';
  end if;
  select versao_atual into v_ver from private.cripto_config where singleton;
  v_enc := extensions.pgp_sym_encrypt(p_chave, private.chave(v_ver),
             'cipher-algo=aes256, compress-algo=0, s2k-mode=3, s2k-digest-algo=sha256');
  insert into private.sync_credencial as s (singleton, email, projeto, chave_enc, kv, enviada_em, enviada_por)
  values (true, btrim(p_email), nullif(btrim(coalesce(p_projeto, '')), ''), v_enc, v_ver, now(), auth.uid())
  on conflict (singleton) do update set
    email = excluded.email, projeto = excluded.projeto,
    chave_enc = excluded.chave_enc, kv = excluded.kv,
    enviada_em = excluded.enviada_em, enviada_por = excluded.enviada_por;
  update public.sync_planilha_config
     set conta_email = btrim(p_email), chave_enviada_em = now(), teste = null, atualizado_em = now()
   where singleton;
end $$;

-- devolve o JSON da chave decifrado (só a edge vê; NUNCA logar)
create or replace function public.sync_credencial_ler() returns text
  language plpgsql stable security definer set search_path = ''
as $$
declare v_enc bytea; v_kv smallint;
begin
  select chave_enc, kv into v_enc, v_kv from private.sync_credencial where singleton;
  if v_enc is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_enc, private.chave(v_kv));
end $$;

-- senha decifrada p/ compor a linha do cliente novo no PUSH (paridade com a
-- planilha, que já guarda senha em texto). Auditada em segredo_acessos.
create or replace function public.sync_senha_ler(p_lead uuid, p_tipo text) returns text
  language plpgsql security definer set search_path = ''
as $$
declare v_enc bytea; v_kv smallint;
begin
  if p_tipo not in ('inss', 'reclame') then raise exception 'tipo invalido' using errcode = '22023'; end if;
  select case when p_tipo = 'inss' then senha_inss_enc else reclame_senha_enc end,
         case when p_tipo = 'inss' then senha_inss_kv  else reclame_senha_kv  end
    into v_enc, v_kv from private.lead_segredos where lead_id = p_lead;
  insert into private.segredo_acessos (lead_id, tipo, acao, ator, ator_papel)
  values (p_lead, p_tipo, 'sync_push', null, null);
  if v_enc is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_enc, private.chave(v_kv));
end $$;

-- busca na Lixeira pela chave do cliente (CPF → nome → NB, normalizações do
-- Python). Entrada: lista [{cpf, nome, nb}]; saída: lista alinhada por índice
-- [{trash_id, lead_id}] (nulos quando não achou).
create or replace function public.sync_lixeira_buscar(p jsonb) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  it jsonb;
  v_out jsonb := '[]'::jsonb;
  v_cpf text; v_nome text; v_nb text;
  v_trash uuid; v_lead uuid;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    raise exception 'esperava uma lista [{cpf, nome, nb}]' using errcode = '22023';
  end if;
  for it in select value from jsonb_array_elements(p) loop
    v_trash := null; v_lead := null;
    v_cpf := private.sync_cpf_chave(it->>'cpf');
    v_nome := nullif(private.sync_nome_chave(it->>'nome'), '');
    v_nb := nullif(private.sync_nb_chave(it->>'nb'), '');
    if v_cpf is not null then
      select x.id, x.lead_id into v_trash, v_lead from private.leads_lixeira x
       where x.restaurado_em is null and private.sync_cpf_chave(x.lead->>'cpf') = v_cpf
       order by x.deletado_em desc limit 1;
    end if;
    if v_trash is null and v_nome is not null then
      select x.id, x.lead_id into v_trash, v_lead from private.leads_lixeira x
       where x.restaurado_em is null and private.sync_nome_chave(x.lead->>'nome') = v_nome
       order by x.deletado_em desc limit 1;
    end if;
    if v_trash is null and v_nb is not null then
      select x.id, x.lead_id into v_trash, v_lead from private.leads_lixeira x
       where x.restaurado_em is null and private.sync_nb_chave(x.lead->>'nb') = v_nb
       order by x.deletado_em desc limit 1;
    end if;
    -- o cliente já está na base? então o item da Lixeira não serve (não é restauração)
    if v_trash is not null and exists (select 1 from public.leads l where l.id = v_lead) then
      v_trash := null; v_lead := null;
    end if;
    v_out := v_out || jsonb_build_object('trash_id', v_trash, 'lead_id', v_lead);
  end loop;
  return v_out;
end $$;

-- a aplicação TRANSACIONAL do pull (tudo-ou-nada). Reusa os núcleos vivos sem
-- gates de papel: a planilha manda. Seta planilha.pull + planilha.sync (origem
-- própria: cala outbox/reflexos e libera as guardas estruturais).
create or replace function public.sync_aplicar(p jsonb) returns jsonb
  language plpgsql security definer set search_path = '' set statement_timeout = '300s'
as $$
declare
  v_pull text := current_setting('planilha.pull', true);
  v_sync text := current_setting('planilha.sync', true);
  v_itens jsonb;
  it jsonb;
  v_avisos jsonb := '[]'::jsonb;
  v_apl int := 0;
  -- celula (núcleo do planilha_salvar vivo, migs 59/61, SEM gates de papel)
  l public.planilha_linhas%rowtype;
  col public.planilha_colunas%rowtype;
  v_t text; v_base text; v_comp text; v_st text; v_val numeric;
  v_pst text; v_pval numeric; v_pexiste boolean;
  v_tipo_senha text; v_atual text; v_d text; v_num numeric;
  v_patch jsonb := '{}'::jsonb; v_lp jsonb;
  k text; x jsonb;
  -- novo / mover / blocos
  bl public.planilha_blocos%rowtype;
  ld public.leads%rowtype;
  v_cols uuid[]; v_tipos text[]; v_campos text[]; v_mespos int[];
  v_c text[];
  i int;
  v_ref text; v_dia smallint; v_lead uuid; v_linha uuid;
  t_nome text; t_com text; t_nb text; t_banco text; t_cpf text; t_fech text;
  t_val text; t_parou text; t_recl text; t_tel text; t_senha text;
begin
  if p is null or jsonb_typeof(p->'itens') <> 'array' then
    raise exception 'payload inválido (itens)' using errcode = '22023';
  end if;
  v_itens := p->'itens';

  -- uma aplicação por vez (o lease da rodada fica na edge; o lock de banco é este)
  perform pg_advisory_xact_lock(hashtext('reviza_sync_aplicar'));

  -- trava os clientes do lote ANTES de tudo e em ordem de id (o mesmo padrão
  -- anti-deadlock do planilha_salvar)
  perform 1 from public.leads ld2
   where ld2.id in (
     select pl.lead_id from public.planilha_linhas pl
      where pl.id in (select (e->>'linha_id')::uuid from jsonb_array_elements(v_itens) e
                       where e->>'op' = 'celula'
                         and coalesce(e->>'linha_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     union
     select (e->>'lead_id')::uuid from jsonb_array_elements(v_itens) e
      where e->>'op' in ('mover', 'sair')
        and coalesce(e->>'lead_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
   order by ld2.id
   for update;

  perform set_config('planilha.pull', '1', true);
  perform set_config('planilha.sync', '1', true);

  for it in select value from jsonb_array_elements(v_itens) loop
    case coalesce(it->>'op', '')

    when 'celula' then
      select * into l from public.planilha_linhas where id = (it->>'linha_id')::uuid;
      if not found then raise exception 'sincronização: linha não existe mais — refaça a leitura' using errcode = 'P0002'; end if;
      select * into col from public.planilha_colunas where id = (it->>'coluna_id')::uuid;
      if not found then raise exception 'sincronização: coluna não existe mais — refaça a leitura' using errcode = 'P0002'; end if;
      v_t := nullif(it->>'texto', '');

      if l.tipo = 'cliente' and l.lead_id is not null then
        if col.tipo = 'mes' then
          select comp_base into v_base from public.planilha_blocos where id = l.bloco;
          if v_base is not null then
            v_comp := private.pl_comp_soma(v_base, col.mes_pos);
            v_st := private.pl_mes_estado(v_t);
            v_val := case when v_st = 'pago' then private.pl_valor(v_t) end;
            v_pst := null; v_pval := null;
            select status::text, valor into v_pst, v_pval from public.pagamentos where lead_id = l.lead_id and comp = v_comp;
            v_pexiste := found;
            if v_st is null then
              -- vazio ou '-' sobre um "fora" mantém o fora (mesma regra do planilha_salvar)
              if v_pexiste and not (v_pst = 'fora' and coalesce(private.pl_trim(v_t), '') in ('', '-')) then
                delete from public.pagamentos where lead_id = l.lead_id and comp = v_comp;
              end if;
            elsif not (v_pexiste and v_pst = v_st and v_pval is not distinct from v_val) then
              insert into public.competencias (comp) values (v_comp) on conflict do nothing;
              insert into public.pagamentos (lead_id, comp, status, valor, pago_em, confirmado_por)
              values (l.lead_id, v_comp, v_st::public.status_pagamento, v_val, case when v_st = 'pago' then now() end, null)
              on conflict (lead_id, comp) do update set
                status = excluded.status, valor = excluded.valor,
                pago_em = excluded.pago_em, confirmado_por = excluded.confirmado_por;
            end if;
          end if;
        elsif col.tipo = 'campo' then
          v_lp := coalesce(v_patch->(l.lead_id::text), '{}'::jsonb);
          case col.campo
            when 'senha_inss', 'reclame' then
              v_tipo_senha := case col.campo when 'senha_inss' then 'inss' else 'reclame' end;
              -- máscara colada na planilha ("•••") nunca vira senha
              if strpos(coalesce(v_t, ''), '•') > 0 then
                v_avisos := v_avisos || to_jsonb(btrim(col.titulo) || ': senha mascarada (•••) não foi gravada');
              else
                v_atual := private.pl_senha_atual(l.lead_id, v_tipo_senha);
                if coalesce(v_t, '') <> coalesce(v_atual, '') then
                  perform private.sync_set_senha(l.lead_id, v_tipo_senha, coalesce(v_t, ''));
                end if;
              end if;
              if col.campo = 'reclame' then
                v_d := private.pl_data_no_texto(v_t, private.pl_mes_ref(l.lead_id));
                if v_d is not null then v_lp := v_lp || jsonb_build_object('data_reclamacao', v_d); end if;
              end if;
            when 'fechamento' then
              v_d := private.pl_data(v_t, private.pl_mes_ref(l.lead_id));
              if v_d is not null then v_lp := v_lp || jsonb_build_object('fechamento', v_d);
              else v_avisos := v_avisos || to_jsonb(btrim(col.titulo) || ' ''' || coalesce(v_t, '') || ''' não é data (DD/mmm, DD/MM ou DD/MM/AAAA) — a data do sistema não mudou');
              end if;
            when 'valor' then
              v_num := private.pl_valor(v_t);
              if v_num is not null then v_lp := v_lp || jsonb_build_object('valor', v_num);
              else v_avisos := v_avisos || to_jsonb(btrim(col.titulo) || ' ''' || coalesce(v_t, '') || ''' não é número — o valor do sistema não mudou');
              end if;
            when 'nome' then v_lp := v_lp || jsonb_build_object('nome', coalesce(btrim(v_t), ''));
            when 'parou' then
              v_lp := v_lp || jsonb_build_object('parou', v_t);
              v_d := private.pl_data_no_texto(v_t, private.pl_mes_ref(l.lead_id));
              if v_d is not null then v_lp := v_lp || jsonb_build_object('data_parou', v_d); end if;
            when 'telefone' then
              v_d := private.pl_tel(v_t);
              if v_d is not null then v_lp := v_lp || jsonb_build_object('telefone', v_d); end if;
            when 'comercial' then
              v_lp := v_lp || jsonb_build_object('comercial', nullif(btrim(v_t), ''));
            else  -- nb, banco, cpf
              v_lp := v_lp || jsonb_build_object(col.campo, nullif(btrim(v_t), ''));
          end case;
          if v_lp <> '{}'::jsonb then v_patch := v_patch || jsonb_build_object(l.lead_id::text, v_lp); end if;
        end if;
      end if;

      -- a célula recebe o texto EXATO da planilha (senha de cliente: nunca em texto).
      -- coalesce: col.campo é NULL em coluna de mês/livre e "NULL in (...)" é NULL —
      -- sem ele o IF pularia a escrita de TODAS as células de mês (churn infinito)
      if not (l.tipo = 'cliente' and coalesce(col.campo, '') in ('senha_inss', 'reclame')) then
        perform private.pl_set_texto(l.id, col.id, v_t);
      end if;
      v_apl := v_apl + 1;

    when 'novo' then
      -- colunas vivas na ordem da planilha (recalculadas por item: uma coluna
      -- criada neste mesmo lote já entra no mapeamento)
      select coalesce(array_agg(c2.id order by c2.ordem, c2.id), '{}'::uuid[]),
             coalesce(array_agg(c2.tipo order by c2.ordem, c2.id), '{}'::text[]),
             coalesce(array_agg(c2.campo order by c2.ordem, c2.id), '{}'::text[]),
             coalesce(array_agg(c2.mes_pos::int order by c2.ordem, c2.id), '{}'::int[])
        into v_cols, v_tipos, v_campos, v_mespos
        from public.planilha_colunas c2;
      select * into bl from public.planilha_blocos where id = it->>'bloco';
      if not found then raise exception 'sincronização: bloco % não existe', it->>'bloco' using errcode = 'P0002'; end if;
      select coalesce(array_agg(e.t order by e.k), '{}'::text[]) into v_c
        from jsonb_array_elements_text(coalesce(it->'c', '[]'::jsonb)) with ordinality as e(t, k);

      t_nome := null; t_com := null; t_nb := null; t_banco := null; t_cpf := null;
      t_fech := null; t_val := null; t_parou := null; t_recl := null; t_tel := null; t_senha := null;
      for i in 1 .. coalesce(array_length(v_cols, 1), 0) loop
        if v_tipos[i] = 'campo' then
          case v_campos[i]
            when 'nome'       then t_nome := v_c[i];
            when 'comercial'  then t_com := v_c[i];
            when 'nb'         then t_nb := v_c[i];
            when 'banco'      then t_banco := v_c[i];
            when 'cpf'        then t_cpf := v_c[i];
            when 'fechamento' then t_fech := v_c[i];
            when 'valor'      then t_val := v_c[i];
            when 'parou'      then t_parou := v_c[i];
            when 'reclame'    then t_recl := v_c[i];
            when 'telefone'   then t_tel := v_c[i];
            when 'senha_inss' then t_senha := v_c[i];
            else null;
          end case;
        end if;
      end loop;

      -- referência da regra do ano: 1º mês PAGO da própria linha (bloco com mês-base)
      v_ref := null;
      if bl.comp_base is not null then
        for i in 1 .. coalesce(array_length(v_cols, 1), 0) loop
          if v_tipos[i] = 'mes' and private.pl_mes_estado(v_c[i]) = 'pago' then
            v_ref := least(v_ref, private.pl_comp_soma(bl.comp_base, v_mespos[i]));
          end if;
        end loop;
      end if;

      insert into public.leads (nome, comercial, nb, banco, cpf, fechamento, valor, parou, data_parou, data_reclamacao, telefone, dia, situacao)
      values (coalesce(btrim(t_nome), ''), nullif(btrim(t_com), ''), nullif(btrim(t_nb), ''), nullif(btrim(t_banco), ''),
              nullif(btrim(t_cpf), ''), private.pl_data(t_fech, v_ref), coalesce(private.pl_valor(t_val), 0), nullif(t_parou, ''),
              private.pl_data_no_texto(t_parou, v_ref), private.pl_data_no_texto(t_recl, v_ref), private.pl_tel(t_tel),
              bl.dia, bl.situacao)
      returning id into v_lead;

      -- cliente que entra DIRETO num bloco de cobrança não passa pelo fluxo de
      -- parado (a planilha manda) — fica registrado. private.registrar não grava
      -- com auth.uid() nulo (service), então o registro vai direto.
      if bl.situacao = 'cancelado' then
        insert into public.registros (ator_nome, acao, entidade, entidade_id, rotulo, detalhe)
        values ('Sincronização da planilha', 'cliente direto em cobrança', 'cliente', v_lead::text,
                coalesce(nullif(btrim(t_nome), ''), 'cliente'),
                'Entrou pela planilha no bloco ' || bl.id || ' sem o fluxo de débito parado (a planilha manda).');
      end if;

      insert into public.planilha_linhas (ordem, tipo, bloco, lead_id)
      values (private.pl_fim_do_bloco(bl.id), 'cliente', bl.id, v_lead)
      returning id into v_linha;
      for i in 1 .. coalesce(array_length(v_cols, 1), 0) loop
        if v_tipos[i] = 'campo' and v_campos[i] in ('senha_inss', 'reclame') then continue; end if;
        if nullif(v_c[i], '') is not null then
          perform private.pl_set_texto(v_linha, v_cols[i], v_c[i]);
        end if;
      end loop;

      -- senhas cifradas (a célula fica nula; mesma regra da carga)
      if nullif(coalesce(t_senha, ''), '') is not null then perform private.sync_set_senha(v_lead, 'inss', t_senha); end if;
      if nullif(coalesce(t_recl, ''), '') is not null then perform private.sync_set_senha(v_lead, 'reclame', t_recl); end if;

      -- pagamentos da linha (só bloco com mês-base; NOVOS é só texto)
      if bl.comp_base is not null then
        for i in 1 .. coalesce(array_length(v_cols, 1), 0) loop
          if v_tipos[i] = 'mes' then
            v_st := private.pl_mes_estado(v_c[i]);
            if v_st is not null then
              v_comp := private.pl_comp_soma(bl.comp_base, v_mespos[i]);
              insert into public.competencias (comp) values (v_comp) on conflict do nothing;
              insert into public.pagamentos (lead_id, comp, status, valor, pago_em)
              values (v_lead, v_comp, v_st::public.status_pagamento,
                      case when v_st = 'pago' then private.pl_valor(v_c[i]) end,
                      case when v_st = 'pago' then now() end)
              on conflict (lead_id, comp) do nothing;
            end if;
          end if;
        end loop;
      end if;
      v_apl := v_apl + 1;

    when 'mover' then
      select * into ld from public.leads where id = (it->>'lead_id')::uuid for update;
      if not found then raise exception 'sincronização: cliente não existe mais — refaça a leitura' using errcode = 'P0002'; end if;
      select * into bl from public.planilha_blocos where id = it->>'bloco';
      if not found then raise exception 'sincronização: bloco % não existe', it->>'bloco' using errcode = 'P0002'; end if;
      select id into v_linha from public.planilha_linhas where lead_id = ld.id;
      if coalesce(ld.parado_pendente, false) and bl.situacao = 'cancelado' then
        -- o ciclo foi definido NA planilha: núcleo da aprovação (notifica quem pediu)
        perform private.aprovar_parado_impl(ld.id, bl.dia, null, null);
      else
        v_dia := coalesce(bl.dia, case when bl.situacao = 'ativo' then ld.dia end);
        update public.leads set dia = v_dia, situacao = bl.situacao
         where id = ld.id and (dia, situacao) is distinct from (v_dia, bl.situacao);
      end if;
      if v_linha is not null then
        -- pl_meses_trocar_base move os textos de mês para o comp certo do bloco novo.
        -- Essa troca NÃO veio da planilha célula a célula: com o pull ligado os itens
        -- de push nunca nasceriam e a planilha ficaria PARA SEMPRE com os meses na
        -- posição antiga (divergência muda do que a régua cobra). Pull OFF só aqui:
        -- os gatilhos da outbox registram as células movidas (valor_esperado = o texto
        -- atual da planilha) e o próximo push realinha a linha na planilha — se alguém
        -- editar a célula lá nesse meio tempo, o esperado não bate e a planilha manda.
        perform set_config('planilha.pull', '', true);
        perform private.pl_mover_para_bloco(v_linha, bl.id);
        perform set_config('planilha.pull', '1', true);
      end if;
      v_apl := v_apl + 1;

    when 'sair' then
      -- a Lixeira preserva tudo (gatilho leads_lixeira_bd); a linha fica oculta
      delete from public.leads where id = (it->>'lead_id')::uuid;
      v_apl := v_apl + 1;

    when 'restaurar' then
      v_lead := private.lead_restaurar_impl((it->>'trash_id')::uuid);
      v_apl := v_apl + 1;

    when 'coluna_mes_nova' then
      -- coluna de mês nova detectada no FIM da planilha; o cabeçalho chega como
      -- item 'celula' na mesma rodada ou na seguinte (a coluna passa a existir)
      perform private.pl_coluna_mes_nova((it->>'mes_pos')::int);
      if nullif(btrim(coalesce(it->>'titulo', '')), '') is not null then
        update public.planilha_colunas set titulo = btrim(it->>'titulo') where mes_pos = (it->>'mes_pos')::int;
      end if;
      v_apl := v_apl + 1;

    when 'coluna_livre_nova' then
      insert into public.planilha_colunas (ordem, titulo, tipo)
      values ((select coalesce(max(ordem), 0) + 1000 from public.planilha_colunas),
              coalesce(nullif(btrim(coalesce(it->>'titulo', '')), ''), 'Nova coluna'), 'livre');
      v_apl := v_apl + 1;

    when 'bloco_novo' then
      -- comp_base vem da edge, na regra do pl_bloco_para (modelo D24 p/ dia≥15, senão D01)
      insert into public.planilha_blocos (id, dia, situacao, comp_base)
      values (it->>'id', (it->>'dia')::smallint, (it->>'situacao')::public.situacao_debito, nullif(it->>'comp_base', ''))
      on conflict (id) do nothing;
      v_apl := v_apl + 1;

    when 'linha_sumiu' then
      -- linha NÃO-cliente removida na planilha (cliente que sumiu vira 'sair')
      delete from public.planilha_linhas where id = (it->>'linha_id')::uuid and tipo <> 'cliente';
      v_apl := v_apl + 1;

    else
      raise exception 'sincronização: operação "%" desconhecida', coalesce(it->>'op', '') using errcode = '22023';
    end case;
  end loop;

  -- campos do lead: 1 update por cliente (gatilhos de leads rodam 1 vez) —
  -- mesmo bloco final do planilha_salvar
  for k, x in select key, value from jsonb_each(v_patch) loop
    update public.leads ld3 set
      fechamento      = case when x ? 'fechamento'      then x->>'fechamento'           else ld3.fechamento end,
      comercial       = case when x ? 'comercial'       then x->>'comercial'            else ld3.comercial end,
      nome            = case when x ? 'nome'            then coalesce(x->>'nome', '')   else ld3.nome end,
      nb              = case when x ? 'nb'              then x->>'nb'                   else ld3.nb end,
      banco           = case when x ? 'banco'           then x->>'banco'                else ld3.banco end,
      cpf             = case when x ? 'cpf'             then x->>'cpf'                  else ld3.cpf end,
      valor           = case when x ? 'valor'           then (x->>'valor')::numeric     else ld3.valor end,
      data_reclamacao = case when x ? 'data_reclamacao' then x->>'data_reclamacao'      else ld3.data_reclamacao end,
      parou           = case when x ? 'parou'           then x->>'parou'                else ld3.parou end,
      data_parou      = case when x ? 'data_parou'      then x->>'data_parou'           else ld3.data_parou end,
      telefone        = case when x ? 'telefone'        then x->>'telefone'             else ld3.telefone end
    where ld3.id = k::uuid
      and (ld3.fechamento, ld3.comercial, ld3.nome, ld3.nb, ld3.banco, ld3.cpf, ld3.valor, ld3.data_reclamacao, ld3.parou, ld3.data_parou, ld3.telefone)
          is distinct from (
            case when x ? 'fechamento'      then x->>'fechamento'           else ld3.fechamento end,
            case when x ? 'comercial'       then x->>'comercial'            else ld3.comercial end,
            case when x ? 'nome'            then coalesce(x->>'nome', '')   else ld3.nome end,
            case when x ? 'nb'              then x->>'nb'                   else ld3.nb end,
            case when x ? 'banco'           then x->>'banco'                else ld3.banco end,
            case when x ? 'cpf'             then x->>'cpf'                  else ld3.cpf end,
            case when x ? 'valor'           then (x->>'valor')::numeric     else ld3.valor end,
            case when x ? 'data_reclamacao' then x->>'data_reclamacao'      else ld3.data_reclamacao end,
            case when x ? 'parou'           then x->>'parou'                else ld3.parou end,
            case when x ? 'data_parou'      then x->>'data_parou'           else ld3.data_parou end,
            case when x ? 'telefone'        then x->>'telefone'             else ld3.telefone end);
  end loop;

  if v_apl > 0 then perform private.pl_versao_bump(); end if;

  perform set_config('planilha.pull', coalesce(v_pull, ''), true);
  perform set_config('planilha.sync', coalesce(v_sync, ''), true);
  return jsonb_build_object('aplicados', v_apl, 'avisos', v_avisos);
end $$;

-- grants service-only
revoke all on function
  public.sync_credencial_gravar(text, text, text),
  public.sync_credencial_ler(),
  public.sync_senha_ler(uuid, text),
  public.sync_lixeira_buscar(jsonb),
  public.sync_aplicar(jsonb)
from public, anon, authenticated;
grant execute on function
  public.sync_credencial_gravar(text, text, text),
  public.sync_credencial_ler(),
  public.sync_senha_ler(uuid, text),
  public.sync_lixeira_buscar(jsonb),
  public.sync_aplicar(jsonb)
to service_role;

-- helpers private: fora do alcance dos clientes da API
revoke all on function
  private.sync_cpf_chave(text), private.sync_nome_chave(text), private.sync_nb_chave(text),
  private.sync_set_senha(uuid, text, text)
from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7) RPCs de leitura/controle (gate pode_aprovar_parado(); espelham o front)
-- ---------------------------------------------------------------------

-- EstadoSync (chaves camelCase idênticas ao contrato do front)
create or replace function public.sync_estado() returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.sync_planilha_config%rowtype;
  v_conf jsonb;
  v_log jsonb;
  v_conflitos jsonb;
  v_freio jsonb;
begin
  if not public.pode_aprovar_parado() then raise exception 'sem permissao' using errcode = '42501'; end if;
  select * into c from public.sync_planilha_config where singleton;

  select jsonb_build_object('id', x.id, 'geradaEm', x.gerada_em, 'grupos', x.grupos, 'total', x.total)
    into v_conf
    from public.sync_conferencias x
   where x.aplicada_em is null
   order by x.gerada_em desc
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'quando', r.quando, 'origem', r.origem, 'resultado', r.resultado,
           'daPlanilha', r.da_planilha, 'paraPlanilha', r.para_planilha,
           'duracaoMs', coalesce(r.duracao_ms, 0), 'mensagem', r.mensagem)
         order by r.quando desc), '[]'::jsonb)
    into v_log
    from (select * from public.sync_rodadas order by quando desc limit 40) r;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', q.id, 'quando', q.quando, 'cliente', coalesce(ln.nome, '—'),
           'campo', q.campo, 'valorPlanilha', coalesce(q.valor_planilha, ''),
           'valorSistema', coalesce(q.valor_sistema, ''))
         order by q.quando desc), '[]'::jsonb)
    into v_conflitos
    from (select * from public.sync_conflitos order by quando desc limit 50) q
    left join public.leads ln on ln.id = q.lead_id;

  select jsonb_build_object('detectadoEm', f.detectado_em, 'motivo', f.motivo, 'grupos', f.grupos)
    into v_freio
    from public.sync_freio f
   where f.resolvido_em is null
   order by f.detectado_em desc
   limit 1;

  return jsonb_build_object(
    'modo', 'real',
    'planilha', case when c.planilha_id is not null
                     then jsonb_build_object('id', c.planilha_id, 'url', c.planilha_url) end,
    'conta', case when c.conta_email is not null
                  then jsonb_build_object('email', c.conta_email, 'enviadaEm', c.chave_enviada_em) end,
    'teste', c.teste,
    'conferencia', v_conf,
    'aplicadaEm', c.aplicada_em,
    'configuradaEm', c.configurada_em,
    'exigeConferencia', coalesce(c.exige_conferencia, false),
    'automatico', coalesce(c.automatico, false),
    'intervaloMin', coalesce(c.intervalo_min, 15),
    'naHora', case when c.na_hora_segredo is not null
                   then jsonb_build_object(
                     'url', 'https://ftexrtyswpdcndbkjbtf.supabase.co/functions/v1/reviza-planilha-sync?acao=onedit',
                     'segredo', c.na_hora_segredo) end,
    'ultimaRodada', v_log->0,
    'proximaRodada', case when coalesce(c.automatico, false) and c.ultima_rodada_em is not null
                          then to_jsonb(c.ultima_rodada_em + make_interval(mins => c.intervalo_min)) end,
    'log', v_log,
    'conflitos', v_conflitos,
    'freio', v_freio);
end $$;

-- registra o link da planilha (revalida no servidor com as MESMAS recusas do
-- extrairIdPlanilha do front; trocar a planilha depois de configurada exige
-- conferir + aplicar de novo — e zera o teste)
create or replace function public.sync_link_salvar(p_url text) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_t text := btrim(coalesce(p_url, ''));
  v_id text;
  c public.sync_planilha_config%rowtype;
begin
  if not public.pode_aprovar_parado() then raise exception 'sem permissao' using errcode = '42501'; end if;
  if v_t = '' then raise exception 'Cole o link da planilha do Google.' using errcode = '22023'; end if;
  if v_t ~* 'onedrive\.live\.com|1drv\.ms|sharepoint\.com|office\.com|officeapps\.live\.com' then
    raise exception 'Este link é do Excel Online. Leve a planilha para o Google e cole o link do Google Planilhas.' using errcode = '22023';
  end if;
  if v_t ~* 'docs\.google\.com/(document|presentation|forms)/' then
    raise exception 'Este link é de um documento do Google, não de uma planilha.' using errcode = '22023';
  end if;
  if v_t ~* 'drive\.google\.com/(file/d|open)' then
    raise exception 'Este é o link do arquivo enviado ao Drive. Abra o arquivo, use Arquivo → Salvar como Planilhas Google e cole o link da planilha nova.' using errcode = '22023';
  end if;
  v_id := (regexp_match(v_t, 'docs\.google\.com/spreadsheets/(?:u/\d+/)?d/([A-Za-z0-9_-]+)', 'i'))[1];
  if v_id is not null then
    if length(v_id) < 25 then
      raise exception 'O link parece incompleto. Copie de novo o endereço inteiro da planilha.' using errcode = '22023';
    end if;
    -- rtpof=true = arquivo do Excel aberto no modo de compatibilidade: a API do Google não lê
    if v_t ~* '[?&#]rtpof=true' then
      raise exception 'Esta planilha ainda está no formato do Excel (.xlsx). Use Arquivo → Salvar como Planilhas Google e cole o link da planilha nova.' using errcode = '22023';
    end if;
  elsif v_t ~ '^[A-Za-z0-9_-]{25,}$' then
    v_id := v_t;
  else
    raise exception 'Não reconheci este link. Ele deve começar com docs.google.com/spreadsheets/d/…' using errcode = '22023';
  end if;

  select * into c from public.sync_planilha_config where singleton for update;
  if c.planilha_id is distinct from v_id then
    update public.sync_planilha_config
       set planilha_id = v_id,
           planilha_url = 'https://docs.google.com/spreadsheets/d/' || v_id || '/edit',
           teste = null,
           -- trocou a planilha DEPOIS de configurada: as rodadas pausam até conferir + aplicar
           exige_conferencia = (c.configurada_em is not null),
           atualizado_em = now()
     where singleton;
  end if;
  return public.sync_estado();
end $$;

-- liga/desliga a rodada automática. No primeiro ligar gera o segredo do
-- ?acao=onedit (snippet do Apps Script no front).
create or replace function public.sync_automatico(p_ligar boolean) returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.sync_planilha_config%rowtype;
begin
  if not public.pode_aprovar_parado() then raise exception 'sem permissao' using errcode = '42501'; end if;
  select * into c from public.sync_planilha_config where singleton for update;
  if coalesce(p_ligar, false) then
    if c.aplicada_em is null or c.exige_conferencia then
      raise exception 'Aplique a conferência antes de ligar o automático.' using errcode = '55000';
    end if;
    update public.sync_planilha_config
       set automatico = true,
           na_hora_segredo = coalesce(na_hora_segredo, 'sync-' || encode(extensions.gen_random_bytes(12), 'hex')),
           na_hora_em = coalesce(na_hora_em, now()),
           atualizado_em = now()
     where singleton;
  else
    update public.sync_planilha_config
       set automatico = false, atualizado_em = now()
     where singleton;
  end if;
  return public.sync_estado();
end $$;

revoke all on function
  public.sync_estado(), public.sync_link_salvar(text), public.sync_automatico(boolean)
from public, anon;
grant execute on function
  public.sync_estado(), public.sync_link_salvar(text), public.sync_automatico(boolean)
to authenticated;

-- ---------------------------------------------------------------------
-- 8) Realtime: NENHUMA tabela nova entra na publication (de propósito — o
--    front lê a sync por RPC; e tabela fora da publication derruba o channel
--    em silêncio se alguém assinar sem querer).
-- ---------------------------------------------------------------------
