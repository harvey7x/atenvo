-- ============================================================================
-- RADAR DE ATENDIMENTO v2 — o GESTOR decide o repasse (pedido do dono 23/10)
-- "o sistema não vai repassar automático, vai notificar pra mim decidir se vai
--  repassar ou não, e pra quem. Avisos por um dia. Não considera sábado nem
--  domingo. A gente trabalha das 9 às 7."
--
-- - Relógio útil: SEGUNDA a SEXTA, 09h–19h (America/Sao_Paulo). 1 dia útil = 600 min.
-- - Escada ao longo de ~1 dia útil: avisos 30 min / 2 h / 5 h (prioritário 15 min /
--   1 h / 3 h); com 1 dia útil sem resposta (600 min) o caso vai pro GESTOR decidir.
--   (vacuo_config.repasse_min / prio_repasse_min passam a significar "tempo até pedir
--   a decisão do gestor" — nomes mantidos pra não quebrar nada.)
-- - O motor NUNCA mais transfere cliente. Quem transfere é vacuo_decidir(), chamada
--   pelo admin no painel /radar: repassar para quem ELE escolher, ou manter.
-- - Histórico em vacuo_repasses ganha decisao ('repassado'|'mantido'), decidido_por
--   e desfeito_em (o repasse automático de 23/10 foi desfeito a pedido do dono).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------------
alter table public.vacuo_estado
  add column if not exists decisao_pedida_em timestamptz,
  add column if not exists prioritario boolean not null default false,
  add column if not exists prio_motivo text,
  add column if not exists minutos_vacuo integer;

alter table public.vacuo_repasses
  add column if not exists decisao text not null default 'repassado',
  add column if not exists decidido_por uuid references public.usuarios(id),
  add column if not exists desfeito_em timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vacuo_repasses_decisao_check') then
    alter table public.vacuo_repasses add constraint vacuo_repasses_decisao_check
      check (decisao in ('repassado', 'mantido'));
  end if;
end $$;

-- o único repasse automático (Claudio, Juliana → Isadora) foi desfeito em 23/10
update public.vacuo_repasses vr set desfeito_em = coalesce(vr.desfeito_em, now())
 where vr.decidido_por is null and vr.decisao = 'repassado'
   and exists (select 1 from public.contatos ct
               where ct.id = vr.contato_id and ct.responsavel_id = vr.de_usuario_id);

-- ---------------------------------------------------------------------------
-- Regras da CAF: seg–sex 09–19h, escada de ~1 dia útil, decisão do gestor em 600 min
-- (ordem importa por causa dos CHECKs da escada: primeiro o teto, depois os degraus)
-- ---------------------------------------------------------------------------
update public.vacuo_config set
  hora_inicio = 9, hora_fim = 19,
  repasse_min = 600, prio_repasse_min = 600,
  aviso1_min = 30, aviso2_min = 120, aviso3_min = 300,
  prio_aviso1_min = 15, prio_aviso2_min = 60, prio_aviso3_min = 180,
  atualizado_em = now()
 where organizacao_id = 'de300000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Minutos ÚTEIS: só segunda a sexta, dentro de [h_ini, h_fim) em São Paulo
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_minutos_uteis(
  p_ini timestamptz, p_fim timestamptz, p_h_ini int, p_h_fim int
) returns integer
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(sum(greatest(0, extract(epoch from (
           least(p_fim, ((d.dia + make_interval(hours => p_h_fim)) at time zone 'America/Sao_Paulo'))
         - greatest(p_ini, ((d.dia + make_interval(hours => p_h_ini)) at time zone 'America/Sao_Paulo'))
         )) / 60.0))::int, 0)
  from generate_series(
         date_trunc('day', p_ini at time zone 'America/Sao_Paulo'),
         date_trunc('day', p_fim at time zone 'America/Sao_Paulo'),
         interval '1 day') as d(dia)
  where p_ini is not null and p_fim is not null and p_fim > p_ini
    and extract(isodow from d.dia) between 1 and 5   -- sábado (6) e domingo (7) não contam
$$;

-- ---------------------------------------------------------------------------
-- O MOTOR v2 (cron 1 min): avisa o dono e, com 1 dia útil, pede a decisão do gestor.
-- NÃO transfere cliente.
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_avaliar(p_org uuid default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_avisos int := 0; v_decisoes int := 0; v_limpos int := 0;
  r record; v_sev text; v_titulo text;
begin
  drop table if exists _vac;

  create temp table _vac on commit drop as
  select v.*,
         case when v.prioritario then v.p_a1 else v.a1 end as th1,
         case when v.prioritario then v.p_a2 else v.a2 end as th2,
         case when v.prioritario then v.p_a3 else v.a3 end as th3,
         case when v.prioritario then v.p_rep else v.rep end as th_dec
  from (
    select c.id as conversa_id, c.organizacao_id, c.contato_id,
           coalesce(ct.responsavel_id, c.atendente_id) as dono,
           ct.nome as contato_nome,
           um.ult_in,
           -- base = PRIMEIRA mensagem do cliente ainda sem resposta humana; com episódio
           -- aberto, PRESERVA a base (zera: resposta humana, decisão do gestor, troca de dono)
           coalesce(ve.base_em, greatest(pend.pri_in, cfg.ativo_desde)) as base_rel,
           ve.aviso as aviso_atual,
           cfg.aviso1_min as a1, cfg.aviso2_min as a2, cfg.aviso3_min as a3, cfg.repasse_min as rep,
           cfg.prio_aviso1_min as p_a1, cfg.prio_aviso2_min as p_a2, cfg.prio_aviso3_min as p_a3, cfg.prio_repasse_min as p_rep,
           public.vacuo_minutos_uteis(
             coalesce(ve.base_em, greatest(pend.pri_in, cfg.ativo_desde)), now(),
             cfg.hora_inicio, cfg.hora_fim) as min_vacuo,
           (coalesce(ia.tem_docs, false) or coalesce(ia.ia_handoff, false)
            or coalesce(e.lead_quente, false) or e.etapa = 'concluido') as prioritario,
           case when coalesce(ia.tem_docs, false)   then 'documentação enviada'
                when coalesce(ia.ia_handoff, false) then 'IA qualificou e entregou'
                when coalesce(e.lead_quente, false) then 'lead quente (interesse confirmado)'
                when e.etapa = 'concluido'          then 'triagem do robô completa'
                else null end as prio_motivo
    from public.conversas c
    join public.vacuo_config cfg
      on cfg.organizacao_id = c.organizacao_id and cfg.ativo and cfg.ativo_desde is not null
    left join public.contatos ct on ct.id = c.contato_id
    left join public.vacuo_estado ve on ve.conversa_id = c.id
    left join public.bot_conversa_estado e on e.conversa_id = c.id
    left join lateral (
      select max(coalesce(m.recebida_em, m.criado_em)) filter (where m.direcao = 'entrada') as ult_in,
             max(coalesce(m.enviada_em, m.criado_em)) filter (where m.direcao = 'saida'
               and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
                    or (m.autor_id is null and m.origem = 'telefone'))) as ult_humano
      from public.mensagens m where m.conversa_id = c.id
    ) um on true
    left join lateral (
      select min(coalesce(m.recebida_em, m.criado_em)) as pri_in
      from public.mensagens m
      where m.conversa_id = c.id and m.direcao = 'entrada'
        and coalesce(m.recebida_em, m.criado_em) > coalesce(um.ult_humano, '-infinity'::timestamptz)
    ) pend on true
    left join lateral (
      select bool_or(s.docs is not null and s.docs <> '{}'::jsonb and s.docs <> '[]'::jsonb) as tem_docs,
             bool_or(s.status = 'handoff') as ia_handoff,
             bool_or(s.status = 'ativa')   as ia_ativa
      from public.ia_sessoes s where s.conversa_id = c.id
    ) ia on true
    where c.arquivada_em is null
      and c.status in ('aberta','em_atendimento','pendente')
      and (p_org is null or c.organizacao_id = p_org)
      and (ct.responsavel_id is not null or c.atendente_id is not null)
      and c.ultima_entrada_em is not null
      and c.ultima_entrada_em >= cfg.ativo_desde
      -- 14 dias corridos: cobre fim de semana + decisão do gestor ainda pendente
      and c.ultima_entrada_em >= now() - interval '14 days'
      and um.ult_in is not null
      and um.ult_in >= cfg.ativo_desde
      and (um.ult_humano is null or um.ult_humano < um.ult_in)
      and coalesce(e.etapa, '') <> 'inicio'
      and not coalesce(ia.ia_ativa, false)
  ) v;

  delete from _vac where dono is null;

  -- troca de dono no meio do episódio: o novo dono recebe relógio zerado
  drop table if exists _mud;
  create temp table _mud on commit drop as
  with mud as (
    update public.vacuo_estado ve
       set aviso = 0, aviso_em = null, decisao_pedida_em = null,
           usuario_id = v.dono, base_em = now(), atualizado_em = now()
      from _vac v
     where v.conversa_id = ve.conversa_id and ve.usuario_id is distinct from v.dono
    returning ve.conversa_id
  ) select conversa_id from mud;
  update _vac set aviso_atual = 0, base_rel = now(), min_vacuo = 0
   where conversa_id in (select conversa_id from _mud);

  -- quem saiu do vácuo (respondeu/arquivou/fechou) perde estado — e a decisão pendente some junto
  delete from public.vacuo_estado ve
  where (p_org is null or ve.organizacao_id = p_org)
    and not exists (select 1 from _vac v where v.conversa_id = ve.conversa_id);
  get diagnostics v_limpos = row_count;

  update public.sla_alertas a
     set resolvido_em = now(), resolucao = 'auto', atualizado_em = now()
   where a.tipo = 'vacuo_aviso' and a.resolvido_em is null
     and (p_org is null or a.organizacao_id = p_org)
     and not exists (select 1 from _vac v
                     where v.conversa_id = a.conversa_id
                       and v.min_vacuo >= v.th1);

  -- Avisos 1→3 pro DONO (cada estágio dispara uma vez)
  for r in
    select *, case when min_vacuo >= th3 then 3
                   when min_vacuo >= th2 then 2
                   when min_vacuo >= th1 then 1
                   else 0 end as alvo
    from _vac
  loop
    if r.alvo = 0 or coalesce(r.aviso_atual, 0) >= r.alvo then
      continue;
    end if;
    begin
      insert into public.vacuo_estado (conversa_id, organizacao_id, contato_id, usuario_id, base_em, ult_in_em,
                                       aviso, aviso_em, prioritario, prio_motivo, minutos_vacuo, atualizado_em)
      values (r.conversa_id, r.organizacao_id, r.contato_id, r.dono, r.base_rel, r.ult_in,
              r.alvo, now(), r.prioritario, r.prio_motivo, r.min_vacuo, now())
      on conflict (conversa_id) do update
        set aviso = excluded.aviso, aviso_em = now(), usuario_id = excluded.usuario_id,
            base_em = excluded.base_em, ult_in_em = excluded.ult_in_em,
            prioritario = excluded.prioritario, prio_motivo = excluded.prio_motivo,
            minutos_vacuo = excluded.minutos_vacuo, atualizado_em = now();

      v_sev    := case r.alvo when 1 then 'amarelo' when 2 then 'vermelho' else 'critico' end;
      v_titulo := case r.alvo
                    when 1 then '⏰ 1º aviso — cliente no vácuo'
                    when 2 then '⏰ 2º aviso — cliente segue no vácuo'
                    else '🚨 3º e ÚLTIMO aviso — o gestor vai decidir o repasse'
                  end;
      if r.prioritario then
        v_titulo := case when r.prio_motivo = 'documentação enviada' then '📄 ' else '🔥 ' end || v_titulo;
      end if;
      insert into public.sla_alertas
        (organizacao_id, tipo, severidade, conversa_id, contato_id, responsavel_id, titulo, detalhe, dedup_key)
      values
        (r.organizacao_id, 'vacuo_aviso', v_sev, r.conversa_id, r.contato_id, r.dono, v_titulo,
         case when r.prioritario then 'LEAD PRIORITÁRIO (' || r.prio_motivo || ') — escada acelerada. ' else '' end ||
         'Responda o cliente para interromper a escalada. Com 1 dia útil sem resposta, o gestor decide se o cliente será repassado.',
         'vacuo_aviso:' || r.conversa_id)
      on conflict (organizacao_id, dedup_key) where resolvido_em is null do update
        set severidade = excluded.severidade, titulo = excluded.titulo,
            detalhe = excluded.detalhe, responsavel_id = excluded.responsavel_id, atualizado_em = now()
        where (sla_alertas.severidade, sla_alertas.titulo, sla_alertas.responsavel_id)
              is distinct from (excluded.severidade, excluded.titulo, excluded.responsavel_id);

      insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
      values (r.organizacao_id, r.dono, 'vacuo_aviso',
              case when r.prioritario then case when r.prio_motivo = 'documentação enviada' then '📄 ' else '🔥 ' end else '' end ||
              case r.alvo when 1 then '⏰ 1º aviso: cliente no vácuo'
                          when 2 then '⏰ 2º aviso: cliente segue no vácuo'
                          else '🚨 Último aviso: responda antes que o gestor decida o repasse' end,
              coalesce(r.contato_nome, 'Cliente') || ' está sem resposta há ' || r.min_vacuo || ' min (horário útil). ' ||
              case when r.prioritario then 'LEAD PRIORITÁRIO: ' || r.prio_motivo || '. ' else '' end ||
              case r.alvo when 3 then 'Com 1 dia útil sem resposta, o caso vai para o gestor decidir o repasse.'
                          else 'Aviso ' || r.alvo || ' de 3.' end,
              '/whatsapp?conversa=' || r.conversa_id, r.conversa_id);

      v_avisos := v_avisos + 1;
    exception when others then
      raise warning 'vacuo_avaliar: aviso falhou na conversa % — %', r.conversa_id, sqlerrm;
    end;
  end loop;

  -- 1 dia útil sem resposta → pede a DECISÃO do gestor (uma vez por episódio). Não transfere.
  for r in
    select v.*
    from _vac v
    join public.vacuo_estado ve on ve.conversa_id = v.conversa_id
    where ve.aviso >= 3 and ve.decisao_pedida_em is null
      and v.min_vacuo >= v.th_dec
      and ve.aviso_em <= now() - interval '5 minutes'
  loop
    begin
      update public.vacuo_estado
         set decisao_pedida_em = now(), minutos_vacuo = r.min_vacuo,
             prioritario = r.prioritario, prio_motivo = r.prio_motivo, atualizado_em = now()
       where conversa_id = r.conversa_id;

      insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
      select r.organizacao_id, ou.usuario_id, 'vacuo_decisao',
             case when r.prioritario then case when r.prio_motivo = 'documentação enviada' then '📄 ' else '🔥 ' end else '' end ||
             '⚖️ Radar: decida o repasse de um cliente',
             coalesce(r.contato_nome, 'Cliente') || ' está há 1 dia útil sem resposta com ' ||
             coalesce((select u.nome from public.usuarios u where u.id = r.dono), 'o atendente') ||
             '. Decida se repassa e para quem.',
             '/radar', r.conversa_id
      from public.organizacao_usuarios ou
      where ou.organizacao_id = r.organizacao_id and ou.papel = 'admin' and ou.status = 'ativo';

      v_decisoes := v_decisoes + 1;
    exception when others then
      raise warning 'vacuo_avaliar: pedido de decisão falhou na conversa % — %', r.conversa_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('avisos', v_avisos, 'decisoes_pedidas', v_decisoes, 'estados_limpos', v_limpos);
end $$;

revoke all on function public.vacuo_avaliar(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin? (gestor da org) — usado pelas RPCs de decisão
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_eh_gestor(p_org uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from public.organizacao_usuarios ou
                 where ou.organizacao_id = p_org and ou.usuario_id = auth.uid()
                   and ou.papel = 'admin' and ou.status = 'ativo')
$$;

-- ---------------------------------------------------------------------------
-- Fila de decisões pendentes (só o gestor vê)
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_decisoes_pendentes(p_org uuid)
returns table (conversa_id uuid, contato_nome text, dono_id uuid, dono_nome text,
               desde timestamptz, decisao_pedida_em timestamptz, minutos_vacuo integer,
               prioritario boolean, prio_motivo text, sugerido_id uuid, sugerido_nome text)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select ve.conversa_id, ct.nome, ve.usuario_id, u.nome,
         ve.base_em, ve.decisao_pedida_em, ve.minutos_vacuo,
         ve.prioritario, ve.prio_motivo,
         sug.id, sug.nome
  from public.vacuo_estado ve
  left join public.contatos ct on ct.id = ve.contato_id
  left join public.usuarios u on u.id = ve.usuario_id
  left join lateral (
    select uu.id, uu.nome from public.usuarios uu
    where uu.id = public.vacuo_melhor_fechador(p_org, ve.usuario_id,
            coalesce((select c.conversao_janela_dias from public.vacuo_config c where c.organizacao_id = p_org), 30),
            coalesce((select c.conversao_min_recebidos from public.vacuo_config c where c.organizacao_id = p_org), 30))
  ) sug on true
  where ve.organizacao_id = p_org and ve.decisao_pedida_em is not null
    and public.vacuo_eh_gestor(p_org)
  order by ve.prioritario desc, ve.base_em
$$;

-- ---------------------------------------------------------------------------
-- A DECISÃO do gestor: p_destino = outro atendente → repassa; null/o próprio dono → mantém.
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_decidir(p_conversa uuid, p_destino uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  ve public.vacuo_estado%rowtype;
  v_dono uuid; v_contato uuid; v_nome_cli text; v_nome_de text; v_nome_para text; v_opp uuid;
  v_decisao text;
begin
  select * into ve from public.vacuo_estado where conversa_id = p_conversa for update;
  if not found or ve.decisao_pedida_em is null then
    raise exception 'Esta decisão não está mais pendente — o cliente provavelmente já foi respondido.';
  end if;
  if not public.vacuo_eh_gestor(ve.organizacao_id) then
    raise exception 'Só o gestor pode decidir repasses.';
  end if;

  select coalesce(ct.responsavel_id, c.atendente_id), c.contato_id, coalesce(ct.nome, 'Cliente')
    into v_dono, v_contato, v_nome_cli
  from public.conversas c left join public.contatos ct on ct.id = c.contato_id
  where c.id = p_conversa;
  select nome into v_nome_de from public.usuarios where id = v_dono;

  v_decisao := case when p_destino is null or p_destino = v_dono then 'mantido' else 'repassado' end;

  if v_decisao = 'repassado' then
    if not exists (select 1 from public.organizacao_usuarios ou
                   where ou.organizacao_id = ve.organizacao_id and ou.usuario_id = p_destino and ou.status = 'ativo') then
      raise exception 'O atendente escolhido não está ativo nesta organização.';
    end if;
    select nome into v_nome_para from public.usuarios where id = p_destino;

    select o.id into v_opp from public.oportunidades o
     where o.contato_id = v_contato and o.organizacao_id = ve.organizacao_id and o.status = 'em_andamento'
     order by o.entrada_em desc limit 1;

    insert into public.vacuo_repasses
      (organizacao_id, conversa_id, contato_id, oportunidade_id, de_usuario_id, para_usuario_id,
       avisos, minutos_vacuo, prioritario, prio_motivo, decisao, decidido_por)
    values (ve.organizacao_id, p_conversa, v_contato, v_opp, v_dono, p_destino,
            3, ve.minutos_vacuo, ve.prioritario, ve.prio_motivo, 'repassado', auth.uid());

    update public.contatos set responsavel_id = p_destino where id = v_contato;
    update public.conversas set atendente_id = p_destino where id = p_conversa and atendente_id is distinct from p_destino;

    insert into public.conversa_atividades (organizacao_id, conversa_id, usuario_id, tipo, de, para, motivo)
    values (ve.organizacao_id, p_conversa, auth.uid(), 'transferido',
            jsonb_build_object('responsavel_id', v_dono), jsonb_build_object('responsavel_id', p_destino),
            'Radar de Atendimento: 1 dia útil sem resposta — o gestor repassou de ' || coalesce(v_nome_de, '?') ||
            ' para ' || v_nome_para || '.');

    insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
    values (ve.organizacao_id, p_conversa, 'saida', 'nota_interna', 'bot', 'enviada',
            '🛡️ Radar de Atendimento: cliente repassado de ' || coalesce(v_nome_de, '?') || ' para ' || v_nome_para ||
            ' por decisão do gestor (1 dia útil sem resposta).' ||
            case when ve.prioritario then ' LEAD PRIORITÁRIO: ' || ve.prio_motivo || '.' else '' end, now());

    insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id) values
      (ve.organizacao_id, v_dono, 'vacuo_punicao', '🛡️ Radar: o gestor repassou um cliente seu',
       v_nome_cli || ' ficou 1 dia útil sem resposta e foi repassado para ' || v_nome_para || ' pelo gestor.',
       '/whatsapp?conversa=' || p_conversa, p_conversa),
      (ve.organizacao_id, p_destino, 'vacuo_recebido', '🛡️ Radar: cliente repassado para você — priorize',
       v_nome_cli || ' estava com ' || coalesce(v_nome_de, 'outro atendente') || ' e o gestor passou pra você. Responda assim que puder.',
       '/whatsapp?conversa=' || p_conversa, p_conversa);
  else
    insert into public.vacuo_repasses
      (organizacao_id, conversa_id, contato_id, de_usuario_id, para_usuario_id,
       avisos, minutos_vacuo, prioritario, prio_motivo, decisao, decidido_por)
    values (ve.organizacao_id, p_conversa, v_contato, v_dono, v_dono,
            3, ve.minutos_vacuo, ve.prioritario, ve.prio_motivo, 'mantido', auth.uid());

    insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
    values (ve.organizacao_id, p_conversa, 'saida', 'nota_interna', 'bot', 'enviada',
            '🛡️ Radar de Atendimento: o gestor manteve o cliente com ' || coalesce(v_nome_de, '?') ||
            ' após 1 dia útil sem resposta.', now());

    insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
    values (ve.organizacao_id, v_dono, 'vacuo_mantido', '⚖️ Radar: o gestor manteve o cliente com você',
            v_nome_cli || ' segue com você após 1 dia útil sem resposta. Responda hoje.',
            '/whatsapp?conversa=' || p_conversa, p_conversa);
  end if;

  -- novo ciclo completo pro dono (atual ou novo)
  update public.vacuo_estado
     set aviso = 0, aviso_em = null, decisao_pedida_em = null,
         usuario_id = coalesce(case when v_decisao = 'repassado' then p_destino end, v_dono),
         base_em = now(), atualizado_em = now()
   where conversa_id = p_conversa;

  update public.sla_alertas
     set resolvido_em = now(), resolucao = v_decisao, resolvido_por = auth.uid(), atualizado_em = now()
   where tipo = 'vacuo_aviso' and conversa_id = p_conversa and resolvido_em is null;

  return jsonb_build_object('decisao', v_decisao, 'para', coalesce(v_nome_para, v_nome_de));
end $$;

revoke all on function public.vacuo_eh_gestor(uuid) from public, anon;
revoke all on function public.vacuo_decisoes_pendentes(uuid) from public, anon;
revoke all on function public.vacuo_decidir(uuid, uuid) from public, anon;
grant execute on function public.vacuo_eh_gestor(uuid) to authenticated;
grant execute on function public.vacuo_decisoes_pendentes(uuid) to authenticated;
grant execute on function public.vacuo_decidir(uuid, uuid) to authenticated;

-- ranking: "punições" passa a contar só os REPASSES efetivos (não desfeitos)
create or replace function public.vacuo_ranking(p_org uuid)
returns table (usuario_id uuid, nome text, fechados bigint, recebidos bigint, taxa numeric, punicoes bigint)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  with cfg as (
    select coalesce((select c.conversao_janela_dias from public.vacuo_config c
                     where c.organizacao_id = p_org), 30) as dias
  ), base as (
    select ou.usuario_id as uid, u.nome,
      coalesce((select count(*) from public.oportunidades o
        where o.organizacao_id = p_org and o.status = 'ganho'
          and o.responsavel_no_fechamento_id = ou.usuario_id
          and o.fechado_em >= now() - make_interval(days => (select dias from cfg))), 0) as fechados,
      coalesce((select count(*) from public.oportunidades o
        where o.organizacao_id = p_org and o.responsavel_id = ou.usuario_id
          and o.entrada_em >= now() - make_interval(days => (select dias from cfg))), 0) as recebidos,
      coalesce((select count(*) from public.vacuo_repasses vr
        where vr.organizacao_id = p_org and vr.de_usuario_id = ou.usuario_id
          and vr.decisao = 'repassado' and vr.desfeito_em is null
          and vr.criado_em >= now() - make_interval(days => (select dias from cfg))), 0) as punicoes
    from public.organizacao_usuarios ou
    join public.usuarios u on u.id = ou.usuario_id
    where ou.organizacao_id = p_org and ou.status = 'ativo'
      and public.is_member(p_org)
  )
  select uid, nome, fechados, recebidos,
         case when recebidos > 0 then round(fechados::numeric / recebidos * 100, 1) else 0 end as taxa,
         punicoes
  from base
  order by taxa desc, fechados desc
$$;
