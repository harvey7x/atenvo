-- Bot de REMARKETING — Parte 2. Entrega ADITIVA e INERTE:
--  * nada envia por si só: o worker (edge bot-remarketing) roda com REMARKETING_ATIVO=nao e
--    dry_run=true por default; esta migration só cria estrutura + travas + roteamento.
--  * coluna REMARKETING no Kanban (fila visível), tabela bot_remarketing (estado da cadência),
--    RLS multi-tenant no mesmo padrão dos bot_* (SELECT is_member; writes só service_role),
--    secret p/ o cron, helper de janela (SP seg-sáb 9-18) e RPCs (sync/due/checar/registrar/inbound).
--  * NÃO altera funil_colunas.ordem existente (não há unique de ordem — sem colisão). Idempotente.

-- ========================================================================================
-- 1) Coluna REMARKETING no Kanban (idempotente, em todo funil não arquivado que ainda não tem)
--    ordem=8 (> máximo atual 7=PERDIDO; sem unique de ordem → sem colisão), neutro, NÃO-entrada
--    (não vira porta de auto-entrada do webhook), não encerra oportunidade.
-- ========================================================================================
insert into public.funil_colunas (funil_id, organizacao_id, nome, cor, ordem, arquivada, entrada, resultado, encerra_oportunidade)
select f.id, f.organizacao_id, 'REMARKETING', '#f59e0b', 8, false, false, 'neutro', false
from public.funis f
where f.arquivado = false
  and not exists (
    select 1 from public.funil_colunas c
    where c.funil_id = f.id and c.nome = 'REMARKETING'
  );

-- ========================================================================================
-- 2) Tabela bot_remarketing — estado da cadência por oportunidade
-- ========================================================================================
create table if not exists public.bot_remarketing (
  id                uuid primary key default gen_random_uuid(),
  organizacao_id    uuid not null references public.organizacoes(id) on delete cascade,
  oportunidade_id   uuid not null references public.oportunidades(id) on delete cascade,
  conversa_id       uuid references public.conversas(id) on delete set null,
  contato_id        uuid references public.contatos(id) on delete set null,
  canal_id          uuid references public.canais(id) on delete set null,
  status            text not null default 'ativo'
                      check (status in ('ativo','pausado','respondeu','optout','cancelado','concluido')),
  toque             int  not null default 0,     -- quantos toques já saíram (0..5)
  proximo_em        timestamptz,                 -- quando o próximo toque vence (já snapado na janela)
  ultimo_toque_em   timestamptz,
  criado_em         timestamptz not null default now(),  -- entrada na coluna = base da cadência
  atualizado_em     timestamptz not null default now()
);

-- uma fila ATIVA por oportunidade (permite histórico: linhas encerradas não bloqueiam re-entrada).
create unique index if not exists bot_remarketing_opp_ativa_uk
  on public.bot_remarketing (oportunidade_id)
  where status in ('ativo','pausado');
create index if not exists bot_remarketing_due_idx    on public.bot_remarketing (status, proximo_em);
create index if not exists bot_remarketing_conversa_idx on public.bot_remarketing (conversa_id);
create index if not exists bot_remarketing_contato_idx  on public.bot_remarketing (contato_id);

-- atualizado_em automático
create or replace function public.bot_remarketing_touch_updated()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists trg_bot_remarketing_updated on public.bot_remarketing;
create trigger trg_bot_remarketing_updated before update on public.bot_remarketing
  for each row execute function public.bot_remarketing_touch_updated();

-- RLS: mesmo padrão dos bot_* (leitura org-scoped; escrita só via service_role, que ignora RLS).
alter table public.bot_remarketing enable row level security;
drop policy if exists bot_remarketing_sel on public.bot_remarketing;
create policy bot_remarketing_sel on public.bot_remarketing
  for select using (is_platform_admin() or is_member(organizacao_id));

-- ========================================================================================
-- 3) Secret do cron (idempotente)
-- ========================================================================================
-- secret hex de 64 chars sem pgcrypto (gen_random_bytes vive em extensions, fora do search_path):
-- dois uuids concatenados sem hífen. gen_random_uuid é core (PG13+).
insert into public.webhook_config (chave, secret)
select 'bot_remarketing',
       replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (select 1 from public.webhook_config where chave = 'bot_remarketing');

