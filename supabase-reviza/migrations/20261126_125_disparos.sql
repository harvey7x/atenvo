-- 125 · DISPAROS EM LOTE (26/11, "igual" aos Disparos do sistema que a Reviza usava antes). O administrador escolhe QUEM
-- recebe (etapas, etiquetas, responsável, só cards em andamento, sem conversa há X dias), a MENSAGEM (texto com {{nome}},
-- e um arquivo dos Scripts, se quiser), o NÚMERO e o RITMO; confirma; e cada mensagem vira uma MENSAGEM AGENDADA
-- (a central de sempre: aparece lá, sai pelo número escolhido, pode ser cancelada uma a uma ou o disparo inteiro).
-- Ritmo por número (anti-spam): uma mensagem a cada "intervalo" (padrão 90–180 s, sorteado), só na janela de horário e nos
-- dias escolhidos, no máximo "máximo por dia". Fica de fora: quem pediu para não receber (opt-out), sem telefone válido,
-- card fechado (a não ser que peça "todos"). Até 2.000 por disparo. Nada sai sem alguém da equipe criar e confirmar. ADITIVA.

create table if not exists public.atd_disparos (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  nome           text not null check (char_length(btrim(nome)) between 1 and 80),
  canal_id       uuid not null,
  mensagem       jsonb not null,                 -- {tipo, texto, storage_path, mime, nome, tamanho}
  filtro         jsonb not null default '{}'::jsonb,
  ritmo          jsonb not null default '{}'::jsonb,
  status         text not null default 'agendado' check (status in ('agendado', 'cancelado', 'concluido')),
  total          int not null default 0,
  inicio_em      timestamptz,
  fim_previsto   timestamptz,
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  cancelado_em   timestamptz,
  cancelado_por  uuid
);
create index if not exists atd_disparos_org on public.atd_disparos (organizacao_id, criado_em desc);
create index if not exists mensagens_agendadas_disparo on public.mensagens_agendadas ((metadados->>'disparo_id')) where metadados ? 'disparo_id';
alter table public.atd_disparos enable row level security;
drop policy if exists atd_disparos_admin on public.atd_disparos;
create policy atd_disparos_admin on public.atd_disparos for select to authenticated using (public.org_papel(organizacao_id) = 'admin');
revoke all on public.atd_disparos from public, anon;
grant select on public.atd_disparos to authenticated;

-- quem o filtro pega (um por cliente): o card do funil padrão + o contato, sem opt-out e com telefone válido
create or replace function private.atd_disparo_alvos(p_org uuid, p_filtro jsonb)
returns table (contato_id uuid, nome text, telefone text, oportunidade_id uuid, etapa text)
language sql stable security definer set search_path = '' as $$
  with f as (
    select coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_filtro->'etapas', '[]')) x), '{}') as etapas,
           coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_filtro->'etiquetas', '[]')) x), '{}') as etiquetas,
           coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_filtro->'responsaveis', '[]')) x), '{}') as resps,
           coalesce((p_filtro->>'todos')::boolean, false) as todos,
           nullif(p_filtro->>'sem_conversa_dias', '')::int as sem_dias,
           coalesce((p_filtro->>'sem_responsavel')::boolean, false) as sem_resp),
  base as (
    select distinct on (o.contato_id) o.contato_id, coalesce(ct.nome, o.contato_nome, o.titulo) as nome, ct.telefone, o.id as oportunidade_id, fc.nome as etapa
      from public.oportunidades o
      join public.funis fu on fu.id = o.funil_id and fu.padrao
      join public.contatos ct on ct.id = o.contato_id and ct.mesclado_para is null
      left join public.funil_colunas fc on fc.id = o.coluna_id, f
     where o.organizacao_id = p_org and o.contato_id is not null
       and (f.todos or o.status = 'em_andamento') and o.status <> 'cancelado'
       and (cardinality(f.etapas) = 0 or o.coluna_id = any (f.etapas))
       and (cardinality(f.etiquetas) = 0 or (coalesce(o.etiquetas, '{}') || coalesce(ct.etiquetas, '{}')) && f.etiquetas)
       and (cardinality(f.resps) = 0 or o.responsavel_id = any (f.resps) or (f.sem_resp and o.responsavel_id is null))
       and (not f.sem_resp or cardinality(f.resps) > 0 or o.responsavel_id is null)
     order by o.contato_id, o.criado_em desc)
  select b.contato_id, b.nome, b.telefone, b.oportunidade_id, b.etapa
    from base b, f
   where regexp_replace(coalesce(b.telefone, ''), '\D', '', 'g') ~ '^(55)?[1-9][0-9][0-9]{8,9}$'
     and not exists (select 1 from public.atd_wa_optout x where x.contato_id = b.contato_id)
     and not exists (select 1 from public.wa_optout w where private.atd_chave_fone(w.telefone) = private.atd_chave_fone(b.telefone))
     and (f.sem_dias is null or not exists (
           select 1 from public.conversas cv join public.mensagens m on m.conversa_id = cv.id
            where cv.contato_id = b.contato_id and m.enviada_em > now() - make_interval(days => f.sem_dias)))
