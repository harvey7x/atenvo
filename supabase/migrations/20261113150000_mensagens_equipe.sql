-- =====================================================================================
-- MENSAGEM DO MURILLO PARA A EQUIPE (dono 13/11: "preciso conseguir notificar os cliente, enviar uma mensagem que
-- apareça no meio da tela cobrando eles, mas quero conseguir fazer isso em qualquer ocasião, escolher o atendente
-- ou todos, e tem que ser enviado como Murillo").
-- - mensagem_equipe_enviar: o ADMINISTRADOR escreve de qualquer tela (botão na barra do topo) para um ou mais
--   atendentes ou para TODOS (os ativos da org que não são administradores, na hora do envio). Para quem recebe,
--   quem assina é sempre o Murillo (a assinatura fica gravada na mensagem); quem escreveu de verdade fica no
--   registro (de_id) e só a lista do administrador mostra.
-- - mensagens_equipe(p_org): o que chegou para mim e ainda não teve "Ok" (7 dias) e, para o administrador, quem
--   pode receber e as mensagens dos últimos 7 dias, com quem viu e quem deu ok.
-- - mensagem_equipe_vista (apareceu na tela dele) / mensagem_equipe_ok ("Ok, entendi") / mensagem_equipe_tirar (o
--   administrador tira das telas de quem ainda não deu ok: escreveu errado, mandou para a pessoa errada).
-- - Nada vai ao cliente. Não depende da Fila da Iris: vale para toda a equipe da org.
-- =====================================================================================
set lock_timeout = '5s';

create table if not exists public.mensagens_equipe (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  -- quem escreveu de verdade (registro; a tela do atendente mostra só a assinatura)
  de_id uuid not null,
  assinatura text not null,
  mensagem text not null check (length(btrim(mensagem)) between 1 and 600),
  para_todos boolean not null default false,
  criado_em timestamptz not null default now(),
  -- o administrador tirou das telas (quem já deu ok fica registrado)
  tirada_em timestamptz
);
create index if not exists mensagens_equipe_org_idx on public.mensagens_equipe (organizacao_id, criado_em desc);

create table if not exists public.mensagens_equipe_destinos (
  mensagem_id uuid not null references public.mensagens_equipe(id) on delete cascade,
  usuario_id uuid not null,
  visto_em timestamptz,
  ok_em timestamptz,
  primary key (mensagem_id, usuario_id)
);
create index if not exists mensagens_equipe_destinos_pendentes_idx
  on public.mensagens_equipe_destinos (usuario_id) where ok_em is null;

alter table public.mensagens_equipe enable row level security;
alter table public.mensagens_equipe_destinos enable row level security;
-- sem política: só as funções abaixo (security definer) leem e gravam
revoke all on table public.mensagens_equipe, public.mensagens_equipe_destinos from anon, authenticated;

-- ---------------------------------------------------------------- enviar (só o administrador)
create or replace function public.mensagem_equipe_enviar(p_org uuid, p_para uuid[], p_mensagem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_eu uuid := auth.uid();
  v_msg text := btrim(coalesce(p_mensagem, ''));
  -- null = todos (quem estiver na equipe na hora); uma lista = exatamente essas pessoas (vazia é recusada, nunca vira
  -- "todos" por engano)
  v_todos boolean := p_para is null;
  v_dest uuid[];
  v_id uuid;
begin
  -- is_member: ativo E sem troca de senha pendente (a trava do sistema contra chamada direta à API); papel: admin
  if v_eu is null or not public.is_member(p_org) or coalesce(public.papel_na_org(p_org)::text, '') <> 'admin' then
    raise exception 'Só o administrador manda mensagem para a equipe.' using errcode = '42501';
  end if;
  -- um envio por vez de cada administrador (duas abas ao mesmo tempo: o freio do clique duplo vê o primeiro)
  perform pg_advisory_xact_lock(hashtextextended('mensagem_equipe:' || p_org::text || ':' || v_eu::text, 0));
  if length(v_msg) = 0 then raise exception 'Escreva a mensagem.'; end if;
  if length(v_msg) > 600 then raise exception 'A mensagem passou de 600 letras.'; end if;
  if v_todos then
    -- todos = quem está ativo na equipe e não é administrador, na hora do envio
    select array_agg(ou.usuario_id order by ou.usuario_id) into v_dest
      from public.organizacao_usuarios ou
     where ou.organizacao_id = p_org and ou.status::text = 'ativo' and ou.papel::text <> 'admin'
       and ou.usuario_id <> v_eu;
  else
    select array_agg(distinct t.x order by t.x) into v_dest from unnest(p_para) as t(x) where t.x is not null;
    if coalesce(cardinality(v_dest), 0) = 0 then raise exception 'Escolha quem recebe.'; end if;
    if v_eu = any (v_dest) then raise exception 'Você não manda mensagem para você mesmo.'; end if;
    if exists (select 1 from unnest(v_dest) as t(x)
                where not exists (select 1 from public.organizacao_usuarios ou
                                   where ou.organizacao_id = p_org and ou.usuario_id = t.x and ou.status::text = 'ativo')) then
      raise exception 'Alguém que você escolheu não está mais na equipe. Abra de novo.';
    end if;
  end if;
  if coalesce(cardinality(v_dest), 0) = 0 then raise exception 'Não há ninguém da equipe para receber.'; end if;
  -- freio: a mesma mensagem para as mesmas pessoas há menos de 1 minuto (clique duplo)
  if exists (select 1 from public.mensagens_equipe m
              where m.organizacao_id = p_org and m.de_id = v_eu and m.mensagem = v_msg and m.tirada_em is null
                and m.criado_em > now() - interval '1 minute'
                and (select array_agg(d.usuario_id order by d.usuario_id) from public.mensagens_equipe_destinos d
                      where d.mensagem_id = m.id) = v_dest) then
    raise exception 'Você acabou de mandar esta mensagem.';
  end if;
  insert into public.mensagens_equipe (organizacao_id, de_id, assinatura, mensagem, para_todos)
  values (p_org, v_eu, 'Murillo', v_msg, v_todos)
  returning id into v_id;
  insert into public.mensagens_equipe_destinos (mensagem_id, usuario_id)
  select v_id, t.x from unnest(v_dest) as t(x);
  return jsonb_build_object('id', v_id, 'destinos', cardinality(v_dest));
end;
$$;

-- ---------------------------------------------------------------- o que a tela lê (todos os da org, a cada 20 s)
create or replace function public.mensagens_equipe(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_eu uuid := auth.uid();
  v_papel text := coalesce(public.papel_na_org(p_org)::text, '');
  v_minhas jsonb := '[]'::jsonb;
  v_equipe jsonb := '[]'::jsonb;
  v_enviadas jsonb := '[]'::jsonb;
begin
  if v_eu is null or v_papel = '' or not public.is_member(p_org) then
    raise exception 'Sem acesso a esta organização.' using errcode = '42501';
  end if;
  -- para mim, sem "Ok" ainda (a mais antiga primeiro)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'assinatura', m.assinatura, 'mensagem', m.mensagem, 'criado_em', m.criado_em, 'visto_em', d.visto_em)
           order by m.criado_em, m.id), '[]'::jsonb)
    into v_minhas
    from public.mensagens_equipe_destinos d
    join public.mensagens_equipe m on m.id = d.mensagem_id
   where d.usuario_id = v_eu and d.ok_em is null and m.tirada_em is null
     and m.organizacao_id = p_org and m.criado_em > now() - interval '7 days';
  if v_papel = 'admin' then
    -- quem pode receber (sem administradores e sem mim)
    select coalesce(jsonb_agg(jsonb_build_object('id', ou.usuario_id, 'nome', coalesce(nullif(btrim(u.nome), ''), 'Atendente'))
             order by u.nome nulls last, ou.usuario_id), '[]'::jsonb)
      into v_equipe
      from public.organizacao_usuarios ou
      left join public.usuarios u on u.id = ou.usuario_id
     where ou.organizacao_id = p_org and ou.status::text = 'ativo' and ou.papel::text <> 'admin' and ou.usuario_id <> v_eu;
    -- as mensagens da org nos últimos 7 dias (dos dois administradores), a mais nova primeiro
    select coalesce(jsonb_agg(x.j order by x.criado_em desc, x.id), '[]'::jsonb)
      into v_enviadas
      from (
        select m.id, m.criado_em, jsonb_build_object(
                 'id', m.id, 'assinatura', m.assinatura, 'mensagem', m.mensagem, 'criado_em', m.criado_em,
                 'para_todos', m.para_todos, 'tirada_em', m.tirada_em, 'de_id', m.de_id,
                 'de_nome', (select u.nome from public.usuarios u where u.id = m.de_id),
                 'destinos', (select coalesce(jsonb_agg(jsonb_build_object(
                                  'usuario_id', d.usuario_id, 'nome', coalesce(nullif(btrim(u.nome), ''), 'Atendente'),
                                  'visto_em', d.visto_em, 'ok_em', d.ok_em) order by u.nome nulls last, d.usuario_id), '[]'::jsonb)
                                from public.mensagens_equipe_destinos d
                                left join public.usuarios u on u.id = d.usuario_id
                               where d.mensagem_id = m.id)) as j
          from public.mensagens_equipe m
         where m.organizacao_id = p_org and m.criado_em > now() - interval '7 days'
         -- as que ainda estão na tela de alguém entram antes do corte (o "Tirar das telas" nunca some da lista);
         -- a lista sai do jsonb_agg de fora na ordem da hora
         order by (m.tirada_em is null and exists (select 1 from public.mensagens_equipe_destinos d2
                                                    where d2.mensagem_id = m.id and d2.ok_em is null)) desc,
                  m.criado_em desc
         limit 40
      ) x;
  end if;
  return jsonb_build_object('admin', v_papel = 'admin', 'minhas', v_minhas, 'equipe', v_equipe, 'enviadas', v_enviadas);
