-- ============================================================================
-- DOIS NÚMEROS NA CLOUD API — papel do canal, janela por número, opt-out da Meta
--
-- ARQUITETURA: um número ATENDE (recebe o anúncio, qualifica) e outro DISPARA
-- (só remarketing, por template pago). A qualidade é POR NÚMERO: template de
-- marketing leva bloqueio/denúncia, e isso derruba o rating de quem disparou.
-- Separando, o número que recebe o anúncio mantém a reputação limpa.
-- (O tier de iniciações é do PORTFÓLIO e segue compartilhado — separar não isola isso.)
--
-- O QUE ESTA MIGRATION CORRIGE, ponto a ponto:
--
--  1) canais.papel  — não existia NENHUMA marca de papel. `origem_tipo` é null em
--     todos os canais e significa outra coisa (fonte comercial do lead).
--
--  2) canal_janela  — a janela de 24h é contada pela última resposta do cliente AO
--     NÚMERO REMETENTE (erro 131047: "since the recipient last replied to the sender
--     number"). conversas.ultima_entrada_em é POR CONVERSA, e existe UMA conversa por
--     contato (conversas_uma_ativa_por_contato) — logo o inbound no número de
--     atendimento abriria uma janela fantasma no número de disparo, que nunca recebeu
--     nada daquele lead. Resultado seria texto livre fora de janela: 131047 + queda de
--     qualidade no número pago. Agora o relógio é por PAR (canal, contato).
--     SEM BACKFILL: `mensagens` não tem coluna de canal, então o histórico não é
--     reconstruível — e é irrelevante (16 inbounds nas últimas 24h de 4.484 no total).
--     Para o número de disparo, nascer com a janela FECHADA é o comportamento correto.
--
--  3) wa_templates.toque — o índice era unique(organizacao_id), ou seja UM template por
--     org. A cadência tem 5 toques com ângulos deliberadamente distintos; um template só
--     mandaria o MESMO texto nos cinco, que é exatamente o padrão de repetição em massa
--     que a Meta pontua como spam. Agora é um template por (org, toque).
--
--  4) wa_optout — o opt-out de hoje está amarrado a motivo_perda='sem_interesse', que é
--     outra coisa (motivo comercial da perda). O opt-out da Meta é do lado DELES: chega
--     pelo erro 131050 no envio e pelo webhook `user_preferences` (value=stop|resume).
--     Ignorar isso penaliza o número. Agora vira estado persistido por (contato, canal).
--
-- NADA AQUI LIGA NADA. Colunas com default inerte, tabelas vazias, RPCs sem chamador
-- automático. O remarketing segue com REMARKETING_ATIVO ausente e cron inativo.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) PAPEL DO CANAL
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.canais
  add column if not exists papel text not null default 'atendimento';

do $$ begin
  alter table public.canais add constraint canais_papel_check
    check (papel in ('atendimento', 'disparo', 'ambos'));
exception when duplicate_object then null; end $$;

-- Desempate quando houver mais de um canal de disparo. Sem isto, "qual número dispara?"
-- viraria ordem de criação — e um disparo pago sair do número errado é caro.
alter table public.canais
  add column if not exists disparo_padrao boolean not null default false;

create unique index if not exists uq_canais_disparo_padrao
  on public.canais (organizacao_id) where disparo_padrao and ativo;

comment on column public.canais.papel is
  'atendimento = recebe o tráfego e conversa; disparo = só remarketing por template; ambos = os dois. A qualidade do número é medida separadamente por isso.';
comment on column public.canais.disparo_padrao is
  'Desempate: com vários canais de papel disparo, este é o escolhido. No máximo um ativo por organização.';

