-- ============================================================================
-- BLOCO 5 — TEMPLATES DA CLOUD API + JANELA DE 24H
--
-- PROBLEMA: no WhatsApp oficial (Cloud API) só dá para mandar texto livre dentro
-- de 24h contadas a partir da ÚLTIMA MENSAGEM DO CLIENTE. Fora disso a Meta só
-- aceita template aprovado — e recusa o resto com erro 131047. Duas peças faltavam:
--   1) não existia NENHUM lugar guardando os templates e o status de aprovação;
--   2) não existia campo dizendo quando o CLIENTE falou pela última vez.
--      conversas.ultima_interacao_em não serve: ela é escrita nos DOIS sentidos,
--      então responder ao cliente reiniciava o relógio da janela — o oposto do certo.
--
-- REGRA DURA (implementada no bot-remarketing e no evolution-send):
--   cloud_api + fora da janela + sem template aprovado  =>  NÃO ENVIA.
--   Nunca, em nenhuma circunstância, cai para texto livre.
--
-- ESTA MIGRATION NÃO LIGA NADA. Cria tabela vazia e uma coluna derivada. O envio
-- por template só acontece quando existir canal cloud_api + template aprovado, e
-- o remarketing continua inerte (REMARKETING_ATIVO=nao).
--
-- Segurança: RLS por org; leitura para membro; escrita SÓ por RPC security definer
-- (mesmo padrão de mensagens_agendadas/maturacao). service_role com o mínimo.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) JANELA — conversas.ultima_entrada_em (última mensagem DO CLIENTE)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversas
  add column if not exists ultima_entrada_em timestamptz;

comment on column public.conversas.ultima_entrada_em is
  'Instante da última mensagem RECEBIDA do cliente (direcao=entrada). É o relógio da janela de 24h da Cloud API. Diferente de ultima_interacao_em, que também anda quando NÓS respondemos.';

-- Mantida por trigger para não depender de ninguém lembrar de atualizar: qualquer
-- caminho de ingestão (Evolution, Cloud API, Messenger, import) fica coberto de graça.
-- greatest() protege contra webhook fora de ordem — a Meta não garante ordem de entrega.
create or replace function public.trg_fn_conversa_ultima_entrada()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.conversas
     set ultima_entrada_em = greatest(
           coalesce(ultima_entrada_em, to_timestamp(0)),
           coalesce(new.recebida_em, new.criado_em, now())
         )
   where id = new.conversa_id;
  return null;                              -- AFTER trigger: retorno é ignorado
end $fn$;

revoke all on function public.trg_fn_conversa_ultima_entrada() from public, anon;

drop trigger if exists trg_conversa_ultima_entrada on public.mensagens;
create trigger trg_conversa_ultima_entrada
  after insert on public.mensagens
  for each row
  when (new.direcao = 'entrada' and new.conversa_id is not null)
  execute function public.trg_fn_conversa_ultima_entrada();

comment on function public.trg_fn_conversa_ultima_entrada is
  'Trigger de mensagens (AFTER INSERT, WHEN direcao=entrada): mantém conversas.ultima_entrada_em, o relógio da janela de 24h.';

-- Backfill: sem isto toda conversa antiga nasceria "fora da janela" e o primeiro
-- disparo real seria bloqueado sem motivo real.
update public.conversas c
   set ultima_entrada_em = m.ult
  from (
    select conversa_id, max(coalesce(recebida_em, criado_em)) as ult
      from public.mensagens
     where direcao = 'entrada' and conversa_id is not null
     group by conversa_id
  ) m
 where m.conversa_id = c.id
   and c.ultima_entrada_em is distinct from m.ult;

create index if not exists conversas_ultima_entrada_idx
  on public.conversas (ultima_entrada_em desc nulls last);

-- Helper único da janela. Fonte de verdade para painel, remarketing e envio: se um dia
-- a Meta mudar as 24h, muda AQUI e todo mundo obedece junto.
create or replace function public.wa_dentro_janela(p_conversa uuid, p_horas int default 24)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select c.ultima_entrada_em > now() - make_interval(hours => greatest(p_horas, 1))
       from public.conversas c where c.id = p_conversa),
    false                                   -- conversa sem inbound NUNCA está na janela
  );
$fn$;

