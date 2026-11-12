-- =====================================================================================
-- RECADO DO ADMINISTRADOR PARA O ATENDENTE (dono 12/11: "uma parte para mim notificar o atendente de
-- responder o cliente, que eu consiga colocar uma mensagem pra ele… apareça pra ele responder ou
-- repassar o cliente, aí tem que mostrar a resposta dele pra gente" + "coloca como recado do
-- ADMINISTRADOR, quero que apareça no meio da tela").
-- - recado_enviar: o administrador manda o recado sobre um cliente para o DONO DE AGORA pela regra da fila
--   (o mesmo que a ficha mostra; o banco confere), que precisa estar na Fila da Iris (senão nunca veria).
-- - recados_meus: o que me envolve (para mim; de mim; administrador: a org toda). O que espera ação
--   (recado pendente para mim, resposta que não vi) vem sempre; o histórico, 7 dias. "Respondeu o cliente"
--   vem sozinho: a 1ª mensagem de GENTE que saiu de verdade para o cliente depois do recado — do próprio
--   destinatário pelo painel, ou pelo celular —, sem agendamento, em qualquer conversa do contato.
--   ainda_dono: o cliente continua com o destinatário (senão a tela não cobra mais nada dele).
-- - recado_dono_mudou (gatilho em contatos.responsavel_id e conversas.atendente_id): o cliente saiu do
--   destinatário por outro caminho (Radar, inbox, distribuição) → o recado pendente se encerra (não volta a
--   cobrar quando o cliente voltar; "respondeu o cliente" não vem de outra pessoa). Nunca trava a troca de dono.
-- - recado_visto / recado_responder / recado_repassar (a um colega da Fila: o cliente muda de dono — contato,
--   conversa e linha do tempo, como no Radar — e o colega recebe o MESMO recado do administrador com
--   "repassado por"; a resposta dele vai para o administrador. Ou devolver para o administrador decidir.) /
--   recados_resposta_vista.
-- - Para o atendente o recado é "do administrador": o nome de quem mandou não aparece na nota nem no
--   cartão; fica só no registro (de_id). Tudo vira NOTA INTERNA na conversa. Nada vai ao cliente.
-- =====================================================================================
set lock_timeout = '5s';

create table if not exists public.recados_gestor (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null,
  de_id uuid not null,
  para_id uuid not null,
  contato_id uuid not null references public.contatos(id) on delete cascade,
  conversa_id uuid,
  mensagem text not null check (length(btrim(mensagem)) between 1 and 400),
  criado_em timestamptz not null default now(),
  visto_em timestamptz,
  resposta text check (resposta is null or length(resposta) <= 400),
  respondido_em timestamptz,
  repassado_para uuid,
  devolvido boolean not null default false,
  gestor_visto_em timestamptz,
  -- o recado que nasceu de um repasse aponta para o de origem e diz quem repassou e por quê
  origem_id uuid references public.recados_gestor(id) on delete set null,
  repassado_por uuid,
  repasse_motivo text check (repasse_motivo is null or length(repasse_motivo) <= 400),
  -- encerrado sem ação do atendente (o cliente saiu dele por outro caminho)
  encerrado text,
  -- a resposta ao cliente guardada quando o cliente muda de dono (pelo celular ela deixaria de contar: a conversa
  -- passa a ser do outro); sem troca de dono, "respondeu o cliente" é lido na hora (recados_meus)
  cliente_respondido_em timestamptz
);
create index if not exists recados_gestor_para_idx on public.recados_gestor (para_id, criado_em desc);
create index if not exists recados_gestor_de_idx on public.recados_gestor (de_id, criado_em desc);
create index if not exists recados_gestor_org_idx on public.recados_gestor (organizacao_id, criado_em desc);
create index if not exists recados_gestor_contato_idx on public.recados_gestor (contato_id, criado_em desc);
create index if not exists recados_gestor_pendentes_idx on public.recados_gestor (contato_id)
  where respondido_em is null and encerrado is null and cliente_respondido_em is null;
alter table public.recados_gestor enable row level security;
-- sem política: só as funções abaixo (security definer) leem e gravam

-- a nota interna na conversa do cliente (sem conversa, não há onde registrar: segue sem nota)
create or replace function public.recado_nota(p_org uuid, p_conversa uuid, p_texto text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_conversa is null then
    return;
  end if;
  insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
  values (p_org, p_conversa, 'saida', 'nota_interna', 'bot', 'enviada', p_texto, now());
end;
$$;

-- a conversa do cliente, pela regra do webhook (a que está em uso: não fechada, não arquivada, a mais recente)
create or replace function public.recado_conversa(p_contato uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select c.id from public.conversas c
   where c.contato_id = p_contato
   order by (c.status::text = 'fechada'), c.arquivada_em nulls first, c.ultima_interacao_em desc nulls last
   limit 1;
$$;

-- o dono de agora pela regra da Fila da Iris (fila_iris_itens_base): prioridade 0 (assinou e falta o
-- histórico) fica com o vendedor do caso no CAF; sem ele, o dono de sempre (conversa → contato → card)
create or replace function public.recado_dono_agora(p_org uuid, p_contato uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select public.adm_usuario_do_vendedor(p_org, p.vendedor) from public.adm_pendencias p
      where p.organizacao_id = p_org and p.contato_id = p_contato and p.assinado and 'historico' = any (p.falta)
      order by p.assinado_em desc nulls last limit 1),
    public.fila_iris_dono(p_contato));
$$;

-- ---------------------------------------------------------------- o administrador manda
-- p_para = o dono que a ficha mostra; o banco confere que ele continua sendo o dono
create or replace function public.recado_enviar(p_org uuid, p_contato uuid, p_para uuid, p_mensagem text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_msg text := btrim(coalesce(p_mensagem, ''));
  v_conv uuid; v_id uuid; v_para text; cfg public.fila_iris_config;
begin
  if not public.fila_iris_acesso(p_org) or coalesce(public.papel_na_org(p_org)::text, '') <> 'admin' then
    raise exception 'Só o administrador manda recado para o atendente.' using errcode = '42501';
  end if;
  if length(v_msg) = 0 then raise exception 'Escreva o recado.'; end if;
  if length(v_msg) > 400 then raise exception 'O recado passou de 400 letras.'; end if;
  if p_para is null then raise exception 'Este cliente está sem atendente.'; end if;
  if p_para = auth.uid() then raise exception 'Este cliente é seu.'; end if;
  select * into cfg from public.fila_iris_config where organizacao_id = p_org;
  if cfg.organizacao_id is null or not (p_para = any (cfg.usuarios))
     or not exists (select 1 from public.organizacao_usuarios ou where ou.organizacao_id = p_org
                     and ou.usuario_id = p_para and ou.status::text = 'ativo') then
    raise exception 'Essa pessoa não está na Fila da Iris: o recado não chegaria a ela.';
  end if;
  if not exists (select 1 from public.contatos ct where ct.id = p_contato and ct.organizacao_id = p_org) then
    raise exception 'Cliente não encontrado.';
  end if;
  if public.recado_dono_agora(p_org, p_contato) is distinct from p_para then
    raise exception 'Este cliente mudou de atendente. Abra a ficha de novo.';
  end if;
  -- freio: o mesmo recado de novo em menos de 1 minuto (clique duplo)
  if exists (select 1 from public.recados_gestor r where r.contato_id = p_contato and r.de_id = auth.uid()
              and r.mensagem = v_msg and r.criado_em > now() - interval '1 minute') then
    raise exception 'Você acabou de mandar este recado.';
  end if;
  v_conv := public.recado_conversa(p_contato);
  insert into public.recados_gestor (organizacao_id, de_id, para_id, contato_id, conversa_id, mensagem)
  values (p_org, auth.uid(), p_para, p_contato, v_conv, v_msg)
  returning id into v_id;
  select nome into v_para from public.usuarios where id = p_para;
  perform public.recado_nota(p_org, v_conv,
    'Recado do administrador para ' || coalesce(v_para, 'o atendente') || ': “' || v_msg || '”');
  return jsonb_build_object('id', v_id, 'para_nome', v_para);
end;
$$;

-- ---------------------------------------------------------------- o que a tela lê
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
         coalesce(r.cliente_respondido_em, (select m.enviada_em from public.mensagens m
            join public.conversas c on c.id = m.conversa_id
           where c.contato_id = r.contato_id
             and m.direcao = 'saida' and m.tipo::text not in ('sistema', 'nota_interna')
             and m.status::text in ('enviada', 'entregue', 'lida')
             and coalesce(m.metadados->>'agendamento_id', '') = ''
             and ((m.origem = 'atenvo' and m.autor_id = r.para_id)
                  or (m.origem = 'telefone' and m.autor_id is null and c.atendente_id = r.para_id))
             and m.enviada_em > r.criado_em
           order by m.enviada_em limit 1)),
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

-- ---------------------------------------------------------------- o atendente age
create or replace function public.recado_visto(p_org uuid, p_recado uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.fila_iris_acesso(p_org) then raise exception 'Sem acesso.' using errcode = '42501'; end if;
  update public.recados_gestor set visto_em = now()
   where id = p_recado and organizacao_id = p_org and para_id = auth.uid() and visto_em is null;
end;
$$;

create or replace function public.recado_responder(p_org uuid, p_recado uuid, p_texto text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.recados_gestor; v_txt text := btrim(coalesce(p_texto, '')); v_eu text;
begin
  if not public.fila_iris_acesso(p_org) then raise exception 'Sem acesso.' using errcode = '42501'; end if;
  select * into r from public.recados_gestor where id = p_recado and organizacao_id = p_org for update;
  if not found or r.para_id is distinct from auth.uid() then raise exception 'Este recado não é seu.' using errcode = '42501'; end if;
  if r.respondido_em is not null then raise exception 'Este recado já foi respondido.'; end if;
  if r.encerrado is not null then raise exception 'Este recado já foi encerrado.'; end if;
  if length(v_txt) = 0 then raise exception 'Escreva a resposta.'; end if;
  if length(v_txt) > 400 then raise exception 'A resposta passou de 400 letras.'; end if;
  update public.recados_gestor
     set resposta = v_txt, respondido_em = now(), visto_em = coalesce(visto_em, now()), gestor_visto_em = null
   where id = p_recado;
  select nome into v_eu from public.usuarios where id = auth.uid();
  perform public.recado_nota(p_org, r.conversa_id,
    coalesce(v_eu, 'O atendente') || ' respondeu o recado do administrador: “' || v_txt || '”');
end;
$$;

-- p_para = o colega (o cliente muda de dono: contato + conversa + linha do tempo, como no Radar; e o colega
-- recebe o MESMO recado do administrador, com "repassado por"); p_para nulo = devolver para o administrador
-- decidir (o cliente não muda de dono). Volta {ok, para_nome} — ou {ok: false, erro} quando o cliente já
-- não é de quem repassa (o recado se encerra; por isso não é exceção, que desfaria o encerramento).
create or replace function public.recado_repassar(p_org uuid, p_recado uuid, p_para uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r public.recados_gestor; v_mot text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_eu text; v_para text; cfg public.fila_iris_config; v_dono uuid; v_resp uuid; v_ultima uuid; v_irmaos uuid[];
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
  if exists (select 1 from public.adm_pendencias p where p.organizacao_id = p_org and p.contato_id = r.contato_id
              and p.assinado and 'historico' = any (p.falta)
              and public.adm_usuario_do_vendedor(p_org, p.vendedor) is not null) then
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
       and g.respondido_em is null and g.encerrado is null
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
  if p_para is distinct from r.de_id then
    insert into public.recados_gestor (organizacao_id, de_id, para_id, contato_id, conversa_id, mensagem, origem_id, repassado_por, repasse_motivo, criado_em)
    values (p_org, r.de_id, p_para, r.contato_id, r.conversa_id, r.mensagem, r.id, auth.uid(), v_mot, clock_timestamp());
  end if;
  insert into public.recados_gestor (organizacao_id, de_id, para_id, contato_id, conversa_id, mensagem, origem_id, repassado_por, repasse_motivo, criado_em)
  select p_org, g.de_id, p_para, g.contato_id, g.conversa_id, g.mensagem, g.id, auth.uid(), v_mot, clock_timestamp()
    from public.recados_gestor g
   where g.id = any (v_irmaos) and g.de_id is distinct from p_para
   order by g.criado_em;
  perform public.recado_nota(p_org, r.conversa_id,
    coalesce(v_eu, 'O atendente') || ' repassou o cliente para ' || coalesce(v_para, 'outro atendente')
    || ' (recado do administrador)' || coalesce(': “' || v_mot || '”', '.'));
  return jsonb_build_object('ok', true, 'para_nome', v_para);
end;
$$;

-- ---------------------------------------------------------------- o cliente mudou de dono por outro caminho
-- (o Radar, o inbox, a distribuição): o recado pendente de quem deixou de ser o dono se encerra, pela regra da
-- fila. Dispara só quando o dono muda; nunca atrapalha a troca (qualquer erro aqui vira só um aviso no log).
create or replace function public.recado_dono_mudou()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_contato uuid; v_conv uuid; v_antes uuid;
begin
  begin
    -- (um ramo por tabela: o registro de contatos não tem contato_id nem atendente_id)
    if tg_table_name = 'contatos' then
      v_contato := new.id;
    else
      v_contato := new.contato_id; v_conv := new.id; v_antes := old.atendente_id;
    end if;
    if v_contato is null or not exists (select 1 from public.recados_gestor g
         where g.contato_id = v_contato and g.respondido_em is null and g.encerrado is null and g.cliente_respondido_em is null) then
      return null;
    end if;
    -- quem deixou de ser o dono e JÁ tinha respondido o cliente: guarda a hora (a conversa que acabou de mudar
    -- ainda conta como dele para o celular)
    update public.recados_gestor g
       set cliente_respondido_em = x.em
      from (select g2.id,
                   (select min(m.enviada_em) from public.mensagens m join public.conversas c on c.id = m.conversa_id
                     where c.contato_id = g2.contato_id and m.direcao = 'saida' and m.tipo::text not in ('sistema', 'nota_interna')
                       and m.status::text in ('enviada', 'entregue', 'lida') and coalesce(m.metadados->>'agendamento_id', '') = ''
                       and m.enviada_em > g2.criado_em
                       and ((m.origem = 'atenvo' and m.autor_id = g2.para_id)
                            or (m.origem = 'telefone' and m.autor_id is null
                                and (c.atendente_id = g2.para_id or (c.id = v_conv and v_antes = g2.para_id))))) as em
              from public.recados_gestor g2
             where g2.contato_id = v_contato and g2.respondido_em is null and g2.encerrado is null and g2.cliente_respondido_em is null
               and public.recado_dono_agora(g2.organizacao_id, g2.contato_id) is distinct from g2.para_id
               and (select ct.responsavel_id from public.contatos ct where ct.id = g2.contato_id) is distinct from g2.para_id) x
     where g.id = x.id and x.em is not null;
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
drop trigger if exists trg_recado_dono_mudou on public.contatos;
create trigger trg_recado_dono_mudou after update of responsavel_id on public.contatos
  for each row when (new.responsavel_id is distinct from old.responsavel_id) execute function public.recado_dono_mudou();
drop trigger if exists trg_recado_dono_mudou on public.conversas;
create trigger trg_recado_dono_mudou after update of atendente_id on public.conversas
  for each row when (new.atendente_id is distinct from old.atendente_id) execute function public.recado_dono_mudou();

-- ---------------------------------------------------------------- o administrador viu as respostas
create or replace function public.recados_resposta_vista(p_org uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.fila_iris_acesso(p_org) then raise exception 'Sem acesso.' using errcode = '42501'; end if;
  update public.recados_gestor set gestor_visto_em = now()
   where organizacao_id = p_org and de_id = auth.uid() and id = any (p_ids) and gestor_visto_em is null;
end;
$$;

revoke all on function public.recado_nota(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.recado_conversa(uuid) from public, anon, authenticated;
revoke all on function public.recado_dono_agora(uuid, uuid) from public, anon, authenticated;
revoke all on function public.recado_enviar(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.recados_meus(uuid) from public, anon;
revoke all on function public.recado_visto(uuid, uuid) from public, anon;
revoke all on function public.recado_responder(uuid, uuid, text) from public, anon;
revoke all on function public.recado_repassar(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.recados_resposta_vista(uuid, uuid[]) from public, anon;
grant execute on function public.recado_enviar(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.recados_meus(uuid) to authenticated;
grant execute on function public.recado_visto(uuid, uuid) to authenticated;
grant execute on function public.recado_responder(uuid, uuid, text) to authenticated;
grant execute on function public.recado_repassar(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.recados_resposta_vista(uuid, uuid[]) to authenticated;
