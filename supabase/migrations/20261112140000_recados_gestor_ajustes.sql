-- =====================================================================================
-- RECADO DO ADMINISTRADOR — ajustes da 2ª verificação (12/11, logo depois de publicar 20261112130000):
-- - recado_respondeu_em: UMA regra para "respondeu o cliente" (leitura, gatilho e repasse). Pelo celular vale o dono
--   da conversa pela regra da fila (conversa → contato): conversa sem atendente_id cai no dono do contato.
-- - gatilho: guarda a resposta de todos os pendentes do contato vista como era ANTES da troca, e só então encerra.
-- - repasse: o recado que já se resolveu (ele respondeu o cliente) não vai junto; a prioridade 0 segue a regra do
--   dono (o caso mais recente); as cópias nascem espaçadas de 1 ms (a principal na frente do colega).
-- =====================================================================================
set lock_timeout = '5s';

create or replace function public.recado_respondeu_em(p_contato uuid, p_para uuid, p_desde timestamptz, p_resp uuid,
                                                     p_conv uuid default null, p_conv_dono uuid default null)
returns timestamptz language sql stable security definer set search_path = public, pg_temp as $$
  -- a 1ª mensagem que saiu de verdade para o cliente depois do recado, sem agendamento: do destinatário pelo painel,
  -- ou pelo celular numa conversa que é dele pela regra da fila (atendente da conversa → dono do contato).
  -- p_conv/p_conv_dono: a conversa que está mudando de dono agora e o dono dela ANTES (o gatilho)
  select min(m.enviada_em) from public.mensagens m join public.conversas c on c.id = m.conversa_id
   where c.contato_id = p_contato and m.direcao = 'saida' and m.tipo::text not in ('sistema', 'nota_interna')
     and m.status::text in ('enviada', 'entregue', 'lida') and coalesce(m.metadados->>'agendamento_id', '') = ''
     and m.enviada_em > p_desde
     and ((m.origem = 'atenvo' and m.autor_id = p_para)
          or (m.origem = 'telefone' and m.autor_id is null
              and coalesce(case when c.id = p_conv then p_conv_dono else c.atendente_id end, p_resp) = p_para));
