-- =====================================================================================
-- Fila da Iris — AVISO NA TELA quando a Iris passa um cliente (dono 12/11: "a Iris atendeu um cliente
-- completo e passou para você… preciso que apareça uma notificação na tela, independente da onde").
-- 1) fila_iris_itens vira um invólucro (checa acesso e dono) de fila_iris_itens_base (o corpo de sempre,
--    sem a checagem, só para quem já checou e para o relógio). Mesma assinatura, mesmo resultado.
-- 2) fila_iris_estado (a fila do minuto anterior, só o que muda é regravado) + fila_iris_avisos.
-- 3) relógio fila_iris_avisos (cron, todo minuto): quem ENTROU em quentes / documentação / sem resposta
--    (ou trocou de dono lá dentro), com a passagem fresca e a ÚLTIMA mensagem nossa vinda da Iris/robô
--    (origem 'bot' — remarketing da atendente não vira "a Iris passou"), vira aviso para o dono.
-- 4) a tela lê os meus avisos (só os do episódio atual, do dono atual, com o relógio vivo) e marca vistos.
-- Nada muda nos clientes, nas conversas, nos cards, na Iris nem no robô.
-- =====================================================================================
set lock_timeout = '5s';

-- trava: a fila_iris_itens viva tem de ser a de 20261111220000 (md5 conferido em 12/11) ou já o invólucro
do $trava$
declare v_md5 text; v_invol boolean;
begin
  select md5(prosrc), prosrc like '%fila_iris_itens_base%' into v_md5, v_invol
    from pg_proc where oid = 'public.fila_iris_itens(uuid, uuid)'::regprocedure;
  if v_md5 is distinct from '94ba8ea54a9013a975f0f5cb31a6a75c' and not coalesce(v_invol, false) then
    raise exception 'fila_iris_itens mudou depois de 12/11 (md5 %): refaça a base antes de aplicar', v_md5;
  end if;
end
$trava$;

create or replace function public.fila_iris_itens_base(p_org uuid, p_dono uuid default null)
returns table (
  contato_id uuid, conversa_id uuid, oportunidade_id uuid, dono_id uuid, nome text, telefone text,
  categoria text, aguardando boolean, coluna text, campanha text,
  entrou_em timestamptz, ult_cliente_em timestamptz, ult_nossa_em timestamptz, ult_doc_em timestamptz,
  doc_pessoal boolean, comprovante boolean, falta text[], assinado_em timestamptz, marcacoes jsonb, ult_cliente_texto text
) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  cfg public.fila_iris_config;
  v_dono uuid := p_dono;
