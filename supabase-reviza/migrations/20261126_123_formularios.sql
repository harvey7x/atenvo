-- 123 · FORMULÁRIOS DE CAPTAÇÃO (26/11, "igual" aos Formulários do sistema que a Reviza usava antes: um link que o cliente
-- preenche, com agendamento). O administrador monta em Atendimento › Automações › Formulários; o cliente abre
-- <site>/f/<endereço>, preenche e (se ligado) escolhe um horário livre. Cada envio:
--   • acha o cliente pelo telefone (DDD + 8 últimos) ou cria (origem 'formulario');
--   • cria o card na etapa escolhida (ou junta no card aberto que ele já tem), com as etiquetas, o responsável e as respostas;
--   • marca a reunião na Agenda, se ele escolheu horário (só horário livre, dentro das regras do formulário);
--   • o sino da equipe avisa como sempre ("Novo lead", "Reunião agendada" — os avisos da 114).
-- NADA é enviado ao cliente pelo WhatsApp. Proteção: campo-isca para robô, no máximo 30 envios por formulário a cada 10 min e
-- 3 por telefone por dia (os repetidos só atualizam). ADITIVA. Depende da 109 (agenda), 114 (avisos) e 117 (índice do telefone).

create table if not exists public.atd_formularios (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null,
  nome            text not null check (char_length(btrim(nome)) between 1 and 80),
  slug            text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,40}$'),
  titulo          text not null default '' check (char_length(titulo) <= 120),
  descricao       text not null default '' check (char_length(descricao) <= 600),
  campos          jsonb not null default '[]'::jsonb check (jsonb_typeof(campos) = 'array' and jsonb_array_length(campos) <= 20),
  coluna_id       uuid,                                  -- a etapa em que o card nasce (null = a de entrada do funil padrão)
  etiquetas       text[] not null default '{}',
  responsavel_id  uuid,                                  -- o dono do card (null = sem dono)
  agenda          jsonb not null default '{"ligado": false}'::jsonb,
  mensagem_final  text not null default 'Recebemos seus dados. Em breve a nossa equipe fala com você.' check (char_length(mensagem_final) <= 400),
  ativo           boolean not null default true,
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index if not exists atd_formularios_org on public.atd_formularios (organizacao_id);

create table if not exists public.atd_formulario_respostas (
  id               uuid primary key default gen_random_uuid(),
  formulario_id    uuid not null references public.atd_formularios(id) on delete cascade,
  organizacao_id   uuid not null,
  dados            jsonb not null default '{}'::jsonb,
  telefone_chave   text,
  contato_id       uuid,
  oportunidade_id  uuid,
  reuniao_id       uuid,
  repetido         boolean not null default false,
  criado_em        timestamptz not null default now()
);
create index if not exists atd_formulario_respostas_form on public.atd_formulario_respostas (formulario_id, criado_em desc);
create index if not exists atd_formulario_respostas_fone on public.atd_formulario_respostas (formulario_id, telefone_chave, criado_em desc);

alter table public.atd_formularios enable row level security;
alter table public.atd_formulario_respostas enable row level security;
drop policy if exists atd_formularios_admin on public.atd_formularios;
create policy atd_formularios_admin on public.atd_formularios for all to authenticated
  using (public.org_papel(organizacao_id) = 'admin') with check (public.org_papel(organizacao_id) = 'admin');
drop policy if exists atd_formulario_respostas_admin on public.atd_formulario_respostas;
create policy atd_formulario_respostas_admin on public.atd_formulario_respostas for select to authenticated using (public.org_papel(organizacao_id) = 'admin');
revoke all on public.atd_formularios, public.atd_formulario_respostas from public, anon;
grant select, insert, update, delete on public.atd_formularios to authenticated;
grant select on public.atd_formulario_respostas to authenticated;

create or replace function private.atd_formularios_tocar() returns trigger language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists atd_formularios_tocar on public.atd_formularios;
create trigger atd_formularios_tocar before update on public.atd_formularios for each row execute function private.atd_formularios_tocar();

