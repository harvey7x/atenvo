-- IA SDR — retomada de leads parados + vigia automático (pré-go-live).
--
-- ia_sdr_retomar_leads: cria ia_sessoes para conversas em que o fluxo caf_emprestimo_v1
-- COMPLETOU (fecho no CPF) e NENHUM humano deu continuidade. p_dry_run=true (default) só
-- LISTA; a execução real espaça as aberturas (p_espaco_min) para proteger o chip, e o
-- worker respeita a janela 07:30–21:30 sozinho. NUNCA é chamada por cron — só manualmente,
-- com aprovação explícita do dono para aquele lote.
create or replace function public.ia_sdr_retomar_leads(
  p_canal uuid,
  p_dias_max integer default 30,
  p_limite integer default 20,
  p_espaco_min integer default 4,
  p_responsavel uuid default null,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_criadas integer := 0;
  v_amostra jsonb;
  v_total integer;
  r record;
  v_n integer := 0;
begin
  drop table if exists _alvos;   -- permite 2+ chamadas na mesma transação (dry-run comparativo)
  create temp table _alvos on commit drop as
  select e.conversa_id, c.contato_id, c.organizacao_id, e.oportunidade_id, e.concluido_em,
         ct.nome, right(coalesce(ct.telefone, ''), 4) as tel4,
         extract(day from now() - e.concluido_em)::int as dias
  from public.bot_conversa_estado e
  join public.conversas c on c.id = e.conversa_id
  join public.contatos ct on ct.id = c.contato_id
  where e.concluido_em > now() - make_interval(days => greatest(p_dias_max, 1))
    and e.dados_qualificacao->>'passo_emprestimo' = 'fim'
    and c.status <> 'fechada'
    and (p_responsavel is null or ct.responsavel_id = p_responsavel)
    and not exists (select 1 from public.ia_sessoes s where s.conversa_id = e.conversa_id)
    and not exists (select 1 from public.wa_optout w where w.contato_id = c.contato_id)
    -- NENHUMA resposta humana depois do fecho (painel: autor_id; celular: origem='telefone')
    and not exists (
      select 1 from public.mensagens m
      where m.conversa_id = e.conversa_id and m.direcao = 'saida' and m.criado_em > e.concluido_em
        and m.tipo not in ('sistema', 'nota_interna')
        and (m.autor_id is not null or m.origem = 'telefone')
    )
  order by e.concluido_em desc
  limit greatest(p_limite, 0);

  select count(*), jsonb_agg(jsonb_build_object('nome', nome, 'tel_final', tel4, 'dias_parado', dias) order by concluido_em desc)
    into v_total, v_amostra from _alvos;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'canal', p_canal, 'elegiveis', coalesce(v_total, 0), 'amostra', coalesce(v_amostra, '[]'::jsonb));
  end if;

  for r in select * from _alvos loop
    insert into public.ia_sessoes (organizacao_id, canal_id, conversa_id, contato_id, oportunidade_id,
                                   etapa, status, processar_apos, dados)
    values (r.organizacao_id, p_canal, r.conversa_id, r.contato_id, r.oportunidade_id,
            'qualificacao_inss', 'ativa',
            now() + make_interval(mins => v_n * greatest(p_espaco_min, 1)),
            jsonb_build_object('retomada', true, 'retomada_dias', r.dias))
    on conflict (conversa_id) do nothing;
    if found then
      v_criadas := v_criadas + 1;
      insert into public.ia_eventos (sessao_id, conversa_id, organizacao_id, tipo, detalhe)
      select s.id, r.conversa_id, r.organizacao_id, 'sessao_criada', jsonb_build_object('canal_id', p_canal, 'retomada', true, 'dias_parado', r.dias)
      from public.ia_sessoes s where s.conversa_id = r.conversa_id;
      v_n := v_n + 1;
    end if;
  end loop;

  return jsonb_build_object('dry_run', false, 'criadas', v_criadas, 'espaco_min', p_espaco_min, 'amostra', coalesce(v_amostra, '[]'::jsonb));
end $fn$;
revoke all on function public.ia_sdr_retomar_leads(uuid, integer, integer, integer, uuid, boolean) from public, anon, authenticated;
grant execute on function public.ia_sdr_retomar_leads(uuid, integer, integer, integer, uuid, boolean) to service_role;

-- ia_sdr_watchdog: vigia de 10 em 10 minutos, DENTRO do sistema (não depende de ninguém acordado):
--  * destrava sessão ativa com processar_apos vencido há >15min (claim órfão / worker que morreu);
--  * solta lease de canal vencida;
--  * conta anomalias da última hora (gemini_erro, quota, envio_falhou, guardrail) e sessões com
--    colega chamado há >2h sem humano assumir;
--  * quando há algo relevante, grava audit_log acao='ia_watchdog' (visível e consultável).
create or replace function public.ia_sdr_watchdog()
returns jsonb
language plpgsql security definer set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_destravadas integer;
  v_erros_1h integer; v_quota_1h integer; v_envio_1h integer; v_guardrail_1h integer;
  v_aguardando_2h integer; v_falhas_altas integer;
  v_resumo jsonb; v_org uuid;
begin
  with d as (
    update public.ia_sessoes set processar_apos = now(), atualizado_em = now()
    where status = 'ativa' and processar_apos is not null and processar_apos < now() - interval '15 minutes'
    returning 1
  ) select count(*) into v_destravadas from d;

  update public.ia_canal_locks set lock_until = now() where lock_until < now() - interval '30 minutes';

  select count(*) filter (where tipo = 'gemini_erro'),
         count(*) filter (where tipo = 'quota_gemini'),
         count(*) filter (where tipo = 'envio_falhou'),
         count(*) filter (where tipo = 'guardrail_bloqueou')
    into v_erros_1h, v_quota_1h, v_envio_1h, v_guardrail_1h
  from public.ia_eventos where criado_em > now() - interval '1 hour';

  select count(*) into v_aguardando_2h from public.ia_sessoes
  where status = 'ativa' and dados->>'aguardando_humano' is not null
    and atualizado_em < now() - interval '2 hours';

  select count(*) into v_falhas_altas from public.ia_sessoes
  where status = 'ativa' and coalesce((dados->>'falhas_tecnicas')::int, 0) >= 3;

  v_resumo := jsonb_build_object(
    'destravadas', v_destravadas, 'gemini_erro_1h', v_erros_1h, 'quota_1h', v_quota_1h,
    'envio_falhou_1h', v_envio_1h, 'guardrail_1h', v_guardrail_1h,
    'aguardando_humano_2h', v_aguardando_2h, 'falhas_tecnicas_altas', v_falhas_altas);

  if v_destravadas > 0 or v_erros_1h >= 5 or v_quota_1h > 0 or v_envio_1h > 0
     or v_aguardando_2h > 0 or v_falhas_altas > 0 then
    select organizacao_id into v_org from public.ia_sessoes limit 1;
    insert into public.audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
    values (null, 'ia_watchdog', 'ia_sessoes', null, v_resumo, coalesce(v_org, 'de300000-0000-4000-8000-000000000001'));
  end if;
  return v_resumo;
end $fn$;
revoke all on function public.ia_sdr_watchdog() from public, anon, authenticated;
grant execute on function public.ia_sdr_watchdog() to service_role;

select cron.schedule('ia-sdr-watchdog', '*/10 * * * *', $cron$ select public.ia_sdr_watchdog(); $cron$);
