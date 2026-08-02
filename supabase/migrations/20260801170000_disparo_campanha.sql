-- ─────────────────────────────────────────────────────────────────────────────
-- DISPARO EM MASSA POR TEMPLATE (Cloud API) — Fase 1: disparo único, sem cadência.
--
-- Modelo: uma CAMPANHA (template + canal + teto/24h) com N ALVOS (snapshot de
-- contato+telefone). O envio é da edge function `disparo-processar`, em lotes
-- pequenos escolhidos na tela ("Enviar agora: X"), com dry_run por default.
-- Cada alvo recebe NO MÁXIMO uma vez por campanha (unique campanha+contato).
--
-- Segurança (padrão da auditoria 2026-07-15):
--  * tabelas: RLS ligado; leitura só para membro ativo da org; escrita só service_role/RPC.
--  * RPCs de escrita: admin|supervisor (mesmo gate de wa_template_status).
--  * opt-out: quem tem QUALQUER linha em wa_optout (qualquer canal) NUNCA entra em alvo
--    e é re-checado de novo no momento do envio pela edge function.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.disparo_campanhas (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  canal_id        uuid not null references public.canais(id),
  template_id     uuid not null references public.wa_templates(id),
  nome            text not null,
  status          text not null default 'ativa' check (status in ('ativa', 'concluida', 'cancelada')),
  -- teto MÓVEL de 24h do canal (Meta conta conversas de marketing em janela móvel, não dia-calendário).
  -- 200 deixa folga nos 250 do tier atual do número.
  teto_24h        int  not null default 200 check (teto_24h between 1 and 1000),
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.disparo_alvos (
  id              uuid primary key default gen_random_uuid(),
  campanha_id     uuid not null references public.disparo_campanhas(id) on delete cascade,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  contato_id      uuid not null references public.contatos(id) on delete cascade,
  telefone        text,                                   -- snapshot do valor_normalizado no momento da inclusão
  status          text not null default 'pendente'
                  check (status in ('pendente', 'enviado', 'falhou', 'optout', 'pulado')),
  erro            text,
  wamid           text,                                   -- id da Meta quando enviado
  enviado_em      timestamptz,
  criado_em       timestamptz not null default now(),
  unique (campanha_id, contato_id)                        -- ninguém recebe 2x na mesma campanha
);
create index if not exists disparo_alvos_pend_ix on public.disparo_alvos (campanha_id, status, criado_em);
create index if not exists disparo_alvos_env24_ix on public.disparo_alvos (enviado_em) where status = 'enviado';

alter table public.disparo_campanhas enable row level security;
alter table public.disparo_alvos     enable row level security;

-- leitura: membro da org (papel_na_org devolve null para quem não é membro ativo)
drop policy if exists disparo_campanhas_sel on public.disparo_campanhas;
create policy disparo_campanhas_sel on public.disparo_campanhas
  for select to authenticated using (public.papel_na_org(organizacao_id) is not null);
drop policy if exists disparo_alvos_sel on public.disparo_alvos;
create policy disparo_alvos_sel on public.disparo_alvos
  for select to authenticated using (public.papel_na_org(organizacao_id) is not null);

revoke insert, update, delete on public.disparo_campanhas from anon, authenticated;
revoke insert, update, delete on public.disparo_alvos     from anon, authenticated;
grant select, insert, update, delete on public.disparo_campanhas to service_role;
grant select, insert, update, delete on public.disparo_alvos     to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: público elegível (32 do REMARKETING + LEAD NOVO com conversa real).
-- "Conversa real" = o contato mandou PELO MENOS uma mensagem (direcao='entrada');
-- quem só entrou mudo (anúncio clicado e abandonado) fica fora.
-- Dedupe por contato: se está nas duas colunas, vale REMARKETING.
-- optout = tem QUALQUER linha em wa_optout (a tela mostra e o disparo exclui).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.disparo_elegiveis(p_org uuid)
returns table (
  contato_id uuid, nome text, telefone text, origem text,
  ultima_msg_em timestamptz, optout boolean
)
language sql stable security definer set search_path = public as $fn$
  with base as (
    select distinct on (o.contato_id)
      o.contato_id,
      case when fc.nome = 'REMARKETING' then 'REMARKETING' else 'LEAD NOVO' end as origem
    from public.oportunidades o
    join public.funil_colunas fc on fc.id = o.coluna_id
    where o.organizacao_id = p_org
      and o.status = 'em_andamento'
      and fc.nome in ('REMARKETING', 'LEAD NOVO')
    order by o.contato_id, (fc.nome = 'REMARKETING') desc
  ),
  falou as (
    select c.contato_id, max(m.criado_em) as ultima
    from public.conversas c
    join public.mensagens m on m.conversa_id = c.id and m.direcao = 'entrada'
    where c.contato_id in (select b.contato_id from base b)
    group by c.contato_id
  ),
  wa as (
    select distinct on (ci.contato_id) ci.contato_id, ci.valor_normalizado
    from public.contato_identidades ci
    where ci.tipo = 'whatsapp' and coalesce(ci.valor_normalizado, '') <> ''
      and ci.contato_id in (select b.contato_id from base b)
    order by ci.contato_id
  )
  select b.contato_id, co.nome, wa.valor_normalizado, b.origem, f.ultima,
         exists (select 1 from public.wa_optout w where w.contato_id = b.contato_id) as optout
  from base b
  join public.contatos co on co.id = b.contato_id and co.mesclado_em is null
  join falou f on f.contato_id = b.contato_id           -- exige conversa real
  join wa on wa.contato_id = b.contato_id               -- exige WhatsApp válido
  where public.papel_na_org(p_org) is not null          -- membro da org (RLS da função)
  order by f.ultima desc;
$fn$;
revoke all on function public.disparo_elegiveis(uuid) from public, anon;
grant execute on function public.disparo_elegiveis(uuid) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: criar campanha (admin|supervisor). Template precisa estar APROVADO e ativo.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.disparo_criar_campanha(
  p_org uuid, p_nome text, p_template uuid, p_canal uuid, p_teto int default 200
) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  if not (public.is_platform_admin() or
      (public.papel_na_org(p_org) = any (array['admin'::user_role, 'supervisor'::user_role]) and public.org_operacional(p_org)))
  then raise exception 'sem_permissao'; end if;

  perform 1 from public.wa_templates t
   where t.id = p_template and t.organizacao_id = p_org and t.ativo and t.status = 'aprovado';
  if not found then raise exception 'template_nao_aprovado'; end if;

  perform 1 from public.canais c
   where c.id = p_canal and c.organizacao_id = p_org and c.transporte = 'cloud_api' and c.ativo;
  if not found then raise exception 'canal_invalido'; end if;

  insert into public.disparo_campanhas (organizacao_id, canal_id, template_id, nome, teto_24h, criado_por)
  values (p_org, p_canal, p_template, nullif(btrim(p_nome), ''), least(greatest(coalesce(p_teto, 200), 1), 200), auth.uid())
  returning id into v_id;
  return v_id;
end $fn$;
revoke all on function public.disparo_criar_campanha(uuid, text, uuid, uuid, int) from public, anon;
grant execute on function public.disparo_criar_campanha(uuid, text, uuid, uuid, int) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: adicionar alvos (admin|supervisor). Snapshot de telefone; opt-out e
-- sem-WhatsApp entram marcados (nunca 'pendente'), para a tela mostrar o porquê.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.disparo_add_alvos(p_campanha uuid, p_contatos uuid[])
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_pend int := 0; v_opt int := 0; v_sem int := 0; v_dup int := 0; v_c uuid; v_tel text;
begin
  select organizacao_id into v_org from public.disparo_campanhas where id = p_campanha and status = 'ativa';
  if v_org is null then raise exception 'campanha_invalida'; end if;
  if not (public.is_platform_admin() or
      (public.papel_na_org(v_org) = any (array['admin'::user_role, 'supervisor'::user_role]) and public.org_operacional(v_org)))
  then raise exception 'sem_permissao'; end if;

  foreach v_c in array coalesce(p_contatos, '{}'::uuid[]) loop
    -- contato tem que ser da MESMA org (nunca cruza organização)
    perform 1 from public.contatos where id = v_c and organizacao_id = v_org and mesclado_em is null;
    if not found then continue; end if;

    select ci.valor_normalizado into v_tel
      from public.contato_identidades ci
     where ci.contato_id = v_c and ci.tipo = 'whatsapp' and coalesce(ci.valor_normalizado, '') <> ''
     limit 1;

    if exists (select 1 from public.wa_optout w where w.contato_id = v_c) then
      insert into public.disparo_alvos (campanha_id, organizacao_id, contato_id, telefone, status, erro)
      values (p_campanha, v_org, v_c, v_tel, 'optout', 'opt-out registrado antes da inclusão')
      on conflict (campanha_id, contato_id) do nothing;
      if found then v_opt := v_opt + 1; else v_dup := v_dup + 1; end if;
    elsif v_tel is null then
      insert into public.disparo_alvos (campanha_id, organizacao_id, contato_id, telefone, status, erro)
      values (p_campanha, v_org, v_c, null, 'pulado', 'sem_whatsapp')
      on conflict (campanha_id, contato_id) do nothing;
      if found then v_sem := v_sem + 1; else v_dup := v_dup + 1; end if;
    else
      insert into public.disparo_alvos (campanha_id, organizacao_id, contato_id, telefone)
      values (p_campanha, v_org, v_c, v_tel)
      on conflict (campanha_id, contato_id) do nothing;
      if found then v_pend := v_pend + 1; else v_dup := v_dup + 1; end if;
    end if;
  end loop;

  return jsonb_build_object('pendentes', v_pend, 'optout', v_opt, 'sem_whatsapp', v_sem, 'ja_existiam', v_dup);
end $fn$;
revoke all on function public.disparo_add_alvos(uuid, uuid[]) from public, anon;
grant execute on function public.disparo_add_alvos(uuid, uuid[]) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- OPT-OUT MANUAL pela tela: quem pediu pra sair "de um jeito criativo" que a
-- regex não pegou. Qualquer membro ativo pode MARCAR (é ação de proteção);
-- DESFAZER é admin|supervisor (reverter opt-out é decisão de gestão).
-- Canal: o cloud_api da org (o par contato+canal é o que o disparo checa).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.wa_optout_manual(p_contato uuid, p_detalhe text default null)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_canal uuid;
begin
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  if public.papel_na_org(v_org) is null and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;

  select id into v_canal from public.canais
   where organizacao_id = v_org and transporte = 'cloud_api' and ativo
   order by (papel in ('disparo', 'ambos')) desc, criado_em
   limit 1;
  if v_canal is null then raise exception 'sem_canal_cloud'; end if;

  perform public.wa_optout_registrar(p_contato, v_canal, 'manual',
    left(coalesce(nullif(btrim(p_detalhe), ''), 'via painel'), 300));
end $fn$;
revoke all on function public.wa_optout_manual(uuid, text) from public, anon;
grant execute on function public.wa_optout_manual(uuid, text) to authenticated, service_role;

create or replace function public.wa_optout_manual_remover(p_contato uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  if not (public.is_platform_admin() or
      (public.papel_na_org(v_org) = any (array['admin'::user_role, 'supervisor'::user_role]) and public.org_operacional(v_org)))
  then raise exception 'sem_permissao'; end if;
  delete from public.wa_optout where contato_id = p_contato and organizacao_id = v_org;
end $fn$;
revoke all on function public.wa_optout_manual_remover(uuid) from public, anon;
grant execute on function public.wa_optout_manual_remover(uuid) to authenticated, service_role;

-- Lista da aba "Excluídos" (leitura, membro da org).
create or replace function public.wa_optout_lista(p_org uuid)
returns table (contato_id uuid, nome text, telefone text, motivo text, detalhe text, criado_em timestamptz)
language sql stable security definer set search_path = public as $fn$
  select w.contato_id, co.nome,
         (select ci.valor_normalizado from public.contato_identidades ci
           where ci.contato_id = w.contato_id and ci.tipo = 'whatsapp' limit 1),
         w.motivo, w.detalhe, w.criado_em
  from public.wa_optout w
  join public.contatos co on co.id = w.contato_id
  where w.organizacao_id = p_org
    and public.papel_na_org(p_org) is not null
  order by w.criado_em desc;
$fn$;
revoke all on function public.wa_optout_lista(uuid) from public, anon;
grant execute on function public.wa_optout_lista(uuid) to authenticated, service_role;
