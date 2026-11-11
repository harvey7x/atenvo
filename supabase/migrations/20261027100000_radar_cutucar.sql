-- ============================================================================
-- RADAR: "👉 CUTUCAR" — o gestor cutuca o atendente pra responder um cliente
-- (pedido do dono 27/10: "coloque uma opção de cutucar; eu aperto e aparece um
--  aviso pro atendente responder aquela pessoa, pois já está sem resposta após os
--  outros avisos").
--
-- - vacuo_cutucar(conversa): só o GESTOR; o cliente precisa estar no Radar
--   (vacuo_estado). Cria alerta 'vacuo_cutucada' (severidade imediato) pro DONO,
--   sino e nota interna na conversa. Intervalo mínimo de 10 min entre cutucões.
-- - O aviso some quando o atendente responde (trg_sla_mensagem_humano resolve
--   todos os alertas da conversa), quando o cliente sai do Radar (vacuo_avaliar)
--   ou na decisão do gestor (vacuo_decidir). A decisão de repasse NÃO muda.
-- - Recutucar encerra o alerta anterior e cria um novo (o aviso volta pra tela
--   mesmo que o atendente tenha dispensado o primeiro).
-- ============================================================================

-- tipo novo no CHECK de sla_alertas
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.sla_alertas'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%atendimento_sem_resposta%';
  if v_name is not null then
    execute format('alter table public.sla_alertas drop constraint %I', v_name);
  end if;
  execute $sql$alter table public.sla_alertas add constraint sla_alertas_tipo_check
    check (tipo = any (array['atendimento_sem_resposta','cliente_qualificado_aguardando_atendimento',
      'lead_quente_aguardando','audio_recebido_precisa_humano','parado_ha_muito_tempo',
      'prazo_2_dias_em_risco','prazo_2_dias_estourado','janela_expirando','vacuo_aviso','robo_ligar',
      'vacuo_cutucada']))$sql$;
end $$;

-- sla_avaliar (vivo) não pode auto-resolver o cutucão
do $$
declare
  d text := pg_get_functiondef('public.sla_avaliar(uuid)'::regprocedure);
  alvo text := 'a.tipo not in (''vacuo_aviso'', ''robo_ligar'')';
  novo text := 'a.tipo not in (''vacuo_aviso'', ''robo_ligar'', ''vacuo_cutucada'')';
begin
  if position(novo in d) > 0 then return; end if;
  if position(alvo in d) = 0 then raise exception 'sla_avaliar mudou: exclusão não encontrada — remendar à mão'; end if;
  execute replace(d, alvo, novo);
end $$;

-- vacuo_avaliar: cliente que saiu do Radar leva o cutucão junto
do $$
declare
  d text := pg_get_functiondef('public.vacuo_avaliar(uuid)'::regprocedure);
  alvo text := '  -- FORA DO HORÁRIO ÚTIL';
  novo text := '  -- cutucão do gestor some quando o cliente sai do Radar (arquivou, virou NE, respondido por telefone…)
  update public.sla_alertas a set resolvido_em = now(), resolucao = ''auto'', atualizado_em = now()
   where a.tipo = ''vacuo_cutucada'' and a.resolvido_em is null and (p_org is null or a.organizacao_id = p_org)
     and not exists (select 1 from _vac v where v.conversa_id = a.conversa_id);

  -- FORA DO HORÁRIO ÚTIL';
begin
  if position('vacuo_cutucada' in d) > 0 then return; end if;
  if (length(d) - length(replace(d, alvo, ''))) / length(alvo) <> 1 then
    raise exception 'vacuo_avaliar mudou: âncora não encontrada — remendar à mão';
  end if;
  execute replace(d, alvo, novo);
end $$;

-- vacuo_decidir: a decisão encerra também o cutucão
do $$
declare
  d text := pg_get_functiondef('public.vacuo_decidir(uuid, uuid)'::regprocedure);
  alvo text := 'where tipo = ''vacuo_aviso'' and conversa_id = p_conversa and resolvido_em is null;';
  novo text := 'where tipo in (''vacuo_aviso'', ''vacuo_cutucada'') and conversa_id = p_conversa and resolvido_em is null;';
begin
  if position(novo in d) > 0 then return; end if;
  if (length(d) - length(replace(d, alvo, ''))) / length(alvo) <> 1 then
    raise exception 'vacuo_decidir mudou: âncora não encontrada — remendar à mão';
  end if;
  execute replace(d, alvo, novo);
end $$;

alter table public.vacuo_estado
  add column if not exists cutucado_em timestamptz,
  add column if not exists cutucadas integer not null default 0;

-- ---------------------------------------------------------------------------
-- O cutucão
-- ---------------------------------------------------------------------------
create or replace function public.vacuo_cutucar(p_conversa uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  ve public.vacuo_estado%rowtype;
  v_dono uuid; v_contato uuid; v_cli text; v_nome_dono text; v_nome_gestor text; v_desde text;
begin
  select * into ve from public.vacuo_estado where conversa_id = p_conversa for update;
  if not found then
    raise exception 'Este cliente já foi respondido — não precisa cutucar.';
  end if;
  if not public.vacuo_eh_gestor(ve.organizacao_id) then
    raise exception 'Só o gestor pode cutucar o atendente.';
  end if;
  if ve.cutucado_em is not null and ve.cutucado_em > now() - interval '10 minutes' then
    raise exception 'Você cutucou há poucos minutos — dê um tempo pro atendente responder.';
  end if;

  select coalesce(ct.responsavel_id, c.atendente_id), c.contato_id, coalesce(ct.nome, 'o cliente')
    into v_dono, v_contato, v_cli
  from public.conversas c left join public.contatos ct on ct.id = c.contato_id
  where c.id = p_conversa;
  if v_dono is null then
    raise exception 'Este cliente está sem atendente — atribua alguém antes de cutucar.';
  end if;
  select nome into v_nome_dono from public.usuarios where id = v_dono;
  select nome into v_nome_gestor from public.usuarios where id = auth.uid();
  v_desde := to_char(ve.base_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');

  update public.vacuo_estado
     set cutucado_em = now(), cutucadas = cutucadas + 1, atualizado_em = now()
   where conversa_id = p_conversa;

  -- recutucar: encerra o anterior e cria um novo (volta pra tela mesmo se foi dispensado)
  update public.sla_alertas
     set resolvido_em = now(), resolucao = 'recutucada', resolvido_por = auth.uid(), atualizado_em = now()
   where tipo = 'vacuo_cutucada' and conversa_id = p_conversa and resolvido_em is null;

  insert into public.sla_alertas
    (organizacao_id, tipo, severidade, conversa_id, contato_id, responsavel_id, titulo, detalhe, dedup_key)
  values
    (ve.organizacao_id, 'vacuo_cutucada', 'imediato', p_conversa, v_contato, v_dono,
     '👉 O gestor pediu: responda agora',
     'Este cliente está sem resposta desde ' || v_desde || ', mesmo depois dos avisos. ' ||
     coalesce(v_nome_gestor, 'O gestor') || ' pediu pra você responder agora.',
     'vacuo_cutucada:' || p_conversa);

  insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
  values (ve.organizacao_id, v_dono, 'vacuo_cutucada', '👉 ' || coalesce(v_nome_gestor, 'O gestor') || ' pediu: responda ' || v_cli,
          v_cli || ' está sem resposta desde ' || v_desde || '. Responda agora.',
          '/whatsapp?conversa=' || p_conversa, p_conversa);

  insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
  values (ve.organizacao_id, p_conversa, 'saida', 'nota_interna', 'bot', 'enviada',
          '👉 ' || coalesce(v_nome_gestor, 'O gestor') || ' cutucou ' || coalesce(v_nome_dono, 'o atendente') ||
          ' para responder este cliente (sem resposta desde ' || v_desde || ').', now());

  return jsonb_build_object('ok', true, 'atendente', v_nome_dono, 'cutucadas', ve.cutucadas + 1);
end $$;
revoke all on function public.vacuo_cutucar(uuid) from public, anon;
grant execute on function public.vacuo_cutucar(uuid) to authenticated;

-- fila de decisões passa a dizer quando foi o último cutucão e quantos já foram
drop function if exists public.vacuo_decisoes_pendentes(uuid);
create function public.vacuo_decisoes_pendentes(p_org uuid)
returns table (conversa_id uuid, contato_nome text, dono_id uuid, dono_nome text,
               desde timestamptz, decisao_pedida_em timestamptz, minutos_vacuo integer,
               prioritario boolean, prio_motivo text, sugerido_id uuid, sugerido_nome text,
               cutucado_em timestamptz, cutucadas integer)
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select ve.conversa_id, ct.nome, ve.usuario_id, u.nome,
         ve.base_em, ve.decisao_pedida_em, ve.minutos_vacuo,
         ve.prioritario, ve.prio_motivo,
         sug.id, sug.nome,
         ve.cutucado_em, ve.cutucadas
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
revoke all on function public.vacuo_decisoes_pendentes(uuid) from public, anon;
grant execute on function public.vacuo_decisoes_pendentes(uuid) to authenticated;
