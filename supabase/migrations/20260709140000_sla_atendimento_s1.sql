-- ============================================================================
-- ALERTAS DE ATENDIMENTO / SLA — S1 (dados + motor, SEM automação ligada)
-- Cria config, campos de tempo, tabela de alertas e RPCs. NÃO agenda cron (S2),
-- NÃO mexe em front, e-mail/push, health check WA, alertas globais WA, Relatórios,
-- Ficha, Cobranças, distribuição, nem no bot (B3). sla_avaliar só roda se chamada.
-- ============================================================================

-- ===== 1) sla_config (thresholds por org; defaults aplicados por coalesce no motor) =====
create table if not exists public.sla_config (
  organizacao_id               uuid primary key references public.organizacoes(id) on delete cascade,
  ativo                        boolean not null default true,
  lead_novo_sem_resposta_min   int not null default 5,
  qualificado_aguardando_min   int not null default 10,
  lead_quente_sem_resposta_min int not null default 15,
  atendimento_sem_avanco_horas int not null default 2,
  kanban_sem_avanco_horas      int not null default 24,
  prazo_risco_horas            int not null default 40,
  prazo_fechamento_horas       int not null default 48,
  criado_em                    timestamptz not null default now(),
  atualizado_em                timestamptz not null default now()
);
drop trigger if exists trg_sla_config_upd on public.sla_config;
create trigger trg_sla_config_upd before update on public.sla_config
  for each row execute function public.set_atualizado_em();

-- ===== 2) oportunidades: entrada_em + movimentado_em (só muda em troca de coluna) =====
alter table public.oportunidades
  add column if not exists entrada_em     timestamptz not null default now(),
  add column if not exists movimentado_em timestamptz not null default now();
-- backfill de linhas existentes (idempotente: só onde ainda está no default de agora)
update public.oportunidades
  set entrada_em = criado_em,
      movimentado_em = coalesce(atualizado_em, criado_em)
  where entrada_em >= now() - interval '5 minutes';   -- recém-adicionadas pelo default

-- movimentado_em só avança quando coluna_id muda (NÃO em edição de nome/etc)
create or replace function public.sla_opp_movimento()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.entrada_em     := coalesce(new.entrada_em, now());
    new.movimentado_em := coalesce(new.movimentado_em, now());
  elsif new.coluna_id is distinct from old.coluna_id then
    new.movimentado_em := clock_timestamp();
  end if;
  return new;
end $$;
drop trigger if exists trg_sla_opp_movimento on public.oportunidades;
create trigger trg_sla_opp_movimento before insert or update on public.oportunidades
  for each row execute function public.sla_opp_movimento();

-- ===== 3) conversas: precisa_humano =====
alter table public.conversas
  add column if not exists precisa_humano        boolean not null default false,
  add column if not exists precisa_humano_motivo text,
  add column if not exists precisa_humano_em     timestamptz;

-- ===== 4) sla_alertas (instâncias, com dedup de alerta ativo por tipo/alvo) =====
create table if not exists public.sla_alertas (
  id               uuid primary key default gen_random_uuid(),
  organizacao_id   uuid not null references public.organizacoes(id) on delete cascade,
  tipo             text not null check (tipo in (
    'atendimento_sem_resposta','cliente_qualificado_aguardando_atendimento','lead_quente_aguardando',
    'audio_recebido_precisa_humano','parado_ha_muito_tempo','prazo_2_dias_em_risco','prazo_2_dias_estourado')),
  severidade       text not null check (severidade in ('leve','amarelo','vermelho','critico','imediato')),
  conversa_id      uuid references public.conversas(id) on delete cascade,
  oportunidade_id  uuid references public.oportunidades(id) on delete cascade,
  contato_id       uuid references public.contatos(id) on delete set null,
  responsavel_id   uuid references public.usuarios(id) on delete set null,
  titulo           text not null,
  detalhe          text,
  vence_em         timestamptz,
  dedup_key        text not null,                          -- tipo:alvo (1 ativo por vez)
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  resolvido_em     timestamptz,
  resolvido_por    uuid references public.usuarios(id) on delete set null,
  resolucao        text,                                   -- 'auto' | 'manual'
  silenciado_ate   timestamptz,
  silenciado_por   uuid references public.usuarios(id) on delete set null,
  silenciado_motivo text
);
-- dedup: no máximo 1 alerta ATIVO (não resolvido) por (org, tipo, alvo)
create unique index if not exists uq_sla_alerta_ativo
  on public.sla_alertas(organizacao_id, dedup_key) where resolvido_em is null;
