-- Redesign da tela de Disparo: os cards precisam de contexto do lead — serviço de
-- interesse e canal de origem da oportunidade. Retorno muda ⇒ drop + recreate.
-- Regras de elegibilidade INALTERADAS (topo do funil, conversa real, WA válido).
drop function if exists public.disparo_elegiveis(uuid);

create or replace function public.disparo_elegiveis(p_org uuid)
returns table (
  contato_id uuid, nome text, telefone text,
  etapa text, etapa_ordem int,
  tipo_servico text, canal_origem text,
  ultima_msg_em timestamptz, optout boolean
)
language sql stable security definer set search_path = public as $fn$
  with base as (
    select distinct on (o.contato_id)
      o.contato_id, fc.nome as etapa, fc.ordem as etapa_ordem,
      o.tipo_servico, o.canal_origem_id
    from public.oportunidades o
    join public.funil_colunas fc on fc.id = o.coluna_id
    where o.organizacao_id = p_org
      and o.status = 'em_andamento'
      and fc.resultado = 'neutro'
      and fc.arquivada = false
      and (fc.entrada or fc.nome = 'REMARKETING')
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
  select b.contato_id, co.nome, wa.valor_normalizado, b.etapa, b.etapa_ordem,
         nullif(btrim(coalesce(b.tipo_servico, '')), '') as tipo_servico,
         ca.nome_interno as canal_origem,
         f.ultima,
         exists (select 1 from public.wa_optout w where w.contato_id = b.contato_id) as optout
  from base b
  join public.contatos co on co.id = b.contato_id and co.mesclado_em is null
  join falou f on f.contato_id = b.contato_id
  join wa on wa.contato_id = b.contato_id
  left join public.canais ca on ca.id = b.canal_origem_id
  where public.papel_na_org(p_org) is not null
  order by b.etapa_ordem, f.ultima desc;
$fn$;
revoke all on function public.disparo_elegiveis(uuid) from public, anon;
grant execute on function public.disparo_elegiveis(uuid) to authenticated, service_role;
