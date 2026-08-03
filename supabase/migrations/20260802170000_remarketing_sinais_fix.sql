-- ============================================================================
-- Central de Operações — correções nos sinais (revisão adversarial).
--   * Fichas são VERSIONADAS (cadeia linear ficha_anterior_id): contar todas as
--     versões inflava contratos/benefício. Passa a contar só a CABEÇA da cadeia
--     (a versão vigente = a que ninguém sucede).
--   * telefones_extras trazia o próprio número PRINCIPAL (e sem ordem estável),
--     fazendo a IA sugerir "tente o outro número" apontando o mesmo que falhou.
--     Passa a excluir principal + o telefone do contato, com ordem determinística.
-- Continuam SOMENTE-LEITURA, member-gated, motor INERTE.
-- ============================================================================

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
      -- só a versão vigente de cada ficha (cabeça da cadeia: ninguém a sucede)
      select count(*) as contratos, coalesce(sum(fj.valor_beneficio), 0) as benef_total
      from public.fichas_judiciais fj
      where fj.contato_id = rl.contato_id
        and not exists (select 1 from public.fichas_judiciais s where s.ficha_anterior_id = fj.id)
    ) f on true
    where rl.organizacao_id = p_org and rl.status = 'ativo'
  ), '[]'::jsonb) end;
$$;

create or replace function public.remarketing_conversa_resumo(p_conversa uuid, p_contato uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v jsonb; v_ult_entrada timestamptz; v_tel text;
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

  v := v || coalesce((
    select jsonb_build_object('moda_hora', hora, 'moda_hora_qtd', qtd)
    from (
      select extract(hour from enviada_em at time zone 'America/Sao_Paulo')::int as hora, count(*) as qtd
      from public.mensagens where conversa_id = p_conversa and direcao = 'entrada'
      group by 1 order by qtd desc, hora asc limit 1
    ) h
  ), '{}'::jsonb);

  v := v || coalesce((
    select jsonb_build_object('ultima_saida_status', status, 'erro_envio', erro_envio)
    from public.mensagens where conversa_id = p_conversa and direcao = 'saida'
    order by enviada_em desc limit 1
  ), '{}'::jsonb);

  v := v || jsonb_build_object('lidas_pos_entrada', coalesce((
    select count(*) from public.mensagens
    where conversa_id = p_conversa and direcao = 'saida' and status = 'lida'
      and (v_ult_entrada is null or enviada_em > v_ult_entrada)
  ), 0));

  v := v || coalesce((select jsonb_build_object('nao_lidas', nao_lidas) from public.conversas where id = p_conversa), '{}'::jsonb);
  v := v || coalesce((
    select jsonb_build_object('ultima_entrada_tipo', tipo)
    from public.mensagens where conversa_id = p_conversa and direcao = 'entrada'
    order by enviada_em desc limit 1
  ), '{}'::jsonb);

  if p_contato is not null then
    select telefone into v_tel from public.contatos where id = p_contato;
    -- números ALTERNATIVOS: exclui o principal e o telefone do contato; ordem estável
    v := v || jsonb_build_object('telefones_extras', coalesce((
      select jsonb_agg(distinct valor_normalizado order by valor_normalizado)
      from public.contato_identidades
      where contato_id = p_contato and tipo = 'whatsapp'
        and coalesce(principal, false) = false
        and valor_normalizado is not null
        and valor_normalizado is distinct from v_tel
    ), '[]'::jsonb));
    -- contratos = só a versão vigente de cada ficha
    v := v || jsonb_build_object('contratos_lista', coalesce((
      select jsonb_agg(jsonb_build_object('banco', banco_nome, 'tipo', tipo_beneficio, 'valor', valor_beneficio)
                       order by valor_beneficio desc nulls last)
      from public.fichas_judiciais fj
      where fj.contato_id = p_contato
        and not exists (select 1 from public.fichas_judiciais s where s.ficha_anterior_id = fj.id)
    ), '[]'::jsonb));
  end if;

  return v;
end $$;

grant execute on function public.remarketing_fila_sinais(uuid) to authenticated, service_role;
grant execute on function public.remarketing_conversa_resumo(uuid, uuid) to authenticated, service_role;