revoke all on function public.wa_dentro_janela(uuid, int) from public, anon;
grant execute on function public.wa_dentro_janela(uuid, int) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) TEMPLATES — espelho local do que existe (e do que foi aprovado) na Meta
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.wa_templates (
  id                 uuid primary key default gen_random_uuid(),
  organizacao_id     uuid not null references public.organizacoes(id) on delete cascade,
  -- o template pertence ao WABA, não ao número: canal_id é só a pista de qual conta o trouxe.
  canal_id           uuid references public.canais(id) on delete set null,
  waba_id            text,
  nome               text not null,
  idioma             text not null default 'pt_BR',
  categoria          text not null default 'MARKETING'
                       check (categoria in ('MARKETING', 'UTILITY', 'AUTHENTICATION')),
  corpo              text not null,
  -- [{"pos":1,"rotulo":"nome","exemplo":"Maria"}] — a ordem é a das {{n}} no corpo.
  variaveis          jsonb not null default '[]'::jsonb,
  status             text not null default 'rascunho'
                       check (status in ('rascunho', 'pendente', 'aprovado', 'rejeitado', 'pausado', 'desativado')),
  status_motivo      text,
  meta_template_id   text,
  sincronizado_em    timestamptz,
  -- exatamente UM template por org é o usado pelo remarketing fora da janela.
  usar_em_remarketing boolean not null default false,
  ativo              boolean not null default true,
  criado_por         uuid references public.usuarios(id),
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  atualizado_por     uuid references public.usuarios(id),
  metadados          jsonb not null default '{}'::jsonb,
  -- a Meta só aceita nome minúsculo/underscore; validar aqui evita descobrir isso no envio.
  constraint wat_nome_valido    check (nome ~ '^[a-z0-9_]{1,512}$'),
  constraint wat_corpo_nao_vazio check (length(trim(corpo)) > 0)
);

comment on table public.wa_templates is
  'Templates (HSM) da WhatsApp Cloud API e seu status de aprovação na Meta. Espelho local: quem aprova é a Meta, aqui só registramos para poder enviar fora da janela de 24h.';
comment on column public.wa_templates.usar_em_remarketing is
  'Marca o template que o bot-remarketing usa quando o lead está fora da janela de 24h. No máximo um ativo por organização.';

create unique index if not exists uq_wa_templates_nome_idioma
  on public.wa_templates (organizacao_id, nome, idioma) where ativo;
create unique index if not exists uq_wa_templates_remarketing
  on public.wa_templates (organizacao_id) where usar_em_remarketing and ativo;
create index if not exists wat_org_status_idx
  on public.wa_templates (organizacao_id, status) where ativo;

create or replace function public.wa_templates_touch()
returns trigger language plpgsql set search_path = public as $fn$
begin new.atualizado_em := now(); return new; end $fn$;
revoke all on function public.wa_templates_touch() from public, anon;

drop trigger if exists trg_wa_templates_upd on public.wa_templates;
create trigger trg_wa_templates_upd before update on public.wa_templates
  for each row execute function public.wa_templates_touch();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS — leitura para membro da org; escrita SÓ por RPC security definer
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.wa_templates enable row level security;

drop policy if exists wat_sel on public.wa_templates;
create policy wat_sel on public.wa_templates for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));

