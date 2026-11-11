-- ============================================================================
-- RADAR v3 — nada de aviso fora do horário (pedido do dono 26/10:
-- "por que o sistema está avisando nos finais de semana ou fora das 09–18h?")
--
-- Causas medidas (fim de semana 24–25/10: 11 "último aviso" do Radar):
--  1) o motor não olhava o relógio na hora de AVISAR — cliente escreveu no sábado,
--     o aviso saiu no sábado;
--  2) ele PULAVA DEGRAUS: a 1ª mensagem pendente era antiga (antes de ligar o Radar),
--     o relógio útil já marcava 429 min (sexta 11:51→19h) e saía o 3º aviso direto;
--  3) horário estava 9h–19h ("das 9 às 7"); o dono agora quer 9h–18h.
-- Correções:
--  - vacuo_horario_aberto(): seg–sex, hora_inicio ≤ hora < hora_fim (SP). Fora disso
--    os motores (Radar e "📞 Ligar") só LIMPAM — não criam aviso, sino nem decisão;
--  - escada completa: sobe 1 degrau por vez e cada degrau espera o intervalo útil
--    desde o aviso anterior (decisão do gestor também espera th_dec − th3 úteis);
--  - CAF: 9h–18h; 1 dia útil = 540 min (decisão do gestor em 540).
-- ============================================================================

create or replace function public.vacuo_horario_aberto(p_org uuid default null)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(bool_or(
           extract(isodow from (now() at time zone 'America/Sao_Paulo')) between 1 and 5
       and extract(hour   from (now() at time zone 'America/Sao_Paulo')) >= c.hora_inicio
       and extract(hour   from (now() at time zone 'America/Sao_Paulo')) <  c.hora_fim), false)
  from public.vacuo_config c
  where c.ativo and (p_org is null or c.organizacao_id = p_org)
$$;
revoke all on function public.vacuo_horario_aberto(uuid) from public, anon;
grant execute on function public.vacuo_horario_aberto(uuid) to authenticated;

update public.vacuo_config
   set hora_inicio = 9, hora_fim = 18, repasse_min = 540, prio_repasse_min = 540, atualizado_em = now()
 where organizacao_id = 'de300000-0000-4000-8000-000000000001';

-- motor do Radar v3 (a partir da versão viva v2 + regra da aba "Meus")
CREATE OR REPLACE FUNCTION public.vacuo_avaliar(p_org uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
           ve.aviso as aviso_atual, ve.aviso_em as aviso_em_atual,
           cfg.hora_inicio as h_ini, cfg.hora_fim as h_fim,
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
      -- só clientes da aba "Meus": fora FECHADO (qualquer ganho) e PERDIDO/NE (sem
      -- oportunidade em andamento e a mais recente perdida) — mesma regra do inbox
      and not exists (select 1 from public.oportunidades og
                      where og.contato_id = c.contato_id and og.organizacao_id = c.organizacao_id
                        and og.status = 'ganho')
      and not (
        not exists (select 1 from public.oportunidades oa
                    where oa.contato_id = c.contato_id and oa.organizacao_id = c.organizacao_id
                      and oa.status = 'em_andamento')
        and coalesce((select ol.status::text from public.oportunidades ol
                      where ol.contato_id = c.contato_id and ol.organizacao_id = c.organizacao_id
                      order by ol.atualizado_em desc limit 1), '') = 'perdido'
      )
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

  -- FORA DO HORÁRIO ÚTIL (seg–sex, hora_inicio–hora_fim, SP) não dispara nada novo — só limpa (26/10)
  if not public.vacuo_horario_aberto(p_org) then
    return jsonb_build_object('avisos', 0, 'decisoes_pedidas', 0, 'estados_limpos', v_limpos, 'fora_do_horario', true);
  end if;

  -- Avisos 1→3 pro DONO (cada estágio dispara uma vez)
  for r in
    -- ESCADA COMPLETA (26/10): sobe UM degrau por vez e cada degrau espera o intervalo útil
    -- desde o aviso anterior — cliente que já esperava há muito tempo recebe 1º, 2º e 3º com o
    -- espaçamento normal, nunca o "último aviso" de cara
    select *, case coalesce(aviso_atual, 0)
                when 0 then case when min_vacuo >= th1 then 1 else 0 end
                when 1 then case when min_vacuo >= th2
                                  and public.vacuo_minutos_uteis(aviso_em_atual, now(), h_ini, h_fim) >= th2 - th1 then 2 else 1 end
                when 2 then case when min_vacuo >= th3
                                  and public.vacuo_minutos_uteis(aviso_em_atual, now(), h_ini, h_fim) >= th3 - th2 then 3 else 2 end
                else coalesce(aviso_atual, 0) end as alvo
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
      and public.vacuo_minutos_uteis(ve.aviso_em, now(), v.h_ini, v.h_fim) >= greatest(v.th_dec - v.th3, 5)
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
end $function$;
revoke all on function public.vacuo_avaliar(uuid) from public, anon, authenticated;

-- "📞 Ligar": mesma trava de horário (remendo na âncora, aborta se mudou)
do $$
declare
  d text := pg_get_functiondef('public.robo_ligar_avaliar(uuid)'::regprocedure);
  alvo text := '  get diagnostics v_resolvidos = row_count;';
  novo text := '  get diagnostics v_resolvidos = row_count;

  -- fora do horário útil (seg–sex, hora_inicio–hora_fim SP) não avisa ninguém — só limpa (26/10)
  if not public.vacuo_horario_aberto(p_org) then
    return jsonb_build_object(''avisos'', 0, ''resolvidos'', v_resolvidos, ''fora_do_horario'', true);
  end if;';
begin
  if position('vacuo_horario_aberto' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, alvo, ''))) / length(alvo) <> 1 then
    raise exception 'robo_ligar_avaliar mudou: âncora não encontrada — remendar à mão';
  end if;
  execute replace(d, alvo, novo);
end $$;
