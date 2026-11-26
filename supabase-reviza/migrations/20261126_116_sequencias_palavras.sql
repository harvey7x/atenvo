-- 116 · SEQUÊNCIAS e AUTOMAÇÃO POR PALAVRAS (26/11, "igual" ao sistema que a Reviza usava antes: Automações › Sequências —
-- "roteiros de mensagens que você dispara na conversa, na hora que escolher; não começam sozinhos" — e › Automação por
-- palavras — "ações automáticas quando o lead ou a equipe escrevem uma palavra-chave": mover o lead de etapa).
--   atd_sequencias             os modelos: passos (texto ou mídia de um script) com a espera antes de cada um; "parar se o
--                              cliente responder"
--   atd_aplicar_sequencia      a pessoa aplica um modelo numa conversa: vira mensagens_agendadas (o mesmo envio de sempre,
--                              com as mesmas travas do número), cada passo na sua hora
--   atd_regras_palavras        as regras: palavras (contém, exato, começa com, termina com, regex), palavras para ignorar,
--                              OU/E, onde procurar (última mensagem, últimas N, toda a conversa), de quem (todas, só do
--                              cliente, só da equipe) e para qual etapa o card vai
--   atd_regras_palavras_log    o histórico do que cada regra fez
--   gatilho AFTER INSERT em mensagens: (1) cliente respondeu → cancela o resto das sequências "parar se responder"; (2) aplica
--   as regras. Erro aqui NUNCA derruba a mensagem (vira aviso no log do banco).
-- ADITIVA. Depende da 93. DESFAZER no fim.

-- 1) os modelos de sequência --------------------------------------------------------------------------------------------
create table if not exists public.atd_sequencias (
  id                 uuid primary key default gen_random_uuid(),
  organizacao_id     uuid not null references public.organizacoes(id) on delete cascade,
  nome               text not null,
  categoria          text,
  descricao          text,
  passos             jsonb not null default '[]'::jsonb,
  parar_se_responder boolean not null default true,
  ativo              boolean not null default true,
  criado_por         uuid,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint atd_seq_nome check (char_length(btrim(nome)) between 1 and 80),
  constraint atd_seq_cat check (categoria is null or char_length(categoria) <= 40),
  constraint atd_seq_desc check (descricao is null or char_length(descricao) <= 300),
  constraint atd_seq_passos check (jsonb_typeof(passos) = 'array' and jsonb_array_length(passos) between 1 and 20)
);
create unique index if not exists atd_seq_nome_uniq on public.atd_sequencias (organizacao_id, lower(btrim(nome)));
alter table public.atd_sequencias enable row level security;
revoke all on public.atd_sequencias from public, anon, authenticated;
grant select, insert, update, delete on public.atd_sequencias to authenticated;
grant all on public.atd_sequencias to service_role;
drop policy if exists atd_seq_ler on public.atd_sequencias;
create policy atd_seq_ler on public.atd_sequencias for select to authenticated
  using ((select public.is_member(organizacao_id)) or (select public.is_platform_admin()));
drop policy if exists atd_seq_gestao on public.atd_sequencias;
create policy atd_seq_gestao on public.atd_sequencias for all to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') in ('admin', 'supervisor') or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') in ('admin', 'supervisor') or (select public.is_platform_admin()));

-- cada passo: {tipo: texto|imagem|audio|video|documento, texto, storage_path, mime, nome, tamanho, espera_min}
create or replace function private.atd_seq_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p jsonb; v_tipo text; v_espera int;
begin
  new.nome := btrim(new.nome);
  new.categoria := nullif(btrim(coalesce(new.categoria, '')), '');
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  for p in select value from jsonb_array_elements(new.passos) loop
    v_tipo := p->>'tipo';
    if v_tipo not in ('texto', 'imagem', 'audio', 'video', 'documento') then raise exception 'passo_tipo_invalido'; end if;
    if v_tipo = 'texto' and char_length(btrim(coalesce(p->>'texto', ''))) = 0 then raise exception 'passo_texto_vazio'; end if;
    if char_length(coalesce(p->>'texto', '')) > 4096 then raise exception 'passo_texto_longo'; end if;
    if v_tipo <> 'texto' and left(coalesce(p->>'storage_path', ''), length(new.organizacao_id::text) + 1) <> new.organizacao_id::text || '/' then raise exception 'passo_midia_invalida'; end if;
    v_espera := coalesce(nullif(p->>'espera_min', '')::int, 0);
    if v_espera < 0 or v_espera > 60 * 24 * 30 then raise exception 'passo_espera_invalida'; end if;
  end loop;
  new.atualizado_em := now();
  if tg_op = 'INSERT' then new.criado_por := coalesce(auth.uid(), new.criado_por); end if;
  return new;
