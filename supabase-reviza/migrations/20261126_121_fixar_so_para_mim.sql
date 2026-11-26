-- 121 · FIXAR SÓ PARA MIM (26/11, "igual" à lista de conversas do sistema que a Reviza usava antes: "fixar para mim" e
-- "fixar para todos"). O fixar de sempre (conversas.fixada_em) continua valendo para a equipe toda; este guarda, por
-- pessoa, as conversas que ELA quer no topo da lista dela. Cada um só lê as suas. ADITIVA.

create table if not exists public.atd_fixadas_minhas (
  usuario_id      uuid not null references public.usuarios(id) on delete cascade,
  conversa_id     uuid not null references public.conversas(id) on delete cascade,
  organizacao_id  uuid not null,
  fixada_em       timestamptz not null default now(),
  primary key (usuario_id, conversa_id)
);
alter table public.atd_fixadas_minhas enable row level security;
drop policy if exists atd_fixadas_minhas_ler on public.atd_fixadas_minhas;
create policy atd_fixadas_minhas_ler on public.atd_fixadas_minhas for select to authenticated using (usuario_id = (select auth.uid()));
revoke all on public.atd_fixadas_minhas from public, anon;
grant select on public.atd_fixadas_minhas to authenticated;

create or replace function public.atd_fixar_para_mim(p_conversa uuid, p_fixar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_eu uuid := auth.uid();
begin
  if v_eu is null then raise exception 'sem_permissao'; end if;
  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not exists (select 1 from public.organizacao_usuarios ou where ou.organizacao_id = v_org and ou.usuario_id = v_eu and ou.status = 'ativo') then
    raise exception 'sem_permissao';
  end if;
  if p_fixar then
    insert into public.atd_fixadas_minhas (usuario_id, conversa_id, organizacao_id) values (v_eu, p_conversa, v_org)
    on conflict (usuario_id, conversa_id) do update set fixada_em = now();
  else
    delete from public.atd_fixadas_minhas where usuario_id = v_eu and conversa_id = p_conversa;
  end if;
end $$;
revoke all on function public.atd_fixar_para_mim(uuid, boolean) from public, anon;
grant execute on function public.atd_fixar_para_mim(uuid, boolean) to authenticated;

-- DESFAZER: drop function if exists public.atd_fixar_para_mim(uuid, boolean); drop table if exists public.atd_fixadas_minhas;