create index if not exists idx_sla_alertas_org_ativo on public.sla_alertas(organizacao_id) where resolvido_em is null;
create index if not exists idx_sla_alertas_resp on public.sla_alertas(responsavel_id) where resolvido_em is null;
drop trigger if exists trg_sla_alertas_upd on public.sla_alertas;
create trigger trg_sla_alertas_upd before update on public.sla_alertas
  for each row execute function public.set_atualizado_em();

-- ===== 5) sla_avaliar: motor idempotente (upsert de vigentes + auto-resolução) =====
create or replace function public.sla_avaliar(p_org uuid default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_ativos int; v_resolvidos int; v_criados int;
begin
  drop table if exists _conv; drop table if exists _opp; drop table if exists _vig;

  create temp table _conv on commit drop as
  select c.id, c.organizacao_id, c.contato_id, c.atendente_id, c.status, c.criado_em,
         e.etapa as bot_etapa, coalesce(e.lead_quente,false) as lead_quente, e.concluido_em,
         coalesce(c.precisa_humano,false) as precisa_humano, c.precisa_humano_motivo,
         ui.ult_in, uh.ult_humano,
         (ui.ult_in is not null and (uh.ult_humano is null or uh.ult_humano < ui.ult_in)) as aguardando,
         coalesce(sc.lead_novo_sem_resposta_min,5)   as th_novo,
         coalesce(sc.qualificado_aguardando_min,10)  as th_qual,
         coalesce(sc.lead_quente_sem_resposta_min,15) as th_quente,
         coalesce(sc.atendimento_sem_avanco_horas,2) as th_atend_h
  from public.conversas c
  left join public.bot_conversa_estado e on e.conversa_id = c.id
  left join public.sla_config sc on sc.organizacao_id = c.organizacao_id
  left join lateral (select max(coalesce(m.recebida_em,m.criado_em)) as ult_in
                     from public.mensagens m where m.conversa_id=c.id and m.direcao='entrada') ui on true
  left join lateral (select max(coalesce(m.enviada_em,m.criado_em)) as ult_humano
                     from public.mensagens m where m.conversa_id=c.id and m.direcao='saida'
                       and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
                            or (m.autor_id is null and m.origem='telefone'))) uh on true
  where c.arquivada_em is null and c.status in ('aberta','em_atendimento','pendente')
    and coalesce(sc.ativo,true) and (p_org is null or c.organizacao_id = p_org);

  create temp table _opp on commit drop as
  select o.id, o.organizacao_id, o.contato_id, o.responsavel_id, o.entrada_em, o.movimentado_em,
         coalesce(sc.kanban_sem_avanco_horas,24) as th_kanban,
         coalesce(sc.prazo_risco_horas,40)       as th_risco,
         coalesce(sc.prazo_fechamento_horas,48)  as th_prazo
  from public.oportunidades o
  left join public.sla_config sc on sc.organizacao_id = o.organizacao_id
  where o.status = 'em_andamento' and coalesce(sc.ativo,true) and (p_org is null or o.organizacao_id = p_org);

  create temp table _vig (
    organizacao_id uuid, tipo text, severidade text, conversa_id uuid, oportunidade_id uuid,
    contato_id uuid, responsavel_id uuid, titulo text, detalhe text, vence_em timestamptz, dedup_key text
  ) on commit drop;

  -- Regra 1: lead novo sem resposta humana (>5min) — leve
  insert into _vig select organizacao_id,'atendimento_sem_resposta','leve',id,null,contato_id,null,
    '⚠️ Lead novo sem resposta há '||floor(extract(epoch from (now()-ult_in))/60)::int||' min.',
    'Lead novo aguardando a primeira resposta humana.', null,'atendimento_sem_resposta:'||id
  from _conv where atendente_id is null and aguardando and not lead_quente
    and bot_etapa is distinct from 'concluido' and ult_in < now() - make_interval(mins => th_novo);

  -- Regra 5: em atendimento sem avanço (>2h) — amarelo (mesmo tipo, alvo exclusivo por ter atendente)
  insert into _vig select organizacao_id,'atendimento_sem_resposta','amarelo',id,null,contato_id,atendente_id,
    '⚠️ Atendimento sem avanço há '||floor(extract(epoch from (now()-ult_in))/3600)::int||' h.',
    'Cliente em atendimento aguardando retorno.', null,'atendimento_sem_resposta:'||id
  from _conv where atendente_id is not null and aguardando and ult_in < now() - make_interval(hours => th_atend_h);

  -- Regra 2: qualificado pelo bot aguardando atendente (>10min) — amarelo
  insert into _vig select organizacao_id,'cliente_qualificado_aguardando_atendimento','amarelo',id,null,contato_id,null,
    '🟡 Lead qualificado aguardando atendimento há '||floor(extract(epoch from (now()-concluido_em))/60)::int||' min.',
    'Bot concluiu a triagem; nenhum humano assumiu.', null,'cliente_qualificado_aguardando_atendimento:'||id
  from _conv where bot_etapa='concluido' and atendente_id is null and concluido_em is not null
    and concluido_em < now() - make_interval(mins => th_qual);

  -- Regra 3: lead quente sem resposta (>15min) — vermelho
  insert into _vig select organizacao_id,'lead_quente_aguardando','vermelho',id,null,contato_id,null,
    '🚨 Lead quente parado há '||floor(extract(epoch from (now()-ult_in))/60)::int||' min. Chamar agora.',
    'Lead quente sem resposta humana.', null,'lead_quente_aguardando:'||id
  from _conv where lead_quente and atendente_id is null and aguardando and ult_in < now() - make_interval(mins => th_quente);

  -- Regra 4: áudio recebido durante o bot — imediato
  insert into _vig select organizacao_id,'audio_recebido_precisa_humano','imediato',id,null,contato_id,atendente_id,
    '🎧 Cliente enviou áudio durante a triagem. Atendimento humano necessário.',
    'Cliente mandou áudio; o bot pausou e pediu texto.', null,'audio_recebido_precisa_humano:'||id
  from _conv where precisa_humano and precisa_humano_motivo = 'audio';

  -- Regra 6: Kanban sem movimento (>24h) — vermelho
  insert into _vig select organizacao_id,'parado_ha_muito_tempo','vermelho',null,id,contato_id,responsavel_id,
    '⏳ Oportunidade parada há '||floor(extract(epoch from (now()-movimentado_em))/3600)::int||' h no Kanban.',
    'Card sem avanço de coluna.', null,'parado_ha_muito_tempo:'||id
  from _opp where movimentado_em < now() - make_interval(hours => th_kanban);

  -- Regra 7a: prazo de 2 dias em risco (>=40h e <48h) — vermelho
  insert into _vig select organizacao_id,'prazo_2_dias_em_risco','vermelho',null,id,contato_id,responsavel_id,
    '⏰ Cliente perto de 2 dias sem fechamento.',
    'Entrada há '||floor(extract(epoch from (now()-entrada_em))/3600)::int||' h; prazo de 48h se aproximando.',
    entrada_em + make_interval(hours => th_prazo),'prazo_2_dias_em_risco:'||id
  from _opp where entrada_em <= now() - make_interval(hours => th_risco)
             and entrada_em >  now() - make_interval(hours => th_prazo);

  -- Regra 7b: prazo de 2 dias estourado (>=48h) — crítico
  insert into _vig select organizacao_id,'prazo_2_dias_estourado','critico',null,id,contato_id,responsavel_id,
    '🚨 Cliente há 2 dias sem fechamento. Prioridade máxima.',
    'Entrada há '||floor(extract(epoch from (now()-entrada_em))/3600)::int||' h (>48h).',
    entrada_em + make_interval(hours => th_prazo),'prazo_2_dias_estourado:'||id
  from _opp where entrada_em <= now() - make_interval(hours => th_prazo);

  -- upsert (1 por dedup_key ativo; mantém a maior severidade se colidir)
  insert into public.sla_alertas
    (organizacao_id, tipo, severidade, conversa_id, oportunidade_id, contato_id, responsavel_id, titulo, detalhe, vence_em, dedup_key)
  select distinct on (organizacao_id, dedup_key)
    organizacao_id, tipo, severidade, conversa_id, oportunidade_id, contato_id, responsavel_id, titulo, detalhe, vence_em, dedup_key
  from _vig
  order by organizacao_id, dedup_key,
    case severidade when 'imediato' then 5 when 'critico' then 4 when 'vermelho' then 3 when 'amarelo' then 2 else 1 end desc
  on conflict (organizacao_id, dedup_key) where resolvido_em is null do update set
    severidade = excluded.severidade, titulo = excluded.titulo, detalhe = excluded.detalhe,
    responsavel_id = excluded.responsavel_id, vence_em = excluded.vence_em, atualizado_em = now();
  get diagnostics v_criados = row_count;

  -- auto-resolução: alertas ativos cuja condição não vigora mais
  update public.sla_alertas a set resolvido_em = now(), resolucao = 'auto', atualizado_em = now()
  where a.resolvido_em is null and (p_org is null or a.organizacao_id = p_org)
    and not exists (select 1 from _vig v where v.organizacao_id = a.organizacao_id and v.dedup_key = a.dedup_key);
  get diagnostics v_resolvidos = row_count;

  select count(*) into v_ativos from public.sla_alertas
    where resolvido_em is null and (p_org is null or organizacao_id = p_org);

  return jsonb_build_object('ativos', v_ativos, 'upsertados', v_criados, 'auto_resolvidos', v_resolvidos);
