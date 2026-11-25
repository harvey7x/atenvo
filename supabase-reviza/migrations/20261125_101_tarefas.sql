-- 101 · TAREFAS DA EQUIPE no Atendimento (dono 25/11: trazer do sistema que a Reviza usava antes as funções
-- úteis — lá havia o menu "Tarefas", com lista e quadro, prazo, prioridade, responsável e subtarefas).
--   atd_tarefas       a tarefa: título, descrição, responsável, prazo (dia e, se quiser, hora), prioridade,
--                     situação (pendente · em andamento · concluída), projeto e, se veio de uma conversa,
--                     o cliente (conversa_id + contato_id + o nome do cliente guardado na hora)
--   atd_tarefa_itens  as subtarefas (a listinha de "feito / não feito" dentro da tarefa)
-- QUEM VÊ: o administrador vê todas; os demais veem só as que criaram ou que estão com eles.
-- QUEM APAGA: o administrador ou quem criou. Passar a tarefa para outra pessoa avisa essa pessoa no sino.
-- A tela grava a tarefa e as subtarefas de uma vez pela rotina atd_tarefa_salvar (as regras de acesso valem
-- igual: ela roda como a pessoa logada). Nada aqui muda as Cobranças nem o resto do Atendimento.

-- 1) as tabelas
create table if not exists public.atd_tarefas (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  titulo          text not null check (length(btrim(titulo)) between 1 and 200),
  descricao       text check (descricao is null or length(descricao) <= 4000),
  responsavel_id  uuid references public.usuarios(id) on delete set null,
  criado_por      uuid default auth.uid() references public.usuarios(id) on delete set null,
  prazo           timestamptz,
  -- false = só o dia (o prazo fica no fim do dia, 23:59 de Brasília); true = dia e hora
  prazo_com_hora  boolean not null default false,
  prioridade      text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  status          text not null default 'pendente' check (status in ('pendente', 'andamento', 'concluida')),
  projeto         text check (projeto is null or length(projeto) <= 80),
  conversa_id     uuid references public.conversas(id) on delete set null,
  contato_id      uuid references public.contatos(id) on delete set null,
  cliente_nome    text check (cliente_nome is null or length(cliente_nome) <= 160),
  concluida_em    timestamptz,
  concluida_por   uuid references public.usuarios(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create table if not exists public.atd_tarefa_itens (
  id              uuid primary key default gen_random_uuid(),
  tarefa_id       uuid not null references public.atd_tarefas(id) on delete cascade,
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  texto           text not null check (length(btrim(texto)) between 1 and 300),
  feito           boolean not null default false,
  ordem           integer not null default 0,
  feito_em        timestamptz,
  criado_em       timestamptz not null default now()
);

create index if not exists atd_tarefas_org_status_prazo on public.atd_tarefas (organizacao_id, status, prazo);
create index if not exists atd_tarefas_responsavel on public.atd_tarefas (responsavel_id, status);
create index if not exists atd_tarefas_criado_por on public.atd_tarefas (criado_por);
create index if not exists atd_tarefas_conversa on public.atd_tarefas (conversa_id) where conversa_id is not null;
create index if not exists atd_tarefas_contato on public.atd_tarefas (contato_id) where contato_id is not null;
create index if not exists atd_tarefas_concluida_por on public.atd_tarefas (concluida_por) where concluida_por is not null;
create index if not exists atd_tarefa_itens_tarefa on public.atd_tarefa_itens (tarefa_id, ordem);
create index if not exists atd_tarefa_itens_org on public.atd_tarefa_itens (organizacao_id);

-- 2) antes de gravar a tarefa: limpa os textos, confere responsável e conversa (da mesma empresa), não deixa
--    trocar empresa nem autor, e carimba quando foi concluída. SECURITY DEFINER só para CONFERIR (a pessoa
--    pode não enxergar a lista inteira da equipe nem a conversa de outro atendente).
create or replace function public.atd_tarefas_antes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_ct  uuid;
  v_nome text;
begin
  new.titulo := btrim(new.titulo);
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  new.projeto := nullif(btrim(coalesce(new.projeto, '')), '');
  new.cliente_nome := nullif(btrim(coalesce(new.cliente_nome, '')), '');

  if tg_op = 'UPDATE' then
    new.organizacao_id := old.organizacao_id;
    new.criado_por := old.criado_por;
    new.criado_em := old.criado_em;
    new.atualizado_em := now();
  end if;

  if new.responsavel_id is not null and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    if not exists (select 1 from public.organizacao_usuarios ou
                    where ou.organizacao_id = new.organizacao_id and ou.usuario_id = new.responsavel_id and ou.status = 'ativo') then
      raise exception 'responsavel_fora_da_equipe';
    end if;
  end if;

  if new.conversa_id is not null and (tg_op = 'INSERT' or new.conversa_id is distinct from old.conversa_id) then
    select c.organizacao_id, c.contato_id into v_org, v_ct from public.conversas c where c.id = new.conversa_id;
    if v_org is distinct from new.organizacao_id then raise exception 'conversa_de_outra_empresa'; end if;
    new.contato_id := coalesce(v_ct, new.contato_id);
  elsif new.conversa_id is null and tg_op = 'UPDATE' and old.conversa_id is not null and new.contato_id is not distinct from old.contato_id then
    -- tirou o vínculo com a conversa: sai o cliente junto
    new.contato_id := null;
    new.cliente_nome := null;
  end if;

  if new.contato_id is not null and (tg_op = 'INSERT' or new.contato_id is distinct from old.contato_id) then
    select ct.organizacao_id, nullif(btrim(coalesce(ct.nome, '')), '') into v_org, v_nome from public.contatos ct where ct.id = new.contato_id;
    if v_org is distinct from new.organizacao_id then raise exception 'cliente_de_outra_empresa'; end if;
    new.cliente_nome := coalesce(new.cliente_nome, v_nome);
  end if;

  if new.status = 'concluida' then
    if tg_op = 'INSERT' or old.status <> 'concluida' then
      new.concluida_em := now();
      new.concluida_por := auth.uid();
    else
      new.concluida_em := old.concluida_em;
      new.concluida_por := old.concluida_por;
    end if;
  else
    new.concluida_em := null;
    new.concluida_por := null;
  end if;
  return new;
end;
$$;
revoke all on function public.atd_tarefas_antes() from public, anon, authenticated;
drop trigger if exists trg_atd_tarefas_antes on public.atd_tarefas;
create trigger trg_atd_tarefas_antes before insert or update on public.atd_tarefas
  for each row execute function public.atd_tarefas_antes();

-- 3) tarefa passada para outra pessoa (na criação ou depois): aviso no sino de quem recebeu
create or replace function public.atd_tarefas_avisar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quem text;
  v_prazo text;
