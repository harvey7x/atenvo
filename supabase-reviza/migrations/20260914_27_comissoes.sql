-- Reviza — COMISSÕES por comercial (áudio do dono 14/09).
-- Regra: a empresa recebe a MENSALIDADE (metade da parcela, valor/2) por mês;
-- o comercial recebe uma % da mensalidade — padrão 50% ("metade da metade").
-- O administrador define a % de cada comercial numa tela; a chave é o NOME
-- (leads.comercial, caixa alta) porque a carteira toda é por nome e a maioria
-- dos comerciais não tem login. Sem linha aqui = 50% no cálculo.
-- Privacidade: comercial só enxerga a PRÓPRIA %; financeiro+ vê todas;
-- editar é gestor/admin.
-- Aplicada 2026-09-14 via MCP como "reviza_27_comissoes".

-- nome do usuário logado (security definer: usável dentro de policies)
create or replace function public.meu_nome()
returns text language sql stable security definer set search_path = public as
$$ select nome from public.profiles where id = auth.uid() $$;
revoke all on function public.meu_nome() from public, anon;
grant execute on function public.meu_nome() to authenticated;

create table public.comissoes (
  comercial   text primary key,                          -- caixa alta, igual a leads.comercial
  pct         numeric(5,2) not null default 50 check (pct >= 0 and pct <= 100),
  updated_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at  timestamptz not null default now()
);
create trigger comissoes_updated_at before update on public.comissoes
  for each row execute function public.tg_set_updated_at();

alter table public.comissoes enable row level security;
create policy comissoes_sel on public.comissoes for select to authenticated
  using (public.is_at_least('financeiro') or upper(comercial) = upper(coalesce(public.meu_nome(), '')));
create policy comissoes_ins on public.comissoes for insert to authenticated
  with check (public.is_at_least('gestor'));
create policy comissoes_upd on public.comissoes for update to authenticated
  using (public.is_at_least('gestor')) with check (public.is_at_least('gestor'));
create policy comissoes_del on public.comissoes for delete to authenticated
  using (public.is_at_least('gestor'));
