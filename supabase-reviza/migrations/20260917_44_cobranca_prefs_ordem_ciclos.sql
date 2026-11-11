-- =====================================================================
-- 44 — Preferências da operação de cobrança (dono 17/09: "tem que dar pra
-- arrastar pra organizar [os ciclos] da forma que a gente quiser").
-- Tabela genérica chave→jsonb; primeira chave: 'ciclos_ordem' = array de dias
-- na ordem escolhida arrastando os chips da Gestão. Ordem é COMPARTILHADA
-- (a organização da operação vale pra equipe toda). Dias fora da lista entram
-- no fim (por dia); dias extintos na lista são ignorados — nada quebra.
-- Escrita: financeiro+ (mesmo degrau do Gerenciar ciclos).
-- =====================================================================

create table if not exists public.cobranca_prefs (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.cobranca_prefs enable row level security;
drop policy if exists cpref_sel on public.cobranca_prefs;
drop policy if exists cpref_ins on public.cobranca_prefs;
drop policy if exists cpref_upd on public.cobranca_prefs;
create policy cpref_sel on public.cobranca_prefs for select to authenticated
  using (public.current_papel() is not null);
create policy cpref_ins on public.cobranca_prefs for insert to authenticated
  with check (public.is_at_least('financeiro'));
create policy cpref_upd on public.cobranca_prefs for update to authenticated
  using (public.is_at_least('financeiro')) with check (public.is_at_least('financeiro'));

create or replace function public.tg_cobranca_prefs_touch()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists cobranca_prefs_touch on public.cobranca_prefs;
create trigger cobranca_prefs_touch before insert or update on public.cobranca_prefs
  for each row execute function public.tg_cobranca_prefs_touch();
