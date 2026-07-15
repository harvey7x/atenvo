-- Fase 2 do health check de ENTREGA: número interno/autorizado que recebe o teste de entrega REAL.
-- Nunca é cliente. O probe (wa-health-check tipo=entrega) envia "Teste de entrega Atenvo — não responder"
-- para este número e confirma a entrega pelo ACK real (DELIVERY_ACK/READS vs ERROR) via evolution-webhook.
alter table public.canais
  add column if not exists entrega_teste_phone text;

comment on column public.canais.entrega_teste_phone is
  'Número INTERNO/autorizado (E.164 sem +, ex.: 5551998872825) que recebe o teste ativo de ENTREGA. Nunca cliente. Vazio = probe desativado para o canal.';

-- Configura o canal LUIZA com o número interno autorizado (51998872825 -> DDI 55 -> 5551998872825).
update public.canais set entrega_teste_phone = '5551998872825'
where organizacao_id = 'de300000-0000-4000-8000-000000000001' and nome_interno = 'LUIZA' and tipo = 'whatsapp';
