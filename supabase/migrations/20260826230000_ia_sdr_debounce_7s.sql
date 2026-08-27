-- IA SDR: debounce 4s -> 7s (agrupa rajada de mensagens do cliente e responde tudo junto).

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
  v_ad boolean;
begin
  select id, status, etapa, dados, oportunidade_id
    into v_id, v_status, v_etapa, v_dados, v_opp
    from public.ia_sessoes where conversa_id = new.conversa_id;

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

  -- veio do ANÚNCIO? (Click-to-WhatsApp grava metadados.referral). É o gate do reengajamento.
  v_ad := coalesce(new.metadados ? 'referral', false);

  -- caminho QUENTE: sessão ativa. Só vira RETORNO (requalificação firme) se esfriou (ghostou os
  -- nudges) E veio pelo anúncio; caso contrário é só o debounce normal (a IA segue atendendo).
  if v_id is not null and v_status = 'ativa' then
    if not ( v_ad
             and coalesce((v_dados->>'nudge_n')::int, 0) >= 3
             and coalesce(v_etapa,'') not in ('conclusao','retorno')
             and coalesce(v_dados->>'aguardando_humano','') = '' ) then
      update public.ia_sessoes
        set ultima_msg_cliente_em = now(), processar_apos = now() + interval '7 seconds', atualizado_em = now()
        where id = v_id;
      return new;
    end if;
  end if;

  -- ===== detecção de RETORNO (inbound sem sessão ativa-quente) =====
  -- Sem anúncio, nada de retorno: lead que volta espontâneo (ex.: "bom dia") é do humano.
  if not v_ad then return new; end if;

  select canal_id, organizacao_id, contato_id, coalesce(precisa_humano,false)
    into v_canal, v_org, v_contato, v_precisa_humano
    from public.conversas where id = new.conversa_id;
  select coalesce(ia_enabled,false) into v_ia_on from public.bot_canal_config where canal_id = v_canal;

  if v_precisa_humano or not coalesce(v_ia_on,false) then
    return new;
  end if;

  if v_dados is not null and (v_dados->>'retorno_ts') is not null
     and (v_dados->>'retorno_ts')::timestamptz > now() - interval '20 hours' then
    return new;
  end if;

  if coalesce(v_status,'') <> 'ativa' and exists (
    select 1 from public.mensagens m
    where m.conversa_id = new.conversa_id and m.direcao = 'saida'
      and m.tipo not in ('sistema','nota_interna')
      and (m.autor_id is not null or m.origem = 'telefone')
      and m.criado_em > now() - interval '2 hours'
  ) then
    return new;
  end if;

  if v_opp is not null then
    select status into v_opp_status from public.oportunidades where id = v_opp;
  else
    select status into v_opp_status from public.oportunidades
      where organizacao_id = v_org and contato_id = v_contato
      order by criado_em desc limit 1;
  end if;
  v_fechado := coalesce(v_opp_status,'') in ('ganho','perdido','cancelado');

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
        'retorno_via_anuncio', true,
        'nudge_n', 0, 'abertura_enviada', false, 'aguardando_humano', null,
        'retomada', false, 'transicao_pendente', false, 'teve_inbound', true),
      processar_apos = now() + interval '7 seconds', ultima_msg_cliente_em = now(), atualizado_em = now()
    where id = v_id;
    insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
    values (v_id, new.conversa_id, new.organizacao_id, 'retorno_detectado',
            jsonb_build_object('fechado', v_fechado, 'opp_status', v_opp_status, 'de_status', v_status, 'via_anuncio', true));
  else
    insert into public.ia_sessoes (organizacao_id, canal_id, conversa_id, contato_id, oportunidade_id, etapa, status, dados, processar_apos, ultima_msg_cliente_em)
    values (v_org, v_canal, new.conversa_id, v_contato,
      (select id from public.oportunidades where organizacao_id = v_org and contato_id = v_contato order by criado_em desc limit 1),
      'retorno', 'ativa',
      jsonb_build_object('retorno', true, 'retorno_fechado', true,
        'retorno_opp_status', coalesce(v_opp_status,'sem_opp'), 'retorno_de_status', 'sem_sessao',
        'retorno_via_anuncio', true,
        'nudge_n', 0, 'abertura_enviada', false),
      now() + interval '7 seconds', now())
    returning id into v_id;
    insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
    values (v_id, new.conversa_id, new.organizacao_id, 'retorno_detectado',
            jsonb_build_object('fechado', true, 'opp_status', v_opp_status, 'de_status', 'sem_sessao', 'via_anuncio', true));
  end if;

  return new;
end
$function$;