end $$;
revoke all on function private.atd_seq_carimbo() from public, anon, authenticated;
drop trigger if exists atd_seq_carimbo on public.atd_sequencias;
create trigger atd_seq_carimbo before insert or update on public.atd_sequencias for each row execute function private.atd_seq_carimbo();

-- aplicar numa conversa: as mesmas travas do agendamento de sempre (contato com telefone, número conectado e sem restrição)
create or replace function public.atd_aplicar_sequencia(p_modelo uuid, p_conversa uuid, p_canal uuid, p_inicio timestamptz default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_contato uuid; v_tel text; v_canal public.canais%rowtype; m public.atd_sequencias%rowtype;
  v_seq uuid := gen_random_uuid(); v_quando timestamptz; v_i int := 0; p jsonb; v_tipo text;
begin
  select organizacao_id, contato_id into v_org, v_contato from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.atd_vejo_conversa(p_conversa))) then raise exception 'sem_acesso'; end if;
  select * into m from public.atd_sequencias where id = p_modelo and organizacao_id = v_org;
  if m.id is null then raise exception 'sequencia_nao_encontrada'; end if;
  if not m.ativo then raise exception 'sequencia_desligada'; end if;
  select telefone into v_tel from public.contatos where id = v_contato;
  if v_tel is null or length(regexp_replace(v_tel, '\D', '', 'g')) < 10 then raise exception 'contato_sem_telefone'; end if;
  select * into v_canal from public.canais where id = p_canal and organizacao_id = v_org;
  if v_canal.id is null then raise exception 'canal_invalido'; end if;
  if v_canal.ativo = false then raise exception 'canal_inativo'; end if;
  if v_canal.status_integracao::text <> 'conectado' then raise exception 'canal_desconectado'; end if;
  if v_canal.envio_restrito then raise exception 'canal_restrito'; end if;
  if v_canal.conflito_com is not null then raise exception 'canal_em_conflito'; end if;
  -- a mesma sequência não roda duas vezes ao mesmo tempo na conversa
  if exists (select 1 from public.mensagens_agendadas a where a.conversa_id = p_conversa and a.status in ('agendada', 'processando')
              and a.metadados->>'sequencia_modelo_id' = p_modelo::text) then raise exception 'sequencia_ja_rodando'; end if;
  v_quando := greatest(coalesce(p_inicio, now() + interval '1 minute'), now() + interval '45 seconds');
  for p in select value from jsonb_array_elements(m.passos) loop
    v_tipo := p->>'tipo';
    -- a espera vale ANTES do passo; entre dois passos, no mínimo 1 minuto (preserva a ordem sob o ritmo do número)
    if v_i > 0 then v_quando := v_quando + greatest(coalesce(nullif(p->>'espera_min', '')::int, 1), 1) * interval '1 minute'; end if;
    insert into public.mensagens_agendadas (
      organizacao_id, conversa_id, contato_id, canal_id, nome_canal_snapshot, telefone_canal_snapshot, criado_por,
      tipo, texto, storage_path, mime_type, nome_arquivo, tamanho_bytes, executar_em, sequencia_id, ordem_na_sequencia, metadados)
    values (
      v_org, p_conversa, v_contato, p_canal, v_canal.nome_interno, v_canal.numero_conectado, auth.uid(),
      v_tipo, nullif(btrim(coalesce(p->>'texto', '')), ''),
      case when v_tipo = 'texto' then null else p->>'storage_path' end,
      case when v_tipo = 'texto' then null else p->>'mime' end,
      case when v_tipo = 'texto' then null else p->>'nome' end,
      case when v_tipo = 'texto' then null else nullif(p->>'tamanho', '')::bigint end,
      v_quando, v_seq, v_i,
      jsonb_build_object('sequencia_modelo_id', m.id, 'sequencia_nome', m.nome, 'parar_se_responder', m.parar_se_responder,
                         'responsavel_no_agendamento', (select responsavel_id from public.contatos where id = v_contato)));
    v_i := v_i + 1;
  end loop;
  return v_i;
