-- Encerrar campanha pela tela (flagrado no redesign: sem isso, uma campanha de teste
-- ativa trava a escolha de template até alguém mexer no banco). Admin|supervisor.
-- Alvos pendentes ficam como estão (histórico); nada é apagado.
create or replace function public.disparo_cancelar_campanha(p_campanha uuid)
returns void
language plpgsql security definer set search_path = public as $fn$
declare v_org uuid;
begin
  select organizacao_id into v_org from public.disparo_campanhas where id = p_campanha and status = 'ativa';
  if v_org is null then raise exception 'campanha_invalida'; end if;
  if not (public.is_platform_admin() or
      (public.papel_na_org(v_org) = any (array['admin'::user_role, 'supervisor'::user_role]) and public.org_operacional(v_org)))
  then raise exception 'sem_permissao'; end if;
  update public.disparo_campanhas set status = 'cancelada', atualizado_em = now() where id = p_campanha;
end $fn$;
revoke all on function public.disparo_cancelar_campanha(uuid) from public, anon;
grant execute on function public.disparo_cancelar_campanha(uuid) to authenticated, service_role;
