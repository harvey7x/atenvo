-- Presenciais — pedido do dono 29/10/2026.
--
-- Aba "Presenciais": um calendário onde a equipe marca o atendimento presencial de um
-- cliente. Ao marcar, sai uma mensagem no grupo DOCUMENTOS CLIENTES CAF (pelo MURILLO CHIP)
-- e o card do cliente vai para "Reunião Marcada". No dia, às 8h, sai o lembrete com os
-- presenciais do dia. Remarcar e desmarcar também avisam o grupo.
--
-- TEXTOS aprovados pelo dono em 29/10 (mudar só com o ok dele): presencial_texto e
-- presencial_lembrete_texto. A tela mostra a prévia com a mesma regra (src/data/presenciais.ts).
--
-- ENVIO: as mensagens entram na fila presenciais_avisos; o cron (1 min) chama a edge fn
-- presenciais-avisos só quando há pendente. A edge fn tem chave de liga/desliga
-- (PRESENCIAIS_AVISO_ATIVO, padrão 'nao': com 'nao' o aviso fica 'bloqueado' e não sai depois).

-- ---------------------------------------------------------------- tabelas
create table if not exists public.presenciais (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  oportunidade_id uuid,
  cliente_nome text not null,                -- o nome que vai nas mensagens
  quando timestamptz not null,
  observacao text,
  status text not null default 'marcado' check (status in ('marcado', 'desmarcado')),
  marcado_por uuid references public.usuarios(id),
  marcado_em timestamptz not null default now(),
  alterado_por uuid references public.usuarios(id),
  atualizado_em timestamptz not null default now(),
  desmarcado_em timestamptz
);
create index if not exists idx_presenciais_quando on public.presenciais (organizacao_id, quando);
create index if not exists idx_presenciais_contato on public.presenciais (contato_id) where status = 'marcado';
alter table public.presenciais enable row level security;
drop policy if exists presenciais_sel on public.presenciais;
create policy presenciais_sel on public.presenciais for select to authenticated
  using (public.is_member(organizacao_id));

create table if not exists public.presenciais_avisos (
  id bigserial primary key,
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  presencial_id uuid references public.presenciais(id) on delete cascade,   -- null = lembrete do dia
  tipo text not null check (tipo in ('marcado', 'remarcado', 'desmarcado', 'lembrete')),
  dia date,                                                                 -- lembrete: o dia
  texto text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviando', 'enviado', 'incerto', 'falhou', 'bloqueado')),
  tentativas int not null default 0,
  id_mensagem text,
  erro text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create unique index if not exists uq_presenciais_lembrete_dia
  on public.presenciais_avisos (organizacao_id, dia) where tipo = 'lembrete';
create index if not exists idx_presenciais_avisos_pend on public.presenciais_avisos (status, id) where status = 'pendente';
alter table public.presenciais_avisos enable row level security;
drop policy if exists presenciais_avisos_sel on public.presenciais_avisos;
create policy presenciais_avisos_sel on public.presenciais_avisos for select to authenticated
  using (public.is_member(organizacao_id));

-- ---------------------------------------------------------------- textos (aprovados 29/10)
-- "14h" / "16h30"
create or replace function public.presencial_hora_txt(p_em timestamptz)
returns text language sql stable set search_path = public, pg_temp as $$
  select to_char(p_em at time zone 'America/Sao_Paulo', 'FMHH24') || 'h'
         || case when extract(minute from p_em at time zone 'America/Sao_Paulo') = 0 then ''
                 else to_char(p_em at time zone 'America/Sao_Paulo', 'MI') end
$$;

-- "sexta, 31/10"
create or replace function public.presencial_dia_txt(p_em timestamptz)
returns text language sql stable set search_path = public, pg_temp as $$
  select (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])
           [extract(dow from p_em at time zone 'America/Sao_Paulo')::int + 1]
         || ', ' || to_char(p_em at time zone 'America/Sao_Paulo', 'DD/MM')
$$;

-- "na sexta, 31/10" / "no sábado, 01/11"
create or replace function public.presencial_na_txt(p_em timestamptz)
returns text language sql stable set search_path = public, pg_temp as $$
  select case when extract(dow from p_em at time zone 'America/Sao_Paulo')::int in (0, 6) then 'no ' else 'na ' end
         || public.presencial_dia_txt(p_em)
$$;

create or replace function public.presencial_texto(p_tipo text, p_nome text, p_quando timestamptz, p_quem text)
returns text language sql stable set search_path = public, pg_temp as $$
  select case p_tipo
    when 'marcado' then
      E'📅 *PRESENCIAL MARCADO*\n' || p_nome || ' foi marcado para atendimento presencial '
      || public.presencial_na_txt(p_quando) || ', às ' || public.presencial_hora_txt(p_quando) || E'.\n'
      || 'Marcado por ' || p_quem || '. No dia, aviso aqui de novo.'
    when 'remarcado' then
      E'🔁 *PRESENCIAL REMARCADO*\n' || p_nome || ' passou para '
      || public.presencial_dia_txt(p_quando) || ', às ' || public.presencial_hora_txt(p_quando) || E'.\n'
      || 'Remarcado por ' || p_quem || '.'
    when 'desmarcado' then
      E'❌ *PRESENCIAL DESMARCADO*\nO atendimento de ' || p_nome || ' '
      || public.presencial_na_txt(p_quando) || ', às ' || public.presencial_hora_txt(p_quando)
      || ' foi desmarcado por ' || p_quem || '.'
  end
