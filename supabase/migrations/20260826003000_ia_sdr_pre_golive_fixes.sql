-- IA SDR — fixes da auditoria pré-go-live (camada SQL). Espelha o aplicado via apply_migration.
--  #1  ia_canal_lock/unlock: revoke public/anon/authenticated + grant service_role; TTL teto <=600s.
--  #6/#7/#17/#20 ia_sdr_retomar_leads v2: RECUSA execução real com ia_enabled=false OU ia_modo_teste=true;
--     só oportunidade em_andamento; dry-run expõe precisa_humano; execução limpa precisa_humano dos alvos.
--  #5/#18 ia_sdr_watchdog v2: NÃO re-carimba processar_apos (só conta backlog); contadores restritos à org.

create or replace function public.ia_canal_lock(p_canal uuid, p_dono uuid, p_ttl_seg integer default 240)
returns boolean language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
begin
  insert into public.ia_canal_locks (canal_id, dono, lock_until)
  values (p_canal, p_dono, now() + make_interval(secs => least(greatest(coalesce(p_ttl_seg, 240), 5), 600)))
  on conflict (canal_id) do update
    set dono = excluded.dono, lock_until = excluded.lock_until
    where ia_canal_locks.lock_until < now() or ia_canal_locks.dono = excluded.dono;
  return found;
