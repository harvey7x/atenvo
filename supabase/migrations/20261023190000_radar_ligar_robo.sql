-- ============================================================================
-- RADAR: "LIGAR PRO CLIENTE" — lead parou de responder o ROBÔ (pedido do dono 23/10)
-- "Quando o lead chegou e o robô tá atendendo, o robô manda a última mensagem e
--  o cliente não respondeu: depois de 2 horas notifica o atendente pra ligar e
--  retomar a venda."
--
-- Regra (avaliada a cada 2 min, relógio ÚTIL do Radar: seg–sex 9h–19h):
--  - a última mensagem da conversa é do ROBÔ (saída, autor nulo, origem 'bot');
--  - NENHUM humano falou com o cliente ainda (o lead está na mão do robô);
--  - SÓ CLIENTE NOVO: oportunidade em andamento e NENHUMA oportunidade (nem
--    antiga) fechada, perdida, cancelada ou não elegível (dono 23/10);
--  - cliente fora do "não incomodar" (relacionamento_bloqueio);
--  - 2 h úteis (vacuo_config.robo_ligar_min) desde a última mensagem do robô.
-- Aviso só pro DONO do lead (sla_alertas 'robo_ligar' + sino). Some quando o
-- cliente responde, quando um humano escreve ou no "Já liguei". Um aviso por
-- silêncio: se o cliente voltar a falar e sumir de novo, avisa de novo.
-- NADA é enviado ao cliente; o robô segue o fluxo dele.
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
      'prazo_2_dias_em_risco','prazo_2_dias_estourado','janela_expirando','vacuo_aviso','robo_ligar']))$sql$;
end $$;

-- sla_avaliar (vivo) também não pode auto-resolver o 'robo_ligar'
do $$
declare
  d text := pg_get_functiondef('public.sla_avaliar(uuid)'::regprocedure);
  alvo text := 'a.tipo <> ''vacuo_aviso''';
  novo text := 'a.tipo not in (''vacuo_aviso'', ''robo_ligar'')';
begin
  if position(novo in d) > 0 then return; end if;
  if position(alvo in d) = 0 then
    raise exception 'sla_avaliar mudou: exclusão do vacuo_aviso não encontrada — remendar à mão';
  end if;
  execute replace(d, alvo, novo);
end $$;

-- configuração (nasce desligada: robo_ligar_desde nulo)
alter table public.vacuo_config
  add column if not exists robo_ligar_min integer not null default 120,
  add column if not exists robo_ligar_desde timestamptz;

-- episódios (dedup: um aviso por silêncio do cliente)
create table if not exists public.robo_ligar (
  conversa_id    uuid primary key references public.conversas(id) on delete cascade,
  organizacao_id uuid        not null,
  contato_id     uuid,
  usuario_id     uuid,
  ult_bot_em     timestamptz not null,
  ult_in_ref     timestamptz not null,          -- última fala do cliente quando avisamos
  notificado_em  timestamptz not null default now(),
  concluido_em   timestamptz,
  concluido_por  uuid references public.usuarios(id)
);
create index if not exists robo_ligar_org_idx on public.robo_ligar (organizacao_id);
alter table public.robo_ligar enable row level security;
drop policy if exists robo_ligar_sel on public.robo_ligar;
create policy robo_ligar_sel on public.robo_ligar for select to authenticated using (public.is_member(organizacao_id));
grant select on public.robo_ligar to authenticated;
grant select, insert, update, delete on public.robo_ligar to service_role;