begin
  if new.responsavel_id is null or new.status = 'concluida' then return null; end if;
  if new.responsavel_id is not distinct from auth.uid() then return null; end if; -- tarefa para si mesmo: sem aviso
  if tg_op = 'UPDATE' and new.responsavel_id is not distinct from old.responsavel_id then return null; end if;
  select nullif(btrim(u.nome), '') into v_quem from public.usuarios u where u.id = auth.uid();
  v_prazo := case when new.prazo is null then ''
                  when new.prazo_com_hora then ' · prazo ' || to_char(new.prazo at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
                  else ' · prazo ' || to_char(new.prazo at time zone 'America/Sao_Paulo', 'DD/MM') end;
  insert into public.atd_notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  values (new.organizacao_id, new.responsavel_id, 'tarefa', 'Nova tarefa para você',
          left(coalesce(v_quem, 'Alguém da equipe') || ' passou uma tarefa para você: ' || new.titulo || v_prazo, 500),
          '/tarefas?tarefa=' || new.id, new.id);
  return null;
end;
$$;
revoke all on function public.atd_tarefas_avisar() from public, anon, authenticated;
drop trigger if exists trg_atd_tarefas_avisar on public.atd_tarefas;
create trigger trg_atd_tarefas_avisar after insert or update of responsavel_id on public.atd_tarefas
  for each row execute function public.atd_tarefas_avisar();

-- 4) antes de gravar a subtarefa: a empresa vem da tarefa (que a pessoa precisa enxergar), não muda de tarefa,
--    e carimba quando foi feita
create or replace function public.atd_tarefa_itens_antes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    new.tarefa_id := old.tarefa_id;
    new.organizacao_id := old.organizacao_id;
    new.criado_em := old.criado_em;
  else
    select t.organizacao_id into new.organizacao_id from public.atd_tarefas t where t.id = new.tarefa_id;
    if new.organizacao_id is null then raise exception 'tarefa_nao_encontrada'; end if;
  end if;
  new.texto := btrim(new.texto);
  new.feito_em := case when not new.feito then null
                       when tg_op = 'UPDATE' and old.feito then old.feito_em
                       else now() end;
  return new;
end;
$$;
revoke all on function public.atd_tarefa_itens_antes() from public, anon, authenticated;
drop trigger if exists trg_atd_tarefa_itens_antes on public.atd_tarefa_itens;
create trigger trg_atd_tarefa_itens_antes before insert or update on public.atd_tarefa_itens
  for each row execute function public.atd_tarefa_itens_antes();

