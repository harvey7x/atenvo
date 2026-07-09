-- ============================================================================
-- BOT — B3.1: alinhar bot_pode_atuar ao conceito real de "tem humano".
-- Bloqueia o bot quando conversas.atendente_id NOT NULL, OU contatos.responsavel_id
-- NOT NULL, OU conversas.precisa_humano = true. (Fluxo de assumir grava responsavel_id.)
-- Só a função de elegibilidade. NÃO altera webhook, envio do bot, nem liga master.
-- ============================================================================
create or replace function public.bot_pode_atuar(p_conversa uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_recencia constant interval := interval '48 hours';
  c record; cc record; cn record; v_uid uuid := auth.uid();
begin
  select id, organizacao_id, contato_id, canal_id, atendente_id, status, arquivada_em, criado_em,
         coalesce(precisa_humano, false) as precisa_humano
    into c from public.conversas where id = p_conversa;
  if not found then return jsonb_build_object('elegivel', false, 'motivo', 'conversa_inexistente'); end if;

  if v_uid is not null and not (public.is_platform_admin() or public.is_member(c.organizacao_id)) then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.bot_config b where b.organizacao_id = c.organizacao_id and b.ativo) then
    return jsonb_build_object('elegivel', false, 'motivo', 'master_desligado');
  end if;

  select * into cc from public.bot_canal_config where canal_id = c.canal_id;
  if cc.canal_id is null or not cc.bot_enabled then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_nao_habilitado', 'canal', c.canal_id);
  end if;

  -- bot já pausado nesta conversa (humano/áudio)
  if exists (select 1 from public.bot_conversa_estado e where e.conversa_id = c.id and e.pausado) then
    return jsonb_build_object('elegivel', false, 'motivo', 'bot_pausado');
  end if;

  -- saúde do canal
  select status_integracao, envio_restrito, health_check_status into cn from public.canais where id = c.canal_id;
  if cn.status_integracao is distinct from 'conectado' then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_desconectado', 'canal', c.canal_id);
  end if;
  if coalesce(cn.envio_restrito, false) then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_restrito', 'canal', c.canal_id);
  end if;
  if cn.health_check_status in ('restrito','falha') then
    return jsonb_build_object('elegivel', false, 'motivo', 'canal_health_ruim', 'canal', c.canal_id);
  end if;

  -- ===== TEM HUMANO (B3.1): atendente_id OU responsavel_id OU precisa_humano =====
  if c.atendente_id is not null then
    return jsonb_build_object('elegivel', false, 'motivo', 'ja_tem_atendente');
  end if;
  if exists (select 1 from public.contatos ct where ct.id = c.contato_id and ct.responsavel_id is not null) then
    return jsonb_build_object('elegivel', false, 'motivo', 'ja_tem_responsavel');
  end if;
  if c.precisa_humano then
    return jsonb_build_object('elegivel', false, 'motivo', 'precisa_humano');
  end if;

  -- conversa nova
  if c.arquivada_em is not null then
    return jsonb_build_object('elegivel', false, 'motivo', 'conversa_arquivada');
  end if;
  if c.status is distinct from 'aberta' then
    return jsonb_build_object('elegivel', false, 'motivo', 'conversa_em_andamento');
  end if;
  if c.criado_em < now() - v_recencia then
    return jsonb_build_object('elegivel', false, 'motivo', 'conversa_antiga');
  end if;

  -- atendente humano já respondeu (painel: autor_id; celular: origem='telefone')
  if exists (
    select 1 from public.mensagens m
    where m.conversa_id = c.id and m.direcao = 'saida'
      and ((m.autor_id is not null and m.tipo not in ('sistema','nota_interna'))
           or (m.autor_id is null and m.origem = 'telefone'))
  ) then
    return jsonb_build_object('elegivel', false, 'motivo', 'atendente_ja_respondeu');
  end if;

  -- oportunidade em etapa avançada (card aberto fora da coluna de entrada)
  if exists (
    select 1 from public.oportunidades o
    join public.funil_colunas fc on fc.id = o.coluna_id
    where o.contato_id = c.contato_id and o.status = 'em_andamento'
      and coalesce(fc.entrada, false) = false
  ) then
    return jsonb_build_object('elegivel', false, 'motivo', 'oportunidade_avancada');
  end if;

  -- contato tem destino de envio (não pode ser LID-only)
  if not exists (
    select 1 from public.contato_identidades ci
    where ci.contato_id = c.contato_id and ci.tipo = 'whatsapp' and ci.valor_normalizado is not null
  ) then
    return jsonb_build_object('elegivel', false, 'motivo', 'sem_destino_envio');
  end if;

  return jsonb_build_object('elegivel', true, 'motivo', 'ok', 'canal', c.canal_id, 'fluxo', cc.fluxo_slug);
end $$;

notify pgrst, 'reload schema';
