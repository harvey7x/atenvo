-- Telemetria de saúde por conexão WhatsApp (read-only). Sem segredos. Mascaramento de destino.
-- Chamada pela Edge Function wa-health (que valida auth/organização). Não classifica só por status_integracao.
create or replace function public.wa_health(p_org uuid)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(h order by nome), '[]'::jsonb)
  from (
    select c.nome_interno as nome, jsonb_build_object(
      'canal_id', c.id,
      'nome', c.nome_interno,
      'numero', c.numero_conectado,
      'status_integracao', c.status_integracao,
      'instancia', c.instancia_externa,
      'ativo', c.ativo,
      'criado_em', c.criado_em,
      'last_inbound', (select max(e.recebido_em) from whatsapp_webhook_events e where e.instance_name=c.instancia_externa and e.from_me=false),
      'last_webhook', (select max(e.recebido_em) from whatsapp_webhook_events e where e.instance_name=c.instancia_externa),
      'last_webhook_event', (select e.event from whatsapp_webhook_events e where e.instance_name=c.instancia_externa order by e.recebido_em desc limit 1),
      'last_delivered', (select max(coalesce(m.lida_em,m.entregue_em)) from mensagens m join conversas cv on cv.id=m.conversa_id where cv.canal_id=c.id and m.direcao='saida' and m.status in ('entregue','lida')),
      'last_error_at', (select max(e.recebido_em) from whatsapp_webhook_events e where e.instance_name=c.instancia_externa and e.event='messages.update' and e.payload->>'status'='ERROR'),
      'last_error_msg', (select m.erro_envio from mensagens m join conversas cv on cv.id=m.conversa_id where cv.canal_id=c.id and m.direcao='saida' and m.status='falhou' and m.erro_envio is not null order by m.criado_em desc limit 1),
      'last10', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'hora', s.recebido_em,
          'status', coalesce(u.fstatus, 'PENDING'),
          'destino', right(split_part(coalesce(s.dest,''),'@',1), 4),
          'erro', mm.erro_envio
        ) order by s.recebido_em desc), '[]'::jsonb)
        from (
          select e.payload->'key'->>'id' as keyid, e.recebido_em, e.remote_jid as dest
          from whatsapp_webhook_events e
          where e.instance_name=c.instancia_externa and e.event='send.message'
          order by e.recebido_em desc limit 10
        ) s
        left join lateral (
          select e2.payload->>'status' as fstatus from whatsapp_webhook_events e2
          where e2.instance_name=c.instancia_externa and e2.event='messages.update' and e2.payload->>'keyId'=s.keyid
          order by e2.recebido_em desc limit 1
        ) u on true
        left join lateral (
          select m.erro_envio from mensagens m where m.id_externo=s.keyid and m.status='falhou' limit 1
        ) mm on true
      )
    ) as h
    from canais c
    where c.organizacao_id = p_org and c.tipo='whatsapp'
  ) t;
$$;

revoke all on function public.wa_health(uuid) from public, anon;
grant execute on function public.wa_health(uuid) to authenticated, service_role;
notify pgrst, 'reload schema';
