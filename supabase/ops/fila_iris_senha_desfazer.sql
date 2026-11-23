-- DESFAZER a senha do INSS na Fila da Iris (migration 20261119170000_fila_iris_senha_prioridade): volta a base, o
-- invólucro e o relógio dos avisos EXATAMENTE ao texto de 19/11 (antes da migration). NÃO é migration: rodar à mão, numa
-- transação só (o arquivo já tem begin/commit), pelo SQL Editor do Supabase ou pela Management API.
--
-- Antes de desfazer, o mais simples é DESLIGAR (a fila volta a ser como antes, sem mexer em função nenhuma):
--   update public.fila_iris_config set senha_prioridade = false;
-- Ordem num incidente: primeiro desligar (ou desfazer), DEPOIS voltar a tela (git revert) — a tela velha com a chave
-- ligada mostraria quem está só pela senha como "Documentação completa".
--
-- Fica no banco (inofensivo, as funções de 19/11 não usam): a tabela fila_iris_senha_digitada, as funções
-- fila_iris_texto_tem_senha / fila_iris_parece_senha / fila_iris_senha_marcar, as colunas senha_prioridade e
-- senha_varrida_ate (fila_iris_config) e so_senha (fila_iris_estado).

begin;
set local lock_timeout = '5s';

do $trava$
declare v_base text; v_itens text; v_tick text;
begin
  perform pg_advisory_xact_lock(hashtext('fila_iris_avisos_tick'));
  select md5(prosrc) into v_base from pg_proc where oid = 'public.fila_iris_itens_base(uuid, uuid)'::regprocedure;
  select md5(prosrc) into v_itens from pg_proc where oid = 'public.fila_iris_itens(uuid, uuid)'::regprocedure;
  select md5(prosrc) into v_tick from pg_proc where oid = 'public.fila_iris_avisos_tick()'::regprocedure;
  -- o texto que a migration 20261119170000 deixou (se mudou depois, conferir antes de desfazer)
  if v_base is distinct from 'ec07dd1b8c6a93b895f6e7ba7a75938e' or v_itens is distinct from '639820d98c73c75216b100f37084fec0' or v_tick is distinct from '079c5f5db41e24f6336a2da1f0116f0f' then
    raise exception 'as funções mudaram depois da migration da senha (base %, invólucro %, relógio %): conferir antes de desfazer',
      v_base, v_itens, v_tick;
  end if;
end
$trava$;

drop function public.fila_iris_itens(uuid, uuid);
drop function public.fila_iris_itens_base(uuid, uuid);

