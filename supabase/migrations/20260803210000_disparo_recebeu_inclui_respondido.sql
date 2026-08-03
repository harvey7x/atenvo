-- ─────────────────────────────────────────────────────────────────────────────
-- FIX: "já recebeu" tem que incluir status='respondido'.
-- O cloud-webhook promove o alvo de 'enviado' → 'respondido' quando o contato
-- responde (handoff pro humano). Quem respondeu OBVIAMENTE recebeu — mas as
-- funções de 2026-08-03 só contavam 'enviado', então esses sumiam do histórico
-- e do filtro/badge. enviado_em continua preenchido no respondido, então
-- max()/order by seguem válidos. Passamos a contar status in ('enviado','respondido').
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.disparo_elegiveis(uuid);

create or replace function public.disparo_elegiveis(p_org uuid)
returns table (
  contato_id uuid, nome text, telefone text,
  etapa text, etapa_ordem int,
  tipo_servico text, canal_origem text,
  ultima_msg_em timestamptz, optout boolean,
  ja_recebeu boolean, ultimo_disparo_em timestamptz, ultima_campanha text
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
  ),
  disp as (
    select distinct on (da.contato_id)
           da.contato_id, da.enviado_em, dc.nome as campanha
    from public.disparo_alvos da
    join public.disparo_campanhas dc on dc.id = da.campanha_id
    where dc.organizacao_id = p_org and da.status in ('enviado', 'respondido')
      and da.contato_id in (select b.contato_id from base b)
    order by da.contato_id, da.enviado_em desc nulls last
  )
  select b.contato_id, co.nome, wa.valor_normalizado, b.etapa, b.etapa_ordem,
         nullif(btrim(coalesce(b.tipo_servico, '')), '') as tipo_servico,
         ca.nome_interno as canal_origem,
         f.ultima,
         exists (select 1 from public.wa_optout w where w.contato_id = b.contato_id) as optout,
         (d.contato_id is not null) as ja_recebeu,
         d.enviado_em as ultimo_disparo_em,
         d.campanha   as ultima_campanha
  from base b
  join public.contatos co on co.id = b.contato_id and co.mesclado_em is null
  join falou f on f.contato_id = b.contato_id
  join wa on wa.contato_id = b.contato_id
  left join public.canais ca on ca.id = b.canal_origem_id
  left join disp d on d.contato_id = b.contato_id
  where public.papel_na_org(p_org) is not null
  order by b.etapa_ordem, f.ultima desc;
$fn$;
revoke all on function public.disparo_elegiveis(uuid) from public, anon;
grant execute on function public.disparo_elegiveis(uuid) to authenticated, service_role;

create or replace function public.disparo_contatados(p_org uuid)
returns table (
  contato_id uuid, nome text, telefone text,
  total_disparos int, ultimo_em timestamptz,
  ultima_campanha text, optout boolean
)
language sql stable security definer set search_path = public as $fn$
  with env as (
    select da.contato_id,
           count(*)::int      as total,
           max(da.enviado_em) as ultimo_em
    from public.disparo_alvos da
    join public.disparo_campanhas dc on dc.id = da.campanha_id
    where dc.organizacao_id = p_org and da.status in ('enviado', 'respondido')
    group by da.contato_id
  ),
  ult as (
    select distinct on (da.contato_id) da.contato_id, dc.nome as campanha
    from public.disparo_alvos da
    join public.disparo_campanhas dc on dc.id = da.campanha_id
    where dc.organizacao_id = p_org and da.status in ('enviado', 'respondido')
    order by da.contato_id, da.enviado_em desc nulls last
  ),
  wa as (
    select distinct on (ci.contato_id) ci.contato_id, ci.valor_normalizado
    from public.contato_identidades ci
    where ci.tipo = 'whatsapp' and coalesce(ci.valor_normalizado, '') <> ''
      and ci.contato_id in (select e.contato_id from env e)
    order by ci.contato_id
  )
  select e.contato_id, co.nome, wa.valor_normalizado,
         e.total, e.ultimo_em, u.campanha,
         exists (select 1 from public.wa_optout w where w.contato_id = e.contato_id) as optout
  from env e
  join public.contatos co on co.id = e.contato_id and co.mesclado_em is null
  left join ult u on u.contato_id = e.contato_id
  left join wa  on wa.contato_id = e.contato_id
  where public.papel_na_org(p_org) is not null
  order by e.ultimo_em desc nulls last;
$fn$;
revoke all on function public.disparo_contatados(uuid) from public, anon;
grant execute on function public.disparo_contatados(uuid) to authenticated, service_role;
