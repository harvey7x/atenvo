-- 102 · CHAT DA EQUIPE no Atendimento (dono 25/11, a partir do sistema que a Reviza usava antes: o "Chat Interno" do menu,
-- com o número de não lidas). Conversa entre colegas, de pessoa para pessoa ou em grupo, só texto, com "não lidas" e "visto".
--   atd_chat_salas    a conversa: 'direta' (duas pessoas, uma só por dupla) ou 'grupo' (com nome)
--   atd_chat_membros  quem está na conversa e até quando leu (lido_ate) — é dela que saem as não lidas e o "visto"
--   atd_chat_msgs     as mensagens (texto de 1 a 4000 letras)
-- REGRA DE ACESSO (dentro do banco, não só na tela): cada pessoa só lê as conversas em que ela ESTÁ — nem o administrador
-- lê a conversa de outros dois. Mensagem só sai em nome de quem está logado, numa conversa em que ele está. Cada um só marca
-- a SUA leitura. Conversa nova só pelas rotinas abaixo (atd_chat_abrir_direta e atd_chat_criar_grupo), sempre dentro da
-- empresa e só com pessoas ativas dela. Quem sai do Atendimento (inativo) deixa de ler tudo na hora.
-- Nada aqui muda as Cobranças nem o resto do Atendimento.

-- 1) as tabelas
create table if not exists public.atd_chat_salas (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  tipo           text not null check (tipo in ('direta', 'grupo')),
  nome           text check (nome is null or char_length(btrim(nome)) between 1 and 80),
  -- direta: "menor-id:maior-id" — garante UMA conversa por dupla mesmo com os dois abrindo ao mesmo tempo
  chave_direta   text,
  criado_por     uuid references public.usuarios(id) on delete set null,
  criado_em      timestamptz not null default now(),
  ultima_msg_em  timestamptz,
  constraint atd_chat_salas_direta_tem_chave check ((tipo = 'direta') = (chave_direta is not null)),
  constraint atd_chat_salas_grupo_tem_nome check (tipo = 'direta' or nome is not null)
);
create unique index if not exists atd_chat_salas_dupla on public.atd_chat_salas (organizacao_id, chave_direta) where chave_direta is not null;

create table if not exists public.atd_chat_membros (
  sala_id    uuid not null references public.atd_chat_salas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  lido_ate   timestamptz,
  entrou_em  timestamptz not null default now(),
  primary key (sala_id, usuario_id)
);
create index if not exists atd_chat_membros_usuario on public.atd_chat_membros (usuario_id);

create table if not exists public.atd_chat_msgs (
  id             uuid primary key default gen_random_uuid(),
  sala_id        uuid not null references public.atd_chat_salas(id) on delete cascade,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  autor_id       uuid references public.usuarios(id) on delete set null,
  texto          text not null check (char_length(texto) between 1 and 4000 and btrim(texto) <> ''),
  criado_em      timestamptz not null default now(),
  editado_em     timestamptz,
  apagada        boolean not null default false
);
create index if not exists atd_chat_msgs_sala_quando on public.atd_chat_msgs (sala_id, criado_em desc);
create index if not exists atd_chat_msgs_autor on public.atd_chat_msgs (autor_id);

-- 2) as conversas que a pessoa logada enxerga: as dela, numa empresa em que ela está ativa. Uma vez por consulta nas
--    regras abaixo (forma "sala_id in (select …)"), nunca uma chamada por linha.
create or replace function public.atd_chat_salas_que_vejo()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.sala_id
    from public.atd_chat_membros m
    join public.atd_chat_salas s on s.id = m.sala_id
   where m.usuario_id = (select auth.uid())
     and public.is_member(s.organizacao_id)
$$;
revoke all on function public.atd_chat_salas_que_vejo() from public, anon;
grant execute on function public.atd_chat_salas_que_vejo() to authenticated, service_role;