-- 5) quem vê, cria, muda e apaga
alter table public.atd_tarefas enable row level security;
alter table public.atd_tarefa_itens enable row level security;
revoke all on table public.atd_tarefas, public.atd_tarefa_itens from public, anon, authenticated;
grant select, insert, update, delete on table public.atd_tarefas, public.atd_tarefa_itens to authenticated;
grant all on table public.atd_tarefas, public.atd_tarefa_itens to service_role;

drop policy if exists atd_tarefas_sel on public.atd_tarefas;
drop policy if exists atd_tarefas_ins on public.atd_tarefas;
drop policy if exists atd_tarefas_upd on public.atd_tarefas;
drop policy if exists atd_tarefas_del on public.atd_tarefas;
-- ver: administrador, quem criou ou quem é o responsável
create policy atd_tarefas_sel on public.atd_tarefas as permissive for select to authenticated
  using (public.is_member(organizacao_id) and (
    criado_por = (select auth.uid()) or responsavel_id = (select auth.uid()) or public.org_papel(organizacao_id) = 'admin'));
-- criar: qualquer pessoa da empresa, sempre em nome próprio
create policy atd_tarefas_ins on public.atd_tarefas as permissive for insert to authenticated
  with check (public.is_member(organizacao_id) and criado_por = (select auth.uid()));
-- mudar: quem enxerga a tarefa. Passar a tarefa para OUTRA pessoa sem ser quem criou (nem o administrador)
-- faz a pessoa deixar de enxergá-la — o Postgres recusa essa troca direta, então ela passa pela rotina
-- atd_tarefa_passar (abaixo), que confere o mesmo acesso
create policy atd_tarefas_upd on public.atd_tarefas as permissive for update to authenticated
  using (public.is_member(organizacao_id) and (
    criado_por = (select auth.uid()) or responsavel_id = (select auth.uid()) or public.org_papel(organizacao_id) = 'admin'))
  with check (public.is_member(organizacao_id));
-- apagar: administrador ou quem criou
create policy atd_tarefas_del on public.atd_tarefas as permissive for delete to authenticated
  using (public.is_member(organizacao_id) and (
    criado_por = (select auth.uid()) or public.org_papel(organizacao_id) = 'admin'));

-- subtarefas: valem as regras da tarefa (a consulta à tarefa já passa pelas regras acima)
drop policy if exists atd_tarefa_itens_sel on public.atd_tarefa_itens;
drop policy if exists atd_tarefa_itens_ins on public.atd_tarefa_itens;
drop policy if exists atd_tarefa_itens_upd on public.atd_tarefa_itens;
drop policy if exists atd_tarefa_itens_del on public.atd_tarefa_itens;
create policy atd_tarefa_itens_sel on public.atd_tarefa_itens as permissive for select to authenticated
  using (exists (select 1 from public.atd_tarefas t where t.id = tarefa_id));
create policy atd_tarefa_itens_ins on public.atd_tarefa_itens as permissive for insert to authenticated
  with check (exists (select 1 from public.atd_tarefas t where t.id = tarefa_id));
create policy atd_tarefa_itens_upd on public.atd_tarefa_itens as permissive for update to authenticated
  using (exists (select 1 from public.atd_tarefas t where t.id = tarefa_id))
  with check (exists (select 1 from public.atd_tarefas t where t.id = tarefa_id));
create policy atd_tarefa_itens_del on public.atd_tarefa_itens as permissive for delete to authenticated
  using (exists (select 1 from public.atd_tarefas t where t.id = tarefa_id));