end $$;

-- ===== 6) sla_alertas_ativos: lista para UI, ciente de papel =====
create or replace function public.sla_alertas_ativos(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_admin boolean; r jsonb;
begin
  if not (public.is_platform_admin() or public.is_member(p_org)) then
    raise exception 'sem_acesso' using errcode='insufficient_privilege';
  end if;
  v_admin := public.is_platform_admin() or public.papel_na_org(p_org) = any (array['admin','supervisor']::user_role[]);

  with vis as (
    select * from public.sla_alertas a
    where a.organizacao_id = p_org and a.resolvido_em is null
      and (a.silenciado_ate is null or a.silenciado_ate < now())
      and (v_admin or a.responsavel_id = v_uid)     -- atendente vê só a própria fila
  )
  select jsonb_build_object(
    'total', (select count(*) from vis),
    'imediatos', (select count(*) from vis where severidade='imediato'),
    'criticos', (select count(*) from vis where severidade in ('critico')),
    'vermelhos', (select count(*) from vis where severidade='vermelho'),
    'amarelos', (select count(*) from vis where severidade='amarelo'),
    'leves', (select count(*) from vis where severidade='leve'),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', id, 'tipo', tipo, 'severidade', severidade, 'titulo', titulo, 'detalhe', detalhe,
        'conversa_id', conversa_id, 'oportunidade_id', oportunidade_id, 'contato_id', contato_id,
        'responsavel_id', responsavel_id, 'vence_em', vence_em, 'criado_em', criado_em
      ) order by case severidade when 'imediato' then 5 when 'critico' then 4 when 'vermelho' then 3 when 'amarelo' then 2 else 1 end desc, criado_em asc)
      from vis), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- ===== 7) sla_silenciar / sla_resolver (admin/supervisor OU responsável) =====
