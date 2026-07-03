-- ETAPA 2A — Semântica de fechamento do Kanban (fonte ÚNICA: funil_colunas.resultado).
-- Ganho/perdido NÃO dependem mais do NOME da coluna. Sincronização atômica coluna↔status↔fechado_em
-- por trigger; snapshot imutável do responsável no fechamento; histórico de ganho/perda/reabertura.

-- 1) funil_colunas: resultado estruturado + flag terminal
alter table public.funil_colunas
  add column if not exists resultado text not null default 'neutro',
  add column if not exists encerra_oportunidade boolean not null default false;
alter table public.funil_colunas drop constraint if exists funil_colunas_resultado_chk;
alter table public.funil_colunas add constraint funil_colunas_resultado_chk check (resultado in ('neutro','ganho','perdido'));

-- 2) oportunidades: snapshot de fechamento + motivos
alter table public.oportunidades
  add column if not exists fechado_por_id uuid references public.usuarios(id) on delete set null,
  add column if not exists responsavel_no_fechamento_id uuid references public.usuarios(id) on delete set null,
  add column if not exists motivo_perda text,
  add column if not exists motivo_perda_desc text,
  add column if not exists motivo_reabertura text,
  add column if not exists fechado_em_estimado boolean not null default false;
alter table public.oportunidades drop constraint if exists oportunidades_motivo_perda_chk;
alter table public.oportunidades add constraint oportunidades_motivo_perda_chk
  check (motivo_perda is null or motivo_perda in ('sem_interesse','nao_respondeu','nao_elegivel','concorrente','dados_invalidos','outro'));
create index if not exists idx_opp_fechamento on public.oportunidades(organizacao_id, status, fechado_em);

-- 3) histórico imutável de eventos de fechamento/reabertura
create table if not exists public.oportunidade_eventos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  oportunidade_id uuid not null references public.oportunidades(id) on delete cascade,
  evento text not null check (evento in ('ganho','perdido','reaberto')),
  coluna_anterior_id uuid,
  coluna_nova_id uuid,
  status_anterior text,
  status_novo text,
  resultado_anterior text,
  resultado_novo text,
  motivo_perda text,
  motivo_reabertura text,
  responsavel_no_fechamento_id uuid,
  executado_por uuid,
  criado_em timestamptz not null default now()
);
create index if not exists idx_opp_eventos_opp on public.oportunidade_eventos(oportunidade_id, criado_em);
create index if not exists idx_opp_eventos_org on public.oportunidade_eventos(organizacao_id, criado_em);
alter table public.oportunidade_eventos enable row level security;
drop policy if exists opp_eventos_sel on public.oportunidade_eventos;
create policy opp_eventos_sel on public.oportunidade_eventos for select using (is_platform_admin() or is_member(organizacao_id));
-- INSERT apenas via trigger SECURITY DEFINER (sem policy de insert p/ authenticated).

