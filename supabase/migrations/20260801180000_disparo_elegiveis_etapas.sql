-- Disparo: seleção por ETAPA do Kanban. A elegibilidade deixa de ser fixa em
-- REMARKETING/LEAD NOVO: qualquer coluna ABERTA (resultado='neutro') entra, e a
-- tela filtra por etapa (multi-seleção). Critérios de pessoa continuam iguais:
-- conversa real (≥1 msg recebida) + WhatsApp válido; opt-out vem marcado.
-- Retorno mudou (origem → etapa/etapa_ordem) ⇒ drop antes de recriar.
drop function if exists public.disparo_elegiveis(uuid);

create or replace function public.disparo_elegiveis(p_org uuid)
returns table (
  contato_id uuid, nome text, telefone text,
  etapa text, etapa_ordem int,
  ultima_msg_em timestamptz, optout boolean
)
language sql stable security definer set search_path = public as $fn$
  with base as (
    -- 1 linha por contato: se tem opp em mais de uma coluna, vale a MAIS RECENTE
    select distinct on (o.contato_id) o.contato_id, fc.nome as etapa, fc.ordem as etapa_ordem
    from public.oportunidades o
    join public.funil_colunas fc on fc.id = o.coluna_id
    where o.organizacao_id = p_org
      and o.status = 'em_andamento'
      and fc.resultado = 'neutro'                       -- nunca FECHADO/PERDIDO
      and fc.arquivada = false
    order by o.contato_id, o.atualizado_em desc
  ),
  falou as (
    select c.contato_id, max(m.criado_em) as ultima
    from public.conversas c
    join public.mensagens m on m.conversa_id = c.id and m.direcao = 'entrada'
    where c.contato_id in (select b.contato_id from base b)
    group by c.contato_id
  ),
  wa as (
    select distinct on (ci.contato_id) ci.contato_id, ci.valor_normalizado
    from public.contato_identidades ci
    where ci.tipo = 'whatsapp' and coalesce(ci.valor_normalizado, '') <> ''
      and ci.contato_id in (select b.contato_id from base b)
    order by ci.contato_id
  )
  select b.contato_id, co.nome, wa.valor_normalizado, b.etapa, b.etapa_ordem, f.ultima,
         exists (select 1 from public.wa_optout w where w.contato_id = b.contato_id) as optout
  from base b
  join public.contatos co on co.id = b.contato_id and co.mesclado_em is null
  join falou f on f.contato_id = b.contato_id
  join wa on wa.contato_id = b.contato_id
  where public.papel_na_org(p_org) is not null
  order by b.etapa_ordem, f.ultima desc;
$fn$;
revoke all on function public.disparo_elegiveis(uuid) from public, anon;
grant execute on function public.disparo_elegiveis(uuid) to authenticated, service_role;