end;
$$;

-- ---------------------------------------------------------------- quem recebeu: viu / Ok
create or replace function public.mensagem_equipe_vista(p_org uuid, p_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.mensagens_equipe_destinos d set visto_em = now()
    from public.mensagens_equipe m
   where d.mensagem_id = p_id and d.usuario_id = auth.uid() and d.visto_em is null
     and m.id = d.mensagem_id and m.organizacao_id = p_org and public.is_member(p_org);
$$;

create or replace function public.mensagem_equipe_ok(p_org uuid, p_id uuid)
returns void language sql security definer set search_path = public, pg_temp as $$
  update public.mensagens_equipe_destinos d set ok_em = now(), visto_em = coalesce(d.visto_em, now())
    from public.mensagens_equipe m
   where d.mensagem_id = p_id and d.usuario_id = auth.uid() and d.ok_em is null
     and m.id = d.mensagem_id and m.organizacao_id = p_org and public.is_member(p_org);
$$;

-- ---------------------------------------------------------------- o administrador tira das telas
create or replace function public.mensagem_equipe_tirar(p_org uuid, p_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not public.is_member(p_org) or coalesce(public.papel_na_org(p_org)::text, '') <> 'admin' then
    raise exception 'Só o administrador tira a mensagem das telas.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.mensagens_equipe m where m.id = p_id and m.organizacao_id = p_org) then
    raise exception 'Mensagem não encontrada.';
  end if;
  update public.mensagens_equipe m set tirada_em = now()
   where m.id = p_id and m.organizacao_id = p_org and m.tirada_em is null;
  -- quantos ainda não tinham dado ok (deixam de ver)
  return jsonb_build_object('tirada_de', (select count(*) from public.mensagens_equipe_destinos d
                                           where d.mensagem_id = p_id and d.ok_em is null));
end;
$$;

revoke all on function public.mensagem_equipe_enviar(uuid, uuid[], text) from public, anon;
revoke all on function public.mensagens_equipe(uuid) from public, anon;
revoke all on function public.mensagem_equipe_vista(uuid, uuid) from public, anon;
revoke all on function public.mensagem_equipe_ok(uuid, uuid) from public, anon;
revoke all on function public.mensagem_equipe_tirar(uuid, uuid) from public, anon;
grant execute on function public.mensagem_equipe_enviar(uuid, uuid[], text) to authenticated;
grant execute on function public.mensagens_equipe(uuid) to authenticated;
grant execute on function public.mensagem_equipe_vista(uuid, uuid) to authenticated;
grant execute on function public.mensagem_equipe_ok(uuid, uuid) to authenticated;
grant execute on function public.mensagem_equipe_tirar(uuid, uuid) to authenticated;
