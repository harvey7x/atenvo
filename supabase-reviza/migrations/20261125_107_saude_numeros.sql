-- 107 · SAÚDE DOS NÚMEROS DE WHATSAPP do Atendimento (25/11, "algo melhor que" o sistema que a Reviza usava antes: lá
-- só aparecia "conectado/desconectado"). Para cada número: o que saiu, o que falhou e o que chegou hoje e nos últimos
-- 7 dias, quando chegou a última mensagem, e quantos clientes que A GENTE chamou responderam (WhatsApp bloqueia número
-- que manda muito para quem não responde). A tela (Configurações › WhatsApp) junta isso numa nota: boa, atenção ou risco,
-- com o motivo — inclusive o número "conectado, mas nada chega" (o travamento de 24/10 no Atenvo).
-- A mensagem conta para o número pelo qual a conversa falou por último (conversas.ultimo_canal_id, senão canal_id).
-- Só leitura: uma função, nenhuma tabela. Só o administrador. ADITIVA. Depende da 93 e da 97 (atd_minutos_uteis).
create or replace function public.atd_saude_numeros()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org  uuid := 'a1fa0000-0000-4000-8000-000000000001';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_at_least('admin') then raise exception 'sem_permissao'; end if;
  return coalesce((
    with cn as (
      select c.id, c.nome_interno, c.numero_conectado, c.status_integracao::text as status, c.envio_restrito, c.entrega_status
        from public.canais c
       where c.organizacao_id = v_org and c.tipo::text = 'whatsapp' and c.ativo
    ),
    m as (
      select coalesce(cv.ultimo_canal_id, cv.canal_id) as canal_id, mm.conversa_id, mm.direcao::text as dir, mm.status::text as st,
             case when mm.direcao::text = 'entrada' then coalesce(mm.recebida_em, mm.criado_em) else coalesce(mm.enviada_em, mm.criado_em) end as ts
        from public.mensagens mm
        join public.conversas cv on cv.id = mm.conversa_id
       where mm.organizacao_id = v_org and mm.criado_em >= now() - interval '8 days'
         and mm.tipo::text not in ('sistema', 'nota_interna')
    ),
    dia as (
      select canal_id, (ts at time zone 'America/Sao_Paulo')::date as d,
             count(*) filter (where dir = 'saida') as env,
             count(*) filter (where dir = 'saida' and st = 'falhou') as fal,
             count(*) filter (where dir = 'entrada') as rec
        from m where ts >= ((v_hoje - 6)::timestamp at time zone 'America/Sao_Paulo')
       group by 1, 2
    ),
    -- conversas que a gente CHAMOU nos 7 dias (a nossa mensagem veio antes de qualquer uma do cliente) e se ele respondeu
    chamadas as (
      select canal_id, conversa_id,
             min(ts) filter (where dir = 'saida' and st <> 'falhou') as nossa,
             min(ts) filter (where dir = 'entrada') as dele_primeira,
             max(ts) filter (where dir = 'entrada') as dele_ultima
        from m where ts >= now() - interval '7 days'
       group by 1, 2
    ),
    ult as (
      select canal_id, max(ts) filter (where dir = 'entrada') as rec, max(ts) filter (where dir = 'saida' and st <> 'falhou') as env
        from m group by 1
    )
    select jsonb_agg(jsonb_build_object(
             'canal_id', cn.id, 'nome', cn.nome_interno, 'numero', cn.numero_conectado, 'status', cn.status,
             'envio_restrito', cn.envio_restrito, 'entrega_status', cn.entrega_status,
             'hoje', jsonb_build_object('enviadas', coalesce(h.env, 0), 'falharam', coalesce(h.fal, 0), 'recebidas', coalesce(h.rec, 0)),
             'ultima_recebida', u.rec, 'ultima_enviada', u.env,
             'sem_receber_min_uteis', case when u.rec is null then null else round(public.atd_minutos_uteis(u.rec, now()))::int end,
             'recebidas_7d', (select coalesce(sum(x.rec), 0) from dia x where x.canal_id = cn.id),
             'enviadas_7d', (select coalesce(sum(x.env), 0) from dia x where x.canal_id = cn.id),
             'falharam_7d', (select coalesce(sum(x.fal), 0) from dia x where x.canal_id = cn.id),
             'chamadas_7d', (select count(*) from chamadas k where k.canal_id = cn.id and k.nossa is not null and (k.dele_primeira is null or k.dele_primeira > k.nossa)),
             'responderam_7d', (select count(*) from chamadas k where k.canal_id = cn.id and k.nossa is not null and (k.dele_primeira is null or k.dele_primeira > k.nossa) and k.dele_ultima > k.nossa),
             'serie', (select jsonb_agg(jsonb_build_object('dia', g.d::date, 'enviadas', coalesce(x.env, 0), 'falharam', coalesce(x.fal, 0), 'recebidas', coalesce(x.rec, 0)) order by g.d)
                         from generate_series(v_hoje - 6, v_hoje, interval '1 day') g(d)
                         left join dia x on x.canal_id = cn.id and x.d = g.d::date)
           ) order by cn.nome_interno)
      from cn
      left join dia h on h.canal_id = cn.id and h.d = v_hoje
      left join ult u on u.canal_id = cn.id
  ), '[]'::jsonb);
end $$;
revoke all on function public.atd_saude_numeros() from public, anon;
grant execute on function public.atd_saude_numeros() to authenticated, service_role;
comment on function public.atd_saude_numeros() is 'Saúde dos números de WhatsApp do Atendimento (hoje, 7 dias, quem respondeu). Só administrador. Migration 107.';

-- DESFAZER:
--   drop function if exists public.atd_saude_numeros();