-- 3) regras de acesso
alter table public.atd_chat_salas enable row level security;
alter table public.atd_chat_membros enable row level security;
alter table public.atd_chat_msgs enable row level security;
revoke all on table public.atd_chat_salas, public.atd_chat_membros, public.atd_chat_msgs from public, anon, authenticated;
grant select on table public.atd_chat_salas, public.atd_chat_membros, public.atd_chat_msgs to authenticated;
grant update (lido_ate) on table public.atd_chat_membros to authenticated;       -- só a própria leitura (regra abaixo)
grant insert (sala_id, autor_id, texto) on table public.atd_chat_msgs to authenticated; -- empresa e hora: o banco põe
grant all on table public.atd_chat_salas, public.atd_chat_membros, public.atd_chat_msgs to service_role;

drop policy if exists atd_chat_salas_sel on public.atd_chat_salas;
create policy atd_chat_salas_sel on public.atd_chat_salas for select to authenticated
  using (id in (select public.atd_chat_salas_que_vejo()));
drop policy if exists atd_chat_membros_sel on public.atd_chat_membros;
create policy atd_chat_membros_sel on public.atd_chat_membros for select to authenticated
  using (sala_id in (select public.atd_chat_salas_que_vejo()));
drop policy if exists atd_chat_membros_upd on public.atd_chat_membros;
create policy atd_chat_membros_upd on public.atd_chat_membros for update to authenticated
  using (usuario_id = (select auth.uid()) and sala_id in (select public.atd_chat_salas_que_vejo()))
  with check (usuario_id = (select auth.uid()) and sala_id in (select public.atd_chat_salas_que_vejo()));
drop policy if exists atd_chat_msgs_sel on public.atd_chat_msgs;
create policy atd_chat_msgs_sel on public.atd_chat_msgs for select to authenticated
  using (sala_id in (select public.atd_chat_salas_que_vejo()));
drop policy if exists atd_chat_msgs_ins on public.atd_chat_msgs;
create policy atd_chat_msgs_ins on public.atd_chat_msgs for insert to authenticated
  with check (autor_id = (select auth.uid()) and sala_id in (select public.atd_chat_salas_que_vejo()));

-- 4) a mensagem nova: a empresa vem da conversa e a hora é a do banco (ninguém data mensagem no passado);
--    depois, a conversa sobe na lista e quem escreveu já leu até ali
create or replace function public.atd_chat_msg_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select s.organizacao_id into new.organizacao_id from public.atd_chat_salas s where s.id = new.sala_id;
  if new.organizacao_id is null then raise exception 'sala_inexistente'; end if;
  new.criado_em := now();
  new.editado_em := null;
  new.apagada := false;
  return new;
end;
$$;
create or replace function public.atd_chat_msg_depois()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.atd_chat_salas set ultima_msg_em = greatest(coalesce(ultima_msg_em, new.criado_em), new.criado_em) where id = new.sala_id;
  if new.autor_id is not null then
    update public.atd_chat_membros set lido_ate = greatest(coalesce(lido_ate, new.criado_em), new.criado_em)
     where sala_id = new.sala_id and usuario_id = new.autor_id;
  end if;
  return null;
end;
$$;
revoke all on function public.atd_chat_msg_antes() from public, anon, authenticated;
revoke all on function public.atd_chat_msg_depois() from public, anon, authenticated;
drop trigger if exists atd_chat_msgs_antes on public.atd_chat_msgs;
create trigger atd_chat_msgs_antes before insert on public.atd_chat_msgs for each row execute function public.atd_chat_msg_antes();
drop trigger if exists atd_chat_msgs_depois on public.atd_chat_msgs;
create trigger atd_chat_msgs_depois after insert on public.atd_chat_msgs for each row execute function public.atd_chat_msg_depois();