$$;

-- O lembrete do dia: os presenciais MARCADOS do dia, por horário. Null se não há nenhum.
create or replace function public.presencial_lembrete_texto(p_org uuid, p_dia date)
returns text language sql stable set search_path = public, pg_temp as $$
  select E'📍 *HOJE TEM PRESENCIAL*\n'
         || string_agg(public.presencial_hora_txt(p.quando) || ' · ' || p.cliente_nome
                       || ' · marcado por ' || coalesce(u.nome, 'equipe'), E'\n' order by p.quando, p.cliente_nome)
         || E'\nNão se esqueçam!'
    from presenciais p
    left join usuarios u on u.id = p.marcado_por
   where p.organizacao_id = p_org and p.status = 'marcado'
     and (p.quando at time zone 'America/Sao_Paulo')::date = p_dia
  having count(*) > 0
$$;

-- ---------------------------------------------------------------- ações da tela
create or replace function public.presencial_marcar(p_org uuid, p_contato uuid, p_quando timestamptz, p_observacao text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_quem text; v_nome text; v_id uuid;
  v_opp uuid; v_funil uuid; v_col_atual uuid; v_ordem_atual int; v_reuniao uuid; v_ordem_reuniao int;
begin
  if v_uid is null or not public.is_member(p_org) then raise exception 'sem_permissao'; end if;
  if p_quando is null or p_quando < now() then raise exception 'presencial_no_passado'; end if;
  if p_quando > now() + interval '400 days' then raise exception 'presencial_longe_demais'; end if;

  select coalesce(nullif(btrim(c.nome), ''), c.telefone, 'Cliente') into v_nome
    from contatos c where c.id = p_contato and c.organizacao_id = p_org;
  if v_nome is null then raise exception 'contato_nao_encontrado'; end if;
  if exists (select 1 from presenciais p where p.contato_id = p_contato and p.status = 'marcado' and p.quando >= now()) then
    raise exception 'presencial_ja_marcado';
  end if;
  select coalesce(nullif(btrim(u.nome), ''), 'equipe') into v_quem from usuarios u where u.id = v_uid;

  -- o card do cliente (o aberto mais recente)
  select o.id, o.funil_id, o.coluna_id into v_opp, v_funil, v_col_atual
    from oportunidades o
   where o.organizacao_id = p_org and o.contato_id = p_contato and o.status = 'em_andamento'
   order by o.criado_em desc limit 1;

  insert into presenciais (organizacao_id, contato_id, oportunidade_id, cliente_nome, quando, observacao, marcado_por)
  values (p_org, p_contato, v_opp, v_nome, p_quando, nullif(btrim(coalesce(p_observacao, '')), ''), v_uid)
  returning id into v_id;

  -- Kanban: "Reunião Marcada" é quando a gente marca — só puxa para frente (Lead Novo / Qualificado)
  if v_opp is not null then
    select fc.id, fc.ordem into v_reuniao, v_ordem_reuniao from funil_colunas fc
     where fc.funil_id = v_funil and not fc.arquivada and upper(fc.nome) like 'REUNI%' order by fc.ordem limit 1;
    select fc.ordem into v_ordem_atual from funil_colunas fc where fc.id = v_col_atual;
    if v_reuniao is not null and coalesce(v_ordem_atual, -1) < v_ordem_reuniao then
      update oportunidades set coluna_id = v_reuniao where id = v_opp and status = 'em_andamento';
    end if;
  end if;

  insert into presenciais_avisos (organizacao_id, presencial_id, tipo, texto)
  values (p_org, v_id, 'marcado', public.presencial_texto('marcado', v_nome, p_quando, v_quem));
  return v_id;
end $$;
revoke all on function public.presencial_marcar(uuid, uuid, timestamptz, text) from public, anon;
grant execute on function public.presencial_marcar(uuid, uuid, timestamptz, text) to authenticated;

create or replace function public.presencial_remarcar(p_id uuid, p_quando timestamptz)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_p presenciais; v_quem text;
begin
  select * into v_p from presenciais where id = p_id for update;
  if v_p.id is null or v_uid is null or not public.is_member(v_p.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_p.status <> 'marcado' then raise exception 'presencial_desmarcado'; end if;
  if p_quando is null or p_quando < now() then raise exception 'presencial_no_passado'; end if;
  if p_quando > now() + interval '400 days' then raise exception 'presencial_longe_demais'; end if;
  if p_quando = v_p.quando then return; end if;
  select coalesce(nullif(btrim(u.nome), ''), 'equipe') into v_quem from usuarios u where u.id = v_uid;
  update presenciais set quando = p_quando, alterado_por = v_uid, atualizado_em = now() where id = p_id;
  -- o aviso de marcado ainda não saiu: sai ele mesmo, já com o horário novo (o grupo não vê "remarcado" de algo que não viu)
  update presenciais_avisos a
     set texto = public.presencial_texto('marcado', v_p.cliente_nome, p_quando,
                   coalesce((select nullif(btrim(u.nome), '') from usuarios u where u.id = v_p.marcado_por), 'equipe'))
   where a.presencial_id = p_id and a.tipo = 'marcado' and a.status = 'pendente';
  if not found then
    insert into presenciais_avisos (organizacao_id, presencial_id, tipo, texto)
    values (v_p.organizacao_id, p_id, 'remarcado', public.presencial_texto('remarcado', v_p.cliente_nome, p_quando, v_quem));
  end if;
end $$;
revoke all on function public.presencial_remarcar(uuid, timestamptz) from public, anon;
grant execute on function public.presencial_remarcar(uuid, timestamptz) to authenticated;

create or replace function public.presencial_desmarcar(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_p presenciais; v_quem text;
begin
  select * into v_p from presenciais where id = p_id for update;
  if v_p.id is null or v_uid is null or not public.is_member(v_p.organizacao_id) then raise exception 'sem_permissao'; end if;
  if v_p.status <> 'marcado' then return; end if;
  select coalesce(nullif(btrim(u.nome), ''), 'equipe') into v_quem from usuarios u where u.id = v_uid;
  update presenciais set status = 'desmarcado', desmarcado_em = now(), alterado_por = v_uid, atualizado_em = now()
   where id = p_id;
  -- desmarcar antes de o aviso de marcado sair: nada sai (o grupo nunca soube dele)
  update presenciais_avisos set status = 'bloqueado', erro = 'desmarcado antes de sair'
   where presencial_id = p_id and status = 'pendente';
  if exists (select 1 from presenciais_avisos a where a.presencial_id = p_id and a.tipo = 'marcado'
              and a.status in ('enviado', 'incerto', 'enviando')) then
    insert into presenciais_avisos (organizacao_id, presencial_id, tipo, texto)
    values (v_p.organizacao_id, p_id, 'desmarcado', public.presencial_texto('desmarcado', v_p.cliente_nome, v_p.quando, v_quem));
  end if;
end $$;
revoke all on function public.presencial_desmarcar(uuid) from public, anon;
grant execute on function public.presencial_desmarcar(uuid) to authenticated;

-- A agenda do período, com os nomes (a tela).
create or replace function public.presenciais_periodo(p_org uuid, p_ini timestamptz, p_fim timestamptz)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when not public.is_member(p_org) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'contato_id', p.contato_id, 'cliente_nome', p.cliente_nome,
             'telefone', c.telefone, 'quando', p.quando, 'observacao', p.observacao, 'status', p.status,
             'marcado_por', u.nome, 'marcado_em', p.marcado_em,
             'conversa_id', (select cv.id from conversas cv where cv.contato_id = p.contato_id
                              order by cv.ultima_interacao_em desc nulls last limit 1),
             'aviso', (select a.status from presenciais_avisos a where a.presencial_id = p.id
                        order by a.id desc limit 1))
           order by p.quando)
      from presenciais p
      left join contatos c on c.id = p.contato_id
      left join usuarios u on u.id = p.marcado_por
     where p.organizacao_id = p_org and p.quando >= p_ini and p.quando < p_fim), '[]'::jsonb) end
