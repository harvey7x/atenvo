-- IA SDR — RETORNO: lead que já conversou antes e volta a chamar.
--
-- O trigger fn_ia_sessao_mensagem (já existente: debounce + pausa por humano) ganha a detecção
-- de retorno. Quando um INBOUND chega e a conversa NÃO tem uma sessão ativa "quente", decidimos
-- se é um lead voltando e, se for, colocamos a sessão na etapa 'retorno' (o worker ia-sdr trata):
--   • Oportunidade FECHADA (ganho/perdido/cancelado) → avisa que o caso já foi finalizado
--     (mesmo sem sessão anterior — cobre quem fechou no fluxo/humano antes da IA existir).
--   • Oportunidade ABERTA + a IA já falava com ele e ele GHOSTOU toda a escada de nudge
--     (sessão 'ativa', nudge_n>=3, fora de conclusão/retorno) → requalificação firme.
--
-- Guardas para não atropelar ninguém: canal com ia_enabled; conversa sem precisa_humano; nenhum
-- atendente humano nas últimas 2h; cooldown de 20h por episódio de retorno (dados.retorno_ts).
-- NUNCA trata lead novo / meio de fluxo (opp aberta e sem nenhuma sessão) — isso é do bot.

create or replace function public.fn_ia_sessao_mensagem()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_id uuid; v_status text; v_etapa text; v_dados jsonb; v_opp uuid;
  v_canal uuid; v_org uuid; v_contato uuid;
  v_ia_on boolean; v_precisa_humano boolean;
  v_opp_status text; v_fechado boolean;
