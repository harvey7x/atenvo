-- Trava do envio enquanto a Iris atende (dono, 12/11): "quando a Iris estiver [com o] cliente, o atendente
-- não consegue interromper o atendimento da Iris; aparece uma mensagem perguntando se quer pausar o atendimento
-- da IA; apertando, desbloqueia para mandar a mensagem; e fica registrado".
--
-- 1) ia_pausas: a ficha de quem pausou/religou a IA, quando e por onde (trava do envio ou cabeçalho).
-- 2) ia_atendendo_agora(conversa): a Iris (ou a IA) está atendendo DE VERDADE — sessão 'ativa', não desligada à
--    mão, e o número da sessão está conectado e com a IA ligada. Sessão "ativa" em número desconectado, removido
--    ou sem IA NÃO trava (12/11: eram ~500 das 855 sessões ativas — ninguém responderia esses clientes).
-- 3) ia_canais_atendendo(org): os números onde a IA atende agora (a marca "Iris atendendo" da lista).
-- 4) ia_pausar_para_responder(conversa): o botão da trava — pausa e registra com origem 'trava_envio'.
-- 5) ia_conversa_toggle: IGUAL ao vivo, mais o registro de quem pausou/religou (origem 'cabecalho').
-- 6) ia_conversa_estado: mais 'atendendo_agora', 'iris' e as últimas pausas (para o aviso na conversa).
-- Nada muda para a IA: ela continua parando quando o atendente escreve (fn_ia_sessao_mensagem) e pela pausa.

create table if not exists public.ia_pausas (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  conversa_id     uuid not null references public.conversas(id) on delete cascade,
  usuario_id      uuid references public.usuarios(id) on delete set null,
  acao            text not null check (acao in ('pausou', 'religou')),
  origem          text not null check (origem in ('trava_envio', 'cabecalho')),
  criado_em       timestamptz not null default now()
);
create index if not exists idx_ia_pausas_conversa on public.ia_pausas (conversa_id, criado_em desc);
alter table public.ia_pausas enable row level security;
revoke all on public.ia_pausas from public, anon, authenticated;
grant select, insert on public.ia_pausas to service_role;
-- leitura só pelas funções abaixo (security definer, com is_member)

create or replace function public.ia_canal_atende(p_canal uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.bot_canal_config b join public.canais ca on ca.id = b.canal_id
    where b.canal_id = p_canal and b.ia_enabled and ca.status_integracao::text = 'conectado' and ca.ativo is not false
  )
$$;
revoke all on function public.ia_canal_atende(uuid) from public, anon, authenticated;
grant execute on function public.ia_canal_atende(uuid) to service_role;

create or replace function public.ia_atendendo_agora(p_conversa uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select s.status = 'ativa' and coalesce((s.dados->>'desativado_manual')::boolean, false) = false
           and public.ia_canal_atende(s.canal_id)
    from public.ia_sessoes s
    join public.conversas c on c.id = s.conversa_id
    where s.conversa_id = p_conversa
      and (auth.role() = 'service_role' or public.is_member(c.organizacao_id))
  ), false)
$$;
revoke all on function public.ia_atendendo_agora(uuid) from public, anon;
grant execute on function public.ia_atendendo_agora(uuid) to authenticated, service_role;

create or replace function public.ia_canais_atendendo(p_org uuid)
returns table (canal_id uuid, iris boolean)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select b.canal_id, coalesce((b.iris_config->>'ativo')::boolean, false)
  from public.bot_canal_config b join public.canais ca on ca.id = b.canal_id
  where ca.organizacao_id = p_org and public.is_member(p_org)
    and b.ia_enabled and ca.status_integracao::text = 'conectado' and ca.ativo is not false
$$;
revoke all on function public.ia_canais_atendendo(uuid) from public, anon;
grant execute on function public.ia_canais_atendendo(uuid) to authenticated;