$$;
revoke all on function private.atd_disparo_alvos(uuid, jsonb) from public, anon, authenticated;

-- a prévia do "quem recebe" (sem criar nada)
create or replace function public.atd_disparo_previa(p_filtro jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'total', (select count(*) from private.atd_disparo_alvos(v_org, p_filtro)),
    'amostra', coalesce((select jsonb_agg(jsonb_build_object('nome', a.nome, 'etapa', a.etapa)) from (select * from private.atd_disparo_alvos(v_org, p_filtro) limit 6) a), '[]'::jsonb));
end $$;
revoke all on function public.atd_disparo_previa(jsonb) from public, anon;
grant execute on function public.atd_disparo_previa(jsonb) to authenticated;

-- os horários de cada mensagem: a partir do início, um intervalo sorteado entre min e max, só nos dias/horas da janela,
-- no máximo "max_por_dia" por dia (São Paulo)
create or replace function private.atd_disparo_horarios(p_n int, p_inicio timestamptz, p_ritmo jsonb)
returns timestamptz[] language plpgsql volatile set search_path = '' as $$
declare
  v_min int := least(greatest(coalesce((p_ritmo->>'intervalo_min_s')::int, 90), 60), 3600);
  v_max int := least(greatest(coalesce((p_ritmo->>'intervalo_max_s')::int, 180), 60), 7200);
  v_ini time := coalesce(nullif(p_ritmo->>'janela_inicio', '')::time, '08:00');
  v_fim time := coalesce(nullif(p_ritmo->>'janela_fim', '')::time, '20:00');
  v_dias int[] := coalesce((select array_agg(x::int) from jsonb_array_elements_text(coalesce(p_ritmo->'dias', '[1,2,3,4,5,6]'::jsonb)) x), '{1,2,3,4,5,6}');
  v_teto int := least(greatest(coalesce((p_ritmo->>'max_por_dia')::int, 150), 1), 1000);
  v_out timestamptz[] := '{}'; t timestamptz := greatest(coalesce(p_inicio, now()), now() + interval '1 minute');
  v_local timestamp; v_dia date; v_no_dia int := 0; v_dia_atual date := null; i int := 0; v_guarda int := 0;
begin
  if v_max < v_min then v_max := v_min; end if;
  while i < p_n loop
    v_guarda := v_guarda + 1; exit when v_guarda > p_n * 4 + 1000;
    v_local := t at time zone 'America/Sao_Paulo'; v_dia := v_local::date;
    if v_dia_atual is distinct from v_dia then v_dia_atual := v_dia; v_no_dia := 0; end if;
    -- fora do dia, fora da janela ou dia cheio: pula para o começo da janela do próximo dia válido
    if not (extract(isodow from v_dia)::int = any (v_dias)) or v_local::time >= v_fim or v_no_dia >= v_teto then
      v_dia := v_dia + 1;
      while not (extract(isodow from v_dia)::int = any (v_dias)) loop v_dia := v_dia + 1; end loop;
      t := (v_dia + v_ini) at time zone 'America/Sao_Paulo'; continue;
    end if;
    if v_local::time < v_ini then t := (v_dia + v_ini) at time zone 'America/Sao_Paulo'; continue; end if;
    v_out := v_out || t; i := i + 1; v_no_dia := v_no_dia + 1;
    t := t + make_interval(secs => v_min + floor(random() * (v_max - v_min + 1)));
  end loop;
  return v_out;
end $$;
revoke all on function private.atd_disparo_horarios(int, timestamptz, jsonb) from public, anon, authenticated;