-- ---------------------------------------------------------------------------
-- O motor
-- ---------------------------------------------------------------------------
create or replace function public.robo_ligar_avaliar(p_org uuid default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_avisos int := 0; v_resolvidos int := 0; r record;
begin
  drop table if exists _rl;
  create temp table _rl on commit drop as
  select c.id as conversa_id, c.organizacao_id, c.contato_id,
         coalesce(ct.responsavel_id, c.atendente_id) as dono, coalesce(ct.nome, 'Cliente') as contato_nome,
         lm.quando as ult_bot_em, coalesce(um.ult_in, '-infinity'::timestamptz) as ult_in,
         public.vacuo_minutos_uteis(lm.quando, now(), cfg.hora_inicio, cfg.hora_fim) as min_parado,
         cfg.robo_ligar_min as th
  from public.conversas c
  join public.vacuo_config cfg on cfg.organizacao_id = c.organizacao_id and cfg.robo_ligar_desde is not null
  left join public.contatos ct on ct.id = c.contato_id
  join lateral (
    select m.direcao, m.autor_id, m.origem, coalesce(m.enviada_em, m.recebida_em, m.criado_em) as quando
    from public.mensagens m
    where m.conversa_id = c.id and m.tipo not in ('nota_interna', 'sistema')
    order by coalesce(m.enviada_em, m.recebida_em, m.criado_em) desc
    limit 1
  ) lm on true
  left join lateral (
    select max(coalesce(m.recebida_em, m.criado_em)) as ult_in
    from public.mensagens m where m.conversa_id = c.id and m.direcao = 'entrada'
  ) um on true
  where c.arquivada_em is null
    and c.status in ('aberta', 'em_atendimento', 'pendente')
    and (p_org is null or c.organizacao_id = p_org)
    and c.ultima_interacao_em >= now() - interval '10 days'
    and lm.direcao = 'saida' and lm.autor_id is null and lm.origem = 'bot'
    and lm.quando >= cfg.robo_ligar_desde
    and not exists (select 1 from public.mensagens h
                    where h.conversa_id = c.id and h.direcao = 'saida'
                      and ((h.autor_id is not null and h.tipo not in ('sistema', 'nota_interna'))
                           or (h.autor_id is null and h.origem = 'telefone')))
    and not exists (select 1 from public.relacionamento_bloqueio b where b.contato_id = c.contato_id)
    -- SÓ CLIENTE NOVO (dono 23/10): tem oportunidade em andamento e NUNCA teve
    -- oportunidade fechada, perdida, cancelada ou não elegível
    and exists (select 1 from public.oportunidades o
                where o.contato_id = c.contato_id and o.organizacao_id = c.organizacao_id
                  and o.status = 'em_andamento')
    and not exists (select 1 from public.oportunidades o
                    where o.contato_id = c.contato_id and o.organizacao_id = c.organizacao_id
                      and (o.status <> 'em_andamento' or o.motivo_nao_elegivel is not null));

  -- saiu da condição (cliente respondeu, humano falou, virou NE, arquivou…) → aviso some
  update public.sla_alertas a
     set resolvido_em = now(), resolucao = 'auto', atualizado_em = now()
   where a.tipo = 'robo_ligar' and a.resolvido_em is null
     and (p_org is null or a.organizacao_id = p_org)
     and not exists (select 1 from _rl v where v.conversa_id = a.conversa_id);
  get diagnostics v_resolvidos = row_count;

  for r in
    select v.* from _rl v
    left join public.robo_ligar rl on rl.conversa_id = v.conversa_id
    where v.min_parado >= v.th
      -- novo silêncio: nunca avisado, ou o cliente falou de novo depois do último aviso
      and (rl.conversa_id is null or v.ult_in > rl.ult_in_ref)
  loop
    begin
      insert into public.robo_ligar (conversa_id, organizacao_id, contato_id, usuario_id, ult_bot_em, ult_in_ref, notificado_em)
      values (r.conversa_id, r.organizacao_id, r.contato_id, r.dono, r.ult_bot_em, r.ult_in, now())
      on conflict (conversa_id) do update
        set usuario_id = excluded.usuario_id, ult_bot_em = excluded.ult_bot_em, ult_in_ref = excluded.ult_in_ref,
            notificado_em = now(), concluido_em = null, concluido_por = null;

      insert into public.sla_alertas
        (organizacao_id, tipo, severidade, conversa_id, contato_id, responsavel_id, titulo, detalhe, dedup_key)
      values
        (r.organizacao_id, 'robo_ligar', 'vermelho', r.conversa_id, r.contato_id, r.dono,
         '📞 Ligue para o cliente — parou de responder o robô',
         'O robô mandou a última mensagem e o cliente não respondeu em 2 horas úteis. Ligue para retomar a venda.',
         'robo_ligar:' || r.conversa_id)
      on conflict (organizacao_id, dedup_key) where resolvido_em is null do nothing;

      if r.dono is not null then
        insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
        values (r.organizacao_id, r.dono, 'robo_ligar', '📞 Ligue para ' || r.contato_nome,
                r.contato_nome || ' parou de responder o robô há 2 horas úteis. Ligue para retomar a venda.',
                '/whatsapp?conversa=' || r.conversa_id, r.conversa_id);
      else
        insert into public.notificacoes (organizacao_id, usuario_id, tipo, titulo, corpo, rota, ref_id)
        select r.organizacao_id, ou.usuario_id, 'robo_ligar', '📞 Lead sem dono parou no robô',
               r.contato_nome || ' parou de responder o robô há 2 horas úteis e ainda não tem atendente.',
               '/whatsapp?conversa=' || r.conversa_id, r.conversa_id
        from public.organizacao_usuarios ou
        where ou.organizacao_id = r.organizacao_id and ou.papel = 'admin' and ou.status = 'ativo';
      end if;

      v_avisos := v_avisos + 1;
    exception when others then
      raise warning 'robo_ligar_avaliar: falhou na conversa % — %', r.conversa_id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('avisos', v_avisos, 'resolvidos', v_resolvidos);
end $$;
revoke all on function public.robo_ligar_avaliar(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- "Já liguei": o dono do lead (ou o gestor) encerra o aviso e deixa registro na conversa
-- ---------------------------------------------------------------------------
create or replace function public.robo_ligar_concluir(p_conversa uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_org uuid; v_dono uuid; v_nome text;
begin
  select c.organizacao_id, coalesce(ct.responsavel_id, c.atendente_id)
    into v_org, v_dono
  from public.conversas c left join public.contatos ct on ct.id = c.contato_id
  where c.id = p_conversa;
  if v_org is null then raise exception 'Conversa não encontrada.'; end if;
  if auth.uid() is distinct from v_dono and not public.vacuo_eh_gestor(v_org) then
    raise exception 'Só o atendente responsável (ou o gestor) pode marcar a ligação.';
  end if;
  select nome into v_nome from public.usuarios where id = auth.uid();

  update public.sla_alertas
     set resolvido_em = now(), resolucao = 'ligou', resolvido_por = auth.uid(), atualizado_em = now()
   where tipo = 'robo_ligar' and conversa_id = p_conversa and resolvido_em is null;
  update public.robo_ligar set concluido_em = now(), concluido_por = auth.uid() where conversa_id = p_conversa;

  insert into public.mensagens (organizacao_id, conversa_id, direcao, tipo, origem, status, conteudo, enviada_em)
  values (v_org, p_conversa, 'saida', 'nota_interna', 'bot', 'enviada',
          '📞 ' || coalesce(v_nome, 'O atendente') || ' ligou para o cliente (ele tinha parado de responder o robô).', now());

  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.robo_ligar_concluir(uuid) from public, anon;
grant execute on function public.robo_ligar_concluir(uuid) to authenticated;

-- cron a cada 2 min (inerte enquanto robo_ligar_desde for nulo)
do $$ begin
  if not exists (select 1 from cron.job where jobname = 'robo-ligar') then
    perform cron.schedule('robo-ligar', '*/2 * * * *', 'select public.robo_ligar_avaliar()');
  end if;
end $$;
