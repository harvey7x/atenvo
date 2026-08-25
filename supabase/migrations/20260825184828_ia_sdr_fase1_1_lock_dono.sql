-- IA SDR Fase 1.1 — lease de canal com DONO (achados da revisão adversarial):
--  * a renovação era um NO-OP enquanto a lease valia (on conflict … where lock_until < now()):
--    o detentor não conseguia renovar e a lease expirava no meio de um turno longo — outra
--    invocação podia entrar no MESMO canal (quebrando o serial por chip);
--  * o unlock era incondicional: um worker atrasado derrubava a lease de outro.
-- Agora cada invocação gera um dono (uuid) — renovar = mesmo dono; unlock só do próprio dono.

alter table public.ia_canal_locks add column if not exists dono uuid;

drop function if exists public.ia_canal_lock(uuid, integer);
drop function if exists public.ia_canal_unlock(uuid);

create or replace function public.ia_canal_lock(p_canal uuid, p_dono uuid, p_ttl_seg integer default 240)
returns boolean
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
begin
  insert into public.ia_canal_locks (canal_id, dono, lock_until)
  values (p_canal, p_dono, now() + make_interval(secs => greatest(coalesce(p_ttl_seg, 240), 5)))
  on conflict (canal_id) do update
    set dono = excluded.dono, lock_until = excluded.lock_until
    where ia_canal_locks.lock_until < now() or ia_canal_locks.dono = excluded.dono;
  return found;
end $fn$;

create or replace function public.ia_canal_unlock(p_canal uuid, p_dono uuid)
returns void
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
begin
  update public.ia_canal_locks set lock_until = now()
    where canal_id = p_canal and dono = p_dono;
end $fn$;
