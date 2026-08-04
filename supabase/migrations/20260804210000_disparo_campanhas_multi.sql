-- ─────────────────────────────────────────────────────────────────────────────
-- DISPARO — Fase 1 do redesign de CAMPANHAS (múltiplas campanhas lado a lado).
--
-- A tela /disparo era "1 campanha ativa por vez" (achava a única status='ativa').
-- O dono quer campanhas separadas e diferenciáveis (campanha 1, 2, …), ver quem
-- já foi disparado e de qual, e trocar o template de uma campanha.
--
-- Aqui entram só RPCs ADITIVAS (nada quebra a mecânica de envio existente):
--   * disparo_campanhas_resumo — lista TODAS as campanhas da org com contadores,
--     para a nova "lista de campanhas".
--   * disparo_trocar_template — troca o template de uma campanha (admin|supervisor),
--     exigindo template aprovado (mesma trava do disparo_criar_campanha).
--
-- Segurança: mesmo padrão do 20260801170000_disparo_campanha.sql (papel_na_org p/
-- leitura; admin|supervisor + org_operacional p/ escrita; sem anon).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.disparo_campanhas_resumo(p_org uuid)
returns table (
  id uuid, nome text, status text,
  template_id uuid, template_nome text,
  canal_id uuid, canal_nome text,
  teto_24h int, criado_em timestamptz,
  total int, pendentes int, enviados int, respondidos int,
  falhas int, optout int, pulados int,
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

create or replace function public.disparo_trocar_template(p_campanha uuid, p_template uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.disparo_campanhas where id = p_campanha;
  if v_org is null then raise exception 'campanha_invalida'; end if;
  if not (public.is_platform_admin() or
      (public.papel_na_org(v_org) = any (array['admin'::user_role, 'supervisor'::user_role]) and public.org_operacional(v_org)))
  then raise exception 'sem_permissao'; end if;

  perform 1 from public.wa_templates t
   where t.id = p_template and t.organizacao_id = v_org and t.ativo and t.status = 'aprovado';
  if not found then raise exception 'template_nao_aprovado'; end if;

  update public.disparo_campanhas
     set template_id = p_template, atualizado_em = now()
   where id = p_campanha;
end $fn$;
revoke all on function public.disparo_trocar_template(uuid, uuid) from public, anon;
grant execute on function public.disparo_trocar_template(uuid, uuid) to authenticated, service_role;