end $$;
revoke all on function public.atd_aplicar_sequencia(uuid, uuid, uuid, timestamptz) from public, anon;
grant execute on function public.atd_aplicar_sequencia(uuid, uuid, uuid, timestamptz) to authenticated, service_role;

-- 2) automação por palavras ---------------------------------------------------------------------------------------------
create table if not exists public.atd_regras_palavras (
  id             uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  nome           text not null,
  descricao      text,
  palavras       jsonb not null default '[]'::jsonb,
  ignorar        text[] not null default '{}',
  operador       text not null default 'ou',
  onde           text not null default 'ultima',
  ultimas_n      int not null default 5,
  quem           text not null default 'lead',
  coluna_id      uuid references public.funil_colunas(id) on delete set null,
  ativo          boolean not null default true,
  ordem          int not null default 0,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint atd_rp_nome check (char_length(btrim(nome)) between 1 and 80),
  constraint atd_rp_desc check (descricao is null or char_length(descricao) <= 300),
  constraint atd_rp_palavras check (jsonb_typeof(palavras) = 'array' and jsonb_array_length(palavras) between 1 and 50),
  constraint atd_rp_ignorar check (cardinality(ignorar) <= 50),
  constraint atd_rp_operador check (operador in ('ou', 'e')),
  constraint atd_rp_onde check (onde in ('ultima', 'ultimas', 'conversa')),
  constraint atd_rp_n check (ultimas_n between 1 and 50),
  constraint atd_rp_quem check (quem in ('todas', 'lead', 'equipe'))
);
create table if not exists public.atd_regras_palavras_log (
  id              bigint generated always as identity primary key,
  regra_id        uuid not null references public.atd_regras_palavras(id) on delete cascade,
  organizacao_id  uuid not null,
  conversa_id     uuid,
  oportunidade_id uuid,
  de_coluna       text,
  para_coluna     text,
  palavra         text,
  criado_em       timestamptz not null default now()
);
create index if not exists atd_rp_ativas on public.atd_regras_palavras (organizacao_id) where ativo;
create index if not exists atd_rp_log_quando on public.atd_regras_palavras_log (organizacao_id, criado_em desc);
alter table public.atd_regras_palavras enable row level security;
alter table public.atd_regras_palavras_log enable row level security;
revoke all on public.atd_regras_palavras, public.atd_regras_palavras_log from public, anon, authenticated;
grant select, insert, update, delete on public.atd_regras_palavras to authenticated;
grant select on public.atd_regras_palavras_log to authenticated;
grant all on public.atd_regras_palavras, public.atd_regras_palavras_log to service_role;
drop policy if exists atd_rp_admin on public.atd_regras_palavras;
create policy atd_rp_admin on public.atd_regras_palavras for all to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()))
  with check (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));
drop policy if exists atd_rp_log_admin on public.atd_regras_palavras_log;
create policy atd_rp_log_admin on public.atd_regras_palavras_log for select to authenticated
  using (coalesce((select public.org_papel(organizacao_id)), '') = 'admin' or (select public.is_platform_admin()));

-- cada palavra: {texto, modo: contem|exato|comeca|termina|regex}. A etapa de destino é neutra ou de venda (nunca perda:
-- a perda pede o motivo, que só uma pessoa dá).
create or replace function private.atd_rp_carimbo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p jsonb; v_res text;
begin
  new.nome := btrim(new.nome);
  new.descricao := nullif(btrim(coalesce(new.descricao, '')), '');
  new.ignorar := coalesce((select array_agg(distinct btrim(x)) from unnest(new.ignorar) x where btrim(x) <> ''), '{}');
  for p in select value from jsonb_array_elements(new.palavras) loop
    if char_length(btrim(coalesce(p->>'texto', ''))) = 0 or char_length(p->>'texto') > 200 then raise exception 'palavra_invalida'; end if;
    if coalesce(p->>'modo', 'contem') not in ('contem', 'exato', 'comeca', 'termina', 'regex') then raise exception 'modo_invalido'; end if;
    if p->>'modo' = 'regex' then
      begin perform 'x' ~* (p->>'texto'); exception when others then raise exception 'regex_invalida'; end;
    end if;
  end loop;
  if new.coluna_id is not null then
    select resultado into v_res from public.funil_colunas where id = new.coluna_id and organizacao_id = new.organizacao_id;
    if not found then raise exception 'etapa_de_outra_empresa'; end if;
    if v_res = 'perdido' then raise exception 'etapa_de_perda'; end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;
