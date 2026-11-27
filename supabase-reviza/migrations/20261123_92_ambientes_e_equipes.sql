-- 92 — AMBIENTES POR PESSOA, TELAS POR PESSOA E EQUIPES (dono 22 e 23/11). ADITIVA.
--
-- PARA QUEM JÁ USA O SISTEMA NADA MUDA: admin, gestor, comercial, financeiro e cadastro seguem com as
-- mesmas permissões (profiles.modulos nasce vazio = "o padrão do papel", que é Cobranças).
-- CONFERIDO EM 23/11 num banco de testes local idêntico ao de verdade (mesmas 91 regras, 45 tabelas e 166
-- rotinas): para os cinco papéis de hoje, as 74 rotinas que um usuário pode chamar e as 45 tabelas
-- responderam exatamente igual antes e depois (714 respostas comparadas, nenhuma diferente). Para o
-- atendente e para quem só tem o Atendimento: nenhuma linha das Cobranças, nenhuma ação das Cobranças.
--
-- O QUE ENTRA
--   1. profiles.modulos (ambientes: cobrancas, atendimento) e profiles.areas (telas liberadas).
--      Só o administrador muda. Mesma regra da tela (src/v2/data/modulos.ts):
--        admin = os dois ambientes; atendente = só Atendimento; os demais = o que estiver marcado
--        (sem nada marcado = Cobranças).
--   2. QUEM NÃO TRABALHA NAS COBRANÇAS NÃO TEM PAPEL PARA AS COBRANÇAS: current_papel() devolve vazio
--      para o atendente e para quem não tem 'cobrancas' nos ambientes. Como todas as regras e rotinas das
--      Cobranças perguntam o papel por ela (ou por is_at_least/pode_*), todas passam a negar: carteira,
--      senhas dos clientes, pagamentos, régua, números, registros.
--   3. tabela equipes: nome, gerente, pessoas e números de WhatsApp do Atendimento. Só o administrador
--      grava. Cada pessoa fica numa equipe só e cada número é de uma equipe só (o banco garante).
--   4. equipe_pessoas_que_vejo() e equipe_canais_que_vejo(): o que o GERENTE enxerga. As regras das
--      tabelas do Atendimento (quando elas vierem) usam estas duas.

-- ------------------------------------------------------------------ 1. ambientes e telas por pessoa
alter table public.profiles add column if not exists modulos text[];
alter table public.profiles add column if not exists areas jsonb;
alter table public.profiles drop constraint if exists profiles_modulos_ok;
alter table public.profiles add constraint profiles_modulos_ok
  check (modulos is null or (cardinality(modulos) between 1 and 2 and modulos <@ array['cobrancas', 'atendimento']::text[]));
alter table public.profiles drop constraint if exists profiles_areas_ok;
alter table public.profiles add constraint profiles_areas_ok check (areas is null or jsonb_typeof(areas) = 'array');

create or replace function public.tem_ambiente(p_ambiente text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.ativo
       and case when p.papel = 'admin' then p_ambiente in ('cobrancas', 'atendimento')
                when p.papel = 'atendente' then p_ambiente = 'atendimento'
                else p_ambiente = any (coalesce(p.modulos, array['cobrancas']::text[])) end)
$$;
revoke all on function public.tem_ambiente(text) from public, anon;
grant execute on function public.tem_ambiente(text) to authenticated, service_role;

-- ------------------------------------------------------------------ 2. sem Cobranças, sem papel nas Cobranças
create or replace function public.current_papel()
returns public.papel_usuario language sql stable security definer set search_path = '' as $$
  select case when p.papel = 'admin' then p.papel
              when p.papel = 'atendente' then null
              when p.modulos is not null and not ('cobrancas' = any (p.modulos)) then null
              else p.papel end
    from public.profiles p where p.id = auth.uid() and p.ativo
$$;