-- Resolução do canal de disparo. É UMA função para o worker e o painel concordarem.
-- Regra, nesta ordem: (1) o marcado como padrão; (2) se existir exatamente UM candidato,
-- ele; (3) ambíguo (2+ sem marcação) => NULL, e quem chama NÃO envia. Chutar entre dois
-- números pagos é pior que não mandar.
create or replace function public.wa_canal_disparo(p_org uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v_id uuid; v_qtd int;
begin
  if auth.uid() is not null and not (public.is_platform_admin() or public.is_member(p_org)) then
    return null;
  end if;

  select id into v_id from public.canais
   where organizacao_id = p_org and ativo and disparo_padrao
     and papel in ('disparo', 'ambos') and transporte = 'cloud_api'
     and status_integracao <> 'removido'
   limit 1;
  if v_id is not null then return v_id; end if;

  select count(*), min(id) into v_qtd, v_id from public.canais
   where organizacao_id = p_org and ativo
     and papel in ('disparo', 'ambos') and transporte = 'cloud_api'
     and status_integracao <> 'removido';
  if v_qtd = 1 then return v_id; end if;

  return null;                       -- nenhum candidato, ou ambíguo
end $fn$;

revoke all on function public.wa_canal_disparo(uuid) from public, anon;
grant execute on function public.wa_canal_disparo(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) JANELA DE 24H POR (CANAL, CONTATO)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.canal_janela (
  canal_id          uuid not null references public.canais(id) on delete cascade,
  contato_id        uuid not null references public.contatos(id) on delete cascade,
  organizacao_id    uuid not null references public.organizacoes(id) on delete cascade,
  ultima_entrada_em timestamptz not null,
  atualizado_em     timestamptz not null default now(),
  primary key (canal_id, contato_id)
);

create index if not exists idx_canal_janela_org
  on public.canal_janela (organizacao_id, ultima_entrada_em);

comment on table public.canal_janela is
  'Relógio da janela de 24h da Cloud API, por PAR (canal, contato): quando aquele contato falou pela última vez COM AQUELE NÚMERO. A Meta conta a janela contra o número remetente (erro 131047), não contra a empresa.';

alter table public.canal_janela enable row level security;

drop policy if exists cjan_sel on public.canal_janela;
create policy cjan_sel on public.canal_janela for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));

-- Escrita SÓ por RPC security definer (padrão da casa).
revoke insert, update, delete on public.canal_janela from anon, authenticated;
grant select on public.canal_janela to authenticated;
-- os webhooks rodam como service_role; RLS ligado sem grant faz a função ler/gravar vazio em silêncio.
grant select, insert, update on public.canal_janela to service_role;

-- Chamada por AMBOS os webhooks em todo inbound. greatest() protege contra webhook fora
-- de ordem (a Meta não garante ordem de entrega).
create or replace function public.wa_janela_registrar(p_canal uuid, p_contato uuid, p_quando timestamptz default now())
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null or p_contato is null then return; end if;      -- best-effort: nunca quebra a ingestão

  insert into public.canal_janela (canal_id, contato_id, organizacao_id, ultima_entrada_em)
  values (p_canal, p_contato, v_org, coalesce(p_quando, now()))
  on conflict (canal_id, contato_id) do update
    set ultima_entrada_em = greatest(public.canal_janela.ultima_entrada_em, excluded.ultima_entrada_em),
        atualizado_em = now();
end $fn$;

