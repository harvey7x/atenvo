-- ============================================================================
-- CENTRAL DE OPERAÇÕES — sinais reais para a fila e o painel/IA.
-- Duas RPCs SOMENTE-LEITURA (member-gated, security definer) que leem dados que
-- JÁ existem (mensagens, remarketing_eventos, fichas_judiciais, conversas,
-- contato_identidades) — nenhuma coluna nova, nenhuma escrita, motor INERTE.
--   * remarketing_fila_sinais(org)  → 1 round-trip com os indicadores de linha
--                                     (💬 🎤 📄 ✓✓ contratos R$) de todos os leads ativos.
--   * remarketing_conversa_resumo(conversa, contato) → análise profunda de UM lead
--                                     (moda de horário, "leu e sumiu", telefone extra,
--                                     contratos) que alimenta a "Sugestão da IA".
-- Ambas retornam vazio hoje (0 leads ativos — motor desligado) e acendem na F3.
-- ============================================================================

-- ===== Sinais de linha da fila inteira (1 query) =====
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
      'benef_total', coalesce(f.benef_total, 0)
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
      from public.fichas_judiciais fj where fj.contato_id = rl.contato_id
    ) f on true
    where rl.organizacao_id = p_org and rl.status = 'ativo'
  ), '[]'::jsonb) end;
$$;

-- ===== Resumo profundo de UMA conversa (alimenta a Sugestão da IA) =====
create or replace function public.remarketing_conversa_resumo(p_conversa uuid, p_contato uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v jsonb; v_ult_entrada timestamptz;
begin
  if p_conversa is null then return null; end if;
  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then return null; end if;
  if not public.is_member(v_org) and not public.is_platform_admin() then return null; end if;

  select coalesce(jsonb_build_object(
    'entradas_total',  count(*) filter (where direcao = 'entrada'),
    'saidas_total',    count(*) filter (where direcao = 'saida'),
    'entradas_audio',  count(*) filter (where direcao = 'entrada' and tipo = 'audio'),
    'saidas_texto',    count(*) filter (where direcao = 'saida'  and tipo = 'texto'),
    'saidas_audio',    count(*) filter (where direcao = 'saida'  and tipo = 'audio'),
    'docs_recebidos',  count(*) filter (where direcao = 'entrada' and tipo in ('documento','imagem')),
    'ultima_entrada_em', max(enviada_em) filter (where direcao = 'entrada'),
    'ultima_saida_em',   max(enviada_em) filter (where direcao = 'saida')
  ), '{}'::jsonb) into v
  from public.mensagens where conversa_id = p_conversa;

  select max(enviada_em) into v_ult_entrada from public.mensagens where conversa_id = p_conversa and direcao = 'entrada';

  -- moda do horário de resposta do cliente (fuso SP)
  v := v || coalesce((
    select jsonb_build_object('moda_hora', hora, 'moda_hora_qtd', qtd)
    from (
      select extract(hour from enviada_em at time zone 'America/Sao_Paulo')::int as hora, count(*) as qtd
      from public.mensagens where conversa_id = p_conversa and direcao = 'entrada'
      group by 1 order by qtd desc, hora asc limit 1
    ) h
  ), '{}'::jsonb);

  -- status/erro da última saída
  v := v || coalesce((
    select jsonb_build_object('ultima_saida_status', status, 'erro_envio', erro_envio)
    from public.mensagens where conversa_id = p_conversa and direcao = 'saida'
    order by enviada_em desc limit 1
  ), '{}'::jsonb);

  -- "leu e sumiu": saídas lidas depois da última entrada
  v := v || jsonb_build_object('lidas_pos_entrada', coalesce((
    select count(*) from public.mensagens
    where conversa_id = p_conversa and direcao = 'saida' and status = 'lida'
      and (v_ult_entrada is null or enviada_em > v_ult_entrada)
  ), 0));

  -- não lidas + tipo da última entrada
  v := v || coalesce((select jsonb_build_object('nao_lidas', nao_lidas) from public.conversas where id = p_conversa), '{}'::jsonb);
  v := v || coalesce((
    select jsonb_build_object('ultima_entrada_tipo', tipo)
    from public.mensagens where conversa_id = p_conversa and direcao = 'entrada'
    order by enviada_em desc limit 1
  ), '{}'::jsonb);

  -- contexto do contato: telefones extras + contratos (fichas)
  if p_contato is not null then
    v := v || jsonb_build_object('telefones_extras', coalesce((
      select jsonb_agg(distinct valor_normalizado)
      from public.contato_identidades
      where contato_id = p_contato and tipo = 'whatsapp' and valor_normalizado is not null
    ), '[]'::jsonb));
    v := v || jsonb_build_object('contratos_lista', coalesce((
      select jsonb_agg(jsonb_build_object('banco', banco_nome, 'tipo', tipo_beneficio, 'valor', valor_beneficio)
                       order by valor_beneficio desc nulls last)
      from public.fichas_judiciais where contato_id = p_contato
    ), '[]'::jsonb));
  end if;

  return v;
end $$;

do $g$
declare fn text;
begin
  foreach fn in array array['remarketing_fila_sinais(uuid)', 'remarketing_conversa_resumo(uuid, uuid)'] loop
    execute format('grant execute on function public.%s to authenticated, service_role;', fn);
  end loop;
end $g$;
