-- Endurece a confirmação do wa_lid_map: um mapeamento LID->PN só é 'confirmado' quando há EVIDÊNCIA FORTE
-- = o mesmo contato possui a identidade evolution_lid (o LID) E uma identidade whatsapp (o PN) igual ao
-- telefone_normalizado do mapa. Ou seja, o próprio WhatsApp associou LID e PN no mesmo contato/conversa.
-- O backfill inicial confirmou por "contatos.telefone not null", o que é fraco (o telefone pode ter vindo
-- por outra via). Aqui rebaixamos esses casos para confirmado=false (mantendo o registro; nunca apagamos e
-- nunca inventamos telefone). O webhook só reutiliza mapas confirmados=true para envio.
update public.wa_lid_map m
set confirmado = false
where m.confirmado = true
  and m.telefone_normalizado is not null
  and not exists (
    select 1
    from public.contato_identidades lidid
    join public.contato_identidades wa
      on wa.contato_id = lidid.contato_id and wa.tipo = 'whatsapp'
    where lidid.organizacao_id = m.organizacao_id
      and lidid.provedor = 'evolution_lid'
      and lidid.valor_normalizado = m.lid
      and wa.valor_normalizado = m.telefone_normalizado
  );