$$;
revoke all on function public.recado_respondeu_em(uuid, uuid, timestamptz, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.recados_meus(p_org uuid)
returns table (
  id uuid, de_id uuid, de_nome text, para_id uuid, para_nome text, contato_id uuid, conversa_id uuid, cliente text,
  mensagem text, criado_em timestamptz, visto_em timestamptz, cliente_respondido_em timestamptz,
  resposta text, respondido_em timestamptz, repassado_para uuid, repassado_para_nome text, devolvido boolean,
  gestor_visto_em timestamptz, de_admin boolean, repassado_por_nome text, repasse_motivo text, origem_id uuid,
  ainda_dono boolean, encerrado text
) language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_admin boolean;
begin
  if not public.fila_iris_acesso(p_org) then
    return;
  end if;
  v_admin := coalesce(public.papel_na_org(p_org)::text, '') = 'admin';
  return query
  select r.id, r.de_id, ud.nome, r.para_id, up.nome, r.contato_id, r.conversa_id, coalesce(nullif(btrim(ct.nome), ''), ct.telefone),
         r.mensagem, r.criado_em, r.visto_em,
         -- respondeu o cliente: saiu de verdade, depois do recado, sem agendamento — do destinatário pelo painel,
         -- ou pelo celular numa conversa que está com ele (o celular não diz quem escreveu); guardada na troca de dono
         coalesce(r.cliente_respondido_em, public.recado_respondeu_em(r.contato_id, r.para_id, r.criado_em, ct.responsavel_id)),
         r.resposta, r.respondido_em, r.repassado_para, ur.nome, r.devolvido, r.gestor_visto_em,
         true, urp.nome, r.repasse_motivo, r.origem_id,
         coalesce(public.recado_dono_agora(r.organizacao_id, r.contato_id) = r.para_id or ct.responsavel_id = r.para_id, false),
         r.encerrado
    from public.recados_gestor r
    join public.contatos ct on ct.id = r.contato_id
    left join public.usuarios ud on ud.id = r.de_id
    left join public.usuarios up on up.id = r.para_id
    left join public.usuarios ur on ur.id = r.repassado_para
    left join public.usuarios urp on urp.id = r.repassado_por
   where r.organizacao_id = p_org
     and (r.para_id = auth.uid() or r.de_id = auth.uid() or v_admin)
     and (r.criado_em >= now() - interval '7 days'
          -- o que espera ação não sai pela data dos 7 dias (até 30): o recado pendente para mim, a resposta que eu não
          -- vi e, para o administrador, o que a equipe ainda deve
          or (r.criado_em >= now() - interval '30 days' and (
                (r.para_id = auth.uid() and r.respondido_em is null and r.encerrado is null and r.cliente_respondido_em is null)
             or (r.de_id = auth.uid() and r.gestor_visto_em is null)
             or (v_admin and r.respondido_em is null and r.encerrado is null and r.cliente_respondido_em is null))))
   order by (r.para_id = auth.uid() and r.respondido_em is null and r.encerrado is null) desc,
            (r.de_id = auth.uid() and r.gestor_visto_em is null) desc,
            (r.respondido_em is null and r.encerrado is null) desc, r.criado_em desc
   limit 300;
end;
$$;

create or replace function public.recado_repassar(p_org uuid, p_recado uuid, p_para uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.recados_gestor; v_mot text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_eu text; v_para text; cfg public.fila_iris_config; v_dono uuid; v_resp uuid; v_ultima uuid; v_irmaos uuid[];
  v_base timestamptz;
begin
  if not public.fila_iris_acesso(p_org) then raise exception 'Sem acesso.' using errcode = '42501'; end if;
  select * into r from public.recados_gestor where id = p_recado and organizacao_id = p_org for update;
  if not found or r.para_id is distinct from auth.uid() then raise exception 'Este recado não é seu.' using errcode = '42501'; end if;
  if r.respondido_em is not null then raise exception 'Este recado já foi respondido.'; end if;
  if r.encerrado is not null then raise exception 'Este recado já foi encerrado.'; end if;
  if v_mot is not null and length(v_mot) > 400 then raise exception 'O motivo passou de 400 letras.'; end if;
  select nome into v_eu from public.usuarios where id = auth.uid();
  if p_para is null then
    update public.recados_gestor
       set devolvido = true, resposta = v_mot, respondido_em = now(), visto_em = coalesce(visto_em, now()), gestor_visto_em = null
     where id = p_recado;
    perform public.recado_nota(p_org, r.conversa_id,
      coalesce(v_eu, 'O atendente') || ' devolveu o recado para o administrador decidir' || coalesce(': “' || v_mot || '”', '.'));
    return jsonb_build_object('ok', true, 'devolvido', true);
  end if;
  if p_para = auth.uid() then raise exception 'Escolha outro atendente.'; end if;
  select * into cfg from public.fila_iris_config where organizacao_id = p_org;
  if cfg.organizacao_id is null or not (p_para = any (cfg.usuarios))
     or not exists (select 1 from public.organizacao_usuarios ou where ou.organizacao_id = p_org
                     and ou.usuario_id = p_para and ou.status::text = 'ativo') then
    raise exception 'Este atendente não está na Fila da Iris.';
  end if;
  -- cliente fechado (o card mais recente ganho) não se repassa, como no Radar
  if (select o.status::text from public.oportunidades o where o.contato_id = r.contato_id
       order by o.criado_em desc limit 1) = 'ganho' then
    raise exception 'Este cliente já está fechado: não dá para repassar. Use "Devolver para o administrador decidir".';
  end if;
  -- prioridade 0 fica com o vendedor do caso no CAF: repassar aqui não mudaria a fila
  if (select public.adm_usuario_do_vendedor(p_org, p.vendedor) from public.adm_pendencias p
       where p.organizacao_id = p_org and p.contato_id = r.contato_id and p.assinado and 'historico' = any (p.falta)
       order by p.assinado_em desc nulls last limit 1) is not null then
    raise exception 'Este cliente fica com o vendedor do caso no CAF: não dá para repassar. Use "Devolver para o administrador decidir".';
  end if;
  -- o cliente tem de continuar sendo de quem repassa (trava o contato; se mudou, o recado se encerra)
  select ct.responsavel_id into v_resp from public.contatos ct
   where ct.id = r.contato_id and ct.organizacao_id = p_org for update;
  v_dono := public.recado_dono_agora(p_org, r.contato_id);
  if v_dono is distinct from auth.uid() and v_resp is distinct from auth.uid() then
    update public.recados_gestor set encerrado = 'o cliente mudou de atendente', gestor_visto_em = now() where id = p_recado;
    return jsonb_build_object('ok', false, 'erro', 'Este cliente já não é seu: o recado foi encerrado.');
  end if;
  select nome into v_para from public.usuarios where id = p_para;
  update public.recados_gestor
     set repassado_para = p_para, resposta = v_mot, respondido_em = now(), visto_em = coalesce(visto_em, now()), gestor_visto_em = null
   where id = p_recado;
  -- os outros recados pendentes deste cliente para mim vão junto para o colega (cada um com a sua cópia, mais
  -- abaixo); o administrador que mandou o principal já tem o cartão dele, os de outro administrador ganham o seu
  with irm as (
    update public.recados_gestor g
       set repassado_para = p_para, resposta = v_mot, respondido_em = now(), visto_em = coalesce(g.visto_em, now()),
           gestor_visto_em = case when g.de_id = r.de_id then now() else null end
     where g.contato_id = r.contato_id and g.para_id = auth.uid() and g.id <> p_recado
       and g.respondido_em is null and g.encerrado is null and g.cliente_respondido_em is null
       -- o que já se resolveu porque ele respondeu o cliente não vai junto
       and public.recado_respondeu_em(g.contato_id, g.para_id, g.criado_em, v_resp) is null
    returning g.id)
  select coalesce(array_agg(id), '{}') into v_irmaos from irm;
  -- o cliente muda de dono: o contato (a fonte única; o gatilho leva às conversas abertas e aos cards), a
  -- conversa do recado e a mais recente (a que decide o dono na fila), e a linha do tempo (como o vacuo_decidir)
  update public.contatos set responsavel_id = p_para where id = r.contato_id and organizacao_id = p_org;
  select c.id into v_ultima from public.conversas c where c.contato_id = r.contato_id
   order by c.ultima_interacao_em desc nulls last limit 1;
  update public.conversas set atendente_id = p_para
   where contato_id = r.contato_id and id in (r.conversa_id, v_ultima) and atendente_id is distinct from p_para;
  if coalesce(r.conversa_id, v_ultima) is not null then
    insert into public.conversa_atividades (organizacao_id, conversa_id, usuario_id, tipo, de, para, motivo)
    values (p_org, coalesce(r.conversa_id, v_ultima), auth.uid(), 'transferido',
            jsonb_build_object('responsavel_id', coalesce(v_dono, v_resp)), jsonb_build_object('responsavel_id', p_para),
            'Repasse pelo recado do administrador' || coalesce(': ' || v_mot, '.'));
  end if;
  -- o colega recebe o mesmo recado do administrador (a resposta dele vai para o administrador); se o colega é o
  -- próprio administrador que mandou, ele já vê o repasse na resposta: sem recado novo
  -- (a principal na frente do "1 de N" do colega: as cópias nascem espaçadas de 1 ms, a tela lê em ms)
  v_base := clock_timestamp();
  if p_para is distinct from r.de_id then
    insert into public.recados_gestor (organizacao_id, de_id, para_id, contato_id, conversa_id, mensagem, origem_id, repassado_por, repasse_motivo, criado_em)
    values (p_org, r.de_id, p_para, r.contato_id, r.conversa_id, r.mensagem, r.id, auth.uid(), v_mot, v_base);
  end if;
  insert into public.recados_gestor (organizacao_id, de_id, para_id, contato_id, conversa_id, mensagem, origem_id, repassado_por, repasse_motivo, criado_em)
  select p_org, g.de_id, p_para, g.contato_id, g.conversa_id, g.mensagem, g.id, auth.uid(), v_mot,
         v_base + (row_number() over (order by g.criado_em)) * interval '1 millisecond'
    from public.recados_gestor g
   where g.id = any (v_irmaos) and g.de_id is distinct from p_para;
  perform public.recado_nota(p_org, r.conversa_id,
    coalesce(v_eu, 'O atendente') || ' repassou o cliente para ' || coalesce(v_para, 'outro atendente')
    || ' (recado do administrador)' || coalesce(': “' || v_mot || '”', '.'));
  return jsonb_build_object('ok', true, 'para_nome', v_para);
end;
$$;

create or replace function public.recado_dono_mudou()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_contato uuid; v_conv uuid; v_antes uuid; v_resp_antes uuid;
begin
  begin
    -- (um ramo por tabela: o registro de contatos não tem contato_id nem atendente_id)
    if tg_table_name = 'contatos' then
      v_contato := new.id; v_resp_antes := old.responsavel_id;
    else
      v_contato := new.contato_id; v_conv := new.id; v_antes := old.atendente_id;
      select ct.responsavel_id into v_resp_antes from public.contatos ct where ct.id = new.contato_id;
    end if;
    if v_contato is null or not exists (select 1 from public.recados_gestor g
         where g.contato_id = v_contato and g.respondido_em is null and g.encerrado is null and g.cliente_respondido_em is null) then
      return null;
    end if;
    -- quem JÁ respondeu o cliente: guarda a hora de todos os pendentes do contato, vista como era antes da troca
    -- (é o mesmo valor que a leitura mostraria; depois da troca o celular deixaria de contar para ele)
    update public.recados_gestor g
       set cliente_respondido_em = public.recado_respondeu_em(g.contato_id, g.para_id, g.criado_em, v_resp_antes, v_conv, v_antes)
     where g.contato_id = v_contato and g.respondido_em is null and g.encerrado is null and g.cliente_respondido_em is null
       and public.recado_respondeu_em(g.contato_id, g.para_id, g.criado_em, v_resp_antes, v_conv, v_antes) is not null;
    -- quem deixou de ser o dono sem ter respondido: o recado se encerra (não volta a cobrar se o cliente voltar)
    update public.recados_gestor g
       set encerrado = 'o cliente mudou de atendente', gestor_visto_em = coalesce(g.gestor_visto_em, now())
     where g.contato_id = v_contato and g.respondido_em is null and g.encerrado is null and g.cliente_respondido_em is null
       and public.recado_dono_agora(g.organizacao_id, g.contato_id) is distinct from g.para_id
       and (select ct.responsavel_id from public.contatos ct where ct.id = g.contato_id) is distinct from g.para_id;
  exception when others then
    raise warning 'recado_dono_mudou: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.recado_dono_mudou() from public, anon, authenticated;
revoke all on function public.recados_meus(uuid) from public, anon;
revoke all on function public.recado_repassar(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.recados_meus(uuid) to authenticated;
grant execute on function public.recado_repassar(uuid, uuid, uuid, text) to authenticated;