-- os horários livres do formulário (São Paulo): dias da semana e faixa do formulário, de "duracao_min" em "duracao_min",
-- a partir de agora + antecedência, por "ate_dias" dias; sem os horários em que a pessoa da agenda já tem reunião marcada
create or replace function private.atd_formulario_horarios(p_form public.atd_formularios)
returns timestamptz[] language plpgsql stable security definer set search_path = '' as $$
declare
  a jsonb := coalesce(p_form.agenda, '{}'::jsonb);
  v_dur int := least(greatest(coalesce((a->>'duracao_min')::int, 30), 10), 240);
  v_ant int := least(greatest(coalesce((a->>'antecedencia_h')::int, 2), 0), 168);
  v_ate int := least(greatest(coalesce((a->>'ate_dias')::int, 14), 1), 60);
  v_ini time := coalesce(nullif(a->>'inicio', '')::time, '09:00');
  v_fim time := coalesce(nullif(a->>'fim', '')::time, '18:00');
  v_dias int[] := coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(a->'dias', '[1,2,3,4,5]'::jsonb)) x), '{1,2,3,4,5}');
  v_quem uuid := coalesce(nullif(a->>'responsavel_id', '')::uuid, p_form.responsavel_id);
  v_out timestamptz[] := '{}'; d date; t time; h timestamptz;