-- 6) passar a tarefa para outra pessoa da empresa (ou tirar o responsável: p_responsavel nulo). Quem pode: quem
--    enxerga a tarefa (administrador, quem criou ou quem está com ela). O gatilho confere que a pessoa é da equipe
--    e avisa quem recebeu.
create or replace function public.atd_tarefa_passar(p_id uuid, p_responsavel uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_criador uuid;
  v_resp uuid;
begin
  select t.organizacao_id, t.criado_por, t.responsavel_id into v_org, v_criador, v_resp from public.atd_tarefas t where t.id = p_id;
  if v_org is null or auth.uid() is null or not public.is_member(v_org)
     or not (v_criador = auth.uid() or v_resp = auth.uid() or coalesce(public.org_papel(v_org), '') = 'admin') then
    raise exception 'tarefa_nao_encontrada';
  end if;
  if v_resp is not distinct from p_responsavel then return; end if;
  update public.atd_tarefas set responsavel_id = p_responsavel where id = p_id;
end;
$$;
revoke all on function public.atd_tarefa_passar(uuid, uuid) from public, anon, authenticated;
grant execute on function public.atd_tarefa_passar(uuid, uuid) to authenticated, service_role;

-- 7) gravar a tarefa e as subtarefas de uma vez (criar: p_id nulo). Roda COMO A PESSOA (security invoker):
--    as regras acima valem igual. p_itens: [{id?, texto, feito}] na ordem da tela; o que sumiu da lista é apagado.
--    Ordem: subtarefas, depois a tarefa, e o responsável por último (quem passa a tarefa adiante pode deixar de
--    enxergá-la logo depois).
create or replace function public.atd_tarefa_salvar(p_org uuid, p_id uuid, p_dados jsonb, p_itens jsonb default null)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id    uuid := p_id;
  v_item  jsonb;
  v_ordem integer := 0;
  v_ids   uuid[] := '{}';
  v_iid   uuid;
  v_conv  uuid := nullif(p_dados->>'conversa_id', '')::uuid;
  v_ct    uuid := nullif(p_dados->>'contato_id', '')::uuid;
begin
  if p_dados is null or nullif(btrim(coalesce(p_dados->>'titulo', '')), '') is null then raise exception 'titulo_obrigatorio'; end if;
  if p_itens is not null and jsonb_typeof(p_itens) <> 'array' then raise exception 'itens_invalidos'; end if;
  if p_itens is not null and jsonb_array_length(p_itens) > 50 then raise exception 'itens_demais'; end if;

  if v_id is null then
    insert into public.atd_tarefas (organizacao_id, titulo, descricao, responsavel_id, prazo, prazo_com_hora, prioridade, status, projeto, conversa_id, contato_id, cliente_nome)
    values (p_org, p_dados->>'titulo', p_dados->>'descricao', nullif(p_dados->>'responsavel_id', '')::uuid,
            nullif(p_dados->>'prazo', '')::timestamptz, coalesce((p_dados->>'prazo_com_hora')::boolean, false),
            coalesce(nullif(p_dados->>'prioridade', ''), 'media'), coalesce(nullif(p_dados->>'status', ''), 'pendente'),
            p_dados->>'projeto', v_conv, v_ct, p_dados->>'cliente_nome')
    returning id into v_id;
  elsif not exists (select 1 from public.atd_tarefas t where t.id = v_id) then
    raise exception 'tarefa_nao_encontrada';
  end if;

  if p_itens is not null then
    for v_item in select x from jsonb_array_elements(p_itens) x loop
      if nullif(btrim(coalesce(v_item->>'texto', '')), '') is null then continue; end if;
      v_iid := null;
      if coalesce(v_item->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        update public.atd_tarefa_itens set texto = v_item->>'texto', feito = coalesce((v_item->>'feito')::boolean, false), ordem = v_ordem
         where id = (v_item->>'id')::uuid and tarefa_id = v_id
        returning id into v_iid;
      end if;
      if v_iid is null then
        insert into public.atd_tarefa_itens (tarefa_id, texto, feito, ordem)
        values (v_id, v_item->>'texto', coalesce((v_item->>'feito')::boolean, false), v_ordem)
        returning id into v_iid;
      end if;
      v_ids := v_ids || v_iid;
      v_ordem := v_ordem + 1;
    end loop;
    delete from public.atd_tarefa_itens where tarefa_id = v_id and not (id = any (v_ids));
  end if;

  if p_id is not null then
    update public.atd_tarefas set
      titulo = p_dados->>'titulo',
      descricao = p_dados->>'descricao',
      prazo = nullif(p_dados->>'prazo', '')::timestamptz,
      prazo_com_hora = coalesce((p_dados->>'prazo_com_hora')::boolean, false),
      prioridade = coalesce(nullif(p_dados->>'prioridade', ''), 'media'),
      status = coalesce(nullif(p_dados->>'status', ''), 'pendente'),
      projeto = p_dados->>'projeto',
      conversa_id = v_conv,
      contato_id = case when v_conv is null then v_ct else contato_id end,
      cliente_nome = case when v_conv is null and v_ct is null then null else coalesce(p_dados->>'cliente_nome', cliente_nome) end
     where id = v_id;
    -- o responsável por último (passar para outra pessoa pode tirar a tarefa da vista de quem passou)
    perform public.atd_tarefa_passar(v_id, nullif(p_dados->>'responsavel_id', '')::uuid);
  end if;
  return v_id;
end;
$$;
revoke all on function public.atd_tarefa_salvar(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.atd_tarefa_salvar(uuid, uuid, jsonb, jsonb) to authenticated, service_role;
