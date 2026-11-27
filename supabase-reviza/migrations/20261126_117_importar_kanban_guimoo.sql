-- 117 · IMPORTAR O KANBAN DA GUIMOO (26/11, dono: "já pega todo o Kanban deles e integra no nosso… para quando eles chegarem
-- já estiver pronto, eles só precisem conectar algumas coisas"). O arquivo vem do botão oficial "Exportar contatos (CSV)" do
-- CRM do sistema que a Reviza usava antes. Cada linha vira contato + card no funil COMERCIAL REVIZA, na mesma etapa.
--   private.atd_guimoo_kanban     a área de chegada (uma linha por telefone): o que veio no arquivo e o que virou aqui
--   private.atd_guimoo_aplicar()  cria o que falta e atualiza a etapa do que já veio (pode rodar de novo antes da troca)
--   public.atd_guimoo_estado()    o painel de Configurações: quanto veio, por etapa, e quantos responsáveis já ligados
--   public.atd_guimoo_ligar_responsaveis(nome, pessoa)  quando a equipe tiver login: liga pelo NOME de lá, ou o admin escolhe a pessoa
-- O responsável de lá fica guardado no card (metadados.guimoo.responsavel) até ter login aqui. Nada é enviado a ninguém
-- (o card nasce sem conversa: o aviso "fora do RS" e o resto só olham card com conversa) e os avisos à equipe (114) ficam
-- quietos durante a importação (senão "lead novo" sairia 8 mil vezes no dia em que tiverem destinatário). ADITIVA. Depende da 93 e 114.

-- os avisos do card não disparam enquanto a importação roda (a marca vale só dentro da transação dela)
drop trigger if exists atd_avisos_do_card on public.oportunidades;
create trigger atd_avisos_do_card after insert or update of coluna_id, status on public.oportunidades
  for each row when (current_setting('atd.importando', true) is distinct from 'guimoo') execute function private.atd_avisos_do_card();

create table if not exists private.atd_guimoo_kanban (
  chave           text primary key,            -- o telefone (só dígitos, com 55); sem telefone de verdade: 'id:<o que veio>'
  telefone        text,
  nome            text,
  email           text,
  etapa           text,
  responsavel     text,
  departamento    text,
  criado_em       timestamptz,
  etiquetas       text[] not null default '{}',
  conexao         text,
  ultima_msg_em   timestamptz,
  aguardando      boolean,
  ia_ativa        boolean,
  valor           numeric,
  contato_id      uuid,
  oportunidade_id uuid,
  lido_em         timestamptz not null default now(),
  aplicado_em     timestamptz
);
revoke all on private.atd_guimoo_kanban from public, anon, authenticated;
-- achar o contato pelo telefone (DDD + 8 últimos) sem varrer a tabela inteira a cada linha
create index if not exists contatos_chave_fone_idx on public.contatos (organizacao_id, private.atd_chave_fone(telefone));

create or replace function private.atd_guimoo_aplicar()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
  v_funil uuid; r private.atd_guimoo_kanban%rowtype; v_col uuid; v_res text; v_ct uuid; v_op uuid;
  n_ct int := 0; n_op int := 0; n_mov int := 0; n_sem_etapa int := 0; n_junt int := 0; v_meta jsonb; v_status public.oportunidade_status;
begin
  select id into v_funil from public.funis where organizacao_id = v_org and padrao order by criado_em limit 1;
  if v_funil is null then raise exception 'sem_funil_padrao'; end if;
  perform set_config('atd.importando', 'guimoo', true);
  -- o mapa telefone (DDD + 8 últimos) → contato, em memória da transação (procurar na tabela a cada linha leva minutos)
  create temp table if not exists _gm_mapa (k text primary key, contato_id uuid not null) on commit drop;
  truncate pg_temp._gm_mapa;
  insert into pg_temp._gm_mapa
  select distinct on (k) k, id from (select private.atd_chave_fone(telefone) k, id, criado_em from public.contatos where organizacao_id = v_org) x
   where k is not null order by k, criado_em;
  -- etiqueta que ainda não existe aqui nasce com a cor neutra (as de lá já foram criadas: isso só cobre as novas)
  insert into public.etiquetas (organizacao_id, nome, cor, ordem, ativo)
  select v_org, e, '#8a8f98', 100 + row_number() over (order by e), true
    from (select distinct btrim(unnest(etiquetas)) e from private.atd_guimoo_kanban) x
   where e <> '' and not exists (select 1 from public.etiquetas t where t.organizacao_id = v_org and upper(btrim(t.nome)) = upper(e));
  for r in select * from private.atd_guimoo_kanban order by criado_em nulls last loop
    select id, resultado into v_col, v_res from public.funil_colunas
     where funil_id = v_funil and organizacao_id = v_org and not arquivada and upper(btrim(nome)) = upper(btrim(coalesce(r.etapa, ''))) limit 1;
    if v_col is null then
      n_sem_etapa := n_sem_etapa + 1;
      select id, resultado into v_col, v_res from public.funil_colunas where funil_id = v_funil and organizacao_id = v_org and not arquivada order by ordem limit 1;
    end if;
    v_status := case v_res when 'ganho' then 'ganho' when 'perdido' then 'perdido' else 'em_andamento' end;
    v_meta := jsonb_build_object('origem_importacao', 'guimoo', 'guimoo', jsonb_strip_nulls(jsonb_build_object(
      'responsavel', nullif(btrim(r.responsavel), ''), 'departamento', nullif(btrim(r.departamento), ''), 'conexao', nullif(btrim(r.conexao), ''),
      'ultima_mensagem_em', r.ultima_msg_em, 'aguardando_resposta', r.aguardando, 'ia_ativa', r.ia_ativa, 'etapa', r.etapa, 'importado_em', now(),
      'id_sem_telefone', case when r.telefone is null and r.chave like 'id:%' then substr(r.chave, 4) end)));
    -- o contato: o que já veio, ou um com o mesmo telefone (DDD + 8 últimos), ou um novo
    v_ct := r.contato_id;
    if v_ct is not null and not exists (select 1 from public.contatos where id = v_ct) then v_ct := null; end if;
    if v_ct is null and r.telefone is not null then
      select contato_id into v_ct from pg_temp._gm_mapa where k = private.atd_chave_fone(r.telefone);
    end if;
    if v_ct is null then
      insert into public.contatos (organizacao_id, nome, telefone, email, origem, etiquetas, criado_em)
      values (v_org, coalesce(nullif(btrim(r.nome), ''), r.telefone, 'Sem nome'), r.telefone, nullif(btrim(coalesce(r.email, '')), ''), 'guimoo', r.etiquetas, coalesce(r.criado_em, now()))
      returning id into v_ct;
      n_ct := n_ct + 1;
      if private.atd_chave_fone(r.telefone) is not null then insert into pg_temp._gm_mapa values (private.atd_chave_fone(r.telefone), v_ct) on conflict do nothing; end if;
    end if;
    -- o card: o que já veio (só muda a etapa), ou um novo no funil padrão
    v_op := r.oportunidade_id;
    if v_op is not null and not exists (select 1 from public.oportunidades where id = v_op) then v_op := null; end if;
    -- o mesmo cliente duas vezes lá (com e sem o 9, ou em dois números): um card aberto só por cliente no funil
    if v_op is null and v_status = 'em_andamento' then
      select id into v_op from public.oportunidades where organizacao_id = v_org and contato_id = v_ct and funil_id = v_funil and status = 'em_andamento' limit 1;
      if v_op is not null then
        update public.oportunidades set etiquetas = (select coalesce(array_agg(distinct e), '{}') from unnest(coalesce(etiquetas, '{}') || r.etiquetas) e) where id = v_op;
        n_junt := n_junt + 1;
        update private.atd_guimoo_kanban set contato_id = v_ct, oportunidade_id = v_op, aplicado_em = now() where chave = r.chave;
        continue;
      end if;
    end if;
    if v_op is not null then
      if (select coluna_id from public.oportunidades where id = v_op) is distinct from v_col and (select status from public.oportunidades where id = v_op) = 'em_andamento' then
        update public.oportunidades set coluna_id = v_col, metadados = coalesce(metadados, '{}'::jsonb) || v_meta where id = v_op;
        n_mov := n_mov + 1;
      end if;
    else
      insert into public.oportunidades (organizacao_id, contato_id, funil_id, coluna_id, titulo, telefone, contato_nome, origem, fonte_aquisicao,
                                        status, valor_estimado, etiquetas, metadados, criado_em, entrada_em, movimentado_em, fechado_em, fechado_em_estimado)
      values (v_org, v_ct, v_funil, v_col, coalesce(nullif(btrim(r.nome), ''), r.telefone, 'Sem nome'), r.telefone, nullif(btrim(r.nome), ''), 'guimoo', nullif(btrim(r.conexao), ''),
              v_status, nullif(r.valor, 0), r.etiquetas, v_meta, coalesce(r.criado_em, now()), coalesce(r.criado_em, now()), coalesce(r.ultima_msg_em, r.criado_em, now()),
              case when v_status <> 'em_andamento' then coalesce(r.ultima_msg_em, r.criado_em, now()) end, v_status <> 'em_andamento')
      returning id into v_op;
      n_op := n_op + 1;
    end if;
    update private.atd_guimoo_kanban set contato_id = v_ct, oportunidade_id = v_op, aplicado_em = now() where chave = r.chave;
  end loop;
  return jsonb_build_object('contatos_novos', n_ct, 'cards_novos', n_op, 'cards_movidos', n_mov, 'juntados_no_mesmo_card', n_junt, 'etapa_nao_achada', n_sem_etapa);
end $$;
revoke all on function private.atd_guimoo_aplicar() from public, anon, authenticated;

-- o painel (só o administrador)
create or replace function public.atd_guimoo_estado()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001';
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  return jsonb_build_object(
    'linhas', (select count(*) from private.atd_guimoo_kanban),
    'aplicadas', (select count(*) from private.atd_guimoo_kanban where aplicado_em is not null),
    'lido_em', (select max(lido_em) from private.atd_guimoo_kanban),
    'aplicado_em', (select max(aplicado_em) from private.atd_guimoo_kanban),
    'por_etapa', coalesce((select jsonb_agg(jsonb_build_object('etapa', x.etapa, 'qtd', x.qtd) order by x.qtd desc) from (
                    select coalesce(c.nome, '—') as etapa, count(distinct o.id) as qtd from private.atd_guimoo_kanban g
                      join public.oportunidades o on o.id = g.oportunidade_id left join public.funil_colunas c on c.id = o.coluna_id group by 1) x), '[]'::jsonb),
    'responsaveis', coalesce((select jsonb_agg(jsonb_build_object('nome', x.nome, 'qtd', x.qtd, 'abertos', x.abertos, 'ligado_a', x.ligado_a,
                              'ligado_nome', (select u.nome from public.usuarios u where u.id = x.ligado_a)) order by x.nome = 'Sem responsável', x.qtd desc) from (
                    select coalesce(nullif(btrim(g.responsavel), ''), 'Sem responsável') as nome, count(*) as qtd,
                           count(*) filter (where o.status = 'em_andamento') as abertos,
                           (array_agg(g.ligado_a) filter (where g.ligado_a is not null))[1] as ligado_a
                      from private.atd_guimoo_kanban g left join public.oportunidades o on o.id = g.oportunidade_id group by 1) x), '[]'::jsonb),
    'equipe', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome) order by u.nome) from public.organizacao_usuarios ou
                         join public.usuarios u on u.id = ou.usuario_id where ou.organizacao_id = v_org and ou.status = 'ativo'), '[]'::jsonb),
    'por_status', coalesce((select jsonb_object_agg(x.status, x.qtd) from (select o.status::text as status, count(distinct o.id) as qtd from private.atd_guimoo_kanban g
                         join public.oportunidades o on o.id = g.oportunidade_id group by 1) x), '{}'::jsonb),
    'contatos', (select count(distinct contato_id) from private.atd_guimoo_kanban),
    'mensagens', (select count(*) from public.mensagens m where m.organizacao_id = v_org and m.metadados ? 'guimoo_id'));