-- o guarda do perfil: igual ao que está no ar + só o administrador muda ambientes e telas
create or replace function public.guard_profile_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then new.updated_at := now(); return new; end if; -- backend confiável
  if new.id <> old.id then raise exception 'id do profile e imutavel'; end if;
  -- mig 65: email é o "login" da tela Usuarios e da confirmacao do excluir
  if new.email is distinct from old.email and not public.is_at_least('admin') then
    raise exception 'somente admin altera o email (login)'; end if;
  if new.nome is distinct from old.nome and not public.is_at_least('gestor') then
    raise exception 'somente gestor/admin altera o nome (identidade da carteira e da comissao)'; end if;
  if new.papel is distinct from old.papel and not public.is_at_least('admin') then
    raise exception 'somente admin altera papel'; end if;
  -- mig 92: ambientes e telas liberadas
  if (new.modulos is distinct from old.modulos or new.areas is distinct from old.areas) and not public.is_at_least('admin') then
    raise exception 'somente admin altera os ambientes e as telas de uma pessoa'; end if;
  if new.ativo is distinct from old.ativo then
    if old.papel = 'admin' and not public.is_at_least('admin') then
      raise exception 'somente admin altera o ativo de um admin'; end if;
    if not public.is_at_least('gestor') then
      raise exception 'somente gestor/admin altera ativo'; end if;
  end if;
  if old.papel='admin' and old.ativo and (new.papel is distinct from 'admin' or not new.ativo) then
    if (select count(*) from public.profiles where papel='admin' and ativo) <= 1 then
      raise exception 'nao e permitido remover/desativar o ultimo admin ativo'; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- o quadro "quem está conectado" dos números das Cobranças era de qualquer pessoa ativa: agora é de quem
-- trabalha nas Cobranças (o atendente não vê os números dos comerciais)
create or replace function public.wa_canais_visao_equipe()
returns table (
  id uuid, nome text, numero text, estado public.wa_estado_canal,
  dono_id uuid, ultimo_evento_em timestamptz, verificado_em timestamptz, ultimo_erro text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_papel() is null then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query
    select c.id, c.nome, c.numero, c.estado, c.dono_id, c.ultimo_evento_em, c.verificado_em, c.ultimo_erro
      from public.wa_canais c
     order by c.created_at;
end $$;

-- ------------------------------------------------------------------ 3. equipes
create table if not exists public.equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 40),
  gerente_id uuid references public.profiles(id) on delete set null,
  membros uuid[] not null default '{}',
  canais uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists equipes_nome_uniq on public.equipes (lower(btrim(nome)));
create index if not exists equipes_gerente_idx on public.equipes (gerente_id);
alter table public.equipes enable row level security;
revoke all on public.equipes from public, anon;
grant select, insert, update, delete on public.equipes to authenticated;
grant all on public.equipes to service_role;

drop policy if exists equipes_sel on public.equipes;
create policy equipes_sel on public.equipes for select to authenticated
  using ((select public.is_at_least('admin')) or gerente_id = (select auth.uid()) or (select auth.uid()) = any (membros));
drop policy if exists equipes_ins on public.equipes;
create policy equipes_ins on public.equipes for insert to authenticated with check ((select public.is_at_least('admin')));
drop policy if exists equipes_upd on public.equipes;
create policy equipes_upd on public.equipes for update to authenticated
  using ((select public.is_at_least('admin'))) with check ((select public.is_at_least('admin')));
drop policy if exists equipes_del on public.equipes;
create policy equipes_del on public.equipes for delete to authenticated using ((select public.is_at_least('admin')));

-- arruma o que chega: nome sem espaços sobrando, listas sem repetição, gerente fora da lista de pessoas
create or replace function private.equipes_arruma()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.nome := regexp_replace(btrim(new.nome), '\s+', ' ', 'g');
  new.membros := coalesce((select array_agg(distinct m) from unnest(new.membros) m where m is not null and m is distinct from new.gerente_id), '{}');
  new.canais := coalesce((select array_agg(distinct c) from unnest(new.canais) c where c is not null), '{}');
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists equipes_arruma on public.equipes;
create trigger equipes_arruma before insert or update on public.equipes
  for each row execute function private.equipes_arruma();

