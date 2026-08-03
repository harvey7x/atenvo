-- ============================================================================
-- MOTOR DE REMARKETING — F0: Score de Prioridade MATERIALIZADO no banco.
-- Fonte ÚNICA da verdade: fn_remarketing_score (SQL puro, read-only) porta o
-- scoreFatores do front e ESTENDE com o novo modelo (engagement × fit):
--   + CPF preenchido no bot (intenção altíssima), + documento recebido (peso
--   maior), + multiplicador de FIT pela carteira de benefícios, + decaimento.
-- Recalcula por EVENTO (trigger em remarketing_eventos — tabela NOSSA, não os
-- webhooks vivos) e por CRON (dentro de remarketing_avaliar_com_sla).
-- O motor segue INERTE: isto só calcula/ordena um número, não agenda nem envia
-- nada. Respeita ativo_desde (nenhum backlog antigo entra na esteira).
-- ============================================================================

alter table public.remarketing_leads
  add column if not exists score int,
  add column if not exists score_calculado_em timestamptz,
  add column if not exists score_fatores jsonb;

-- Índice para ordenar a fila por score no SERVIDOR (aguenta lista longa).
create index if not exists idx_rmkt_leads_score
  on public.remarketing_leads (organizacao_id, score desc) where status = 'ativo';

