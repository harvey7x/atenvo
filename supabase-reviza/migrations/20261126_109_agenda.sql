-- 109 · AGENDA DO ATENDIMENTO (26/11, "igual" ao sistema que a Reviza usava antes — lá 11 reuniões marcadas e o
-- agente marcava "Agendar reunião"). Reuniões, ligações e retornos com dia, hora, quanto dura, quem faz, o cliente e a
-- conversa. A tela (Atendimento › Agenda) mostra dia, semana, mês e lista — e junta os presenciais que já existem.
-- Quem vê: o administrador vê tudo; os outros veem o que é deles (responsável ou quem marcou) e o das conversas que
-- eles enxergam. Marcar para outra pessoa avisa essa pessoa no sino (o aviso "Reunião agendada" de lá).
-- ADITIVA: só cria peças novas. Depende da 93. DESFAZER no fim.

create table if not exists public.atd_reunioes (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  titulo         text not null,
  tipo           text not null default 'reuniao',
  inicio         timestamptz not null,
  duracao_min    int  not null default 30,
  responsavel_id uuid references public.usuarios(id) on delete set null,
  contato_id     uuid references public.contatos(id) on delete set null,
  conversa_id    uuid references public.conversas(id) on delete set null,
  local          text,
  observacao     text,
  status         text not null default 'marcada',
  criado_por     uuid references public.usuarios(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint atd_reunioes_titulo check (char_length(btrim(titulo)) between 1 and 120),
  constraint atd_reunioes_tipo check (tipo in ('reuniao', 'ligacao', 'retorno', 'videochamada')),
  constraint atd_reunioes_duracao check (duracao_min between 5 and 480),
  constraint atd_reunioes_status check (status in ('marcada', 'feita', 'faltou', 'cancelada')),
  constraint atd_reunioes_local check (local is null or char_length(local) <= 200),
  constraint atd_reunioes_obs check (observacao is null or char_length(observacao) <= 1000)
);
create index if not exists atd_reunioes_inicio_idx on public.atd_reunioes (organizacao_id, inicio);
create index if not exists atd_reunioes_resp_idx on public.atd_reunioes (responsavel_id, inicio);
create index if not exists atd_reunioes_conversa_idx on public.atd_reunioes (conversa_id) where conversa_id is not null;

-- quem pode ver/mexer nesta reunião
create or replace function public.atd_vejo_reuniao(p_resp uuid, p_criador uuid, p_conversa uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_member(p_org) and (
    coalesce(public.org_papel(p_org), '') = 'admin' or public.is_platform_admin()
    or p_resp = auth.uid() or p_criador = auth.uid()
    or (p_conversa is not null and public.atd_vejo_conversa(p_conversa)))
$$;
revoke all on function public.atd_vejo_reuniao(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.atd_vejo_reuniao(uuid, uuid, uuid, uuid) to authenticated;

alter table public.atd_reunioes enable row level security;
revoke all on public.atd_reunioes from public, anon, authenticated;
grant select, insert, update, delete on public.atd_reunioes to authenticated;
grant all on public.atd_reunioes to service_role;
drop policy if exists atd_reunioes_ver on public.atd_reunioes;
create policy atd_reunioes_ver on public.atd_reunioes for select to authenticated
  using ((select public.atd_vejo_reuniao(responsavel_id, criado_por, conversa_id, organizacao_id)));
drop policy if exists atd_reunioes_marcar on public.atd_reunioes;
create policy atd_reunioes_marcar on public.atd_reunioes for insert to authenticated
  with check ((select public.is_member(organizacao_id)) and (conversa_id is null or (select public.atd_vejo_conversa(conversa_id))));
drop policy if exists atd_reunioes_mudar on public.atd_reunioes;
create policy atd_reunioes_mudar on public.atd_reunioes for update to authenticated
  using ((select public.atd_vejo_reuniao(responsavel_id, criado_por, conversa_id, organizacao_id)))
  with check ((select public.is_member(organizacao_id)));
drop policy if exists atd_reunioes_apagar on public.atd_reunioes;
create policy atd_reunioes_apagar on public.atd_reunioes for delete to authenticated
  using (criado_por = (select auth.uid()) or coalesce((select public.org_papel(organizacao_id)), '') = 'admin');

-- carimbos: quem marcou (a tela não escolhe), quando mudou; o cliente vem da conversa
create or replace function private.atd_reunioes_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.titulo := btrim(new.titulo);
  new.atualizado_em := now();
  if tg_op = 'INSERT' then new.criado_por := coalesce(auth.uid(), new.criado_por); new.criado_em := now();
  else new.criado_por := old.criado_por; new.criado_em := old.criado_em; end if;
  if new.conversa_id is not null and new.contato_id is null then
    select contato_id into new.contato_id from public.conversas where id = new.conversa_id;
  end if;
  return new;
end $$;
revoke all on function private.atd_reunioes_carimbo() from public, anon, authenticated;
drop trigger if exists atd_reunioes_carimbo on public.atd_reunioes;
create trigger atd_reunioes_carimbo before insert or update on public.atd_reunioes
  for each row execute function private.atd_reunioes_carimbo();

-- "Reunião agendada": quem vai fazer recebe o aviso no sino (se não foi a própria pessoa que marcou)
create or replace function private.atd_reunioes_avisa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cliente text; v_quem text;
begin
  if new.responsavel_id is null or new.responsavel_id = coalesce(auth.uid(), new.criado_por) or new.status = 'cancelada' then return null; end if;
  if tg_op = 'UPDATE' and old.responsavel_id is not distinct from new.responsavel_id and old.inicio = new.inicio then return null; end if;
  select coalesce(nullif(btrim(nome), ''), telefone) into v_cliente from public.contatos where id = new.contato_id;
  select coalesce(nullif(btrim(nome), ''), 'Alguém da equipe') into v_quem from public.usuarios where id = coalesce(auth.uid(), new.criado_por);
  insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  values (new.organizacao_id, new.responsavel_id, 'reuniao_marcada',
          case when tg_op = 'INSERT' then 'Reunião marcada para você' else 'Reunião remarcada' end,
          coalesce(v_quem, 'Alguém da equipe') || ' marcou "' || new.titulo || '"' || coalesce(' com ' || v_cliente, '') || ' para '
            || to_char(new.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI') || '.',
          '/agenda?reuniao=' || new.id, new.id);
  return null;
end $$;
revoke all on function private.atd_reunioes_avisa() from public, anon, authenticated;
drop trigger if exists atd_reunioes_avisa on public.atd_reunioes;
create trigger atd_reunioes_avisa after insert or update on public.atd_reunioes
  for each row execute function private.atd_reunioes_avisa();

-- DESFAZER:
--   drop table if exists public.atd_reunioes;
--   drop function if exists public.atd_vejo_reuniao(uuid, uuid, uuid, uuid), private.atd_reunioes_carimbo(), private.atd_reunioes_avisa();