-- 5) abrir a conversa com um colega: devolve a que já existe ou cria (as duas pessoas ativas na MESMA empresa)
create or replace function public.atd_chat_abrir_direta(p_outro uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu    uuid := auth.uid();
  v_org   uuid;
  v_chave text;
  v_id    uuid;
begin
  if v_eu is null then raise exception 'sem_sessao'; end if;
  if p_outro is null or p_outro = v_eu then raise exception 'pessoa_invalida'; end if;
  select a.organizacao_id into v_org
    from public.organizacao_usuarios a
    join public.organizacao_usuarios b on b.organizacao_id = a.organizacao_id and b.usuario_id = p_outro and b.status = 'ativo'
   where a.usuario_id = v_eu and a.status = 'ativo'
   order by a.criado_em limit 1;
  if v_org is null or not public.is_member(v_org) then raise exception 'fora_da_empresa'; end if;
  v_chave := least(v_eu::text, p_outro::text) || ':' || greatest(v_eu::text, p_outro::text);
  select id into v_id from public.atd_chat_salas where organizacao_id = v_org and chave_direta = v_chave;
  if v_id is not null then return v_id; end if;
  insert into public.atd_chat_salas (organizacao_id, tipo, criado_por, chave_direta)
  values (v_org, 'direta', v_eu, v_chave)
  on conflict (organizacao_id, chave_direta) where chave_direta is not null do nothing
  returning id into v_id;
  if v_id is null then -- o colega abriu no mesmo instante: vale a dele
    select id into v_id from public.atd_chat_salas where organizacao_id = v_org and chave_direta = v_chave;
    return v_id;
  end if;
  insert into public.atd_chat_membros (sala_id, usuario_id) values (v_id, v_eu), (v_id, p_outro);
  return v_id;
end;
$$;
revoke all on function public.atd_chat_abrir_direta(uuid) from public, anon;
grant execute on function public.atd_chat_abrir_direta(uuid) to authenticated, service_role;

-- 6) criar um grupo: nome de 1 a 80 letras, quem cria entra sozinho na lista, de 2 a 100 pessoas, todas ativas na empresa
create or replace function public.atd_chat_criar_grupo(p_nome text, p_membros uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eu    uuid := auth.uid();
  v_nome  text := nullif(btrim(coalesce(p_nome, '')), '');
  v_org   uuid;
  v_lista uuid[];
  v_id    uuid;
begin
  if v_eu is null then raise exception 'sem_sessao'; end if;
  if v_nome is null or char_length(v_nome) > 80 then raise exception 'nome_invalido'; end if;
  select organizacao_id into v_org from public.organizacao_usuarios
   where usuario_id = v_eu and status = 'ativo' order by criado_em limit 1;
  if v_org is null or not public.is_member(v_org) then raise exception 'fora_da_empresa'; end if;
  v_lista := array(select distinct x from unnest(coalesce(p_membros, '{}'::uuid[]) || v_eu) x where x is not null);
  if cardinality(v_lista) < 2 then raise exception 'poucas_pessoas'; end if;
  if cardinality(v_lista) > 100 then raise exception 'pessoas_demais'; end if;
  if exists (
    select 1 from unnest(v_lista) x
     where not exists (select 1 from public.organizacao_usuarios ou where ou.organizacao_id = v_org and ou.usuario_id = x and ou.status = 'ativo')
  ) then raise exception 'pessoa_fora_da_empresa'; end if;
  insert into public.atd_chat_salas (organizacao_id, tipo, nome, criado_por) values (v_org, 'grupo', v_nome, v_eu) returning id into v_id;
  insert into public.atd_chat_membros (sala_id, usuario_id) select v_id, x from unnest(v_lista) x;
  return v_id;
end;
$$;
revoke all on function public.atd_chat_criar_grupo(text, uuid[]) from public, anon;
grant execute on function public.atd_chat_criar_grupo(text, uuid[]) to authenticated, service_role;

-- 7) a lista da tela: as conversas da pessoa, com as pessoas (e até quando cada uma leu, para o "visto"), a última
--    mensagem e as não lidas — tudo numa chamada. Não lida = de OUTRA pessoa, depois da leitura (ou da entrada, quando
--    ainda não leu nada), não apagada.
create or replace function public.atd_chat_minhas_salas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(q.j order by q.ordem desc), '[]'::jsonb) from (
    select coalesce(s.ultima_msg_em, s.criado_em) as ordem, jsonb_build_object(
      'id', s.id, 'tipo', s.tipo, 'nome', s.nome, 'criado_em', s.criado_em, 'ultima_msg_em', s.ultima_msg_em,
      'lido_ate', m.lido_ate,
      'membros', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome, 'lido_ate', mm.lido_ate) order by u.nome), '[]'::jsonb)
                    from public.atd_chat_membros mm join public.usuarios u on u.id = mm.usuario_id where mm.sala_id = s.id),
      'ultima', (select jsonb_build_object('autor_id', x.autor_id, 'texto', case when x.apagada then null else left(x.texto, 160) end,
                        'apagada', x.apagada, 'criado_em', x.criado_em)
                   from public.atd_chat_msgs x where x.sala_id = s.id order by x.criado_em desc limit 1),
      'nao_lidas', (select count(*) from public.atd_chat_msgs x
                     where x.sala_id = s.id and (case when m.lido_ate is null then x.criado_em >= m.entrou_em else x.criado_em > m.lido_ate end)
                       and x.autor_id is distinct from m.usuario_id and not x.apagada)
    ) as j
      from public.atd_chat_membros m
      join public.atd_chat_salas s on s.id = m.sala_id
     where m.usuario_id = (select auth.uid())
       and public.is_member(s.organizacao_id)
  ) q
