-- =====================================================================
-- 42 — Abrir ciclo VAZIO + Esvaziar todos os ciclos (dono 17/09, reorganização):
--   "tá faltando eu abrir dia seis, dia sete — não tem aqui, como eu abro?"
--   + "limpar todos os ciclos" (Matheus confirmou: esvaziar — todo mundo vai
--   pra 'aguardando ciclo' e o dono redistribui dia a dia dentro do sistema).
-- Um ciclo só existia se tinha gente (turmas derivam de leads.dia); a tabela
-- ciclos_abertos guarda os dias que o gestor ABRIU à mão, pra aparecerem na
-- lista/selects mesmo vazios e receberem clientes depois.
-- =====================================================================

create table if not exists public.ciclos_abertos (
  dia smallint primary key check (dia between 1 and 31),
  criado_em timestamptz not null default now(),
  criado_por uuid
);
alter table public.ciclos_abertos enable row level security;
drop policy if exists ca_sel on public.ciclos_abertos;
drop policy if exists ca_ins on public.ciclos_abertos;
drop policy if exists ca_del on public.ciclos_abertos;
create policy ca_sel on public.ciclos_abertos for select to authenticated
  using (public.current_papel() is not null);
create policy ca_ins on public.ciclos_abertos for insert to authenticated
  with check (public.is_at_least('financeiro'));
create policy ca_del on public.ciclos_abertos for delete to authenticated
  using (public.is_at_least('financeiro'));

-- Esvaziar TODOS os ciclos numa transação: todo lead com dia vira 'aguardando'
-- (dia = null) e as datas manuais do calendário (mês corrente em diante) são
-- removidas (todas ficariam órfãs). Devolve o que foi feito — o DESFAZER usa
-- 'afetados' (id + dia antigo) e 'datas_removidas' pra repor tudo.
-- O trigger leads_dia_carimbo (mig 41) carimba dia_alterado_em normalmente.
create or replace function public.esvaziar_ciclos()
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_comp text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM');
  v_afetados jsonb;
  v_datas jsonb;
begin
  if not public.is_at_least('financeiro') then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  with alvo as (
    select id, dia from public.leads where dia is not null for update
  ), upd as (
    update public.leads l set dia = null from alvo a where l.id = a.id
    returning a.id, a.dia
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'dia', dia)), '[]'::jsonb)
    into v_afetados from upd;

  with del as (
    delete from public.ciclos_datas where comp >= v_comp
    returning dia, comp, inicio, fim, cobranca
  )
  select coalesce(jsonb_agg(to_jsonb(del)), '[]'::jsonb) into v_datas from del;

  return jsonb_build_object('afetados', v_afetados, 'datas_removidas', v_datas);
end $$;

grant execute on function public.esvaziar_ciclos() to authenticated;