CREATE OR REPLACE FUNCTION public.fila_iris_itens_base(p_org uuid, p_dono uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contato_id uuid, conversa_id uuid, oportunidade_id uuid, dono_id uuid, nome text, telefone text, categoria text, aguardando boolean, coluna text, campanha text, entrou_em timestamp with time zone, ult_cliente_em timestamp with time zone, ult_nossa_em timestamp with time zone, ult_doc_em timestamp with time zone, doc_pessoal boolean, comprovante boolean, falta text[], assinado_em timestamp with time zone, marcacoes jsonb, ult_cliente_texto text, ult_nossa_texto text, ult_nossa_origem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
                                        'em', mk.atualizado_em, 'vence_em', case when mk.tipo in ('nao_atendeu', 'recuperar_senha', 'mandar_senha', 'mandar_doc', 'falta') then greatest(mk.prazo_desde, coalesce(fe.na_fila_desde, now())) + make_interval(hours => coalesce(cfg.horas_marcacao, 36)) end, 'ult', (select jsonb_build_object('texto', au.texto, 'por', au.usuario_id, 'por_nome', (select u.nome from public.usuarios u where u.id = au.usuario_id), 'em', au.criado_em) from public.fila_iris_marcacao_atualizacoes au where au.marcacao_id = mk.id order by au.criado_em desc limit 1)) order by mk.atualizado_em desc) as lista,
           bool_or(mk.tipo = 'fora_da_fila') as fora,
           bool_or(mk.tipo = 'docs_completos') as forca_ok,
           bool_or(mk.tipo = 'docs_incompletos') as forca_nao
      from public.fila_iris_marcacoes mk
      -- o prazo só corre com o cliente na fila do dono de agora (o relógio dos avisos guarda desde quando);
      -- sem a linha do relógio (acabou de entrar, ou trocou de dono), começa agora
      -- (o dono pela mesma régua do relógio: o card mais novo do cliente entre TODOS os cards, não só os da fila de
      -- quem pede — o vencimento é o mesmo para o atendente, o administrador e o relógio; e a linha do relógio só
      -- vale com a batida viva)
      left join (select distinct on (d.contato_id) d.contato_id, d.dono_id from dono d
                  order by d.contato_id, d.criado_em desc nulls last, d.opp_id) fd on fd.contato_id = mk.contato_id
      left join public.fila_iris_estado fe on fe.contato_id = mk.contato_id and fe.dono_id = fd.dono_id
             and cfg.avisos_tick_em > now() - interval '5 minutes'
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
         end,
         -- a NOSSA última mensagem (dono 13/11: a fila mostra a última mensagem da conversa, de quem for): o texto e de
         -- onde saiu (bot = IA/robô, atenvo = painel, telefone = celular) — a mesma régua do u_out
         nos.texto, nos.origem
    from cls c
    left join public.canais cn on cn.id = c.canal_id
    left join lateral (
      select left(coalesce(nullif(m4.conteudo, ''), '[' || m4.tipo::text || ']'), 160) as texto, m4.origem
        from public.mensagens m4
       where m4.conversa_id = c.conv_id and m4.direcao = 'saida' and m4.tipo not in ('sistema', 'nota_interna')
       order by coalesce(m4.enviada_em, m4.criado_em) desc
       limit 1) nos on c.u_out is not null
   where c.cat is not null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fila_iris_itens(p_org uuid, p_dono uuid DEFAULT NULL::uuid)
 RETURNS TABLE(contato_id uuid, conversa_id uuid, oportunidade_id uuid, dono_id uuid, nome text, telefone text, categoria text, aguardando boolean, coluna text, campanha text, entrou_em timestamp with time zone, ult_cliente_em timestamp with time zone, ult_nossa_em timestamp with time zone, ult_doc_em timestamp with time zone, doc_pessoal boolean, comprovante boolean, falta text[], assinado_em timestamp with time zone, marcacoes jsonb, ult_cliente_texto text, ult_nossa_texto text, ult_nossa_origem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

revoke all on function public.fila_iris_itens_base(uuid, uuid) from public, anon, authenticated;
grant execute on function public.fila_iris_itens_base(uuid, uuid) to service_role;
revoke all on function public.fila_iris_itens(uuid, uuid) from public, anon;
grant execute on function public.fila_iris_itens(uuid, uuid) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fila_iris_avisos_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  cfg public.fila_iris_config;
  v_semente boolean;
  v_parado boolean;
  v_n integer;
  v_total integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('fila_iris_avisos_tick')) then
    return 0;
  end if;
  for cfg in select * from public.fila_iris_config where ativo loop
    begin
      v_semente := not exists (select 1 from public.fila_iris_estado e where e.organizacao_id = cfg.organizacao_id);
      -- o relógio estava parado (mais de 5 min sem batida: queda, fila desligada): o tempo parado não conta. Cada
      -- marcação que ainda corria quando ele parou ganha o tempo parado — o começo da janela (o mais tarde entre
      -- prazo_desde e a entrada na fila) anda o tanto que ele ficou parado; a que começou durante a parada começa
      -- agora. A que já tinha vencido antes da parada fica como estava (o aviso dela continua valendo). Assim
      -- ninguém fica vencido por tempo que o relógio não viu e os prazos não se juntam num minuto só. Sem batida
      -- nenhuma antes (a 1ª volta), o "na fila desde" de todos começa agora. Nesta volta não sai aviso de
      -- marcação vencida (dono 16/11; revisão)
      v_parado := cfg.avisos_tick_em is null or cfg.avisos_tick_em < now() - interval '5 minutes';
      if v_parado and cfg.avisos_tick_em is null then
        update public.fila_iris_estado set na_fila_desde = now() where organizacao_id = cfg.organizacao_id;
      elsif v_parado then
        update public.fila_iris_marcacoes mk
           set prazo_desde = least(now(), greatest(mk.prazo_desde, e.na_fila_desde) + (now() - cfg.avisos_tick_em))
          from public.fila_iris_estado e
         where e.contato_id = mk.contato_id and e.organizacao_id = cfg.organizacao_id
           and mk.organizacao_id = cfg.organizacao_id and mk.removido_em is null
           and mk.tipo in ('nao_atendeu', 'recuperar_senha', 'mandar_senha', 'mandar_doc', 'falta')
           and greatest(mk.prazo_desde, e.na_fila_desde) + make_interval(hours => coalesce(cfg.horas_marcacao, 36))
               > cfg.avisos_tick_em;
      end if;
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
        insert into public.fila_iris_estado as e (contato_id, organizacao_id, categoria, dono_id, desde, na_fila_desde)
        select a.contato_id, cfg.organizacao_id, a.categoria, a.dono_id, now(), now() from atual a
        on conflict (contato_id) do update
           set categoria = excluded.categoria, dono_id = excluded.dono_id, desde = now(),
               na_fila_desde = case when e.dono_id is distinct from excluded.dono_id then now() else e.na_fila_desde end
         where e.categoria is distinct from excluded.categoria or e.dono_id is distinct from excluded.dono_id
        returning 1
      ), sairam as (
        delete from public.fila_iris_estado e
         where e.organizacao_id = cfg.organizacao_id
           and not exists (select 1 from atual a where a.contato_id = e.contato_id)
        returning 1
      )
      , vencidas as (
        -- dono 16/11: "quando o prazo terminar tem que enviar uma notificação pro atendente" — um aviso por
        -- vencimento (marcação + vence_em), só com o cliente na fila do MESMO dono desde a rodada anterior
        insert into public.fila_iris_marcacao_avisos (organizacao_id, usuario_id, marcacao_id, contato_id, conversa_id, nome, tipo, texto, vence_em)
        select cfg.organizacao_id, a.dono_id, (mj->>'id')::uuid, a.contato_id, a.conversa_id, a.nome, mj->>'tipo', mj->>'texto',
               (mj->>'vence_em')::timestamptz
          from atual a
          join public.fila_iris_estado ev on ev.contato_id = a.contato_id and ev.dono_id = a.dono_id
          cross join lateral jsonb_array_elements(a.marcacoes) mj
         where not v_semente and not v_parado
           and a.dono_id = any (cfg.usuarios)
           and mj->>'vence_em' is not null
           and (mj->>'vence_em')::timestamptz <= now()
           and (mj->>'vence_em')::timestamptz > now() - interval '1 day'
        on conflict (marcacao_id, vence_em) do nothing
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
    delete from public.fila_iris_avisos where criado_em < now() - interval '400 days';
    delete from public.fila_iris_marcacao_avisos where criado_em < now() - interval '400 days';
  end if;
  return v_total;
end;
$function$;

do $confere$
begin
  if (select md5(prosrc) from pg_proc where oid = 'public.fila_iris_itens_base(uuid, uuid)'::regprocedure) <> '2fc1340b5c0d1aacd4ef7a53459fddea'
     or (select md5(prosrc) from pg_proc where oid = 'public.fila_iris_itens(uuid, uuid)'::regprocedure) <> '639820d98c73c75216b100f37084fec0'
     or (select md5(prosrc) from pg_proc where oid = 'public.fila_iris_avisos_tick()'::regprocedure) <> '3a98474f57c712a2e19499b4de3543b1' then
    raise exception 'o texto restaurado não bate com o de 19/11';
  end if;
end
$confere$;

commit;