-- ========================================================================================
-- 4) Helper de janela: empurra um instante p/ o próximo slot válido (seg-sáb, 09:00-18:00, SP)
-- ========================================================================================
create or replace function public.bot_rmkt_snap(p_ts timestamptz)
returns timestamptz language plpgsql stable as $$
declare l timestamp; guard int := 0;
begin
  l := p_ts at time zone 'America/Sao_Paulo';   -- relógio de parede local
  loop
    guard := guard + 1; exit when guard > 30;    -- trava de segurança
    if extract(dow from l) = 0 then               -- domingo → segunda 09:00
      l := date_trunc('day', l) + interval '1 day' + interval '9 hour'; continue;
    end if;
    if extract(hour from l) < 9 then              -- antes das 9 → 09:00 do mesmo dia
      l := date_trunc('day', l) + interval '9 hour';
    end if;
    if extract(hour from l) >= 18 then            -- 18h ou depois → próximo dia 09:00 (revalida domingo)
      l := date_trunc('day', l) + interval '1 day' + interval '9 hour'; continue;
    end if;
    exit;
  end loop;
  return l at time zone 'America/Sao_Paulo';
end $$;

-- ========================================================================================
-- 5) SYNC Kanban → fila: entra quem caiu em REMARKETING; cancela quem saiu da coluna.
--    (o worker chama todo tick; a checagem final no envio é a garantia anti-race.)
-- ========================================================================================
create or replace function public.bot_remarketing_sync()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_entrou int := 0; v_cancelou int := 0;
begin
  -- saiu da coluna (opp movida p/ qualquer outra) → cancela fila ativa
  with moved as (
    select br.id
    from public.bot_remarketing br
    join public.oportunidades o on o.id = br.oportunidade_id
    left join public.funil_colunas c on c.id = o.coluna_id
    where br.status in ('ativo','pausado')
      and (c.nome is distinct from 'REMARKETING')
  )
  update public.bot_remarketing set status = 'cancelado'
  where id in (select id from moved);
  get diagnostics v_cancelou = row_count;

  -- entrou na coluna e ainda não tem fila ativa → cria (base da cadência = agora; 1º toque em D+1)
  with alvo as (
    select o.id as opp, o.organizacao_id, o.contato_id,
           cv.id as conversa_id, cv.canal_id
    from public.oportunidades o
    join public.funil_colunas c on c.id = o.coluna_id and c.nome = 'REMARKETING' and c.arquivada = false
    left join lateral (
      select cvx.id, cvx.canal_id from public.conversas cvx
      where cvx.contato_id = o.contato_id and cvx.status <> 'fechada'
      order by cvx.ultima_interacao_em desc nulls last, cvx.criado_em desc
      limit 1
    ) cv on true
    where not exists (
      select 1 from public.bot_remarketing br
      where br.oportunidade_id = o.id and br.status in ('ativo','pausado')
    )
  )
  insert into public.bot_remarketing (organizacao_id, oportunidade_id, conversa_id, contato_id, canal_id, status, toque, proximo_em)
  select organizacao_id, opp, conversa_id, contato_id, canal_id, 'ativo', 0, public.bot_rmkt_snap(now() + interval '1 day')
  from alvo;
  get diagnostics v_entrou = row_count;

  return jsonb_build_object('entrou', v_entrou, 'cancelou', v_cancelou);
end $$;

-- ========================================================================================
-- 6) DUE: filas prontas p/ o próximo toque, com TODAS as travas (menos janela/teto, que são do worker).
--    Trava "1 toque por opp por dia" (fuso SP) embutida — fim de semana acumulado não dispara em sequência.
-- ========================================================================================
create or replace function public.bot_remarketing_due(p_limit int default 50)
returns table (
  id uuid, oportunidade_id uuid, conversa_id uuid, contato_id uuid, canal_id uuid,
  toque int, criado_em timestamptz
) language sql security definer set search_path = public as $$
  select br.id, br.oportunidade_id, br.conversa_id, br.contato_id, br.canal_id, br.toque, br.criado_em
  from public.bot_remarketing br
  join public.oportunidades o on o.id = br.oportunidade_id
  join public.funil_colunas c on c.id = o.coluna_id and c.nome = 'REMARKETING' and c.arquivada = false
  join public.conversas cv on cv.id = br.conversa_id
  left join public.bot_conversa_estado bce on bce.conversa_id = br.conversa_id
  where br.status = 'ativo'
    and br.proximo_em is not null
    and br.proximo_em <= now()
    -- 1 toque por opp por dia (SP)
    and (br.ultimo_toque_em is null
         or (timezone('America/Sao_Paulo', now()))::date <> (timezone('America/Sao_Paulo', br.ultimo_toque_em))::date)
    -- travas de humano/pausa
    and coalesce(bce.pausado, false) = false
    and coalesce(cv.precisa_humano, false) = false
    and cv.atendente_id is null
    and not exists (select 1 from public.contatos ct where ct.id = br.contato_id and ct.responsavel_id is not null)
    -- precisa de destino whatsapp
    and exists (
      select 1 from public.contato_identidades ci
      where ci.contato_id = br.contato_id and ci.tipo = 'whatsapp' and ci.valor_normalizado is not null
    )
  order by br.proximo_em asc
  limit greatest(p_limit, 0);
$$;