-- 4) trigger de sincronização atômica coluna ↔ status ↔ fechado_em (+ histórico)
create or replace function public.opp_sync_fechamento()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_novo text; v_antigo text; v_uid uuid := auth.uid();
begin
  if NEW.coluna_id is not distinct from OLD.coluna_id then return NEW; end if;
  select coalesce(resultado,'neutro') into v_novo from public.funil_colunas where id = NEW.coluna_id;
  select coalesce(resultado,'neutro') into v_antigo from public.funil_colunas where id = OLD.coluna_id;
  v_novo := coalesce(v_novo,'neutro'); v_antigo := coalesce(v_antigo,'neutro');
  if v_novo = v_antigo then return NEW; end if;

  if v_novo = 'ganho' then
    NEW.status := 'ganho';
    NEW.fechado_em := coalesce(NEW.fechado_em, now());
    NEW.fechado_por_id := coalesce(NEW.fechado_por_id, v_uid);
    NEW.responsavel_no_fechamento_id := NEW.responsavel_id;   -- snapshot no momento do fechamento
    NEW.motivo_perda := null; NEW.motivo_perda_desc := null;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,responsavel_no_fechamento_id,executado_por)
      values (NEW.organizacao_id,NEW.id,'ganho',OLD.coluna_id,NEW.coluna_id,OLD.status,'ganho',v_antigo,'ganho',NEW.responsavel_id,v_uid);

  elsif v_novo = 'perdido' then
    if NEW.motivo_perda is null then raise exception 'motivo_perda_obrigatorio' using errcode='check_violation'; end if;
    if NEW.motivo_perda='outro' and coalesce(btrim(NEW.motivo_perda_desc),'')='' then raise exception 'motivo_perda_desc_obrigatorio' using errcode='check_violation'; end if;
    NEW.status := 'perdido';
    NEW.fechado_em := coalesce(NEW.fechado_em, now());
    NEW.fechado_por_id := coalesce(NEW.fechado_por_id, v_uid);
    NEW.responsavel_no_fechamento_id := NEW.responsavel_id;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,motivo_perda,responsavel_no_fechamento_id,executado_por)
      values (NEW.organizacao_id,NEW.id,'perdido',OLD.coluna_id,NEW.coluna_id,OLD.status,'perdido',v_antigo,'perdido',NEW.motivo_perda,NEW.responsavel_id,v_uid);

  elsif v_antigo in ('ganho','perdido') and v_novo = 'neutro' then   -- reabertura
    if coalesce(btrim(NEW.motivo_reabertura),'')='' then raise exception 'motivo_reabertura_obrigatorio' using errcode='check_violation'; end if;
    insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_anterior_id,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,motivo_reabertura,executado_por)
      values (NEW.organizacao_id,NEW.id,'reaberto',OLD.coluna_id,NEW.coluna_id,OLD.status,'em_andamento',v_antigo,'neutro',NEW.motivo_reabertura,v_uid);
    NEW.status := 'em_andamento';
    NEW.fechado_em := null; NEW.fechado_por_id := null; NEW.responsavel_no_fechamento_id := null;
    NEW.motivo_perda := null; NEW.motivo_perda_desc := null; NEW.motivo_reabertura := null; -- consumido; histórico preserva
  end if;
  return NEW;
end $function$;

drop trigger if exists trg_opp_sync_fechamento on public.oportunidades;
create trigger trg_opp_sync_fechamento before update of coluna_id on public.oportunidades
  for each row execute function public.opp_sync_fechamento();

-- 5) leitura do histórico (RLS restringe por organização; INSERT só via trigger definer)
grant select on public.oportunidade_eventos to authenticated;

-- 6) config do funil (aprovada): CLIENTE FECHADO = ganho; criar coluna PERDIDO no mesmo funil
update public.funil_colunas set resultado='ganho', encerra_oportunidade=true
  where organizacao_id='de300000-0000-4000-8000-000000000001' and nome='CLIENTE FECHADO';
insert into public.funil_colunas (organizacao_id, funil_id, nome, cor, ordem, resultado, encerra_oportunidade, arquivada)
  select fc.organizacao_id, fc.funil_id, 'PERDIDO', '#B42318', coalesce((select max(ordem) from public.funil_colunas x where x.funil_id=fc.funil_id),0)+1, 'perdido', true, false
  from public.funil_colunas fc
  where fc.organizacao_id='de300000-0000-4000-8000-000000000001' and fc.resultado='ganho'
    and not exists (select 1 from public.funil_colunas p where p.funil_id=fc.funil_id and p.resultado='perdido');

-- 7) backfill seguro (genérico): cards em coluna de GANHO ainda 'em_andamento' -> 'ganho'.
--    fechado_em = melhor evidência (atualizado_em); marcado fechado_em_estimado=true. Sem inventar fechado_por.
insert into public.oportunidade_eventos(organizacao_id,oportunidade_id,evento,coluna_nova_id,status_anterior,status_novo,resultado_anterior,resultado_novo,responsavel_no_fechamento_id,executado_por,criado_em)
  select o.organizacao_id, o.id, 'ganho', o.coluna_id, 'em_andamento','ganho','neutro','ganho', o.responsavel_id, null, coalesce(o.atualizado_em, now())
  from public.oportunidades o join public.funil_colunas fc on fc.id=o.coluna_id
  where fc.resultado='ganho' and o.status='em_andamento';
update public.oportunidades o set
  status='ganho', fechado_em=coalesce(o.fechado_em, o.atualizado_em, now()), fechado_em_estimado=true, responsavel_no_fechamento_id=o.responsavel_id
  from public.funil_colunas fc
  where fc.id=o.coluna_id and fc.resultado='ganho' and o.status='em_andamento';
