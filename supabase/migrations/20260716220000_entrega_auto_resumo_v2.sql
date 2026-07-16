-- ============================================================================
-- wa_entrega_auto_resumo v2 — diagnóstico correto de PENDING/timeout/erro.
--
-- Mudanças (espelham wa-health-check/agenda.ts):
--  1. Só considera o monitoramento OFICIAL: tipo='entrega_automatica' E destino 2825.
--     (o probe antigo grava o número cru '5551998872825'; o automático grava mascarado '••••2825'
--      — aceitamos os dois, mas NADA de outro destino entra na conta.)
--  2. TIMEOUT ≠ ERROR: timeout repetido vira 'instavel'; 'restrito' exige ERROR REAL repetido.
--  3. Saúde pelos ÚLTIMOS 5 testes concluídos (não pelo total da hora): 4-5 saudável · 3 atenção ·
--     1-2 instável · 0 → restrito só se houver ERROR real; se for só timeout ⇒ instável.
--  4. Pausa também por 3 timeouts seguidos.
--  5. Expõe pendente_recente (aguardando ACK < 5 min) p/ a UI não oferecer teste duplicado.
-- ============================================================================

create or replace function public.wa_entrega_auto_resumo(p_org uuid)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare r jsonb;
begin
  if not (public.is_member(p_org) or public.is_platform_admin()) then
    raise exception 'sem_acesso' using errcode = 'insufficient_privilege';
  end if;

  with canal as (
    select c.id, c.nome_interno, c.status_integracao::text as status_integracao, c.ativo,
           c.conflito_com, c.instancia_externa, c.envio_restrito
    from canais c
    where c.organizacao_id = p_org and c.tipo = 'whatsapp' and c.status_integracao <> 'removido'
  ),
  elegivel as (
    select k.*, (k.status_integracao = 'conectado' and k.ativo and k.conflito_com is null
                 and k.instancia_externa is not null and not k.envio_restrito) as apto
    from canal k
  ),
  -- SOMENTE o monitoramento oficial (tipo + destino 2825). Qualquer outro destino fica de fora.
  oficial as (
    select h.* from canal_health_runs h
    where h.tipo = 'entrega_automatica'
      and h.canal_id in (select id from canal)
      and (h.target_phone like '%2825')
  ),
  concl as (   -- concluídos, do mais recente p/ o mais antigo
    select o.canal_id, o.status_resultado, o.executado_em,
           row_number() over (partition by o.canal_id order by o.executado_em desc) as rn
    from oficial o where o.status_resultado <> 'aguardando_ack'
  ),
  janela as (  -- últimos 5 concluídos
    select c2.canal_id,
      count(*) filter (where c2.status_resultado in ('entregue','lida')) as entregues5,
      count(*) filter (where c2.status_resultado = 'ERROR')              as erros5,
      count(*) filter (where c2.status_resultado = 'timeout')            as timeouts5,
      count(*)                                                            as total5
    from concl c2 where c2.rn <= 5 group by c2.canal_id
  ),
  pausa as (
    select c3.canal_id,
      case when (count(*) filter (where c3.rn <= 3 and c3.status_resultado = 'ERROR') = 3)
                or (count(*) filter (where c3.rn <= 3 and c3.status_resultado = 'timeout') = 3)
                or (count(*) filter (where c3.rn <= 5) = 5
                    and count(*) filter (where c3.rn <= 5 and c3.status_resultado in ('entregue','lida')) = 0)
           then max(c3.executado_em) filter (where c3.rn = 1) + interval '1 hour'
      end as pausado_ate
    from concl c3 group by c3.canal_id
  ),
  hora as (
    select o.canal_id,
      count(*) filter (where o.status_resultado in ('entregue','lida')) as entregues,
      count(*) filter (where o.status_resultado not in ('entregue','lida','aguardando_ack')) as falhas,
      count(*) as total
    from oficial o where o.executado_em > now() - interval '1 hour' group by o.canal_id
  ),
  pendente as (  -- aguardando ACK há menos de 5 min ⇒ não oferecer novo teste
    select o.canal_id, bool_or(o.executado_em > now() - interval '5 minutes') as recente
    from oficial o where o.status_resultado = 'aguardando_ack' group by o.canal_id
  ),
  ultimo as (
    select distinct on (o.canal_id) o.canal_id, o.executado_em, o.status_resultado, o.latencia_ms, o.target_phone
    from oficial o order by o.canal_id, o.executado_em desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'canal_id', e.id,
    'canal', e.nome_interno,
    'apto', e.apto,
    'pausado_ate', p.pausado_ate,
    'estado', case when not e.apto then 'inativo'
                   when p.pausado_ate is not null and p.pausado_ate > now() then 'pausado'
                   else 'ativo' end,
    'destino', '••••2825',
    'frequencia_hora', 5,
    'pendente_recente', coalesce(pe.recente, false),
    'ultimo_em', ul.executado_em,
    'ultimo_resultado', ul.status_resultado,
    'ultimo_latencia_ms', ul.latencia_ms,
    'entregues_1h', coalesce(hr.entregues, 0),
    'falhas_1h', coalesce(hr.falhas, 0),
    'total_1h', coalesce(hr.total, 0),
    'entregues_5', coalesce(ja.entregues5, 0),
    'erros_5', coalesce(ja.erros5, 0),
    'timeouts_5', coalesce(ja.timeouts5, 0),
    -- Saúde pelos ÚLTIMOS 5 concluídos. Timeout NÃO vira restrito: restrito exige ERROR real.
    'saude', case
        when not e.apto then 'inativo'
        when coalesce(ja.total5, 0) = 0 then 'sem_dados'
        when coalesce(ja.entregues5, 0) >= 4 then 'saudavel'
        when coalesce(ja.entregues5, 0) = 3 then 'atencao'
        when coalesce(ja.entregues5, 0) >= 1 then 'instavel'
        when coalesce(ja.erros5, 0) >= 3 then 'restrito'      -- 0 entregas + ERROR real repetido
        else 'instavel'                                        -- 0 entregas por timeout ⇒ instável
      end
  ) order by e.nome_interno), '[]'::jsonb) into r
  from elegivel e
  left join pausa p on p.canal_id = e.id
  left join hora hr on hr.canal_id = e.id
  left join janela ja on ja.canal_id = e.id
  left join pendente pe on pe.canal_id = e.id
  left join ultimo ul on ul.canal_id = e.id;

  return r;
end $function$;

revoke execute on function public.wa_entrega_auto_resumo(uuid) from public, anon;
grant execute on function public.wa_entrega_auto_resumo(uuid) to authenticated, service_role;