-- criar o disparo: confere tudo, acha (ou cria, arquivada) a conversa de cada um no número escolhido e agenda as mensagens
create or replace function public.atd_disparo_criar(p_nome text, p_canal uuid, p_mensagem jsonb, p_filtro jsonb, p_ritmo jsonb, p_inicio timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := 'a1fa0000-0000-4000-8000-000000000001'; v_canal public.canais; v_id uuid; a record; v_horas timestamptz[]; v_n int;
  v_conv uuid; v_txt text; v_tipo text := coalesce(nullif(p_mensagem->>'tipo', ''), 'texto'); v_i int := 0; v_primeiro text;
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if char_length(btrim(coalesce(p_nome, ''))) not between 1 and 80 then raise exception 'nome_invalido'; end if;
  if v_tipo not in ('texto', 'imagem', 'audio', 'video', 'documento') then raise exception 'mensagem_invalida'; end if;
  if v_tipo = 'texto' and char_length(btrim(coalesce(p_mensagem->>'texto', ''))) < 2 then raise exception 'mensagem_vazia'; end if;
  if char_length(coalesce(p_mensagem->>'texto', '')) > 4000 then raise exception 'mensagem_longa'; end if;
  if v_tipo <> 'texto' and nullif(p_mensagem->>'storage_path', '') is null then raise exception 'arquivo_faltando'; end if;
  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_org;
  if v_canal.id is null then raise exception 'canal_invalido'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  select count(*) into v_n from private.atd_disparo_alvos(v_org, p_filtro);
  if v_n = 0 then raise exception 'ninguem_no_filtro'; end if;
  if v_n > 2000 then raise exception 'mais_de_2000'; end if;
  v_horas := private.atd_disparo_horarios(v_n, p_inicio, p_ritmo);
  insert into public.atd_disparos (organizacao_id, nome, canal_id, mensagem, filtro, ritmo, total, inicio_em, fim_previsto, criado_por)
  values (v_org, btrim(p_nome), p_canal, p_mensagem, coalesce(p_filtro, '{}'), coalesce(p_ritmo, '{}'), v_n, v_horas[1], v_horas[cardinality(v_horas)], auth.uid())
  returning id into v_id;
  for a in select * from private.atd_disparo_alvos(v_org, p_filtro) order by etapa nulls last, nome loop
    v_i := v_i + 1;
    select id into v_conv from public.conversas where organizacao_id = v_org and contato_id = a.contato_id and status <> 'fechada'
     order by arquivada_em asc nulls first, ultima_interacao_em desc nulls last limit 1;
    if v_conv is null then
      -- a conversa nasce ARQUIVADA: só aparece na lista quando o cliente responder (a mensagem nova a reabre)
      insert into public.conversas (organizacao_id, contato_id, canal_id, canal_origem_id, ultimo_canal_id, status, nao_lidas, ultima_lida_em, arquivada_em)
      values (v_org, a.contato_id, p_canal, p_canal, p_canal, 'aberta', 0, now(), now()) returning id into v_conv;
    else
      -- conversa sem número ou no número de histórico (veio do sistema anterior): fica com o número do disparo
      update public.conversas set canal_id = p_canal, canal_origem_id = coalesce(canal_origem_id, p_canal), ultimo_canal_id = coalesce(ultimo_canal_id, p_canal)
       where id = v_conv and (canal_id is null or canal_id = private.atd_guimoo_canal_historico());
    end if;
    v_primeiro := initcap(split_part(btrim(coalesce(a.nome, '')), ' ', 1));
    v_txt := nullif(btrim(replace(replace(coalesce(p_mensagem->>'texto', ''), '{{nome}}', coalesce(nullif(v_primeiro, ''), 'tudo bem')), '{{nome_completo}}', coalesce(a.nome, ''))), '');
    insert into public.mensagens_agendadas (organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, criado_por,
      tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, metadados)
    values (v_org, v_conv, a.contato_id, p_canal, v_canal.nome_interno, v_canal.numero_conectado, auth.uid(),
      v_tipo, v_txt, case when v_tipo = 'texto' then null else p_mensagem->>'storage_path' end, case when v_tipo = 'texto' then null else p_mensagem->>'mime' end,
      case when v_tipo = 'texto' then null else p_mensagem->>'nome' end, case when v_tipo = 'texto' then null else nullif(p_mensagem->>'tamanho', '')::bigint end,
      v_horas[v_i], jsonb_build_object('disparo_id', v_id, 'disparo_nome', btrim(p_nome)));
  end loop;
  return jsonb_build_object('id', v_id, 'total', v_n, 'inicio', v_horas[1], 'fim', v_horas[cardinality(v_horas)]);
end $$;
revoke all on function public.atd_disparo_criar(text, uuid, jsonb, jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.atd_disparo_criar(text, uuid, jsonb, jsonb, jsonb, timestamptz) to authenticated;

-- a estimativa do ritmo (para a tela mostrar quando termina, antes de criar)
create or replace function public.atd_disparo_estimar(p_n int, p_ritmo jsonb, p_inicio timestamptz default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare h timestamptz[];
begin
  if coalesce(public.org_papel('a1fa0000-0000-4000-8000-000000000001'), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  h := private.atd_disparo_horarios(least(greatest(coalesce(p_n, 0), 0), 2000), p_inicio, p_ritmo);
  return jsonb_build_object('inicio', h[1], 'fim', h[cardinality(h)], 'dias', (select count(distinct (x at time zone 'America/Sao_Paulo')::date) from unnest(h) x));
end $$;
revoke all on function public.atd_disparo_estimar(int, jsonb, timestamptz) from public, anon;
grant execute on function public.atd_disparo_estimar(int, jsonb, timestamptz) to authenticated;

-- cancelar o que ainda não saiu
create or replace function public.atd_disparo_cancelar(p_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_n int;
begin
  select organizacao_id into v_org from public.atd_disparos where id = p_id;
  if v_org is null or coalesce(public.org_papel(v_org), '') <> 'admin' then raise exception 'sem_permissao'; end if;
  update public.mensagens_agendadas set status = 'cancelada', cancelada_em = now(), cancelada_por = auth.uid()
   where organizacao_id = v_org and metadados->>'disparo_id' = p_id::text and status = 'agendada';
  get diagnostics v_n = row_count;
  update public.atd_disparos set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid() where id = p_id and status = 'agendado';
  return v_n;
end $$;
revoke all on function public.atd_disparo_cancelar(uuid) from public, anon;
grant execute on function public.atd_disparo_cancelar(uuid) to authenticated;

-- a lista com o andamento de cada disparo (agendadas, enviadas, falhas, canceladas e quantos responderam)
create or replace function public.atd_disparos_lista()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'nome', d.nome, 'status', d.status, 'total', d.total, 'inicio', d.inicio_em, 'fim', d.fim_previsto,
      'criado_em', d.criado_em, 'canal', (select coalesce(nullif(btrim(c.nome_interno), ''), c.numero_conectado) from public.canais c where c.id = d.canal_id),
      'texto', left(coalesce(d.mensagem->>'texto', ''), 160), 'arquivo', d.mensagem->>'nome',
      'agendadas', x.agendadas, 'enviadas', x.enviadas, 'falhas', x.falhas, 'canceladas', x.canceladas, 'responderam', x.responderam) order by d.criado_em desc)
    from public.atd_disparos d
    cross join lateral (
      select count(*) filter (where a.status in ('agendada', 'processando')) agendadas, count(*) filter (where a.status = 'enviada') enviadas,
             count(*) filter (where a.status in ('falhou', 'expirada', 'bloqueada')) falhas, count(*) filter (where a.status = 'cancelada') canceladas,
             count(*) filter (where a.status = 'enviada' and exists (select 1 from public.mensagens m where m.conversa_id = a.conversa_id and m.direcao = 'entrada' and m.enviada_em > a.enviada_em)) responderam
        from public.mensagens_agendadas a where a.organizacao_id = v_org and a.metadados->>'disparo_id' = d.id::text) x
   where d.organizacao_id = v_org), '[]'::jsonb);
end $$;
revoke all on function public.atd_disparos_lista() from public, anon;
grant execute on function public.atd_disparos_lista() to authenticated;

-- DESFAZER (cancela o que não saiu): update public.mensagens_agendadas set status = 'cancelada' where metadados ? 'disparo_id' and status = 'agendada';
--   drop function if exists public.atd_disparos_lista(), public.atd_disparo_cancelar(uuid), public.atd_disparo_estimar(int, jsonb, timestamptz),
--   public.atd_disparo_criar(text, uuid, jsonb, jsonb, jsonb, timestamptz), private.atd_disparo_horarios(int, timestamptz, jsonb),
--   public.atd_disparo_previa(jsonb), private.atd_disparo_alvos(uuid, jsonb); drop table if exists public.atd_disparos;