create or replace function public.ia_pausar_para_responder(p_conversa uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_conv record; v_sess record;
begin
  select id, organizacao_id into v_conv from public.conversas where id = p_conversa;
  if v_conv is null then raise exception 'conversa inexistente'; end if;
  if not public.is_member(v_conv.organizacao_id) then raise exception 'sem permissão'; end if;
  select * into v_sess from public.ia_sessoes where conversa_id = p_conversa for update;
  if v_sess.id is null then return jsonb_build_object('ok', true, 'ia', 'sem_sessao'); end if;
  update public.ia_sessoes set status = 'pausada',
    dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object('desativado_manual', true, 'desligado_manual_em', now(), 'desligado_por', auth.uid()),
    atualizado_em = now()
  where id = v_sess.id;
  insert into public.ia_pausas (organizacao_id, conversa_id, usuario_id, acao, origem)
  values (v_conv.organizacao_id, p_conversa, auth.uid(), 'pausou', 'trava_envio');
  insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(), 'ia_pausada_para_responder', 'conversas', p_conversa,
          jsonb_build_object('status_antes', v_sess.status, 'etapa', v_sess.etapa), v_conv.organizacao_id);
  return jsonb_build_object('ok', true, 'ia', 'pausada');
end $$;
revoke all on function public.ia_pausar_para_responder(uuid) from public, anon;
grant execute on function public.ia_pausar_para_responder(uuid) to authenticated;

