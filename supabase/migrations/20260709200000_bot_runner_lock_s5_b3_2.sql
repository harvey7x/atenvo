-- ============================================================================
-- BOT — B3.2: lock por conversa (lease) para o bot-runner evitar execução
-- concorrente. Só infraestrutura de lock; não altera webhook/envio/master.
-- ============================================================================
alter table public.bot_conversa_estado
  add column if not exists processando_ate timestamptz;

-- Reivindica a conversa por p_ttl_seg segundos (lease). true = conseguiu; false = já em execução.
create or replace function public.bot_claim_conversa(p_conversa uuid, p_ttl_seg int default 30)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.bot_conversa_estado
    set processando_ate = now() + make_interval(secs => greatest(coalesce(p_ttl_seg,30), 1))
    where conversa_id = p_conversa and (processando_ate is null or processando_ate < now());
  return found;
end $$;

create or replace function public.bot_release_conversa(p_conversa uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.bot_conversa_estado set processando_ate = null where conversa_id = p_conversa;
end $$;

revoke all on function public.bot_claim_conversa(uuid, int) from public, anon;
revoke all on function public.bot_release_conversa(uuid) from public, anon;
grant execute on function public.bot_claim_conversa(uuid, int) to authenticated, service_role;
grant execute on function public.bot_release_conversa(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
