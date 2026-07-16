-- ============================================================================
-- Painel de MONITORAMENTO AUTOMÁTICO DE ENTREGA na tela de Integrações.
--
-- Fonte única p/ o card de cada canal: status (saudável/atenção/instável/restrito/pausado/inativo),
-- destino mascarado, frequência, último teste/resultado, entregues/falhas na última hora e próximo teste.
--
-- Sem coluna nova: tudo derivado de canal_health_runs (tipo='entrega_automatica') + canais.
-- A PAUSA é calculada do histórico (3 ERROR seguidos ou 0 entregas em 5) e expira sozinha em 1h —
-- espelha a mesma regra do wa-health-check/agenda.ts.
--
-- Segurança: SECURITY DEFINER com guard is_member(p_org) + search_path fixo; EXECUTE revogado de
-- anon/public (disciplina do P0) e concedido só a authenticated/service_role.
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
           c.conflito_com, c.instancia_externa, c.envio_restrito, c.entrega_status
    from canais c
    where c.organizacao_id = p_org and c.tipo = 'whatsapp' and c.status_integracao <> 'removido'
  ),
  elegivel as (
    select k.*,
      (k.status_integracao = 'conectado' and k.ativo and k.conflito_com is null
       and k.instancia_externa is not null and not k.envio_restrito) as apto
    from canal k
  ),
  -- últimos runs concluídos por canal (p/ regra de pausa)
  ult as (
    select h.canal_id, h.status_resultado, h.executado_em,
           row_number() over (partition by h.canal_id order by h.executado_em desc) as rn
    from canal_health_runs h
    where h.tipo = 'entrega_automatica' and h.status_resultado <> 'aguardando_ack'
      and h.canal_id in (select id from canal)
  ),
  pausa as (
    select u.canal_id,
      -- 3 ERROR seguidos OU 0 entregas nos últimos 5 concluídos
      case when (count(*) filter (where u.rn <= 3 and u.status_resultado = 'ERROR') = 3
                 and count(*) filter (where u.rn <= 3) = 3)
                or (count(*) filter (where u.rn <= 5) = 5
                    and count(*) filter (where u.rn <= 5 and u.status_resultado in ('entregue','lida')) = 0)
           then max(u.executado_em) filter (where u.rn = 1) + interval '1 hour'
      end as pausado_ate
    from ult u group by u.canal_id
  ),
  -- janela de 1h
  hora as (
    select h.canal_id,
      count(*) filter (where h.status_resultado in ('entregue','lida')) as entregues,
      count(*) filter (where h.status_resultado not in ('entregue','lida','aguardando_ack')) as falhas,
      count(*) as total
    from canal_health_runs h
    where h.tipo = 'entrega_automatica' and h.executado_em > now() - interval '1 hour'
      and h.canal_id in (select id from canal)
    group by h.canal_id
  ),
  ultimo as (
    select distinct on (h.canal_id) h.canal_id, h.executado_em, h.status_resultado, h.latencia_ms, h.target_phone
    from canal_health_runs h
    where h.tipo = 'entrega_automatica' and h.canal_id in (select id from canal)
    order by h.canal_id, h.executado_em desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'canal_id', e.id,
    'canal', e.nome_interno,
    'apto', e.apto,
    'pausado_ate', p.pausado_ate,
    'estado', case
        when not e.apto then 'inativo'
        when p.pausado_ate is not null and p.pausado_ate > now() then 'pausado'
        else 'ativo' end,
    'destino', coalesce(ul.target_phone, '••••2825'),
    'frequencia_hora', 5,
    'ultimo_em', ul.executado_em,
    'ultimo_resultado', ul.status_resultado,
    'ultimo_latencia_ms', ul.latencia_ms,
    'entregues_1h', coalesce(hr.entregues, 0),
    'falhas_1h', coalesce(hr.falhas, 0),
    'total_1h', coalesce(hr.total, 0),
    -- saúde pela janela de 1h (5 testes esperados)
    'saude', case
        when not e.apto then 'inativo'
        when p.pausado_ate is not null and p.pausado_ate > now() then 'restrito'
        when coalesce(hr.total, 0) = 0 then 'sem_dados'
        when coalesce(hr.entregues, 0) >= 5 then 'saudavel'
        when coalesce(hr.entregues, 0) >= 3 then 'atencao'
        when coalesce(hr.entregues, 0) >= 1 then 'instavel'
        else 'restrito' end
  ) order by e.nome_interno), '[]'::jsonb) into r
  from elegivel e
  left join pausa p on p.canal_id = e.id
  left join hora hr on hr.canal_id = e.id
  left join ultimo ul on ul.canal_id = e.id;

  return r;
end $function$;

-- P0: nada de EXECUTE herdado por PUBLIC/anon. Só usuário autenticado (a função já valida is_member).
revoke execute on function public.wa_entrega_auto_resumo(uuid) from public, anon;
grant execute on function public.wa_entrega_auto_resumo(uuid) to authenticated, service_role;
