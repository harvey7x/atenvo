-- bot_pode_atuar: NÃO travar o fluxo só porque o contato tem dono/atendente atribuído.
--
-- Problema (real, ~125 leads no EMPRÉSTIMO): lead vem pelo anúncio, o bot roda o 1º turno do fluxo
-- (SIM/NÃO), o cliente responde — mas o bot IGNORA com 'ja_tem_atendente'/'ja_tem_responsavel'
-- porque o contato "pertence" a um consultor (responsavel_id → atendente_id). Se o consultor não
-- responde, a lead trava para sempre.
--
-- Regra nova (decisão do dono): o bot só para quando um HUMANO REALMENTE responde (isso continua
-- garantido pelo bloqueio 'atendente_ja_respondeu' mais abaixo). O bloqueio por dono-atribuído
-- passa a valer SÓ quando o bot ainda NÃO começou o fluxo nesta conversa — assim um contato de dono
-- não é abordado do zero, mas um fluxo já em andamento consegue terminar (e cair na IA).

create or replace function public.bot_pode_atuar(p_conversa uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
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

  -- ===== TEM HUMANO por ATRIBUIÇÃO (atendente_id/responsavel): só bloqueia se o BOT ainda NÃO
  --       começou o fluxo aqui. Se o bot já está conduzindo (já mandou mensagem) e NENHUM humano
  --       respondeu, deixa o fluxo terminar — senão a lead trava com dono que nunca atende. O
  --       bloqueio real por humano ATIVO continua abaixo ('atendente_ja_respondeu'). =====
  if (c.atendente_id is not null
      or exists (select 1 from public.contatos ct where ct.id = c.contato_id and ct.responsavel_id is not null))
     and not exists (
       select 1 from public.mensagens m
       where m.conversa_id = c.id and m.direcao = 'saida' and m.origem = 'bot'
     )
  then
    return jsonb_build_object('elegivel', false, 'motivo',
      case when c.atendente_id is not null then 'ja_tem_atendente' else 'ja_tem_responsavel' end);
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

  -- atendente humano JÁ RESPONDEU (painel: autor_id; celular: origem='telefone') -> bot para de vez
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
end $function$;
