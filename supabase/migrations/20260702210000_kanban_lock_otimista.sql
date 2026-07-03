-- Ajustes aplicados APÓS 20260702200000 (não editar a migration anterior, já executada).
-- (a) FKs de oportunidade_eventos -> usuarios (habilitam o embed de nomes no histórico do Kanban).
-- (b) atualizado_em muda a cada UPDATE em oportunidades -> habilita o CONTROLE OTIMISTA por
--     atualizado_em no frontend (antes só o default de insert; "Atualizado em" ficava = criação).
--     clock_timestamp garante mudança mesmo em updates no mesmo tick de transação.
-- Idempotente: pode reaplicar sem efeito colateral.

alter table public.oportunidade_eventos drop constraint if exists oportunidade_eventos_executado_por_fkey;
alter table public.oportunidade_eventos add constraint oportunidade_eventos_executado_por_fkey
  foreign key (executado_por) references public.usuarios(id) on delete set null;
alter table public.oportunidade_eventos drop constraint if exists oportunidade_eventos_resp_fech_fkey;
alter table public.oportunidade_eventos add constraint oportunidade_eventos_resp_fech_fkey
  foreign key (responsavel_no_fechamento_id) references public.usuarios(id) on delete set null;

create or replace function public.opp_touch_atualizado()
returns trigger language plpgsql as $function$
begin NEW.atualizado_em := clock_timestamp(); return NEW; end $function$;
drop trigger if exists trg_opp_touch on public.oportunidades;
create trigger trg_opp_touch before update on public.oportunidades for each row execute function public.opp_touch_atualizado();
