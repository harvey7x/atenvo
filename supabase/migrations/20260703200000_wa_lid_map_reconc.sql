-- Reconciliação de evidência FORTE (complementa 190000, que apenas rebaixou confirmações fracas).
-- Em produção, eventos reais com PN resolveram vários LIDs via #7 (identidade whatsapp no mesmo contato)
-- APÓS o backfill, deixando: (a) mapas ainda não confirmados apesar de já haver PN forte; (b) contatos
-- resolvidos porém com nome/estado ainda em "Identidade protegida"/lid_pendente. Corrige ambos por EVIDÊNCIA
-- (identidade whatsapp = PN + identidade evolution_lid = LID no MESMO contato). Sem inventar telefone.

-- (a) CONFIRMA o mapa quando o contato do LID já tem identidade whatsapp (PN) — evidência forte.
update public.wa_lid_map m
set telefone_normalizado = ev.pn,
    jid_telefone = coalesce(m.jid_telefone, ev.jid),
    confirmado = true
from (
  select lidid.organizacao_id as org, lidid.valor_normalizado as lid,
         wa.valor_normalizado as pn, wa.valor as jid
  from public.contato_identidades lidid
  join public.contato_identidades wa
    on wa.contato_id = lidid.contato_id and wa.tipo = 'whatsapp' and wa.principal = true
  where lidid.provedor = 'evolution_lid' and lidid.valor_normalizado is not null and wa.valor_normalizado is not null
) ev
where m.organizacao_id = ev.org and m.lid = ev.lid
  and (m.confirmado = false or m.telefone_normalizado is null)
  -- não sobrescreve um PN confirmado DIFERENTE já presente no mapa (mantém conflito p/ revisão)
  and (m.telefone_normalizado is null or m.telefone_normalizado = ev.pn);

-- (b) CORRIGE contatos já resolvidos (têm telefone) cujo nome/estado ficou como placeholder LID.
update public.contatos c
set nome = coalesce(
      (select ci.valor_normalizado from public.contato_identidades ci where ci.contato_id = c.id and ci.tipo = 'whatsapp' order by ci.principal desc limit 1),
      c.telefone),
    identidade_tipo = 'telefone',
    identidade_resolvida_em = coalesce(c.identidade_resolvida_em, now()),
    identidade_fonte = coalesce(c.identidade_fonte, 'backfill_reconc')
where c.telefone is not null and c.nome = 'Identidade protegida';