begin
  -- SEM checagem de acesso: só a fila_iris_itens (que checa) e o relógio dos avisos chamam esta função
  select * into cfg from public.fila_iris_config where organizacao_id = p_org;

  return query
  with abertas as (
    select o.id as opp_id, o.contato_id, o.criado_em, fc.nome as col
      from public.oportunidades o
      join public.funil_colunas fc on fc.id = o.coluna_id
     where o.organizacao_id = p_org and o.status = 'em_andamento'
       and not (fc.nome = any (cfg.colunas_fora))
       -- clientes novos (desde cfg.inicio) + os da lista da Iris de 11/11, de qualquer data
       and (coalesce(o.entrada_em, o.criado_em) >= cfg.inicio
            or exists (select 1 from public.fila_iris_divisao dv where dv.contato_id = o.contato_id))
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
         -- o que o cliente escreveu por último (sempre: a fila mostra a última mensagem dele em cada linha)
         case when c.u_in is not null then
           (select left(coalesce(nullif(m3.conteudo, ''), '[' || m3.tipo::text || ']'), 160) from public.mensagens m3
             where m3.conversa_id = c.conv_id and m3.direcao = 'entrada' and m3.tipo not in ('sistema', 'nota_interna')
             order by coalesce(m3.enviada_em, m3.criado_em) desc limit 1)
         end
    from cls c
    left join public.canais cn on cn.id = c.canal_id
   where c.cat is not null;
end;
$$;

create or replace function public.fila_iris_itens(p_org uuid, p_dono uuid default null)
returns table (
  contato_id uuid, conversa_id uuid, oportunidade_id uuid, dono_id uuid, nome text, telefone text,
  categoria text, aguardando boolean, coluna text, campanha text,
  entrou_em timestamptz, ult_cliente_em timestamptz, ult_nossa_em timestamptz, ult_doc_em timestamptz,
  doc_pessoal boolean, comprovante boolean, falta text[], assinado_em timestamptz, marcacoes jsonb, ult_cliente_texto text
) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_admin boolean;
  v_dono uuid;
begin
  if not public.fila_iris_acesso(p_org) then
    raise exception 'sem acesso à fila' using errcode = '42501';
  end if;
  v_admin := public.papel_na_org(p_org) = 'admin';
  v_dono := case when v_admin then p_dono else auth.uid() end;
  return query select * from public.fila_iris_itens_base(p_org, v_dono);
end;
$$;

-- ---------------------------------------------------------------- batida do relógio (os avisos só valem com ele vivo)
alter table public.fila_iris_config add column if not exists avisos_tick_em timestamptz;

-- ---------------------------------------------------------------- a fila do minuto anterior
create table if not exists public.fila_iris_estado (
  contato_id uuid primary key references public.contatos(id) on delete cascade,
  organizacao_id uuid not null,
  categoria text not null,
  dono_id uuid,
  desde timestamptz not null default now()
);
create index if not exists fila_iris_estado_org_idx on public.fila_iris_estado (organizacao_id);
alter table public.fila_iris_estado enable row level security;

-- ---------------------------------------------------------------- os avisos de cada atendente
create table if not exists public.fila_iris_avisos (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  usuario_id uuid not null,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  conversa_id uuid,
  categoria text not null check (categoria in ('quente', 'documentacao', 'sem_resposta')),
  nome text,
  passou_em timestamptz not null,
  criado_em timestamptz not null default now(),
  visto_em timestamptz
);
create index if not exists fila_iris_avisos_meus_idx on public.fila_iris_avisos (usuario_id, criado_em desc) where visto_em is null;
create index if not exists fila_iris_avisos_freio_idx on public.fila_iris_avisos (contato_id, categoria, criado_em desc);
create index if not exists fila_iris_avisos_criado_idx on public.fila_iris_avisos (criado_em);
alter table public.fila_iris_avisos enable row level security;
-- sem política: só as funções abaixo (security definer) leem e gravam

-- ---------------------------------------------------------------- o relógio (cron, todo minuto)
-- Quando a Iris passou o cliente (a mesma regra da tela, lead.ts marcarNovo):
--   quente       = completou a documentação (último documento; sem ele, a última mensagem);
--   documentação = 24 h depois do último documento (sem ele, a última mensagem) — a regra de entrada;
--   sem resposta = 24 h depois da nossa última mensagem — a regra de entrada.
-- Avisa quem ENTROU numa prioridade (ou trocou de dono nela) nesta rodada, com:
--   - a passagem fresca (até 3 h — cobre um relógio parado);
--   - a ÚLTIMA mensagem nossa vinda da Iris/robô (origem 'bot');
--   - sem reclassificação à mão (docs_completos / docs_incompletos);
--   - freio: o mesmo cliente na mesma prioridade, no máximo um aviso a cada 3 dias;
--   - dono na fila (cfg.usuarios).
-- A primeira rodada de cada org só fotografa (não avisa o atrasado).
create or replace function public.fila_iris_avisos_tick()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  cfg public.fila_iris_config;
  v_semente boolean;
  v_n integer;
  v_total integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('fila_iris_avisos_tick')) then
    return 0;
  end if;
  for cfg in select * from public.fila_iris_config where ativo loop
    begin
      v_semente := not exists (select 1 from public.fila_iris_estado e where e.organizacao_id = cfg.organizacao_id);
      -- um comando só: os CTEs que gravam enxergam o MESMO retrato (o estado de antes desta rodada)
      with atual as materialized (
        -- uma linha por cliente (cliente com card aberto em dois funis aparece duas vezes na base)
        select distinct on (i.contato_id)
               i.contato_id, i.conversa_id, i.dono_id, i.categoria,
               coalesce(nullif(btrim(i.nome), ''), i.telefone) as nome,
               case i.categoria
                 when 'quente' then coalesce(i.ult_doc_em, i.ult_cliente_em)
                 when 'documentacao' then coalesce(i.ult_doc_em, i.ult_cliente_em) + make_interval(hours => cfg.horas_documentacao)
                 when 'sem_resposta' then i.ult_nossa_em + make_interval(hours => cfg.horas_sem_resposta)
               end as passou_em,
               coalesce(i.marcacoes, '[]'::jsonb) as marcacoes
          from public.fila_iris_itens_base(cfg.organizacao_id, null) i
         where i.categoria in ('quente', 'documentacao', 'sem_resposta')
         order by i.contato_id, i.entrou_em desc nulls last, i.oportunidade_id
      ), candidatos as (
        select a.*
          from atual a
          left join public.fila_iris_estado e on e.contato_id = a.contato_id
         where not v_semente
           and (e.contato_id is null or e.categoria <> a.categoria or e.dono_id is distinct from a.dono_id)
           and a.dono_id = any (cfg.usuarios)
           and a.passou_em between now() - interval '3 hours' and now() + interval '5 minutes'
           and not (a.categoria = 'quente' and a.marcacoes @> '[{"tipo": "docs_completos"}]'::jsonb)
           and not (a.categoria = 'documentacao' and a.marcacoes @> '[{"tipo": "docs_incompletos"}]'::jsonb)
           and (select m.origem from public.mensagens m
                 where m.conversa_id = a.conversa_id and m.direcao = 'saida' and m.tipo not in ('sistema', 'nota_interna')
                 order by coalesce(m.enviada_em, m.criado_em) desc limit 1) = 'bot'
           and not exists (select 1 from public.fila_iris_avisos x
                            where x.contato_id = a.contato_id and x.categoria = a.categoria
                              and x.criado_em > now() - interval '3 days')
      ), novos as (
        insert into public.fila_iris_avisos (organizacao_id, usuario_id, contato_id, conversa_id, categoria, nome, passou_em)
        select cfg.organizacao_id, c.dono_id, c.contato_id, c.conversa_id, c.categoria, c.nome, c.passou_em
          from candidatos c
        returning 1
      ), guarda as (
        -- só o que mudou é regravado (a fila inteira todo minuto seria WAL à toa)
        insert into public.fila_iris_estado as e (contato_id, organizacao_id, categoria, dono_id, desde)
        select a.contato_id, cfg.organizacao_id, a.categoria, a.dono_id, now() from atual a
        on conflict (contato_id) do update
           set categoria = excluded.categoria, dono_id = excluded.dono_id, desde = now()
         where e.categoria is distinct from excluded.categoria or e.dono_id is distinct from excluded.dono_id
        returning 1
      ), sairam as (
        delete from public.fila_iris_estado e
         where e.organizacao_id = cfg.organizacao_id
           and not exists (select 1 from atual a where a.contato_id = e.contato_id)
        returning 1
      )
      select (select count(*) from novos) into v_n;
      update public.fila_iris_config set avisos_tick_em = now() where organizacao_id = cfg.organizacao_id;
      v_total := v_total + coalesce(v_n, 0);
    exception when others then
      -- uma org com problema não derruba as outras; sem a batida, os avisos dela somem da tela em 5 min
      raise warning 'fila_iris_avisos_tick (org %): %', cfg.organizacao_id, sqlerrm;
    end;
  end loop;
  -- faxina, uma vez por hora: aviso com mais de 30 dias sai (visto ou não)
  if extract(minute from now()) = 0 then
    delete from public.fila_iris_avisos where criado_em < now() - interval '30 days';
  end if;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------- o que a tela lê
