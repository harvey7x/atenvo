-- =====================================================================================
-- Fila da Iris — a ÚLTIMA MENSAGEM da conversa, de quem for (dono 13/11: "aqui e aqui sempre tem que atualizar pra
-- última mensagem, e se for do cliente, sempre tem que ter uma marcação").
-- fila_iris_itens(_base) ganham, no fim, ult_nossa_texto e ult_nossa_origem (a nossa última mensagem: o texto e de onde
-- saiu — bot/atenvo/telefone). Com ult_cliente_em × ult_nossa_em a tela sabe quem falou por último. O corpo é o que está
-- no ar (igual a 20261112120000; conferido); mudar o retorno pede drop + create — as permissões voltam iguais (a lista
-- para logados; a base só para o sistema). O relógio dos avisos lê a base por nome de coluna: não muda.
-- =====================================================================================
set lock_timeout = '5s';
drop function if exists public.fila_iris_itens(uuid, uuid);
drop function if exists public.fila_iris_itens_base(uuid, uuid);

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