revoke all on function public.wa_janela_registrar(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.wa_janela_registrar(uuid, uuid, timestamptz) to service_role;

-- Nova assinatura: por (canal, contato). A antiga (por conversa) É REMOVIDA de propósito —
-- deixar as duas conviverem garantiria que alguém chamasse a errada e mandasse texto livre
-- fora da janela. conversas.ultima_entrada_em CONTINUA existindo, para UI/relatório.
drop function if exists public.wa_dentro_janela(uuid, int);

create or replace function public.wa_dentro_janela(p_canal uuid, p_contato uuid, p_horas int default 24)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v_org uuid; v_ult timestamptz;
begin
  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then return false; end if;

  -- auth.uid() null = service_role (worker/webhook). Usuário logado só enxerga a própria org.
  if auth.uid() is not null and not (public.is_platform_admin() or public.is_member(v_org)) then
    return false;
  end if;

  select ultima_entrada_em into v_ult from public.canal_janela
   where canal_id = p_canal and contato_id = p_contato;

  -- sem registro = o contato NUNCA falou com este número = janela fechada. É o estado
  -- correto de um número de disparo recém-criado.
  return coalesce(v_ult > now() - make_interval(hours => greatest(p_horas, 1)), false);
end $fn$;

revoke all on function public.wa_dentro_janela(uuid, uuid, int) from public, anon;
grant execute on function public.wa_dentro_janela(uuid, uuid, int) to authenticated, service_role;

comment on function public.wa_dentro_janela is
  'O par (canal, contato) está dentro da janela de 24h? Fonte de verdade do envio na Cloud API. Chamada autenticada só responde sobre a própria organização.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) UM TEMPLATE POR TOQUE
-- ─────────────────────────────────────────────────────────────────────────────
-- ATENÇÃO à numeração: bot_remarketing.toque é 0-based (0..4, índice de ANGULOS em
-- remarketing.ts). wa_templates.toque é 1-based (1..5), porque é o que a pessoa lê no
-- painel e o que casa com os nomes caf_retomada_01..05. O worker soma 1 na conversão.
alter table public.wa_templates
  add column if not exists toque int;

do $$ begin
  alter table public.wa_templates add constraint wat_toque_valido
    check (toque is null or (toque between 1 and 20));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.wa_templates add constraint wat_remarketing_exige_toque
    check (not usar_em_remarketing or toque is not null);
exception when duplicate_object then null; end $$;

comment on column public.wa_templates.toque is
  'Passo da cadência de remarketing (1..5) que este modelo atende. 1-based; bot_remarketing.toque é 0-based e o worker converte.';

drop index if exists public.uq_wa_templates_remarketing;
create unique index if not exists uq_wa_templates_remarketing
  on public.wa_templates (organizacao_id, toque) where usar_em_remarketing and ativo;

-- salvar passa a aceitar o toque
create or replace function public.wa_template_salvar(
  p_org uuid, p_nome text, p_idioma text, p_categoria text, p_corpo text,
  p_variaveis jsonb default '[]'::jsonb, p_canal uuid default null,
  p_waba text default null, p_id uuid default null, p_toque int default null
) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_nome text;
begin
  if not (public.is_platform_admin() or (public.papel_na_org(p_org) = any (array['admin'::user_role, 'supervisor'::user_role])
          and public.org_operacional(p_org))) then
    raise exception 'sem_permissao';
  end if;
  v_nome := lower(trim(coalesce(p_nome, '')));
  -- sem {1,512}: o motor POSIX do Postgres limita repetição a 255 (ver 20260724170000).
  if v_nome !~ '^[a-z0-9_]+$' or length(v_nome) > 512 then raise exception 'nome_invalido'; end if;
  if length(trim(coalesce(p_corpo, ''))) = 0 then raise exception 'corpo_vazio'; end if;
  if p_toque is not null and (p_toque < 1 or p_toque > 20) then raise exception 'toque_invalido'; end if;
  if p_canal is not null and not exists (
       select 1 from public.canais c where c.id = p_canal and c.organizacao_id = p_org
     ) then raise exception 'canal_invalido'; end if;

  if p_id is null then
    insert into public.wa_templates (organizacao_id, canal_id, waba_id, nome, idioma, categoria, corpo, variaveis, toque, criado_por, atualizado_por)
    values (p_org, p_canal, nullif(trim(coalesce(p_waba, '')), ''), v_nome, coalesce(nullif(trim(p_idioma), ''), 'pt_BR'),
            coalesce(nullif(trim(p_categoria), ''), 'MARKETING'), p_corpo, coalesce(p_variaveis, '[]'::jsonb), p_toque, auth.uid(), auth.uid())
    returning id into v_id;
  else
    -- editar o corpo invalida a aprovação: a Meta aprova o TEXTO, não o registro.
    update public.wa_templates
       set canal_id = p_canal, waba_id = nullif(trim(coalesce(p_waba, '')), ''), nome = v_nome,
           idioma = coalesce(nullif(trim(p_idioma), ''), 'pt_BR'),
           categoria = coalesce(nullif(trim(p_categoria), ''), 'MARKETING'),
           corpo = p_corpo, variaveis = coalesce(p_variaveis, '[]'::jsonb), toque = p_toque,
           status = case when corpo is distinct from p_corpo then 'rascunho' else status end,
           status_motivo = case when corpo is distinct from p_corpo then 'corpo alterado — precisa reenviar para aprovação' else status_motivo end,
           atualizado_por = auth.uid()
     where id = p_id and organizacao_id = p_org and ativo
    returning id into v_id;
    if v_id is null then raise exception 'template_invalido'; end if;
  end if;
  return v_id;
end $fn$;

revoke all on function public.wa_template_salvar(uuid, text, text, text, text, jsonb, uuid, text, uuid, int) from public, anon;
grant execute on function public.wa_template_salvar(uuid, text, text, text, text, jsonb, uuid, text, uuid, int) to authenticated;

-- eleger o template DE UM TOQUE (não mais "o template da org")
drop function if exists public.wa_template_remarketing(uuid);

create or replace function public.wa_template_remarketing(p_id uuid, p_toque int) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_status text;
begin
  select organizacao_id, status into v_org, v_status from public.wa_templates where id = p_id and ativo;
  if v_org is null then raise exception 'template_invalido'; end if;
  if not (public.is_platform_admin() or (public.papel_na_org(v_org) = any (array['admin'::user_role, 'supervisor'::user_role])
          and public.org_operacional(v_org))) then raise exception 'sem_permissao'; end if;
  if v_status <> 'aprovado' then raise exception 'template_nao_aprovado'; end if;
  if p_toque is null or p_toque < 1 or p_toque > 20 then raise exception 'toque_invalido'; end if;

  -- libera o toque para este e desmarca quem o ocupava
  update public.wa_templates set usar_em_remarketing = false, atualizado_por = auth.uid()
   where organizacao_id = v_org and usar_em_remarketing and toque = p_toque and id <> p_id;
  update public.wa_templates set usar_em_remarketing = true, toque = p_toque, atualizado_por = auth.uid()
   where id = p_id;
end $fn$;

revoke all on function public.wa_template_remarketing(uuid, int) from public, anon;
grant execute on function public.wa_template_remarketing(uuid, int) to authenticated;

-- o worker pergunta pelo TOQUE. Sem template aprovado para aquele passo => vazio => bloqueada_janela.
drop function if exists public.wa_template_para_envio(uuid);

create or replace function public.wa_template_para_envio(p_org uuid, p_toque int)
returns table (id uuid, nome text, idioma text, corpo text, variaveis jsonb, meta_template_id text, toque int)
language sql stable security definer set search_path = public as $fn$
  select t.id, t.nome, t.idioma, t.corpo, t.variaveis, t.meta_template_id, t.toque
    from public.wa_templates t
   where t.organizacao_id = p_org and t.ativo
     and t.usar_em_remarketing and t.status = 'aprovado' and t.toque = p_toque
   limit 1;
$fn$;

revoke all on function public.wa_template_para_envio(uuid, int) from public, anon, authenticated;
grant execute on function public.wa_template_para_envio(uuid, int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) OPT-OUT NÍVEL META (131050 / user_preferences)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.wa_optout (
  contato_id     uuid not null references public.contatos(id) on delete cascade,
  canal_id       uuid not null references public.canais(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  waba_id        text,
  motivo         text not null check (motivo in ('erro_131050', 'user_preferences', 'manual')),
  detalhe        text,
  criado_em      timestamptz not null default now(),
  primary key (contato_id, canal_id)
);

create index if not exists idx_wa_optout_org on public.wa_optout (organizacao_id, criado_em desc);

comment on table public.wa_optout is
  'Opt-out de marketing NO NÍVEL DA META, por (contato, canal). Chega pelo erro 131050 no envio ou pelo webhook user_preferences (value=stop). Diferente do motivo_perda comercial: aqui é a pessoa dizendo à própria Meta que não quer marketing deste número.';

alter table public.wa_optout enable row level security;

drop policy if exists waopt_sel on public.wa_optout;
create policy waopt_sel on public.wa_optout for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));

