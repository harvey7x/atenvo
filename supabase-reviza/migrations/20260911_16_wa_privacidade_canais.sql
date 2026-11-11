-- Reviza — privacidade das conversas de WhatsApp (pedido do dono 11/09):
-- cada número conectado pertence a UM atendente (dono_id). As conversas e
-- mensagens daquele número só aparecem pro DONO e pra gestor/admin.
-- Canal sem dono (legado/null) fica visível só pra gestor/admin.

alter table public.wa_canais add column if not exists dono_id uuid references public.profiles(id) on delete set null;
create index if not exists wa_canais_dono_idx on public.wa_canais(dono_id);

-- helper: quem pode ver o canal? (security definer evita recursão de RLS)
create or replace function public.wa_pode_ver_canal(p_canal uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_at_least('gestor')
      or exists (select 1 from public.wa_canais c where c.id = p_canal and c.dono_id = auth.uid());
$$;
revoke all on function public.wa_pode_ver_canal(uuid) from public, anon;
grant execute on function public.wa_pode_ver_canal(uuid) to authenticated;

drop policy if exists wa_canais_sel on public.wa_canais;
create policy wa_canais_sel on public.wa_canais for select to authenticated
  using (public.is_at_least('gestor') or dono_id = auth.uid());

drop policy if exists wa_conversas_sel on public.wa_conversas;
create policy wa_conversas_sel on public.wa_conversas for select to authenticated
  using (public.wa_pode_ver_canal(canal_id));
drop policy if exists wa_conversas_upd on public.wa_conversas;
create policy wa_conversas_upd on public.wa_conversas for update to authenticated
  using (public.wa_pode_ver_canal(canal_id)) with check (public.wa_pode_ver_canal(canal_id));

drop policy if exists wa_mensagens_sel on public.wa_mensagens;
create policy wa_mensagens_sel on public.wa_mensagens for select to authenticated
  using (public.wa_pode_ver_canal(canal_id));

-- marcar lida: só quem pode ver a conversa
create or replace function public.wa_marcar_lida(p_conversa uuid) returns void
  language sql security definer set search_path = public as $$
  update public.wa_conversas c set nao_lidas = 0
   where c.id = p_conversa and public.wa_pode_ver_canal(c.canal_id);
$$;
