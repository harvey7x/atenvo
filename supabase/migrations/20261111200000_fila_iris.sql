-- =====================================================================================
-- Fila da Iris — etapa 2, fase 1 (dono 11/11). NÃO aplicada; só depois do "confirmo".
-- A fila de cada atendente com os clientes DELE (a distribuição do robô continua igual),
-- classificados sozinhos pelo andamento do atendimento:
--   1 Clientes quentes ........ documentação completa (documento pessoal frente e verso + comprovante)
--   2 Documentação pendente ... mandou parte, foi cobrado e ficou 24 h sem mandar o resto
--   3 Sem resposta ............ começou o atendimento e ficou 24 h sem responder
--   0 Pegar histórico ......... o administrativo diz que assinou e falta o histórico de créditos
--                               (CAF ?pendentes=1, no ar desde 11/11: assinado = kit gerado e todas
--                               as vias aprovadas; falta = códigos de documento, 'historico' entre eles.
--                               Quase sempre o caso já está COMPLETO no CAF — o kit assinado completa
--                               o caso mesmo sem o histórico — então ele fica na fila mesmo fechado,
--                               até o histórico chegar. Ver ~/Downloads/resposta-atenvo-pendentes.md)
-- + o aviso "aguardando resposta" (o cliente mandou a última mensagem e ninguém respondeu).
-- Sai da fila sozinho: fechado (ganho, vindo do administrativo; a prioridade 0 sai quando o histórico
-- chega), não elegível/perdido/cancelado,
-- ou "tirar da fila". Só entram os clientes que chegaram depois de fila_iris_config.inicio
-- ("aplicar só aos próximos clientes, sem migrar os antigos") — menos a prioridade 0.
-- Tudo atrás de fila_iris_config.ativo + usuarios (os 5 atendentes + Murilo).
-- Nada aqui mexe na Iris, no robô, nas conversas ou nos cards: só lê, e grava as marcações.
-- =====================================================================================

-- ---------- configuração (interruptor) ----------
create table if not exists public.fila_iris_config (
  organizacao_id uuid primary key references public.organizacoes(id) on delete cascade,
  ativo boolean not null default false,
  inicio timestamptz not null default now(),            -- só clientes que entraram depois disto
  usuarios uuid[] not null default '{}',                -- quem vê a fila (fase 1: só o Matheus)
  horas_sem_resposta int not null default 24,
  horas_documentacao int not null default 24,
  colunas_fora text[] not null default '{REMARKETING}', -- colunas do Kanban que não entram
  atualizado_em timestamptz not null default now()
);
alter table public.fila_iris_config enable row level security;
drop policy if exists fila_iris_config_sel on public.fila_iris_config;
create policy fila_iris_config_sel on public.fila_iris_config for select to authenticated
  using (public.is_member(organizacao_id));

insert into public.fila_iris_config (organizacao_id, ativo, inicio, usuarios)
-- começa com os clientes dos últimos 7 dias (igual à prévia aprovada); os novos entram sozinhos
values ('de300000-0000-4000-8000-000000000001', false, now() - interval '7 days',
        -- os 5 atendentes + Murilo (dono 11/11: "Os 5 atendentes"); liga com: update … set ativo = true
        array['4ac197b4-9600-4756-81aa-1ac29280df09', 'd7e59652-d3eb-4d7d-8830-7fc780701a8e', 'a31b5fcb-d378-4490-83fe-a47a7c1ee847',
              '94f9343a-0a9f-4b4f-9bd3-804f5483170c', 'd189e143-6cab-49c0-98d3-b030453a3c86', 'f81fcc8a-07a7-436a-9224-34003b65fc67']::uuid[])
on conflict (organizacao_id) do nothing;

