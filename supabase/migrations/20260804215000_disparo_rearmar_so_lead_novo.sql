-- ─────────────────────────────────────────────────────────────────────────────
-- DISPARO — re-armar SÓ Lead Novo (regra do dono: disparo é só pra Lead Novo,
-- não pode afetar lead de outra área).
--
-- Antes, disparo_rearmar devolvia à fila TODO alvo enviado/falhou/pulado — inclusive
-- quem já tinha AVANÇADO no funil (Reunião, Documentos, Fechado, Perdido). Reenviar um
-- template frio pra quem já fechou é grave. Agora só volta à fila quem, AGORA, está na
-- coluna de ENTRADA (Lead Novo, fc.entrada=true) — e 'respondido'/'optout' seguem
-- preservados (não re-blasta quem respondeu). Reativa a campanha só se sobrou alguém.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.disparo_rearmar(p_campanha uuid)
returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_n int;
begin
  select organizacao_id into v_org from public.disparo_campanhas where id = p_campanha;
  if v_org is null then raise exception 'campanha_invalida'; end if;
  if not (public.is_platform_admin() or
      (public.papel_na_org(v_org) = any (array['admin'::user_role, 'supervisor'::user_role]) and public.org_operacional(v_org)))
  then raise exception 'sem_permissao'; end if;

  update public.disparo_alvos a
     set status = 'pendente', enviado_em = null, wamid = null, erro = null
   where a.campanha_id = p_campanha
     and a.status in ('enviado', 'falhou', 'pulado')
     and (
       select fc.entrada
       from public.oportunidades o
       join public.funil_colunas fc on fc.id = o.coluna_id
       where o.contato_id = a.contato_id and o.organizacao_id = v_org
       order by o.atualizado_em desc
       limit 1
     ) is true;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    update public.disparo_campanhas
       set status = 'ativa', atualizado_em = now()
     where id = p_campanha and status <> 'cancelada';
  end if;

  return jsonb_build_object('rearmados', v_n);
end $fn$;
revoke all on function public.disparo_rearmar(uuid) from public, anon;
grant execute on function public.disparo_rearmar(uuid) to authenticated, service_role;