-- ========================================================================================
-- 7) CHECAR ENVIO (garantia anti-race no instante do disparo): relê a coluna sob lock.
--    Se a opp NÃO está mais em REMARKETING (time fechou/moveu), cancela e devolve false → não envia.
-- ========================================================================================
create or replace function public.bot_remarketing_checar_envio(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_nome text; v_status text;
begin
  select c.nome, br.status into v_nome, v_status
  from public.bot_remarketing br
  join public.oportunidades o on o.id = br.oportunidade_id
  left join public.funil_colunas c on c.id = o.coluna_id
  where br.id = p_id
  for update of br;
  if not found then return false; end if;
  if v_status <> 'ativo' or v_nome is distinct from 'REMARKETING' then
    update public.bot_remarketing set status = 'cancelado' where id = p_id and status = 'ativo';
    return false;
  end if;
  return true;
end $$;

-- ========================================================================================
-- 8) REGISTRAR TOQUE (após o envio): avança a cadência D+1,3,6,10,15 (offset desde a entrada).
--    5º toque enviado → concluido. Calcula proximo_em internamente (snapado na janela).
-- ========================================================================================
create or replace function public.bot_remarketing_registrar_toque(p_id uuid)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  cadencia int[] := array[1,3,6,10,15];
  v_base timestamptz; v_toque int; v_novo int; v_prox timestamptz;
begin
  select criado_em, toque into v_base, v_toque
  from public.bot_remarketing where id = p_id for update;
  if not found then return null; end if;
  v_novo := v_toque + 1;
  if v_novo >= array_length(cadencia, 1) then
    update public.bot_remarketing
      set toque = v_novo, ultimo_toque_em = now(), proximo_em = null, status = 'concluido'
      where id = p_id;
    return null;
  end if;
  -- próximo toque é o índice (v_novo+1) da cadência 1-based; base = entrada na coluna
  v_prox := public.bot_rmkt_snap(v_base + (cadencia[v_novo + 1] || ' days')::interval);
  update public.bot_remarketing
    set toque = v_novo, ultimo_toque_em = now(), proximo_em = v_prox
    where id = p_id;
  return v_prox;
end $$;

-- ========================================================================================
-- 9) INBOUND durante remarketing: lead respondeu → volta p/ LEAD NOVO (entrada) ANTES de o
--    runner checar elegibilidade; opt-out → PERDIDO. Chamado pelo webhook (best-effort, 1 linha).
--    Retorna 'respondeu' | 'optout' | 'sem_remarketing'.
-- ========================================================================================
create or replace function public.bot_remarketing_inbound(p_conversa uuid, p_texto text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_contato uuid; v_br uuid; v_opp uuid; v_funil uuid; v_optout boolean; v_col uuid; v_alvo text;
begin
  select contato_id into v_contato from public.conversas where id = p_conversa;
  if v_contato is null then return 'sem_remarketing'; end if;

  select br.id, o.id, o.funil_id into v_br, v_opp, v_funil
  from public.bot_remarketing br
  join public.oportunidades o on o.id = br.oportunidade_id
  where o.contato_id = v_contato and br.status in ('ativo','pausado')
  order by br.criado_em desc
  limit 1;
  if v_br is null then return 'sem_remarketing'; end if;

  -- opt-out: pedido explícito de parar (sagrado). Regex conservadora, com variantes acentuadas
  -- inline (sem depender de unaccent — não instalada; zero dependência nova).
  v_optout := (coalesce(p_texto, '') ~* '\y(sair|parar|pare|para de|n[ãa]o quero|descadastr|remover|cancelar? inscri|stop|chega)\y');

  if v_optout then
    update public.bot_remarketing set status = 'optout' where id = v_br;
    v_alvo := 'PERDIDO';
  else
    update public.bot_remarketing set status = 'respondeu' where id = v_br;
    v_alvo := 'LEAD NOVO';
  end if;

  -- move a opp p/ a coluna alvo do MESMO funil (LEAD NOVO=entrada reabre o runner; PERDIDO encerra).
  select id into v_col from public.funil_colunas
  where funil_id = v_funil and nome = v_alvo and arquivada = false limit 1;
  if v_col is not null then
    update public.oportunidades set coluna_id = v_col where id = v_opp;
  end if;

  return case when v_optout then 'optout' else 'respondeu' end;
end $$;

-- ========================================================================================
-- 10) Grants: só service_role (edge/webhook). Leitura via RLS já cobre o app.
-- ========================================================================================
grant execute on function public.bot_remarketing_sync()               to service_role;
grant execute on function public.bot_remarketing_due(int)             to service_role;
grant execute on function public.bot_remarketing_checar_envio(uuid)   to service_role;
grant execute on function public.bot_remarketing_registrar_toque(uuid) to service_role;
grant execute on function public.bot_remarketing_inbound(uuid, text)  to service_role;