revoke insert, update, delete on public.wa_optout from anon, authenticated;
grant select on public.wa_optout to authenticated;
grant select, insert, delete on public.wa_optout to service_role;

create or replace function public.wa_optout_registrar(
  p_contato uuid, p_canal uuid, p_motivo text, p_detalhe text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_waba text;
begin
  select organizacao_id, cloud_waba_id into v_org, v_waba from public.canais where id = p_canal;
  if v_org is null or p_contato is null then return; end if;
  if p_motivo not in ('erro_131050', 'user_preferences', 'manual') then raise exception 'motivo_invalido'; end if;

  insert into public.wa_optout (contato_id, canal_id, organizacao_id, waba_id, motivo, detalhe)
  values (p_contato, p_canal, v_org, v_waba, p_motivo, left(coalesce(p_detalhe, ''), 300))
  on conflict (contato_id, canal_id) do nothing;   -- o primeiro "não quero" é o que vale
end $fn$;

revoke all on function public.wa_optout_registrar(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.wa_optout_registrar(uuid, uuid, text, text) to service_role;

-- `resume` no user_preferences: a pessoa voltou a aceitar marketing daquele número.
create or replace function public.wa_optout_remover(p_contato uuid, p_canal uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  delete from public.wa_optout where contato_id = p_contato and canal_id = p_canal;
end $fn$;

revoke all on function public.wa_optout_remover(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wa_optout_remover(uuid, uuid) to service_role;

-- Consulta do worker antes de disparar. Interna: nunca executável por anon/authenticated.
create or replace function public.wa_optout_ativo(p_contato uuid, p_canal uuid)
returns boolean
language sql stable security definer set search_path = public as $fn$
  select exists (select 1 from public.wa_optout where contato_id = p_contato and canal_id = p_canal);
$fn$;

revoke all on function public.wa_optout_ativo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.wa_optout_ativo(uuid, uuid) to service_role;