-- cada pessoa numa equipe só e cada número de uma equipe só: quem entra aqui sai de onde estava
create or replace function private.equipes_exclusivo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_gente uuid[] := case when new.gerente_id is null then new.membros else new.membros || new.gerente_id end;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  update public.equipes e
     set membros = coalesce((select array_agg(m) from unnest(e.membros) m where m <> all (v_gente)), '{}'),
         canais  = coalesce((select array_agg(c) from unnest(e.canais) c where c <> all (new.canais)), '{}')
   where e.id <> new.id and (e.membros && v_gente or e.canais && new.canais);
  return null;
end $$;
drop trigger if exists equipes_a_exclusivo on public.equipes;
create trigger equipes_a_exclusivo after insert or update on public.equipes
  for each row execute function private.equipes_exclusivo();

-- entra nos Registros (quem criou, alterou ou excluiu a equipe)
create or replace function private.equipes_registra()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_g text;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'DELETE' then
    perform private.registrar('excluiu', 'equipe', old.id::text, old.nome, 'as pessoas e os números ficaram sem equipe');
    return null;
  end if;
  select nome into v_g from public.profiles where id = new.gerente_id;
  perform private.registrar(case when tg_op = 'INSERT' then 'criou' else 'alterou' end, 'equipe', new.id::text, new.nome,
    format('gerente %s · %s · %s de WhatsApp', coalesce(nullif(v_g, ''), '—'),
      cardinality(new.membros) || case when cardinality(new.membros) = 1 then ' pessoa' else ' pessoas' end,
      cardinality(new.canais) || case when cardinality(new.canais) = 1 then ' número' else ' números' end));
  return null;
end $$;
drop trigger if exists equipes_b_registra on public.equipes;
create trigger equipes_b_registra after insert or update or delete on public.equipes
  for each row execute function private.equipes_registra();

-- quem foi excluído do sistema sai das equipes (o gerente excluído já vira "sem gerente" pela própria tabela)
create or replace function private.equipes_sai_excluido()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.equipes set membros = array_remove(membros, old.id) where old.id = any (membros);
  return null;
end $$;
drop trigger if exists profiles_sai_das_equipes on public.profiles;
create trigger profiles_sai_das_equipes after delete on public.profiles
  for each row execute function private.equipes_sai_excluido();

-- ------------------------------------------------------------------ 4. o que o gerente enxerga
-- as pessoas cujas conversas eu posso ver: eu e, se eu for gerente, as pessoas das minhas equipes
create or replace function public.equipe_pessoas_que_vejo()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x), '{}')
    from (select auth.uid() as x
          union all
          select unnest(e.membros) from public.equipes e where e.gerente_id = auth.uid()) t
   where x is not null
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo)
$$;
-- os números de WhatsApp cujas conversas eu posso ver por ser gerente da equipe dona do número
create or replace function public.equipe_canais_que_vejo()
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct c), '{}')
    from public.equipes e cross join lateral unnest(e.canais) c
   where e.gerente_id = auth.uid()
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.ativo)
$$;
revoke all on function public.equipe_pessoas_que_vejo() from public, anon;
revoke all on function public.equipe_canais_que_vejo() from public, anon;
grant execute on function public.equipe_pessoas_que_vejo() to authenticated, service_role;
grant execute on function public.equipe_canais_que_vejo() to authenticated, service_role;

-- ------------------------------------------------------------------ DESFAZER (se precisar voltar)
--   drop trigger if exists profiles_sai_das_equipes on public.profiles;
--   drop table if exists public.equipes;
--   drop function if exists public.equipe_pessoas_que_vejo(), public.equipe_canais_que_vejo(), public.tem_ambiente(text);
--   drop function if exists private.equipes_arruma(), private.equipes_exclusivo(), private.equipes_registra(), private.equipes_sai_excluido();
--   -- current_papel(), guard_profile_update() e wa_canais_visao_equipe(): recriar como estavam (migrations 01/65/86);
--   -- antes disso, ninguém pode estar com papel 'atendente' nem com ambientes sem 'cobrancas'.
--   alter table public.profiles drop constraint if exists profiles_modulos_ok, drop constraint if exists profiles_areas_ok;
--   alter table public.profiles drop column if exists modulos, drop column if exists areas;
