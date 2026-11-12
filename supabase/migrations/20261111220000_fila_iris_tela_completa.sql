-- =====================================================================================
-- Fila da Iris — tela mais completa (dono 11/11: "ta muito simples… mais bem organizado, completo").
-- Só leitura; nada muda nos clientes, nas conversas, nos cards nem na Iris.
-- 1) fila_iris_itens: devolve SEMPRE a última mensagem do cliente (antes só quando estava
--    aguardando resposta) — a fila mostra o que ele disse por último em cada linha.
-- 2) fila_iris_numeros: o atendente vê os PRÓPRIOS números (recebidos e fechados); o
--    administrador continua vendo a equipe toda.
-- Mesma assinatura das duas funções (create or replace mantém as permissões).
-- =====================================================================================

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

create or replace function public.fila_iris_numeros(p_org uuid, p_inicio timestamptz, p_fim timestamptz)
returns table (usuario_id uuid, nome text, recebidos int, fechados int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_admin boolean;
begin
  if not public.fila_iris_acesso(p_org) then
    raise exception 'sem acesso à fila' using errcode = '42501';
  end if;
  -- o administrador vê a equipe toda; o atendente vê só a própria linha
  v_admin := public.papel_na_org(p_org) = 'admin';
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
     and (v_admin or u.id = auth.uid())
     and exists (select 1 from public.bot_roteamentos r2 where r2.organizacao_id = p_org and r2.consultor_id = u.id);
end;
$$;
