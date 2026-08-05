-- ─────────────────────────────────────────────────────────────────────────────
-- DISPARO — Fase 4 (painel profissional): 'fecharam' por campanha no resumo.
--
-- A lista de campanhas e a "visão geral" no topo precisam da taxa de FECHAMENTO,
-- então o disparo_campanhas_resumo passa a devolver fecharam (mesma regra do
-- disparo_campanha_resultado: oportunidade ganha com fechado_em > 1º envio da
-- pessoa, ancorado no log disparo_envios). Só uma coluna nova — nada quebra.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.disparo_campanhas_resumo(uuid);
create or replace function public.disparo_campanhas_resumo(p_org uuid)
returns table (
  id uuid, nome text, status text,
  template_id uuid, template_nome text,
  canal_id uuid, canal_nome text,
  teto_24h int, criado_em timestamptz,
  total int, pendentes int, enviados int, respondidos int,
  falhas int, optout int, pulados int, fecharam int,
  ultimo_envio timestamptz
)
language sql stable security definer set search_path = public as $fn$
  select c.id, c.nome, c.status,
         c.template_id, t.nome, c.canal_id, ca.nome_interno,
         c.teto_24h, c.criado_em,
         count(a.id)::int                                                        as total,
         count(a.id) filter (where a.status = 'pendente')::int                   as pendentes,
         count(a.id) filter (where a.status in ('enviado', 'respondido'))::int   as enviados,
         count(a.id) filter (where a.status = 'respondido')::int                 as respondidos,
         count(a.id) filter (where a.status = 'falhou')::int                     as falhas,
         count(a.id) filter (where a.status = 'optout')::int                     as optout,
         count(a.id) filter (where a.status = 'pulado')::int                     as pulados,
         (select count(distinct e.contato_id)::int
            from public.disparo_envios e
            where e.campanha_id = c.id
              and exists (
                select 1 from public.oportunidades o
                where o.contato_id = e.contato_id and o.status = 'ganho'
                  and o.fechado_em is not null
                  and o.fechado_em > (select min(e2.enviado_em) from public.disparo_envios e2
                                       where e2.campanha_id = c.id and e2.contato_id = e.contato_id)
              ))                                                                 as fecharam,
         max(a.enviado_em)                                                       as ultimo_envio
  from public.disparo_campanhas c
  left join public.wa_templates t  on t.id  = c.template_id
  left join public.canais ca       on ca.id = c.canal_id
  left join public.disparo_alvos a on a.campanha_id = c.id
  where c.organizacao_id = p_org
    and public.papel_na_org(p_org) is not null
  group by c.id, t.nome, ca.nome_interno
  order by c.criado_em desc;
$fn$;
revoke all on function public.disparo_campanhas_resumo(uuid) from public, anon;
grant execute on function public.disparo_campanhas_resumo(uuid) to authenticated, service_role;