-- ===== Função pura: calcula score + fatores de um lead =====
create or replace function public.fn_remarketing_score(p_lead uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  l record; v_prazo timestamptz; v_ult_entrada timestamptz;
  v_docs int := 0; v_ult_tipo text; v_cpf boolean := false;
  v_benef numeric := 0; v_contratos int := 0; v_tipo_benef text;
  f jsonb := '[]'::jsonb; eng int := 0; fitm numeric := 1.0; sc int;
  agora timestamptz := now(); horas int; dias int; respondeu_recente boolean := false;
  add_f record;
begin
  select rl.id, rl.etapa, rl.tentativas, rl.criado_em, rl.entrou_etapa_em, rl.proxima_acao_em,
         rl.conversa_id, rl.contato_id, rl.status,
         (select vence_em from public.remarketing_tarefas t
            where t.remarketing_id = rl.id and t.status = 'pendente' limit 1) as tarefa_vence,
         (select ultima_entrada_em from public.conversas cv where cv.id = rl.conversa_id) as ult_entrada
    into l
    from public.remarketing_leads rl where rl.id = p_lead;
  if l.id is null then return jsonb_build_object('score', 0, 'fatores', '[]'::jsonb); end if;

  v_ult_entrada := l.ult_entrada;
  v_prazo := coalesce(l.tarefa_vence, l.proxima_acao_em);

  -- sinais reais do cliente
  if l.conversa_id is not null then
    select count(*) filter (where direcao = 'entrada' and tipo in ('documento','imagem')),
           (select tipo from public.mensagens m2 where m2.conversa_id = l.conversa_id and m2.direcao = 'entrada' order by m2.enviada_em desc limit 1)
      into v_docs, v_ult_tipo
      from public.mensagens where conversa_id = l.conversa_id;
    v_cpf := exists (
      select 1 from public.bot_conversa_estado b
      where b.conversa_id = l.conversa_id
        and coalesce(b.dados_qualificacao->>'cpf_mascarado', '') <> ''
    );
  end if;

  -- carteira (FIT): só a versão vigente de cada ficha
  select count(*), coalesce(sum(valor_beneficio), 0),
         (array_agg(tipo_beneficio order by valor_beneficio desc nulls last))[1]
    into v_contratos, v_benef, v_tipo_benef
    from public.fichas_judiciais fj
    where fj.contato_id = l.contato_id
      and not exists (select 1 from public.fichas_judiciais s where s.ficha_anterior_id = fj.id);

  -- ===== ENGAGEMENT =====
  if v_prazo is not null then
    if v_prazo < agora then
      horas := floor(extract(epoch from (agora - v_prazo)) / 3600);
      f := f || jsonb_build_object('motivo', 'prazo vencido', 'pts', 50 + least(20, horas));
    elsif (v_prazo at time zone 'America/Sao_Paulo')::date = (agora at time zone 'America/Sao_Paulo')::date then
      f := f || jsonb_build_object('motivo', 'vence hoje', 'pts', 30);
    elsif (v_prazo at time zone 'America/Sao_Paulo')::date = ((agora + interval '1 day') at time zone 'America/Sao_Paulo')::date then
      f := f || jsonb_build_object('motivo', 'vence amanhã', 'pts', 15);
    end if;
  end if;
  if l.criado_em >= agora - interval '10 minutes' then
    f := f || jsonb_build_object('motivo', 'lead novíssimo (<10 min)', 'pts', 45);
  end if;
  if v_cpf then
    f := f || jsonb_build_object('motivo', 'CPF preenchido no bot', 'pts', 40);
  end if;
  if v_ult_entrada is not null and v_ult_entrada >= agora - interval '1 hour' then
    f := f || jsonb_build_object('motivo', 'respondeu há pouco', 'pts', 35); respondeu_recente := true;
  elsif v_ult_entrada is not null and v_ult_entrada >= agora - interval '24 hours' then
    f := f || jsonb_build_object('motivo', 'respondeu nas últimas 24 h', 'pts', 18); respondeu_recente := true;
  end if;
  if v_docs > 0 or v_ult_tipo in ('documento', 'imagem') then
    f := f || jsonb_build_object('motivo', 'enviou documento', 'pts', 30);
  end if;
  f := f || jsonb_build_object('motivo', 'poucas tentativas', 'pts', (3 - least(l.tentativas, 3)) * 6);
  if l.etapa = 'recuperacao_3' then
    f := f || jsonb_build_object('motivo', 'última chance antes de perder', 'pts', 15);
  elsif l.etapa = 'recuperacao_2' then
    f := f || jsonb_build_object('motivo', 'recuperação avançada', 'pts', 10);
  end if;
  -- decaimento (é o que faz o número cair sozinho no silêncio)
  dias := case when v_ult_entrada is null then null else floor(extract(epoch from (agora - v_ult_entrada)) / 86400) end;
  if dias is not null and dias > 5 then
    f := f || jsonb_build_object('motivo', 'abandono antigo', 'pts', -least(dias, 25));
  end if;
  if l.tentativas >= 2 and (v_ult_entrada is null or v_ult_entrada <= l.entrou_etapa_em) then
    f := f || jsonb_build_object('motivo', 'cutucadas ignoradas', 'pts', -least(l.tentativas * 4, 20));
  end if;

  for add_f in select (e->>'pts')::int as pts from jsonb_array_elements(f) e loop
    eng := eng + add_f.pts;
  end loop;
  eng := greatest(0, least(100, eng));

  -- ===== FIT (multiplicador) =====
  if v_benef >= 5000 then fitm := fitm + 0.15;
  elsif v_benef >= 3000 then fitm := fitm + 0.08; end if;
  if v_contratos >= 2 then fitm := fitm + 0.05; end if;
  if v_tipo_benef = 'aposentadoria' then fitm := fitm + 0.05; end if;
  if v_tipo_benef = 'bpc_loas' and v_contratos = 0 then fitm := fitm - 0.10; end if;
  fitm := greatest(0.90, least(1.25, fitm));

  sc := round(least(100, greatest(0, eng * fitm)));
  -- piso de sobrevivência: quem respondeu/mandou doc não afunda por decay
  if (respondeu_recente or v_docs > 0) and sc < 30 then sc := 30; end if;

  return jsonb_build_object('score', sc, 'fatores', f, 'engagement', eng, 'fit', fitm);
end $$;

-- ===== Recalcula o score de todos os leads ativos (chamado pelo cron) =====
create or replace function public.remarketing_recalcular_score(p_org uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.remarketing_leads rl
    set score = (s.j->>'score')::int, score_fatores = s.j->'fatores', score_calculado_em = now()
  from (
    select id, public.fn_remarketing_score(id) as j
    from public.remarketing_leads
    where status = 'ativo' and (p_org is null or organizacao_id = p_org)
  ) s
  where s.id = rl.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ===== Trigger: recalcula na hora quando um evento do lead é registrado =====
-- (remarketing_eventos é tabela NOSSA — escrita só pelo motor/RPCs, nunca pelos
--  webhooks vivos — então este trigger é seguro. Defensivo: nunca derruba o insert.)
create or replace function public.trg_rmkt_score_evento() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb;
begin
  select public.fn_remarketing_score(NEW.remarketing_id) into j;
  update public.remarketing_leads
    set score = (j->>'score')::int, score_fatores = j->'fatores', score_calculado_em = now()
    where id = NEW.remarketing_id;
  return NEW;
exception when others then
  return NEW;  -- jamais quebrar o registro do evento por causa do score
end $$;

drop trigger if exists trg_rmkt_score_evento on public.remarketing_eventos;
create trigger trg_rmkt_score_evento
  after insert on public.remarketing_eventos
  for each row execute function public.trg_rmkt_score_evento();

-- ===== Cron do motor também refresca o score (decaimento temporal) =====
create or replace function public.remarketing_avaliar_com_sla(p_org uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare base jsonb; slas int; recs int;
begin
  base := public.remarketing_avaliar(p_org);
  slas := public.rmkt_sla_estourado(p_org);
  recs := public.remarketing_recalcular_score(p_org);
  return base || jsonb_build_object('slas_estourados', slas, 'scores_recalculados', recs);
end $$;

-- ===== fila_sinais também expõe cpf_preenchido (p/ o fallback client-side) =====
create or replace function public.remarketing_fila_sinais(p_org uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.is_member(p_org) and not public.is_platform_admin() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
      'lead_id', rl.id,
      'conversa_id', rl.conversa_id,
      'saidas_texto', coalesce(m.saidas_texto, 0),
      'saidas_audio', coalesce(m.saidas_audio, 0),
      'entradas_audio', coalesce(m.entradas_audio, 0),
      'entradas_total', coalesce(m.entradas_total, 0),
      'docs_recebidos', coalesce(m.docs_recebidos, 0),
      'ultima_saida_status', m.ultima_saida_status,
      'ultima_saida_em', m.ultima_saida_em,
      'ultima_entrada_em', m.ultima_entrada_em,
      'ligacoes', coalesce(ev.ligacoes, 0),
      'audios_reg', coalesce(ev.audios, 0),
      'whatsapps_reg', coalesce(ev.whatsapps, 0),
      'contratos', coalesce(f.contratos, 0),
      'benef_total', coalesce(f.benef_total, 0),
      'cpf_preenchido', coalesce(cpf.tem, false)
    ))
    from public.remarketing_leads rl
    left join lateral (
      select
        count(*) filter (where m0.direcao = 'saida'  and m0.tipo = 'texto') as saidas_texto,
        count(*) filter (where m0.direcao = 'saida'  and m0.tipo = 'audio') as saidas_audio,
        count(*) filter (where m0.direcao = 'entrada' and m0.tipo = 'audio') as entradas_audio,
        count(*) filter (where m0.direcao = 'entrada') as entradas_total,
        count(*) filter (where m0.direcao = 'entrada' and m0.tipo in ('documento', 'imagem')) as docs_recebidos,
        max(m0.enviada_em) filter (where m0.direcao = 'entrada') as ultima_entrada_em,
        max(m0.enviada_em) filter (where m0.direcao = 'saida')  as ultima_saida_em,
        (select m2.status from public.mensagens m2
           where m2.conversa_id = rl.conversa_id and m2.direcao = 'saida'
           order by m2.enviada_em desc limit 1) as ultima_saida_status
      from public.mensagens m0
      where m0.conversa_id = rl.conversa_id
    ) m on rl.conversa_id is not null
    left join lateral (
      select
        count(*) filter (where e.tipo = 'ligacao_realizada') as ligacoes,
        count(*) filter (where e.tipo = 'audio_enviado')     as audios,
        count(*) filter (where e.tipo = 'whatsapp_enviado')  as whatsapps
      from public.remarketing_eventos e where e.remarketing_id = rl.id
    ) ev on true
    left join lateral (
      select count(*) as contratos, coalesce(sum(fj.valor_beneficio), 0) as benef_total
      from public.fichas_judiciais fj
      where fj.contato_id = rl.contato_id
        and not exists (select 1 from public.fichas_judiciais s where s.ficha_anterior_id = fj.id)
    ) f on true
    left join lateral (
      select coalesce(b.dados_qualificacao->>'cpf_mascarado', '') <> '' as tem
      from public.bot_conversa_estado b where b.conversa_id = rl.conversa_id limit 1
    ) cpf on rl.conversa_id is not null
    where rl.organizacao_id = p_org and rl.status = 'ativo'
  ), '[]'::jsonb) end;
$$;

do $g$
declare fn text;
begin
  foreach fn in array array[
    'fn_remarketing_score(uuid)', 'remarketing_recalcular_score(uuid)',
    'remarketing_avaliar_com_sla(uuid)', 'remarketing_fila_sinais(uuid)'
  ] loop
    execute format('grant execute on function public.%s to authenticated, service_role;', fn);
  end loop;
end $g$;