revoke all on function private.atd_rp_carimbo() from public, anon, authenticated;
drop trigger if exists atd_rp_carimbo on public.atd_regras_palavras;
create trigger atd_rp_carimbo before insert or update on public.atd_regras_palavras for each row execute function private.atd_rp_carimbo();

-- texto sem acento e em minúsculas (a comparação é assim, como lá)
create or replace function private.atd_sem_acento(p text)
returns text language sql immutable set search_path = '' as $$
  select lower(translate(coalesce(p, ''), 'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ', 'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'))
$$;
revoke all on function private.atd_sem_acento(text) from public, anon, authenticated;

create or replace function private.atd_casa_palavra(p_texto text, p_palavra jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare t text := private.atd_sem_acento(p_texto); w text := private.atd_sem_acento(btrim(p_palavra->>'texto'));
begin
  case coalesce(p_palavra->>'modo', 'contem')
    when 'exato' then return btrim(t) = w;
    when 'comeca' then return left(btrim(t), char_length(w)) = w;
    when 'termina' then return right(btrim(t), char_length(w)) = w;
    when 'regex' then begin return coalesce(p_texto, '') ~* (p_palavra->>'texto'); exception when others then return false; end;
    else return strpos(t, w) > 0;
  end case;
end $$;
revoke all on function private.atd_casa_palavra(text, jsonb) from public, anon, authenticated;

create or replace function private.atd_mensagem_automacoes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r public.atd_regras_palavras%rowtype; v_opp public.oportunidades%rowtype; v_texto text; v_achou text; v_ok boolean;
  p jsonb; v_de text; v_para text; v_ign text;
begin
  if new.tipo in ('sistema', 'nota_interna') then return new; end if;
  begin
    -- (1) o cliente respondeu: as sequências "parar se responder" desta conversa param aqui
    if new.direcao = 'entrada' then
      update public.mensagens_agendadas a set status = 'cancelada', cancelada_em = now(), motivo_bloqueio = 'cliente_respondeu'
       where a.conversa_id = new.conversa_id and a.status = 'agendada' and (a.metadados->>'parar_se_responder')::boolean is true;
    end if;
    -- (2) as regras por palavra
    if not exists (select 1 from public.atd_regras_palavras where organizacao_id = new.organizacao_id and ativo and coluna_id is not null) then return new; end if;
    select o.* into v_opp from public.oportunidades o join public.conversas c on c.contato_id = o.contato_id
     where c.id = new.conversa_id and o.organizacao_id = new.organizacao_id and o.status = 'em_andamento'
     order by o.criado_em desc limit 1;
    if v_opp.id is null then return new; end if;
    for r in select * from public.atd_regras_palavras where organizacao_id = new.organizacao_id and ativo and coluna_id is not null order by ordem, criado_em loop
      if r.coluna_id = v_opp.coluna_id then continue; end if;
      -- de quem é a mensagem que disparou
      if r.quem = 'lead' and new.direcao <> 'entrada' then continue; end if;
      if r.quem = 'equipe' and (new.direcao <> 'saida' or coalesce(new.origem, '') = 'bot') then continue; end if;
      -- onde procurar
      if r.onde = 'ultima' then v_texto := coalesce(new.conteudo, '') || ' ' || coalesce(new.metadados->>'transcricao', '');
      else
        select string_agg(coalesce(m.conteudo, '') || ' ' || coalesce(m.metadados->>'transcricao', ''), ' ') into v_texto from (
          select m.conteudo, m.metadados from public.mensagens m
           where m.conversa_id = new.conversa_id and m.tipo not in ('sistema', 'nota_interna')
             and (r.quem = 'todas' or (r.quem = 'lead' and m.direcao = 'entrada') or (r.quem = 'equipe' and m.direcao = 'saida' and coalesce(m.origem, '') <> 'bot'))
           order by m.enviada_em desc limit case when r.onde = 'ultimas' then r.ultimas_n else 200 end) m;
      end if;
      -- palavras para ignorar
      v_ign := null;
      select x into v_ign from unnest(r.ignorar) x where strpos(private.atd_sem_acento(v_texto), private.atd_sem_acento(x)) > 0 limit 1;
      if v_ign is not null then continue; end if;
      -- OU: qualquer palavra; E: todas
      v_achou := null; v_ok := r.operador = 'e';
      for p in select value from jsonb_array_elements(r.palavras) loop
        if private.atd_casa_palavra(v_texto, p) then v_achou := coalesce(v_achou, p->>'texto'); if r.operador = 'ou' then v_ok := true; exit; end if;
        elsif r.operador = 'e' then v_ok := false; exit; end if;
      end loop;
      if not v_ok or v_achou is null then continue; end if;
      select nome into v_de from public.funil_colunas where id = v_opp.coluna_id;
      select nome into v_para from public.funil_colunas where id = r.coluna_id;
      update public.oportunidades set coluna_id = r.coluna_id where id = v_opp.id;
      insert into public.atd_regras_palavras_log (regra_id, organizacao_id, conversa_id, oportunidade_id, de_coluna, para_coluna, palavra)
      values (r.id, r.organizacao_id, new.conversa_id, v_opp.id, v_de, v_para, v_achou);
      exit; -- uma regra por mensagem: a primeira que casar (pela ordem)
    end loop;
  exception when others then
    raise warning 'atd_mensagem_automacoes: %', sqlerrm;
  end;
  return new;
end $$;
revoke all on function private.atd_mensagem_automacoes() from public, anon, authenticated;
drop trigger if exists atd_mensagem_automacoes on public.mensagens;
create trigger atd_mensagem_automacoes after insert on public.mensagens for each row execute function private.atd_mensagem_automacoes();

-- o histórico das duas automações (só o administrador)
create or replace function public.atd_automacoes_historico(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
  v_dias int := least(greatest(coalesce(p_dias, 30), 1), 180);
  v_ini timestamptz := now() - make_interval(days => v_dias);
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'regras', coalesce((select jsonb_agg(r.j order by r.criado_em desc) from (
                select l.criado_em, jsonb_build_object('quando', l.criado_em, 'regra', g.nome, 'de', l.de_coluna, 'para', l.para_coluna, 'palavra', l.palavra,
                         'conversa_id', l.conversa_id, 'contato', coalesce(nullif(btrim(ct.nome), ''), 'Cliente sem nome')) as j
                  from public.atd_regras_palavras_log l join public.atd_regras_palavras g on g.id = l.regra_id
                  left join public.conversas c on c.id = l.conversa_id left join public.contatos ct on ct.id = c.contato_id
                 where l.organizacao_id = v_org and l.criado_em >= v_ini order by l.criado_em desc limit 60) r), '[]'::jsonb),
    'sequencias', coalesce((select jsonb_agg(x.j order by x.ultima desc) from (
                select max(a.criado_em) as ultima, jsonb_build_object('nome', a.metadados->>'sequencia_nome', 'aplicadas', count(distinct a.sequencia_id),
                         'enviadas', count(*) filter (where a.status = 'enviada'), 'agendadas', count(*) filter (where a.status = 'agendada'),
                         'paradas', count(*) filter (where a.status = 'cancelada'), 'falharam', count(*) filter (where a.status in ('falhou', 'bloqueada', 'expirada'))) as j
                  from public.mensagens_agendadas a
                 where a.organizacao_id = v_org and a.criado_em >= v_ini and a.metadados ? 'sequencia_modelo_id'
                 group by a.metadados->>'sequencia_modelo_id', a.metadados->>'sequencia_nome') x), '[]'::jsonb));
end $$;
revoke all on function public.atd_automacoes_historico(int) from public, anon;
grant execute on function public.atd_automacoes_historico(int) to authenticated, service_role;

-- DESFAZER:
--   drop trigger if exists atd_mensagem_automacoes on public.mensagens;
--   drop function if exists public.atd_automacoes_historico(int), private.atd_mensagem_automacoes(), private.atd_casa_palavra(text, jsonb),
--     private.atd_sem_acento(text), private.atd_rp_carimbo(), public.atd_aplicar_sequencia(uuid, uuid, uuid, timestamptz), private.atd_seq_carimbo();
--   drop table if exists public.atd_regras_palavras_log, public.atd_regras_palavras, public.atd_sequencias;
