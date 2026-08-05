-- ─────────────────────────────────────────────────────────────────────────────
-- DISPARO — Fase D (Seção 5): remarketing por FILTRO. A única fase que gasta dinheiro.
--
-- NÃO cria caminho de envio novo: o envio real segue pela edge disparo-processar (teto
-- 200/24h, opt-out re-checado, idempotência por claim, envio parcial). Aqui só se ADICIONA:
-- alvo filtrado + escolha de template + dedup (pessoa,template) + prévia de custo/teto.
--
-- Cada remarketing = uma NOVA campanha (novo "toque") com seu template e alvo — a campanha
-- tem 1 template, então re-armar um subconjunto trocando template contaminaria os outros
-- pendentes. A dedup por template é GLOBAL (disparo_envios) → ninguém recebe o mesmo
-- template 2x nem entre campanhas.
--
-- Alvo = pessoasFiltradas (contato_ids que SÃO alvos da campanha origem) MENOS wa_optout
-- MENOS quem já recebeu ESTE template (log). dry_run só conta; sem dry_run cria a campanha
-- e insere os elegíveis como 'pendente'. A edge ainda re-checa opt-out + dedup no envio.
--
-- Canal: default = canal da campanha origem; o front deixa escolher e avisa se for o 1390
-- (número do tráfego do anúncio). teto_restante espelha o cálculo da edge.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.disparo_remarketing_filtro(
  p_campanha_origem uuid, p_template uuid, p_contatos uuid[],
  p_dry_run boolean default true, p_canal uuid default null, p_nome text default null)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_canal_origem uuid; v_teto int; v_canal uuid; v_usados int; v_restante int;
  v_alvo int; v_opt int; v_jatpl int; v_arm int := 0; v_nova uuid;
begin
  select organizacao_id, canal_id, teto_24h into v_org, v_canal_origem, v_teto from public.disparo_campanhas where id=p_campanha_origem;
  if v_org is null then raise exception 'campanha_invalida'; end if;
  if not (public.is_platform_admin() or (public.papel_na_org(v_org)=any(array['admin'::user_role,'supervisor'::user_role]) and public.org_operacional(v_org))) then raise exception 'sem_permissao'; end if;
  perform 1 from public.wa_templates t where t.id=p_template and t.organizacao_id=v_org and t.ativo and t.status='aprovado';
  if not found then raise exception 'template_nao_aprovado'; end if;
  v_canal := coalesce(p_canal, v_canal_origem);
  perform 1 from public.canais c where c.id=v_canal and c.organizacao_id=v_org and c.transporte='cloud_api' and c.ativo;
  if not found then raise exception 'canal_invalido'; end if;

  select count(*) filter (where not optout and not ja_tpl), count(*) filter (where optout), count(*) filter (where not optout and ja_tpl)
    into v_alvo, v_opt, v_jatpl
  from (select a.contato_id,
      exists(select 1 from public.wa_optout w where w.contato_id=a.contato_id) optout,
      exists(select 1 from public.disparo_envios e where e.contato_id=a.contato_id and e.template_id=p_template) ja_tpl
    from public.disparo_alvos a where a.campanha_id=p_campanha_origem and a.contato_id = any(coalesce(p_contatos,'{}'::uuid[]))) x;

  select coalesce(count(*),0) into v_usados from public.disparo_alvos a
    where a.status='enviado' and a.enviado_em > now()-interval '24 hours'
      and a.campanha_id in (select id from public.disparo_campanhas where canal_id=v_canal);
  v_usados := v_usados + coalesce((select count(*) from public.bot_remarketing where ultimo_toque_em > now()-interval '24 hours'),0);
  v_restante := greatest(0, coalesce(v_teto,200) - v_usados);

  if not p_dry_run then
    insert into public.disparo_campanhas (organizacao_id, canal_id, template_id, nome, teto_24h, status, criado_por)
    values (v_org, v_canal, p_template, coalesce(nullif(btrim(p_nome),''), 'Remarketing · '||to_char(now(),'DD/MM')), least(coalesce(v_teto,200),200), 'ativa', auth.uid())
    returning id into v_nova;
    insert into public.disparo_alvos (campanha_id, organizacao_id, contato_id, telefone, status)
    select v_nova, v_org, x.contato_id,
      (select ci.valor_normalizado from public.contato_identidades ci where ci.contato_id=x.contato_id and ci.tipo='whatsapp' and coalesce(ci.valor_normalizado,'')<>'' limit 1), 'pendente'
    from (select distinct a.contato_id from public.disparo_alvos a
          where a.campanha_id=p_campanha_origem and a.contato_id=any(p_contatos)
            and not exists(select 1 from public.wa_optout w where w.contato_id=a.contato_id)
            and not exists(select 1 from public.disparo_envios e where e.contato_id=a.contato_id and e.template_id=p_template)) x;
    get diagnostics v_arm = row_count;
  end if;
  return jsonb_build_object('campanha_id', v_nova, 'alvo', v_alvo, 'removidos_optout', v_opt, 'removidos_ja_template', v_jatpl,
    'teto', coalesce(v_teto,200), 'teto_restante', v_restante, 'armados', v_arm, 'custo_estimado', round(v_alvo*0.35,2));
end $fn$;
revoke all on function public.disparo_remarketing_filtro(uuid, uuid, uuid[], boolean, uuid, text) from public, anon;
grant execute on function public.disparo_remarketing_filtro(uuid, uuid, uuid[], boolean, uuid, text) to authenticated, service_role;