begin
  if coalesce((a->>'ligado')::boolean, false) is not true then return v_out; end if;
  for d in select generate_series((now() at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date + v_ate, interval '1 day')::date loop
    continue when not (extract(isodow from d)::int = any (v_dias));
    t := v_ini;
    while t + make_interval(mins => v_dur) <= v_fim loop
      h := (d + t) at time zone 'America/Sao_Paulo';
      if h >= now() + make_interval(hours => v_ant)
         and not exists (select 1 from public.atd_reunioes r where r.organizacao_id = p_form.organizacao_id and r.status = 'marcada'
                          and (v_quem is null or r.responsavel_id = v_quem)
                          and tstzrange(r.inicio, r.inicio + make_interval(mins => coalesce(r.duracao_min, 30))) && tstzrange(h, h + make_interval(mins => v_dur))) then
        v_out := v_out || h;
      end if;
      exit when cardinality(v_out) >= 200;
      t := t + make_interval(mins => v_dur);
    end loop;
    exit when cardinality(v_out) >= 200;
  end loop;
  return v_out;
end $$;
revoke all on function private.atd_formulario_horarios(public.atd_formularios) from public, anon, authenticated;

-- o que a página pública mostra (sem login): o formulário ligado, sem nada interno
create or replace function public.atd_formulario_publico(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare f public.atd_formularios;
begin
  select * into f from public.atd_formularios where slug = lower(btrim(coalesce(p_slug, ''))) and ativo;
  if not found then return null; end if;
  return jsonb_build_object(
    'titulo', coalesce(nullif(btrim(f.titulo), ''), f.nome), 'descricao', f.descricao, 'campos', f.campos,
    'empresa', coalesce((select o.nome from public.organizacoes o where o.id = f.organizacao_id), ''),
    'agenda', case when coalesce((f.agenda->>'ligado')::boolean, false)
                   then jsonb_build_object('ligado', true, 'duracao_min', coalesce((f.agenda->>'duracao_min')::int, 30), 'obrigatorio', coalesce((f.agenda->>'obrigatorio')::boolean, false),
                                           'horarios', to_jsonb(private.atd_formulario_horarios(f)))
                   else jsonb_build_object('ligado', false) end);
end $$;
revoke all on function public.atd_formulario_publico(text) from public;
grant execute on function public.atd_formulario_publico(text) to anon, authenticated;

-- o envio (sem login)
create or replace function public.atd_formulario_enviar(p_slug text, p_dados jsonb, p_horario timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f public.atd_formularios; v_funil uuid; v_col uuid; c jsonb; v_chave text; v_val text; v_nome text; v_fone text; v_email text;
  v_k text; v_ct uuid; v_op uuid; v_reu uuid; v_obs text := ''; v_rep boolean := false; v_quem uuid; v_dur int; v_res jsonb := '{}'::jsonb;
begin
  select * into f from public.atd_formularios where slug = lower(btrim(coalesce(p_slug, ''))) and ativo;
  if not found then raise exception 'formulario_indisponivel'; end if;
  if jsonb_typeof(coalesce(p_dados, 'null'::jsonb)) <> 'object' or length(p_dados::text) > 20000 then raise exception 'dados_invalidos'; end if;
  -- campo-isca: gente não vê; robô preenche. Responde "ok" e não grava nada.
  if nullif(btrim(coalesce(p_dados->>'_site', '')), '') is not null then return jsonb_build_object('ok', true, 'mensagem', f.mensagem_final); end if;
  if (select count(*) from public.atd_formulario_respostas r where r.formulario_id = f.id and r.criado_em > now() - interval '10 minutes') >= 30 then
    raise exception 'muitos_envios';
  end if;
  v_nome := left(btrim(coalesce(p_dados->>'nome', '')), 120);
  v_fone := regexp_replace(coalesce(p_dados->>'telefone', ''), '\D', '', 'g');
  if v_fone ~ '^[0-9]{10,11}$' then v_fone := '55' || v_fone; end if;
  v_email := nullif(lower(left(btrim(coalesce(p_dados->>'email', '')), 160)), '');
  if char_length(v_nome) < 2 then raise exception 'campo_obrigatorio:nome'; end if;
  if v_fone !~ '^55[1-9][0-9][0-9]{8,9}$' then raise exception 'telefone_invalido'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  -- as outras perguntas: obrigatórias e tamanho; viram as respostas no card
  for c in select * from jsonb_array_elements(f.campos) loop
    v_chave := c->>'chave';
    continue when v_chave in ('nome', 'telefone', 'email') or v_chave is null;
    v_val := left(btrim(coalesce(p_dados->>v_chave, '')), 1000);
    if coalesce((c->>'obrigatorio')::boolean, false) and v_val = '' then raise exception 'campo_obrigatorio:%', v_chave; end if;
    if v_val <> '' then v_obs := v_obs || E'\n• ' || coalesce(nullif(c->>'rotulo', ''), v_chave) || ': ' || v_val; end if;
  end loop;
  v_k := private.atd_chave_fone(v_fone);
  -- o mesmo telefone mais de 3 vezes no dia neste formulário: guarda a resposta, não mexe em mais nada
  if (select count(*) from public.atd_formulario_respostas r where r.formulario_id = f.id and r.telefone_chave = v_k and r.criado_em > now() - interval '24 hours') >= 3 then
    insert into public.atd_formulario_respostas (formulario_id, organizacao_id, dados, telefone_chave, repetido) values (f.id, f.organizacao_id, p_dados - '_site', v_k, true);
    return jsonb_build_object('ok', true, 'mensagem', f.mensagem_final);
  end if;
  -- 1. o cliente
  select id into v_ct from public.contatos where organizacao_id = f.organizacao_id and mesclado_para is null and private.atd_chave_fone(telefone) = v_k order by criado_em limit 1;
  if v_ct is null then
    insert into public.contatos (organizacao_id, nome, telefone, email, origem, etiquetas)
    values (f.organizacao_id, v_nome, v_fone, v_email, 'formulario', f.etiquetas) returning id into v_ct;
  else
    v_rep := true;
    update public.contatos set email = coalesce(email, v_email) where id = v_ct;
  end if;
  -- 2. o card (junta no aberto, se ele já tem)
  select id into v_funil from public.funis where organizacao_id = f.organizacao_id and padrao order by criado_em limit 1;
  v_col := coalesce((select id from public.funil_colunas where id = f.coluna_id and funil_id = v_funil and not arquivada),
                    (select id from public.funil_colunas where funil_id = v_funil and not arquivada order by entrada desc, ordem limit 1));
  v_obs := 'Formulário "' || f.nome || '" (' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ')' || v_obs;
  select id into v_op from public.oportunidades where organizacao_id = f.organizacao_id and contato_id = v_ct and funil_id = v_funil and status = 'em_andamento' limit 1;
  if v_op is null then
    insert into public.oportunidades (organizacao_id, contato_id, funil_id, coluna_id, titulo, telefone, contato_nome, origem, fonte_aquisicao, responsavel_id, etiquetas, observacoes, metadados)
    values (f.organizacao_id, v_ct, v_funil, v_col, v_nome, v_fone, v_nome, 'Formulário', f.nome, f.responsavel_id, f.etiquetas, v_obs,
            jsonb_build_object('formulario', jsonb_build_object('id', f.id, 'nome', f.nome)))
    returning id into v_op;
  else
    update public.oportunidades
       set etiquetas = (select coalesce(array_agg(distinct e), '{}') from unnest(coalesce(etiquetas, '{}') || f.etiquetas) e),
           observacoes = left(coalesce(nullif(observacoes, '') || E'\n\n', '') || v_obs, 8000)
     where id = v_op;
  end if;
  -- 3. a reunião (só horário livre do formulário)
  if p_horario is not null and coalesce((f.agenda->>'ligado')::boolean, false) then
    if not (p_horario = any (private.atd_formulario_horarios(f))) then raise exception 'horario_indisponivel'; end if;
    v_quem := coalesce(nullif(f.agenda->>'responsavel_id', '')::uuid, f.responsavel_id);
    v_dur := coalesce((f.agenda->>'duracao_min')::int, 30);
    insert into public.atd_reunioes (organizacao_id, titulo, tipo, inicio, duracao_min, responsavel_id, contato_id, observacao, status)
    values (f.organizacao_id, left('Formulário: ' || f.nome || ' · ' || v_nome, 160), coalesce(nullif(f.agenda->>'tipo', ''), 'reuniao'), p_horario, v_dur, v_quem, v_ct,
            'Marcada pelo próprio cliente no formulário "' || f.nome || '".', 'marcada')
    returning id into v_reu;
  elsif coalesce((f.agenda->>'ligado')::boolean, false) and coalesce((f.agenda->>'obrigatorio')::boolean, false) then
    raise exception 'campo_obrigatorio:horario';
  end if;
  insert into public.atd_formulario_respostas (formulario_id, organizacao_id, dados, telefone_chave, contato_id, oportunidade_id, reuniao_id, repetido)
  values (f.id, f.organizacao_id, p_dados - '_site', v_k, v_ct, v_op, v_reu, v_rep);
  return jsonb_build_object('ok', true, 'mensagem', f.mensagem_final, 'horario', case when v_reu is not null then p_horario end);
end $$;
revoke all on function public.atd_formulario_enviar(text, jsonb, timestamptz) from public;
grant execute on function public.atd_formulario_enviar(text, jsonb, timestamptz) to anon, authenticated;

-- a lista do administrador: os formulários e quantas respostas cada um teve (7 e 30 dias)
create or replace function public.atd_formularios_resumo()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'por_formulario', coalesce((select jsonb_object_agg(x.formulario_id, jsonb_build_object('d7', x.d7, 'd30', x.d30, 'reunioes', x.reunioes, 'ultima', x.ultima)) from (
        select r.formulario_id, count(*) filter (where r.criado_em > now() - interval '7 days') d7, count(*) filter (where r.criado_em > now() - interval '30 days') d30,
               count(*) filter (where r.reuniao_id is not null and r.criado_em > now() - interval '30 days') reunioes, max(r.criado_em) ultima
          from public.atd_formulario_respostas r where r.organizacao_id = v_org group by 1) x), '{}'::jsonb),
    'recentes', coalesce((select jsonb_agg(jsonb_build_object('quando', y.criado_em, 'formulario', y.form, 'cliente', y.cliente, 'repetido', y.repetido,
                                                              'reuniao', y.reuniao, 'oportunidade_id', y.oportunidade_id) order by y.criado_em desc) from (
        select r.criado_em, f.nome form, coalesce(ct.nome, r.dados->>'nome') cliente, r.repetido, (select re.inicio from public.atd_reunioes re where re.id = r.reuniao_id) reuniao, r.oportunidade_id
          from public.atd_formulario_respostas r join public.atd_formularios f on f.id = r.formulario_id left join public.contatos ct on ct.id = r.contato_id
         where r.organizacao_id = v_org order by r.criado_em desc limit 50) y), '[]'::jsonb));
end $$;
revoke all on function public.atd_formularios_resumo() from public, anon;
grant execute on function public.atd_formularios_resumo() to authenticated, service_role;

-- DESFAZER: drop function if exists public.atd_formularios_resumo(), public.atd_formulario_enviar(text, jsonb, timestamptz),
--   public.atd_formulario_publico(text), private.atd_formulario_horarios(public.atd_formularios), private.atd_formularios_tocar();
--   drop table if exists public.atd_formulario_respostas, public.atd_formularios;