begin
  -- sessão da conversa (UNIQUE conversa_id → 0 ou 1)
  select id, status, etapa, dados, oportunidade_id
    into v_id, v_status, v_etapa, v_dados, v_opp
    from public.ia_sessoes where conversa_id = new.conversa_id;

  -- SAÍDA de humano pausa a sessão ativa (comportamento original)
  if new.direcao = 'saida' then
    if v_id is not null and v_status = 'ativa'
       and new.tipo not in ('sistema','nota_interna')
       and (new.autor_id is not null or new.origem = 'telefone') then
      update public.ia_sessoes set status = 'pausada', atualizado_em = now() where id = v_id;
      insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
      values (v_id, new.conversa_id, new.organizacao_id, 'pausada_humano',
              jsonb_build_object('mensagem_id', new.id, 'origem', new.origem));
    end if;
    return new;
  end if;

  if new.direcao <> 'entrada' then return new; end if;

  -- caminho QUENTE: sessão ativa que NÃO é retorno-frio → só o debounce original e sai
  if v_id is not null and v_status = 'ativa' then
    if not ( coalesce((v_dados->>'nudge_n')::int, 0) >= 3
             and coalesce(v_etapa,'') not in ('conclusao','retorno')
             and coalesce(v_dados->>'aguardando_humano','') = '' ) then
      update public.ia_sessoes
        set ultima_msg_cliente_em = now(), processar_apos = now() + interval '8 seconds', atualizado_em = now()
        where id = v_id;
      return new;
    end if;
    -- senão: sessão ativa esfriou (ghostou os nudges) → candidata a RETORNO, segue abaixo
  end if;

  -- ===== detecção de RETORNO (inbound sem sessão ativa-quente) =====
  select canal_id, organizacao_id, contato_id, coalesce(precisa_humano,false)
    into v_canal, v_org, v_contato, v_precisa_humano
    from public.conversas where id = new.conversa_id;
  select coalesce(ia_enabled,false) into v_ia_on from public.bot_canal_config where canal_id = v_canal;

  -- guarda: humano é dono OU canal sem IA → não tratar (mas preserva o debounce da sessão ativa-fria)
  if v_precisa_humano or not coalesce(v_ia_on,false) then
    if v_status = 'ativa' then
      update public.ia_sessoes set ultima_msg_cliente_em = now(), processar_apos = now() + interval '8 seconds', atualizado_em = now() where id = v_id;
    end if;
    return new;
  end if;

  -- cooldown: episódio de retorno recente (<20h) → não reabrir
  if v_dados is not null and (v_dados->>'retorno_ts') is not null
     and (v_dados->>'retorno_ts')::timestamptz > now() - interval '20 hours' then
    if v_status = 'ativa' then
      update public.ia_sessoes set ultima_msg_cliente_em = now(), processar_apos = now() + interval '8 seconds', atualizado_em = now() where id = v_id;
    end if;
    return new;
  end if;

  -- anti-atropelo: atendente humano respondeu nas últimas 2h (só checa quando NÃO é a sessão ativa,
  -- porque sessão ainda 'ativa' implica que nenhum humano assumiu — senão teria virado 'pausada')
  if coalesce(v_status,'') <> 'ativa' and exists (
    select 1 from public.mensagens m
    where m.conversa_id = new.conversa_id and m.direcao = 'saida'
      and m.tipo not in ('sistema','nota_interna')
      and (m.autor_id is not null or m.origem = 'telefone')
      and m.criado_em > now() - interval '2 hours'
  ) then
    return new;
  end if;

  -- situação da oportunidade (fonte do "fechado")
  if v_opp is not null then
    select status into v_opp_status from public.oportunidades where id = v_opp;
  else
    select status into v_opp_status from public.oportunidades
      where organizacao_id = v_org and contato_id = v_contato
      order by criado_em desc limit 1;
  end if;
  v_fechado := coalesce(v_opp_status,'') in ('ganho','perdido','cancelado');

  -- decide: é retorno a tratar?
  --   • FECHADA → sempre (avisa finalizado), inclusive sem sessão anterior
  --   • ABERTA  → só a sessão ativa-fria (ghostou os nudges); nunca 'pausada'/lead novo/meio de fluxo
  if not ( v_fechado or coalesce(v_status,'') = 'ativa' ) then
    return new;
  end if;

  if v_id is not null then
    update public.ia_sessoes set
      status = 'ativa', etapa = 'retorno',
      dados = coalesce(dados,'{}'::jsonb) || jsonb_build_object(
        'retorno', true, 'retorno_fechado', v_fechado,
        'retorno_opp_status', coalesce(v_opp_status,'sem_opp'),
        'retorno_de_status', v_status, 'retorno_de_etapa', coalesce(v_etapa,''),
        'nudge_n', 0, 'abertura_enviada', false, 'aguardando_humano', null,
        'retomada', false, 'transicao_pendente', false, 'teve_inbound', true),
      processar_apos = now() + interval '8 seconds', ultima_msg_cliente_em = now(), atualizado_em = now()
    where id = v_id;
    insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
    values (v_id, new.conversa_id, new.organizacao_id, 'retorno_detectado',
            jsonb_build_object('fechado', v_fechado, 'opp_status', v_opp_status, 'de_status', v_status));
  else
    -- opp FECHADA e sem sessão anterior (fechou no fluxo/humano, antes da IA): cria a sessão de retorno
    insert into public.ia_sessoes (organizacao_id, canal_id, conversa_id, contato_id, oportunidade_id, etapa, status, dados, processar_apos, ultima_msg_cliente_em)
    values (v_org, v_canal, new.conversa_id, v_contato,
      (select id from public.oportunidades where organizacao_id = v_org and contato_id = v_contato order by criado_em desc limit 1),
      'retorno', 'ativa',
      jsonb_build_object('retorno', true, 'retorno_fechado', true,
        'retorno_opp_status', coalesce(v_opp_status,'sem_opp'), 'retorno_de_status', 'sem_sessao',
        'nudge_n', 0, 'abertura_enviada', false),
      now() + interval '8 seconds', now())
    returning id into v_id;
    insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
    values (v_id, new.conversa_id, new.organizacao_id, 'retorno_detectado',
            jsonb_build_object('fechado', true, 'opp_status', v_opp_status, 'de_status', 'sem_sessao'));
  end if;

  return new;
end
$function$;