-- os meus avisos não vistos (até 3 dias), um por cliente (o mais novo), só se o cliente CONTINUA na prioridade,
-- comigo, no mesmo episódio (estado.desde ≤ criado do aviso), e com o relógio vivo (batida de até 5 min).
-- O mais antigo vem primeiro: o novo entra atrás, sem trocar o cartão debaixo do mouse.
create or replace function public.fila_iris_avisos_meus(p_org uuid)
returns table (id uuid, contato_id uuid, conversa_id uuid, categoria text, nome text, passou_em timestamptz, criado_em timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.fila_iris_acesso(p_org) then
    return;
  end if;
  if not exists (select 1 from public.fila_iris_config c
                  where c.organizacao_id = p_org and c.avisos_tick_em > now() - interval '5 minutes') then
    return;
  end if;
  return query
  select t.id, t.contato_id, t.conversa_id, t.categoria, t.nome, t.passou_em, t.criado_em
    from (select distinct on (a.contato_id) a.id, a.contato_id, a.conversa_id, a.categoria, a.nome, a.passou_em, a.criado_em
            from public.fila_iris_avisos a
            join public.fila_iris_estado e on e.contato_id = a.contato_id
           where a.organizacao_id = p_org and a.usuario_id = auth.uid() and a.visto_em is null
             and a.criado_em >= now() - interval '3 days'
             and e.categoria = a.categoria and e.dono_id = a.usuario_id and e.desde <= a.criado_em
           order by a.contato_id, a.criado_em desc) t
   order by t.criado_em asc
   limit 50;
end;
$$;

create or replace function public.fila_iris_avisos_visto(p_org uuid, p_ids uuid[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  update public.fila_iris_avisos set visto_em = now()
   where organizacao_id = p_org and usuario_id = auth.uid() and id = any (p_ids) and visto_em is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.fila_iris_itens_base(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fila_iris_avisos_tick() from public, anon, authenticated;
revoke all on function public.fila_iris_avisos_meus(uuid) from public, anon;
revoke all on function public.fila_iris_avisos_visto(uuid, uuid[]) from public, anon;
grant execute on function public.fila_iris_avisos_meus(uuid) to authenticated;
grant execute on function public.fila_iris_avisos_visto(uuid, uuid[]) to authenticated;

-- todo minuto (cron.schedule com nome é idempotente)
select cron.schedule('fila_iris_avisos', '* * * * *', $cron$select public.fila_iris_avisos_tick()$cron$);

-- DESLIGAR: select cron.unschedule('fila_iris_avisos');
--           update public.fila_iris_avisos set visto_em = now() where visto_em is null;
-- (a fila e a tela não mudam; sem a batida do relógio, os avisos somem da tela sozinhos em 5 min)