end $fn$;
revoke all on function public.ia_canal_lock(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.ia_canal_lock(uuid, uuid, integer) to service_role;
revoke all on function public.ia_canal_unlock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ia_canal_unlock(uuid, uuid) to service_role;

create or replace function public.ia_sdr_retomar_leads(
  p_canal uuid, p_dias_max integer default 30, p_limite integer default 20,
  p_espaco_min integer default 4, p_responsavel uuid default null, p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_criadas integer := 0; v_amostra jsonb; v_total integer; r record; v_n integer := 0;
  v_cfg record;
begin
  select ia_enabled, ia_modo_teste into v_cfg from public.bot_canal_config where canal_id = p_canal;
  if v_cfg is null or v_cfg.ia_enabled is not true then
    raise exception 'canal sem IA habilitada (ia_enabled=false ou config ausente)';
  end if;
  if v_cfg.ia_modo_teste is true and not p_dry_run then
    raise exception 'ia_modo_teste=true: desligue o modo teste antes do backfill (é ação de produção)';
  end if;

  drop table if exists _alvos;
  create temp table _alvos on commit drop as
  select e.conversa_id, c.contato_id, c.organizacao_id, e.oportunidade_id, e.concluido_em,
         ct.nome, right(coalesce(ct.telefone, ''), 4) as tel4,
         extract(day from now() - e.concluido_em)::int as dias,
         c.precisa_humano
  from public.bot_conversa_estado e
  join public.conversas c on c.id = e.conversa_id
  join public.contatos ct on ct.id = c.contato_id
  where e.concluido_em > now() - make_interval(days => greatest(p_dias_max, 1))
    and e.dados_qualificacao->>'passo_emprestimo' = 'fim'
    and c.status <> 'fechada'
    and (p_responsavel is null or ct.responsavel_id = p_responsavel)
    and not exists (select 1 from public.ia_sessoes s where s.conversa_id = e.conversa_id)
    and not exists (select 1 from public.wa_optout w where w.contato_id = c.contato_id)
    and exists (
      select 1 from public.oportunidades o
      where o.id = coalesce(e.oportunidade_id, (
              select o2.id from public.oportunidades o2
              where o2.contato_id = c.contato_id order by o2.criado_em desc limit 1))
        and o.status = 'em_andamento'
    )
    and not exists (
      select 1 from public.mensagens m
      where m.conversa_id = e.conversa_id and m.direcao = 'saida' and m.criado_em > e.concluido_em
        and m.tipo not in ('sistema', 'nota_interna')
        and (m.autor_id is not null or m.origem = 'telefone')
    )
  order by e.concluido_em desc
  limit greatest(p_limite, 0);

  select count(*), jsonb_agg(jsonb_build_object('nome', nome, 'tel_final', tel4, 'dias_parado', dias, 'precisa_humano', precisa_humano) order by concluido_em desc)
    into v_total, v_amostra from _alvos;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'canal', p_canal, 'elegiveis', coalesce(v_total, 0),
      'com_precisa_humano', (select count(*) from _alvos where precisa_humano), 'amostra', coalesce(v_amostra, '[]'::jsonb));
  end if;

  for r in select * from _alvos loop
    insert into public.ia_sessoes (organizacao_id, canal_id, conversa_id, contato_id, oportunidade_id, etapa, status, processar_apos, dados)
    values (r.organizacao_id, p_canal, r.conversa_id, r.contato_id, r.oportunidade_id, 'qualificacao_inss', 'ativa',
            now() + make_interval(mins => v_n * greatest(p_espaco_min, 1)),
            jsonb_build_object('retomada', true, 'retomada_dias', r.dias))
    on conflict (conversa_id) do nothing;
    if found then
      v_criadas := v_criadas + 1;
      update public.conversas set precisa_humano = false, precisa_humano_motivo = null, precisa_humano_em = null
        where id = r.conversa_id and precisa_humano = true;
      insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
      select s.id, r.conversa_id, r.organizacao_id, 'sessao_criada', jsonb_build_object('canal_id', p_canal, 'retomada', true, 'dias_parado', r.dias)
      from public.ia_sessoes s where s.conversa_id = r.conversa_id;
      v_n := v_n + 1;
    end if;
  end loop;

  return jsonb_build_object('dry_run', false, 'criadas', v_criadas, 'espaco_min', p_espaco_min, 'amostra', coalesce(v_amostra, '[]'::jsonb));
end $fn$;

create or replace function public.ia_sdr_watchdog()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_atrasadas integer;
  v_erros_1h integer; v_quota_1h integer; v_envio_1h integer; v_guardrail_1h integer;
  v_aguardando_2h integer; v_falhas_altas integer;
  v_resumo jsonb; v_org uuid;
begin
  select organizacao_id into v_org from public.ia_sessoes order by criado_em desc limit 1;
  if v_org is null then return jsonb_build_object('sem_sessoes', true); end if;

  update public.ia_canal_locks set lock_until = now()
    where lock_until < now() - interval '30 minutes' or lock_until > now() + interval '1 hour';

  select count(*) into v_atrasadas from public.ia_sessoes
  where status = 'ativa' and organizacao_id = v_org
    and processar_apos is not null and processar_apos < now() - interval '15 minutes';

  select count(*) filter (where tipo = 'gemini_erro'),
         count(*) filter (where tipo = 'quota_gemini'),
         count(*) filter (where tipo = 'envio_falhou'),
         count(*) filter (where tipo = 'guardrail_bloqueou')
    into v_erros_1h, v_quota_1h, v_envio_1h, v_guardrail_1h
  from public.ia_eventos where organizacao_id = v_org and criado_em > now() - interval '1 hour';

  select count(*) into v_aguardando_2h from public.ia_sessoes
  where status = 'ativa' and organizacao_id = v_org
    and dados->>'aguardando_humano' is not null and atualizado_em < now() - interval '2 hours';

  select count(*) into v_falhas_altas from public.ia_sessoes
  where status = 'ativa' and organizacao_id = v_org and coalesce((dados->>'falhas_tecnicas')::int, 0) >= 3;

  v_resumo := jsonb_build_object(
    'atrasadas_15min', v_atrasadas, 'gemini_erro_1h', v_erros_1h, 'quota_1h', v_quota_1h,
    'envio_falhou_1h', v_envio_1h, 'guardrail_1h', v_guardrail_1h,
    'aguardando_humano_2h', v_aguardando_2h, 'falhas_tecnicas_altas', v_falhas_altas);

  if v_atrasadas > 0 or v_erros_1h >= 5 or v_quota_1h > 0 or v_envio_1h > 0
     or v_aguardando_2h > 0 or v_falhas_altas > 0 then
    insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
    values (null, 'ia_watchdog', 'ia_sessoes', null, v_resumo, v_org);
  end if;
  return v_resumo;
end $fn$;