create or replace function public.sla_silenciar(p_alerta uuid, p_ate timestamptz, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a record;
begin
  select * into a from public.sla_alertas where id = p_alerta;
  if a.id is null then raise exception 'alerta_nao_encontrado'; end if;
  if not (public.is_platform_admin()
          or (public.is_member(a.organizacao_id) and public.papel_na_org(a.organizacao_id) = any(array['admin','supervisor']::user_role[]))
          or a.responsavel_id = auth.uid()) then
    raise exception 'sem_permissao';
  end if;
  if p_motivo is null or btrim(p_motivo)='' then raise exception 'motivo_obrigatorio'; end if;
  update public.sla_alertas set silenciado_ate = p_ate, silenciado_por = auth.uid(), silenciado_motivo = p_motivo
    where id = p_alerta;
  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(),'sla_silenciar','sla_alertas',p_alerta,jsonb_build_object('ate',p_ate,'motivo',p_motivo),a.organizacao_id);
  return jsonb_build_object('ok', true, 'alerta', p_alerta);
end $$;

create or replace function public.sla_resolver(p_alerta uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare a record;
begin
  select * into a from public.sla_alertas where id = p_alerta;
  if a.id is null then raise exception 'alerta_nao_encontrado'; end if;
  if not (public.is_platform_admin()
          or (public.is_member(a.organizacao_id) and public.papel_na_org(a.organizacao_id) = any(array['admin','supervisor']::user_role[]))
          or a.responsavel_id = auth.uid()) then
    raise exception 'sem_permissao';
  end if;
  update public.sla_alertas set resolvido_em = now(), resolvido_por = auth.uid(), resolucao = 'manual'
    where id = p_alerta and resolvido_em is null;
  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(),'sla_resolver','sla_alertas',p_alerta,'{}'::jsonb,a.organizacao_id);
  return jsonb_build_object('ok', true, 'alerta', p_alerta);
end $$;

-- ===== 8) RLS + grants =====
alter table public.sla_config  enable row level security;
alter table public.sla_alertas enable row level security;
drop policy if exists sla_config_sel on public.sla_config;
create policy sla_config_sel on public.sla_config for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));
drop policy if exists sla_alertas_sel on public.sla_alertas;
create policy sla_alertas_sel on public.sla_alertas for select to authenticated
  using (public.is_platform_admin() or public.is_member(organizacao_id));

grant select on public.sla_config, public.sla_alertas to authenticated;
grant select, insert, update, delete on public.sla_config, public.sla_alertas to service_role;

do $g$
declare fn text;
begin
  foreach fn in array array[
    'sla_avaliar(uuid)','sla_alertas_ativos(uuid)','sla_silenciar(uuid, timestamptz, text)','sla_resolver(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon;', fn);
    execute format('grant execute on function public.%s to authenticated, service_role;', fn);
  end loop;
end $g$;

-- ===== 9) seed do sla_config para a org (defaults; configurável depois) =====
insert into public.sla_config (organizacao_id) values ('de300000-0000-4000-8000-000000000001')
on conflict (organizacao_id) do nothing;

notify pgrst, 'reload schema';