create or replace function public.ia_conversa_toggle(p_conversa uuid, p_ativar boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_conv record; v_sess record; v_canal_ia boolean; v_juros boolean; v_opp uuid; v_dq jsonb;
begin
  select id, organizacao_id, contato_id, canal_id into v_conv from public.conversas where id = p_conversa;
  if v_conv is null then raise exception 'conversa inexistente'; end if;
  if not public.is_member(v_conv.organizacao_id) then raise exception 'sem permissão'; end if;

  select * into v_sess from public.ia_sessoes where conversa_id = p_conversa;

  if p_ativar then
    -- JUROS ABUSIVO (20/10): a IA de lá só pergunta do benefício/parente. Só com a conversa em 'sem_beneficio';
    -- sessão de outra etapa (qualificacao_inss de agosto, coleta de documentos trazida de canal removido…) não
    -- retoma: "Recomeçar atendimento" a põe na etapa certa.
    v_juros := v_conv.canal_id is not distinct from 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117'::uuid or v_sess.canal_id is not distinct from 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117'::uuid;
    if v_juros then
      -- revisão 21/10: IA desligada no JUROS (estado depois do config_rollback) → recusa; senão o clique apagaria o
      -- alerta 'beneficio_nao_sem_ia' da equipe e deixaria uma sessão 'ativa' que o worker nunca roda
      if not exists (select 1 from public.bot_canal_config where canal_id = 'fc80ec9e-9f8f-4dca-a3f0-e1101d73e117' and ia_enabled) then
        raise exception 'JUROS ABUSIVO: a IA está desligada neste número';
      end if;
      select e.oportunidade_id, e.dados_qualificacao into v_opp, v_dq from public.bot_conversa_estado e where e.conversa_id = p_conversa;
      if coalesce(v_dq->>'passo_video', '') <> 'sem_beneficio' then
        raise exception 'JUROS ABUSIVO: a IA só entra na pergunta do benefício do INSS, e esta conversa não está nela';
      end if;
      if v_sess.id is not null and v_sess.etapa is distinct from 'juros_beneficio' then
        raise exception 'JUROS ABUSIVO: esta sessão da IA é de outra etapa (%) — use "Recomeçar atendimento"', v_sess.etapa;
      end if;
    end if;
    if v_sess.id is not null then
      update public.ia_sessoes set status = 'ativa', processar_apos = now(),
        dados = (coalesce(dados, '{}'::jsonb) - 'aguardando_humano') || jsonb_build_object('desativado_manual', false, 'religado_manual_em', now()),
        atualizado_em = now()
      where id = v_sess.id;
    else
      -- sem sessão: cria uma (o atendente está mandando a IA assumir esta conversa)
      -- JUROS: na etapa do benefício, semeada com a resposta que o robô colheu — o que o bot-runner faria se a IA
      -- tivesse nascido no 'sem_beneficio' (dados.beneficio_robo; a IA lê só dali pra frente e não repete a pergunta)
      insert into public.ia_sessoes (organizacao_id, canal_id, conversa_id, contato_id, oportunidade_id, etapa, status, processar_apos, dados)
      values (v_conv.organizacao_id, v_conv.canal_id, p_conversa, v_conv.contato_id,
              case when v_juros then v_opp end,
              case when v_juros then 'juros_beneficio' else 'qualificacao_inss' end, 'ativa', now(),
              jsonb_build_object('manual_ativado', true)
              || case when v_juros and coalesce(v_dq->>'beneficio_inss', 'sem_resposta') <> 'sem_resposta'
                      then jsonb_build_object('beneficio_robo', jsonb_build_object('perguntou', true,
                             'classe', v_dq->'beneficio_inss', 'resposta', v_dq->'beneficio_resposta',
                             'msg_id', v_dq->'beneficio_msg_id', 'em', v_dq->'beneficio_em'))
                      else '{}'::jsonb end);
    end if;
    -- limpa o precisa_humano SÓ se foi a IA que pôs (motivos conhecidos dela)
    update public.conversas set precisa_humano = false, precisa_humano_motivo = null, precisa_humano_em = null
      where id = p_conversa and precisa_humano = true
        and precisa_humano_motivo in ('sem_acesso_govbr','auxilio_extratos','auxilio_senha','cpf_divergente',
          'foto_ilegivel','doc_divergente','quer_falar_valores','nao_entendeu','transicao_falhou',
          'falha_tecnica','docs_completos_fechar','analise_pronta_contatar_hoje',
          -- ia-sdr v3 (09/10): motivos novos da IA (alerta leve + representação)
          'prometeu_colega','pediu_humano','representacao',
          -- JUROS (20/10): a IA não tinha nascido no 'sem_beneficio' e o robô chamou o atendente pro parente
          'beneficio_nao_sem_ia');
    -- 12/11: registro de quem religou (ficha ia_pausas)
    insert into public.ia_pausas (organizacao_id, conversa_id, usuario_id, acao, origem)
    values (v_conv.organizacao_id, p_conversa, auth.uid(), 'religou', 'cabecalho');
    return jsonb_build_object('ok', true, 'ia', 'ativa');
  else
    if v_sess.id is not null then
      update public.ia_sessoes set status = 'pausada',
        dados = coalesce(dados, '{}'::jsonb) || jsonb_build_object('desativado_manual', true, 'desligado_manual_em', now(), 'desligado_por', auth.uid()),
        atualizado_em = now()
      where id = v_sess.id;
    end if;
    if v_sess.id is not null then
      -- 12/11: registro de quem pausou (ficha ia_pausas)
      insert into public.ia_pausas (organizacao_id, conversa_id, usuario_id, acao, origem)
      values (v_conv.organizacao_id, p_conversa, auth.uid(), 'pausou', 'cabecalho');
    end if;
    return jsonb_build_object('ok', true, 'ia', 'desativada', 'tinha_sessao', v_sess.id is not null);
  end if;
end $function$;

create or replace function public.ia_conversa_estado(p_conversa uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $function$
  select case
    when not exists (select 1 from public.ia_sessoes where conversa_id = p_conversa) then jsonb_build_object('existe', false)
    else (select jsonb_build_object('existe', true, 'status', s.status, 'etapa', s.etapa,
            'desativado_manual', coalesce((s.dados->>'desativado_manual')::boolean, false),
            'aguardando_humano', s.dados->>'aguardando_humano',
            -- 12/11 (trava do envio): atende de verdade agora? é a Iris? e as últimas pausas, para o aviso na conversa
            'atendendo_agora', public.ia_atendendo_agora(p_conversa),
            'iris', coalesce((select (b.iris_config->>'ativo')::boolean from public.bot_canal_config b where b.canal_id = s.canal_id), false),
            'pausas', coalesce((select jsonb_agg(jsonb_build_object('acao', p.acao, 'origem', p.origem, 'em', p.criado_em,
                                  'nome', coalesce(nullif(split_part(btrim(u.nome), ' ', 1), ''), 'Alguém da equipe')) order by p.criado_em)
                                from (select * from public.ia_pausas p2 where p2.conversa_id = p_conversa and public.is_member(p2.organizacao_id) order by p2.criado_em desc limit 20) p
                                left join public.usuarios u on u.id = p.usuario_id), '[]'::jsonb))
          from public.ia_sessoes s where s.conversa_id = p_conversa)
  end;
$function$;

notify pgrst, 'reload schema';
