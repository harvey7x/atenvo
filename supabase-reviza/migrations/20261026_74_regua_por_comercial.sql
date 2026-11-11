-- 74 — Régua própria de cada comercial (dono 26/10: "cada um vai conseguir editar sua própria régua").
-- Decisões (AskUserQuestion 26/10): a régua é de cada COMERCIAL; cada um edita a SUA e admin/gestor
-- editam todas; muda SÓ a mensagem (texto/áudio/foto/vídeo/documento) — os passos e os dias
-- (3 antes, no dia, +2, +7) continuam os da sequência padrão, iguais para todos.
--
-- Modelo: uma linha = a versão de UM passo da sequência padrão para UM comercial. Sem linha, o
-- comercial usa a mensagem padrão. O passo continua sendo o da padrão (mesmo id na trava do mês,
-- no "cobrança primeiro", no Envios) — a versão só troca os blocos da mensagem.
-- Chave do comercial = nome normalizado (sem acento, espaços simples, MAIÚSCULO), a mesma conta
-- que o motor faz com leads.comercial e com o nome do dono do número (normNome).

create or replace function public.wa_nome_chave(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- NFC antes do translate (acento gravado separado da letra vira a letra acentuada que a lista
  -- conhece); espaços de qualquer tipo viram um só e as pontas saem por ÚLTIMO (idempotente)
  select upper(btrim(regexp_replace(translate(normalize(coalesce(t, ''), NFC),
    'áàâãäåéèêëíìîïóòôõöúùûüýÿçñšžÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÝÇÑŠŽ',
    'aaaaaaeeeeiiiiooooouuuuyycnszAAAAAAEEEEIIIIOOOOOUUUUYCNSZ'), '\s+', ' ', 'g')))
$$;

create table if not exists public.wa_regua_comercial (
  id uuid primary key default gen_random_uuid(),
  passo_id uuid not null references public.wa_regua_msgs(id) on delete cascade,
  comercial text not null,
  blocos jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  constraint wa_regua_comercial_unico unique (passo_id, comercial),
  constraint wa_regua_comercial_nome check (comercial <> '' and comercial = public.wa_nome_chave(comercial)),
  constraint wa_regua_comercial_blocos check (jsonb_typeof(blocos) = 'array' and jsonb_array_length(blocos) > 0)
);
create index if not exists wa_regua_comercial_comercial_idx on public.wa_regua_comercial (comercial);

-- normaliza o nome, carimba quem/quando e só aceita passo da SEQUÊNCIA PADRÃO
create or replace function public.wa_regua_comercial_bi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.comercial := public.wa_nome_chave(new.comercial);
  if not exists (select 1 from public.wa_regua_msgs m where m.id = new.passo_id and m.alvo = 'padrao') then
    raise exception 'A régua do comercial só troca mensagens da sequência padrão.' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and (new.passo_id is distinct from old.passo_id or new.comercial is distinct from old.comercial) then
    raise exception 'Não dá pra mudar o passo nem o comercial de uma versão — apague e crie de novo.' using errcode = '22023';
  end if;
  new.atualizado_em := now();
  new.atualizado_por := auth.uid();
  return new;
end $$;
drop trigger if exists wa_regua_comercial_bi on public.wa_regua_comercial;
create trigger wa_regua_comercial_bi before insert or update on public.wa_regua_comercial
  for each row execute function public.wa_regua_comercial_bi();

-- quem pode mexer na régua de um comercial: admin/gestor em todas; o comercial só na DELE
create or replace function public.wa_regua_pode(p_comercial text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_at_least('gestor')
      or exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.ativo and p.papel = 'comercial'
                    and public.wa_nome_chave(p.nome) = public.wa_nome_chave(p_comercial))
$$;
revoke all on function public.wa_regua_pode(text) from public, anon;
grant execute on function public.wa_regua_pode(text) to authenticated, service_role;

alter table public.wa_regua_comercial enable row level security;
drop policy if exists wa_rcom_sel on public.wa_regua_comercial;
drop policy if exists wa_rcom_ins on public.wa_regua_comercial;
drop policy if exists wa_rcom_upd on public.wa_regua_comercial;
drop policy if exists wa_rcom_del on public.wa_regua_comercial;
create policy wa_rcom_sel on public.wa_regua_comercial for select to authenticated using (public.wa_regua_pode(comercial));
create policy wa_rcom_ins on public.wa_regua_comercial for insert to authenticated with check (public.wa_regua_pode(comercial));
create policy wa_rcom_upd on public.wa_regua_comercial for update to authenticated using (public.wa_regua_pode(comercial)) with check (public.wa_regua_pode(comercial));
create policy wa_rcom_del on public.wa_regua_comercial for delete to authenticated using (public.wa_regua_pode(comercial));

revoke all on table public.wa_regua_comercial from anon;
revoke truncate, trigger, references on table public.wa_regua_comercial from authenticated;
grant select, insert, update, delete on table public.wa_regua_comercial to authenticated;
grant all on table public.wa_regua_comercial to service_role;
revoke all on function public.wa_nome_chave(text) from public, anon;
grant execute on function public.wa_nome_chave(text) to authenticated, service_role;
revoke all on function public.wa_regua_comercial_bi() from public, anon;