-- Sem policy de insert/update/delete => cliente não escreve direto (padrão da casa).
revoke insert, update, delete on public.wa_templates from anon, authenticated;
grant select on public.wa_templates to authenticated;
-- service_role: o cloud-manage sincroniza com a Meta e o bot-remarketing lê para enviar.
-- RLS ligado sem grant explícito faz a Edge Function ler VAZIO em silêncio.
grant select, insert, update on public.wa_templates to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- Cadastro/edição pelo painel. Só admin/supervisor. Devolve o id.
create or replace function public.wa_template_salvar(
  p_org uuid, p_nome text, p_idioma text, p_categoria text, p_corpo text,
  p_variaveis jsonb default '[]'::jsonb, p_canal uuid default null,
  p_waba text default null, p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid; v_nome text;
begin
  if not (public.is_platform_admin() or (public.papel_na_org(p_org) = any (array['admin'::user_role, 'supervisor'::user_role])
          and public.org_operacional(p_org))) then
    raise exception 'sem_permissao';
  end if;
  v_nome := lower(trim(coalesce(p_nome, '')));
  if v_nome !~ '^[a-z0-9_]{1,512}$' then raise exception 'nome_invalido'; end if;
  if length(trim(coalesce(p_corpo, ''))) = 0 then raise exception 'corpo_vazio'; end if;
  if p_canal is not null and not exists (
       select 1 from public.canais c where c.id = p_canal and c.organizacao_id = p_org
     ) then raise exception 'canal_invalido'; end if;

  if p_id is null then
    insert into public.wa_templates (organizacao_id, canal_id, waba_id, nome, idioma, categoria, corpo, variaveis, criado_por, atualizado_por)
    values (p_org, p_canal, nullif(trim(coalesce(p_waba, '')), ''), v_nome, coalesce(nullif(trim(p_idioma), ''), 'pt_BR'),
            coalesce(nullif(trim(p_categoria), ''), 'MARKETING'), p_corpo, coalesce(p_variaveis, '[]'::jsonb), auth.uid(), auth.uid())
    returning id into v_id;
  else
    -- editar o corpo invalida a aprovação: a Meta aprova o TEXTO, não o registro.
    update public.wa_templates
       set canal_id = p_canal, waba_id = nullif(trim(coalesce(p_waba, '')), ''), nome = v_nome,
           idioma = coalesce(nullif(trim(p_idioma), ''), 'pt_BR'),
           categoria = coalesce(nullif(trim(p_categoria), ''), 'MARKETING'),
           corpo = p_corpo, variaveis = coalesce(p_variaveis, '[]'::jsonb),
           status = case when corpo is distinct from p_corpo then 'rascunho' else status end,
           status_motivo = case when corpo is distinct from p_corpo then 'corpo alterado — precisa reenviar para aprovação' else status_motivo end,
           atualizado_por = auth.uid()
     where id = p_id and organizacao_id = p_org and ativo
    returning id into v_id;
    if v_id is null then raise exception 'template_invalido'; end if;
  end if;
  return v_id;
end $fn$;

revoke all on function public.wa_template_salvar(uuid, text, text, text, text, jsonb, uuid, text, uuid) from public, anon;
grant execute on function public.wa_template_salvar(uuid, text, text, text, text, jsonb, uuid, text, uuid) to authenticated;

-- Registra o desfecho da aprovação. Chamada pelo painel (manual) e pelo cloud-manage
-- (sync com a Meta, via service_role) — daí o grant para os dois.
create or replace function public.wa_template_status(
  p_id uuid, p_status text, p_motivo text default null, p_meta_id text default null
) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.wa_templates where id = p_id and ativo;
  if v_org is null then raise exception 'template_invalido'; end if;
  -- auth.uid() null = service_role (sync automático da Meta): backend confiável.
  if auth.uid() is not null and not (public.is_platform_admin() or
      (public.papel_na_org(v_org) = any (array['admin'::user_role, 'supervisor'::user_role]) and public.org_operacional(v_org)))
  then raise exception 'sem_permissao'; end if;
  if p_status not in ('rascunho', 'pendente', 'aprovado', 'rejeitado', 'pausado', 'desativado') then
    raise exception 'status_invalido';
  end if;
  update public.wa_templates
     set status = p_status, status_motivo = p_motivo,
         meta_template_id = coalesce(nullif(trim(coalesce(p_meta_id, '')), ''), meta_template_id),
         sincronizado_em = case when auth.uid() is null then now() else sincronizado_em end,
         atualizado_por = auth.uid()
   where id = p_id;
end $fn$;

revoke all on function public.wa_template_status(uuid, text, text, text) from public, anon;
grant execute on function public.wa_template_status(uuid, text, text, text) to authenticated, service_role;

-- Elege O template do remarketing (exclusivo por org). Só faz sentido em template APROVADO:
-- marcar um rascunho daria a sensação de "configurado" e o envio seria bloqueado do mesmo jeito.
create or replace function public.wa_template_remarketing(p_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_status text;
begin
  select organizacao_id, status into v_org, v_status from public.wa_templates where id = p_id and ativo;
  if v_org is null then raise exception 'template_invalido'; end if;
  if not (public.is_platform_admin() or (public.papel_na_org(v_org) = any (array['admin'::user_role, 'supervisor'::user_role])
          and public.org_operacional(v_org))) then raise exception 'sem_permissao'; end if;
  if v_status <> 'aprovado' then raise exception 'template_nao_aprovado'; end if;
  update public.wa_templates set usar_em_remarketing = false, atualizado_por = auth.uid()
   where organizacao_id = v_org and usar_em_remarketing and id <> p_id;
  update public.wa_templates set usar_em_remarketing = true, atualizado_por = auth.uid() where id = p_id;
end $fn$;

revoke all on function public.wa_template_remarketing(uuid) from public, anon;
grant execute on function public.wa_template_remarketing(uuid) to authenticated;

-- Arquivar (soft): libera o nome para recadastro e sai dos índices parciais.
create or replace function public.wa_template_remover(p_id uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.wa_templates where id = p_id and ativo;
  if v_org is null then raise exception 'template_invalido'; end if;
  if not (public.is_platform_admin() or (public.papel_na_org(v_org) = any (array['admin'::user_role, 'supervisor'::user_role])
          and public.org_operacional(v_org))) then raise exception 'sem_permissao'; end if;
  update public.wa_templates set ativo = false, usar_em_remarketing = false, atualizado_por = auth.uid() where id = p_id;
end $fn$;

revoke all on function public.wa_template_remover(uuid) from public, anon;
grant execute on function public.wa_template_remover(uuid) to authenticated;

-- O que o worker pergunta antes de disparar fora da janela. Devolve NADA se não houver
-- template aprovado — e "nada" é o que faz o envio virar 'bloqueada_janela'.
-- INTERNA: nunca executável por anon/authenticated (P0 da auditoria de 2026-07-15).
create or replace function public.wa_template_para_envio(p_org uuid)
returns table (id uuid, nome text, idioma text, corpo text, variaveis jsonb, meta_template_id text)
language sql stable security definer set search_path = public as $fn$
  select t.id, t.nome, t.idioma, t.corpo, t.variaveis, t.meta_template_id
    from public.wa_templates t
   where t.organizacao_id = p_org and t.ativo
     and t.usar_em_remarketing and t.status = 'aprovado'
   limit 1;
$fn$;

revoke all on function public.wa_template_para_envio(uuid) from public, anon, authenticated;
grant execute on function public.wa_template_para_envio(uuid) to service_role;