end $$;
revoke all on function public.atd_guimoo_estado() from public, anon;
grant execute on function public.atd_guimoo_estado() to authenticated, service_role;

-- quando a equipe tiver login: os cards de cada responsável de lá passam para a pessoa daqui. Sem nome: liga sozinho quem tem o
-- MESMO nome (sem acento, sem maiúscula). Com nome + pessoa: passa os cards daquele nome para a pessoa escolhida. Com nome e sem
-- pessoa: desfaz. Só mexe em card sem dono ou que continua com quem a importação pôs (o que a equipe trocou depois fica).
alter table private.atd_guimoo_kanban add column if not exists ligado_a uuid;
drop function if exists public.atd_guimoo_ligar_responsaveis();
create or replace function public.atd_guimoo_ligar_responsaveis(p_nome text default null, p_usuario uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_org uuid := 'a1fa0000-0000-4000-8000-000000000001'; n int := 0; r record;
begin
  if coalesce(public.org_papel(v_org), '') <> 'admin' and not public.is_platform_admin() then raise exception 'sem_permissao'; end if;
  if p_usuario is not null and not exists (select 1 from public.organizacao_usuarios where organizacao_id = v_org and usuario_id = p_usuario and status = 'ativo') then
    raise exception 'pessoa_invalida';
  end if;
  for r in
    select g.chave, g.oportunidade_id, g.contato_id, g.ligado_a,
           case when p_nome is null then (select u.id from public.organizacao_usuarios ou join public.usuarios u on u.id = ou.usuario_id
                                          where ou.organizacao_id = v_org and ou.status = 'ativo'
                                            and private.atd_sem_acento(btrim(u.nome)) = private.atd_sem_acento(btrim(g.responsavel)) limit 1)
                else p_usuario end as novo
      from private.atd_guimoo_kanban g
     where nullif(btrim(g.responsavel), '') is not null and g.oportunidade_id is not null
       and (p_nome is null or private.atd_sem_acento(btrim(g.responsavel)) = private.atd_sem_acento(btrim(p_nome)))
  loop
    if r.novo is null and p_nome is null then continue; end if;          -- automático: ninguém com esse nome aqui
    if r.novo is not distinct from r.ligado_a then continue; end if;
    update public.oportunidades set responsavel_id = r.novo
     where id = r.oportunidade_id and (responsavel_id is null or responsavel_id is not distinct from r.ligado_a);
    if found then n := n + 1; end if;
    update public.contatos set responsavel_id = r.novo
     where id = r.contato_id and (responsavel_id is null or responsavel_id is not distinct from r.ligado_a) and responsavel_id is distinct from r.novo;
    update private.atd_guimoo_kanban set ligado_a = r.novo where chave = r.chave;
  end loop;
  return jsonb_build_object('cards', n);
end $$;
revoke all on function public.atd_guimoo_ligar_responsaveis(text, uuid) from public, anon;
grant execute on function public.atd_guimoo_ligar_responsaveis(text, uuid) to authenticated, service_role;

-- DESFAZER (antes de usar o sistema; apaga o que veio): delete from public.oportunidades where id in (select oportunidade_id from private.atd_guimoo_kanban);
--   delete from public.contatos where origem = 'guimoo' and id in (select contato_id from private.atd_guimoo_kanban);
--   drop trigger atd_avisos_do_card on public.oportunidades; e criar de novo como na 114 (sem o "when");
--   drop function if exists public.atd_guimoo_ligar_responsaveis(text, uuid), public.atd_guimoo_estado(), private.atd_guimoo_aplicar(); drop table if exists private.atd_guimoo_kanban;