-- ---------- marcações do atendente ----------
-- "liguei, não atendeu" (soma), senha do Meu INSS, ficou de mandar documento, falta X,
-- correção manual da documentação e "tirar da fila". Ficam no CLIENTE (contato).
create table if not exists public.fila_iris_marcacoes (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  tipo text not null check (tipo in ('nao_atendeu','recuperar_senha','mandar_senha','mandar_doc','falta',
                                     'docs_completos','docs_incompletos','fora_da_fila')),
  texto text check (texto is null or length(texto) <= 120),
  vezes int not null default 1,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  removido_em timestamptz,
  removido_por uuid
);
create index if not exists idx_fila_iris_marc_contato on public.fila_iris_marcacoes (organizacao_id, contato_id) where removido_em is null;
alter table public.fila_iris_marcacoes enable row level security;
-- sem política: leitura e escrita só pelas funções abaixo (que conferem dono/administrador)

-- ---------- prioridade 0: a lista INTEIRA de pendências do CAF ----------
-- adm_pendentes continua como está (só os casos não completos: o Kanban segue o CAF por ela).
-- adm_pendencias guarda TODOS os casos que o CAF manda em ?pendentes=1, inclusive o completo que
-- ainda deve documento, com assinado / assinado_em / falta. Só a fila lê esta tabela.
create table if not exists public.adm_pendencias (
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  caso_id uuid not null,
  contato_id uuid references public.contatos(id) on delete set null,
  vendedor text,
  estagio text not null,
  estagio_em timestamptz,
  assinado boolean not null default false,
  assinado_em timestamptz,
  falta text[] not null default '{}',
  atualizado_em timestamptz not null default now(),
  primary key (organizacao_id, caso_id)
);
create index if not exists idx_adm_pendencias_contato on public.adm_pendencias (organizacao_id, contato_id);
alter table public.adm_pendencias enable row level security;
drop policy if exists adm_pendencias_sel on public.adm_pendencias;
create policy adm_pendencias_sel on public.adm_pendencias for select to authenticated
  using (public.is_member(organizacao_id));

-- adm_pendentes_gravar: cópia da versão VIVA (20261030091000) + adm_pendencias. Pára se mudou.
do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.adm_pendentes_gravar(uuid, jsonb)'::regprocedure)
     is distinct from '4f4aac17afacfeff6986c060a103115d' then
    raise exception 'adm_pendentes_gravar mudou depois de 30/10: refaça a cópia antes de aplicar';
  end if;
end $$;