$$;
revoke all on function public.presenciais_periodo(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.presenciais_periodo(uuid, timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------- lembrete das 8h e disparo
-- Enfileira o lembrete de HOJE de cada organização que tem presencial hoje (uma vez por dia).
create or replace function public.presenciais_lembrete_enfileirar()
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare v_dia date := (now() at time zone 'America/Sao_Paulo')::date; v_n int;
begin
  insert into presenciais_avisos (organizacao_id, tipo, dia, texto)
  select o.org, 'lembrete', v_dia, public.presencial_lembrete_texto(o.org, v_dia)
    from (select distinct p.organizacao_id as org from presenciais p
           where p.status = 'marcado' and (p.quando at time zone 'America/Sao_Paulo')::date = v_dia) o
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.presenciais_lembrete_enfileirar() from public, anon, authenticated;

-- Chama a edge fn só quando há aviso esperando (o cron roda a cada minuto).
create or replace function public.presenciais_disparar()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from presenciais_avisos where status = 'pendente') then return false; end if;
  perform net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/presenciais-avisos',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-bot-secret', (select secret from webhook_config where chave = 'presenciais_avisos')),
    timeout_milliseconds := 60000);
  return true;
end $$;
revoke all on function public.presenciais_disparar() from public, anon, authenticated;

insert into public.webhook_config (chave, secret)
values ('presenciais_avisos', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (chave) do nothing;

select cron.schedule('presenciais-avisos', '* * * * *', $$ select public.presenciais_disparar(); $$);
-- 8h em São Paulo (UTC-3, sem horário de verão)
select cron.schedule('presenciais-lembrete', '0 11 * * *', $$ select public.presenciais_lembrete_enfileirar(); $$);

notify pgrst, 'reload schema';