$$;
revoke all on function public.atd_chat_minhas_salas() from public, anon;
grant execute on function public.atd_chat_minhas_salas() to authenticated, service_role;

-- 8) o número do menu: só a contagem (a consulta barata que o menu repete)
create or replace function public.atd_chat_nao_lidas()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.atd_chat_membros m
    join public.atd_chat_salas s on s.id = m.sala_id
    join public.atd_chat_msgs x on x.sala_id = m.sala_id
   where m.usuario_id = (select auth.uid())
     and public.is_member(s.organizacao_id)
     and (case when m.lido_ate is null then x.criado_em >= m.entrou_em else x.criado_em > m.lido_ate end)
     and x.autor_id is distinct from m.usuario_id
     and not x.apagada
$$;
revoke all on function public.atd_chat_nao_lidas() from public, anon;
grant execute on function public.atd_chat_nao_lidas() to authenticated, service_role;

-- 9) "li até aqui": até a última mensagem que existe na conversa (a hora do banco, nunca a do computador)
create or replace function public.atd_chat_marcar_lida(p_sala uuid)
returns timestamptz
language sql
volatile
security definer
set search_path = ''
as $$
  update public.atd_chat_membros m
     set lido_ate = greatest(m.lido_ate, (select max(x.criado_em) from public.atd_chat_msgs x where x.sala_id = p_sala))
   where m.sala_id = p_sala
     and m.usuario_id = (select auth.uid())
     and exists (select 1 from public.atd_chat_salas s where s.id = p_sala and public.is_member(s.organizacao_id))
  returning m.lido_ate
$$;
revoke all on function public.atd_chat_marcar_lida(uuid) from public, anon;
grant execute on function public.atd_chat_marcar_lida(uuid) to authenticated, service_role;

-- 10) tempo real: mensagem nova e leitura nova chegam na hora (cada um só recebe o que a regra de acesso deixa ler).
--     Sem o tempo real a tela confere a cada 30 segundos.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'atd_chat_msgs') then
      alter publication supabase_realtime add table public.atd_chat_msgs;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'atd_chat_membros') then
      alter publication supabase_realtime add table public.atd_chat_membros;
    end if;
  end if;
end $$;

-- DESFAZER: alter publication supabase_realtime drop table public.atd_chat_msgs, public.atd_chat_membros;
--           drop table public.atd_chat_msgs, public.atd_chat_membros, public.atd_chat_salas;
--           drop function public.atd_chat_salas_que_vejo(), public.atd_chat_msg_antes(), public.atd_chat_msg_depois(),
--             public.atd_chat_abrir_direta(uuid), public.atd_chat_criar_grupo(text, uuid[]), public.atd_chat_minhas_salas(),
--             public.atd_chat_nao_lidas(), public.atd_chat_marcar_lida(uuid);