create or replace function public.adm_pendentes_gravar(p_org uuid, p_lista jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n int; v_cas int; v_t int;
begin
  -- 11/11: lê TODOS os casos (o CAF manda também o completo que ainda deve documento)
  create temp table _pd on commit drop as
  select distinct on (caso_id) *
    from (select (e->>'caso_id')::uuid caso_id,
                 btrim(coalesce(e->>'nome', '')) nome,
                 lpad(nullif(regexp_replace(coalesce(e->>'cpf', ''), '\D', '', 'g'), ''), 11, '0') cpf,
                 chave_canonica_telefone(e->>'telefone') tel,
                 nullif(btrim(coalesce(e->>'vendedor', '')), '') vendedor,
                 e->>'estagio' estagio,
                 case when coalesce(e->>'estagio_em', '') ~ '^\d{4}-\d{2}-\d{2}' then (e->>'estagio_em')::timestamptz end estagio_em,
                 coalesce(e->>'assinado', '') = 'true' assinado,
                 case when coalesce(e->>'assinado_em', '') ~ '^\d{4}-\d{2}-\d{2}' then (e->>'assinado_em')::timestamptz end assinado_em,
                 coalesce(array(select left(lower(btrim(f)), 40) from jsonb_array_elements_text(
                            case when jsonb_typeof(e->'falta') = 'array' then e->'falta' else '[]'::jsonb end) f
                          where btrim(f) <> '' limit 20), '{}') falta
            from jsonb_array_elements(coalesce(p_lista, '[]'::jsonb)) e
           where coalesce(e->>'caso_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and e->>'estagio' in ('aguardando_documentos', 'aguardando_assinatura', 'adm_preparando', 'completo')) x
   order by caso_id;

  create temp table _ctp on commit drop as
    select id, lpad(regexp_replace(cpf, '\D', '', 'g'), 11, '0') cpf, chave_canonica_telefone(telefone) tel, criado_em
      from contatos where organizacao_id = p_org;
  alter table _pd add column contato_id uuid;
  update _pd p set contato_id = (select c.id from _ctp c where c.cpf = p.cpf order by c.criado_em desc limit 1)
   where length(p.cpf) = 11;
  update _pd p set contato_id = (select f.contato_id from fichas_judiciais f
                                  where f.organizacao_id = p_org and f.contato_id is not null
                                    and lpad(regexp_replace(coalesce(f.cpf, ''), '\D', '', 'g'), 11, '0') = p.cpf
                                  order by f.criado_em desc limit 1)
   where p.contato_id is null and length(p.cpf) = 11;
  update _pd p set contato_id = (select c.id from _ctp c where c.tel = p.tel order by c.criado_em desc limit 1)
   where p.contato_id is null and p.tel is not null;
  update _pd p set contato_id = u.id
    from (select adm_nome_chave(c.nome) nk, (array_agg(c.id))[1] id
            from contatos c where c.organizacao_id = p_org
           group by 1 having count(*) = 1) u
   where p.contato_id is null and u.nk = adm_nome_chave(p.nome) and u.nk like '% %';

  -- o Kanban continua lendo só os não completos (igual a antes)
  delete from adm_pendentes where organizacao_id = p_org;
  insert into adm_pendentes (organizacao_id, caso_id, contato_id, estagio, vendedor, estagio_em)
  select p_org, caso_id, contato_id, estagio, vendedor, estagio_em from _pd where estagio <> 'completo';
  get diagnostics v_n = row_count;
  select count(contato_id) into v_cas from _pd where estagio <> 'completo';

  -- 11/11: a lista inteira, para a Fila da Iris (prioridade 0)
  delete from adm_pendencias where organizacao_id = p_org;
  insert into adm_pendencias (organizacao_id, caso_id, contato_id, vendedor, estagio, estagio_em, assinado, assinado_em, falta)
  select p_org, caso_id, contato_id, vendedor, estagio, estagio_em, assinado, assinado_em, falta from _pd;
  get diagnostics v_t = row_count;

  insert into adm_config (organizacao_id) values (p_org) on conflict do nothing;
  update adm_config set pendentes_em = now(), atualizado_em = now() where organizacao_id = p_org;
  return jsonb_build_object('pendentes', v_n, 'casados', v_cas, 'pendencias', v_t);
end $$;
revoke all on function public.adm_pendentes_gravar(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.adm_pendentes_gravar(uuid, jsonb) to service_role;

-- ---------- quem pode ver ----------
create or replace function public.fila_iris_acesso(p_org uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.is_member(p_org) and exists (
    select 1 from public.fila_iris_config c
     where c.organizacao_id = p_org and c.ativo and auth.uid() = any (c.usuarios));
$$;

-- dono do cliente = o mesmo do inbox (responsavelEfetivo): atendente da conversa → responsável do contato → do card
create or replace function public.fila_iris_dono(p_contato uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select cv.atendente_id from public.conversas cv where cv.contato_id = p_contato order by cv.ultima_interacao_em desc nulls last limit 1),
    (select ct.responsavel_id from public.contatos ct where ct.id = p_contato),
    (select o.responsavel_id from public.oportunidades o where o.contato_id = p_contato and o.status = 'em_andamento' order by o.criado_em desc limit 1));
$$;

-- ---------- a fila ----------
-- p_dono: o atendente cuja fila se quer ver. Atendente só vê a própria (p_dono é ignorado);
-- administrador vê a de qualquer um, ou de todos (p_dono null).
create or replace function public.fila_iris_itens(p_org uuid, p_dono uuid default null)
returns table (
  contato_id uuid, conversa_id uuid, oportunidade_id uuid, dono_id uuid, nome text, telefone text,
  categoria text, aguardando boolean, coluna text, campanha text,
  entrou_em timestamptz, ult_cliente_em timestamptz, ult_nossa_em timestamptz, ult_doc_em timestamptz,
  doc_pessoal boolean, comprovante boolean, falta text[], assinado_em timestamptz, marcacoes jsonb, ult_cliente_texto text
) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  cfg public.fila_iris_config;
  v_admin boolean;
  v_dono uuid;
begin
  if not public.fila_iris_acesso(p_org) then
    raise exception 'sem acesso à fila' using errcode = '42501';
  end if;
  select * into cfg from public.fila_iris_config where organizacao_id = p_org;
  v_admin := public.papel_na_org(p_org) = 'admin';
  v_dono := case when v_admin then p_dono else auth.uid() end;

  return query
  with abertas as (
    select o.id as opp_id, o.contato_id, o.criado_em, fc.nome as col
      from public.oportunidades o
      join public.funil_colunas fc on fc.id = o.coluna_id
     where o.organizacao_id = p_org and o.status = 'em_andamento'
       and not (fc.nome = any (cfg.colunas_fora))
       and coalesce(o.entrada_em, o.criado_em) >= cfg.inicio
  ), pend as (
    -- prioridade 0 (assinou e falta o histórico de créditos): vale para clientes antigos também,
    -- e para o caso já completo no CAF (o kit assinado completa o caso mesmo sem o histórico)
    select distinct on (p.contato_id) p.contato_id, p.falta, p.assinado_em,
           public.adm_usuario_do_vendedor(p_org, p.vendedor) as vend_id
      from public.adm_pendencias p
     where p.organizacao_id = p_org and p.contato_id is not null
       and p.assinado and 'historico' = any (p.falta)
     order by p.contato_id, p.assinado_em desc nulls last
  ), alvo as (
    select coalesce(a.contato_id, pd.contato_id) as contato_id, a.opp_id, a.criado_em, a.col,
           pd.contato_id is not null as hist, pd.falta as pend_falta, pd.assinado_em as pend_assinado_em, pd.vend_id
      from abertas a full join pend pd on pd.contato_id = a.contato_id
  ), dono as (
    -- prioridade 0: fica com o vendedor do caso no CAF (quem já está com ele); sem ele, o dono de sempre
    select al.*, cv.id as conv_id, cv.canal_id,
           coalesce(case when al.hist then al.vend_id end, cv.atendente_id, ct.responsavel_id,
                    (select o2.responsavel_id from public.oportunidades o2 where o2.id = al.opp_id)) as dono_id,
           ct.nome as ct_nome, ct.telefone as ct_tel
      from alvo al
      join public.contatos ct on ct.id = al.contato_id
      left join lateral (select c.id, c.atendente_id, c.canal_id from public.conversas c
                          where c.contato_id = al.contato_id order by c.ultima_interacao_em desc nulls last limit 1) cv on true
     -- fechado/perdido sai da fila; a prioridade 0 não (sai quando o histórico chega ao CAF)
     where al.hist or not exists (select 1 from public.oportunidades og
                        where og.contato_id = al.contato_id and og.status in ('ganho','perdido','cancelado')
                          and og.fechado_em >= coalesce(al.criado_em, '-infinity'::timestamptz))
  ), filtrado as (
    select d.* from dono d where v_dono is null or d.dono_id = v_dono
  ), msg as (
    select f.contato_id,
      max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'entrada' and m.tipo not in ('sistema','nota_interna')) as u_in,
      max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'saida' and m.tipo not in ('sistema','nota_interna')) as u_out,
      max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'entrada' and m.tipo in ('imagem','documento')) as u_doc
      from filtrado f join public.mensagens m on m.conversa_id = f.conv_id
     group by f.contato_id
  ), ses as (
    select distinct on (s.conversa_id) s.conversa_id, s.docs
      from public.ia_sessoes s join filtrado f on f.conv_id = s.conversa_id
     order by s.conversa_id, s.atualizado_em desc
  ), marc as (
    select mk.contato_id,
           jsonb_agg(jsonb_build_object('id', mk.id, 'tipo', mk.tipo, 'texto', mk.texto, 'vezes', mk.vezes,
                                        'em', mk.atualizado_em) order by mk.atualizado_em desc) as lista,
           bool_or(mk.tipo = 'fora_da_fila') as fora,
           bool_or(mk.tipo = 'docs_completos') as forca_ok,
           bool_or(mk.tipo = 'docs_incompletos') as forca_nao
      from public.fila_iris_marcacoes mk
     where mk.organizacao_id = p_org and mk.removido_em is null
       and mk.contato_id in (select f.contato_id from filtrado f)
     group by mk.contato_id
  ), junto as (
    select f.*, mg.u_in, mg.u_out, mg.u_doc,
      coalesce((se.docs->'doc_pessoal'->>'frente')::boolean and (se.docs->'doc_pessoal'->>'verso')::boolean, false) as d_ok,
      coalesce(se.docs ? 'comprovante', false) as c_ok,
      (coalesce(se.docs ? 'doc_pessoal' or se.docs ? 'comprovante', false) or mg.u_doc is not null) as algum,
      mc.lista, coalesce(mc.fora, false) as fora, coalesce(mc.forca_ok, false) as f_ok, coalesce(mc.forca_nao, false) as f_nao
      from filtrado f
      left join msg mg on mg.contato_id = f.contato_id
      left join ses se on se.conversa_id = f.conv_id
      left join marc mc on mc.contato_id = f.contato_id
  ), cls as (
    select j.*,
      case
        when j.hist then 'historico'
        when (j.f_ok or (j.d_ok and j.c_ok)) and not j.f_nao then 'quente'
        when (j.algum or j.f_nao) and coalesce(j.u_doc, j.u_in) <= now() - make_interval(hours => cfg.horas_documentacao) then 'documentacao'
        when not j.algum and j.u_in is not null and j.u_out > j.u_in and j.u_out <= now() - make_interval(hours => cfg.horas_sem_resposta) then 'sem_resposta'
        else null
      end as cat
      from junto j
     where not j.fora
  )
  select c.contato_id, c.conv_id, c.opp_id, c.dono_id, c.ct_nome, c.ct_tel,
         c.cat, (c.u_in is not null and (c.u_out is null or c.u_in > c.u_out)),
         c.col, coalesce(nullif(cn.campanha, ''), cn.nome_interno),
         c.criado_em, c.u_in, c.u_out, c.u_doc,
         (c.d_ok or c.f_ok) and not c.f_nao, (c.c_ok or c.f_ok) and not c.f_nao,
         c.pend_falta, c.pend_assinado_em, coalesce(c.lista, '[]'::jsonb),
         -- o que o cliente escreveu por último (só quando está aguardando resposta)
         case when c.u_in is not null and (c.u_out is null or c.u_in > c.u_out) then
           (select left(coalesce(nullif(m3.conteudo, ''), '[' || m3.tipo::text || ']'), 160) from public.mensagens m3
             where m3.conversa_id = c.conv_id and m3.direcao = 'entrada' and m3.tipo not in ('sistema', 'nota_interna')
             order by coalesce(m3.enviada_em, m3.criado_em) desc limit 1)
         end
    from cls c
    left join public.canais cn on cn.id = c.canal_id
   where c.cat is not null;
end;
$$;

-- ---------- números da equipe (só administrador) ----------
-- recebidos = clientes que o robô distribuiu (bot_roteamentos); fechados = a regra do placar do CAF
-- (adm_casos: data do pódio, sem os tirados da conta pelo gerente), pelo vendedor do caso.
create or replace function public.fila_iris_numeros(p_org uuid, p_inicio timestamptz, p_fim timestamptz)
returns table (usuario_id uuid, nome text, recebidos int, fechados int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.fila_iris_acesso(p_org) or public.papel_na_org(p_org) <> 'admin' then
    raise exception 'só o administrador vê os números da equipe' using errcode = '42501';
  end if;
  return query
  select u.id, u.nome,
    (select count(distinct r.contato_id)::int from public.bot_roteamentos r
      where r.organizacao_id = p_org and r.consultor_id = u.id and r.criado_em >= p_inicio and r.criado_em < p_fim),
    -- fechados: o mês da casa inteiro (começa no dia 11 à 0 h) = o número do pódio do CAF (adm_placar,
    -- já sem os tirados pelo gerente — regra "placar do CAF = Atenvo"); outro período = os casos completos
    -- no período (adm_casos), pela mesma regra de data e sem os de fora da conta
    coalesce(
      (select pl.completos::int from public.adm_placar pl
        where pl.organizacao_id = p_org and lower(pl.vendedor) = lower(u.nome)
          and extract(day from (p_inicio at time zone 'America/Sao_Paulo')) = 11
          and (p_inicio at time zone 'America/Sao_Paulo')::time = time '00:00'
          and pl.mes = (p_inicio at time zone 'America/Sao_Paulo')::date),
      (select count(*)::int from public.adm_casos ac
        where ac.organizacao_id = p_org and lower(ac.vendedor) = lower(u.nome)
          and ac.completo_em >= p_inicio and ac.completo_em < p_fim and not coalesce(ac.fora_da_conta, false)))
    from public.organizacao_usuarios ou
    join public.usuarios u on u.id = ou.usuario_id
   where ou.organizacao_id = p_org and ou.status = 'ativo' and ou.papel in ('atendente', 'admin')
     and exists (select 1 from public.bot_roteamentos r2 where r2.organizacao_id = p_org and r2.consultor_id = u.id);
end;
$$;

-- ---------- marcar / tirar a marcação ----------
create or replace function public.fila_iris_marcar(p_org uuid, p_contato uuid, p_tipo text, p_texto text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not public.fila_iris_acesso(p_org) then raise exception 'sem acesso à fila' using errcode = '42501'; end if;
  if public.papel_na_org(p_org) <> 'admin' and public.fila_iris_dono(p_contato) is distinct from auth.uid() then
    raise exception 'este cliente é de outro atendente' using errcode = '42501';
  end if;
  if p_tipo = 'nao_atendeu' then
    update public.fila_iris_marcacoes set vezes = vezes + 1, atualizado_em = now()
     where organizacao_id = p_org and contato_id = p_contato and tipo = 'nao_atendeu' and removido_em is null
     returning id into v_id;
    if v_id is not null then return v_id; end if;
  elsif p_tipo in ('docs_completos', 'docs_incompletos') then
    update public.fila_iris_marcacoes set removido_em = now(), removido_por = auth.uid()
     where organizacao_id = p_org and contato_id = p_contato and tipo in ('docs_completos', 'docs_incompletos') and removido_em is null;
  elsif p_tipo <> 'falta' then
    select id into v_id from public.fila_iris_marcacoes
     where organizacao_id = p_org and contato_id = p_contato and tipo = p_tipo and removido_em is null limit 1;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.fila_iris_marcacoes (organizacao_id, contato_id, tipo, texto, criado_por)
  values (p_org, p_contato, p_tipo, nullif(trim(coalesce(p_texto, '')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.fila_iris_tirar(p_org uuid, p_marcacao uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_contato uuid;
begin
  if not public.fila_iris_acesso(p_org) then raise exception 'sem acesso à fila' using errcode = '42501'; end if;
  select contato_id into v_contato from public.fila_iris_marcacoes where id = p_marcacao and organizacao_id = p_org;
  if v_contato is null then return; end if;
  if public.papel_na_org(p_org) <> 'admin' and public.fila_iris_dono(v_contato) is distinct from auth.uid() then
    raise exception 'este cliente é de outro atendente' using errcode = '42501';
  end if;
  update public.fila_iris_marcacoes set removido_em = now(), removido_por = auth.uid()
   where id = p_marcacao and removido_em is null;
end;
$$;

revoke all on function public.fila_iris_acesso(uuid) from public, anon;
revoke all on function public.fila_iris_dono(uuid) from public, anon, authenticated;
revoke all on function public.fila_iris_itens(uuid, uuid) from public, anon;
revoke all on function public.fila_iris_numeros(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.fila_iris_marcar(uuid, uuid, text, text) from public, anon;
revoke all on function public.fila_iris_tirar(uuid, uuid) from public, anon;
grant execute on function public.fila_iris_acesso(uuid) to authenticated;
grant execute on function public.fila_iris_itens(uuid, uuid) to authenticated;
grant execute on function public.fila_iris_numeros(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.fila_iris_marcar(uuid, uuid, text, text) to authenticated;
grant execute on function public.fila_iris_tirar(uuid, uuid) to authenticated;

-- DESLIGAR: update fila_iris_config set ativo = false;   (a tela some; as marcações ficam guardadas)
