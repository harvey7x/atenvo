-- 105 · MOTIVO AO FECHAR A CONVERSA (25/11, como no sistema que a Reviza usava antes: "Motivos de fechamento — as opções que
-- aparecem ao fechar uma conversa, e o histórico de quem fechou e por quê"). Fechar continua sendo mudar o status para
-- "Fechada" (como já era); esta rotina só registra o MOTIVO na atividade do atendimento (conversa_atividades, tipo
-- 'fechado'), que o painel do cliente já mostra. Quem pode: quem vê a conversa (atd_vejo_conversa), membro ativo da
-- empresa. Nada mais muda.
create or replace function public.atd_conversa_registrar_fechamento(p_conversa uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_motivo text := left(btrim(coalesce(p_motivo, '')), 300);
  v_id uuid;
begin
  if v_uid is null then raise exception 'nao_autenticado' using errcode = '42501'; end if;
  select organizacao_id into v_org from public.conversas where id = p_conversa;
  if v_org is null then raise exception 'conversa_nao_encontrada' using errcode = 'P0002'; end if;
  if not (public.is_platform_admin() or public.is_member(v_org)) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if not public.atd_vejo_conversa(p_conversa) then raise exception 'sem_permissao' using errcode = '42501'; end if;
  if char_length(v_motivo) = 0 then raise exception 'motivo_vazio' using errcode = '22023'; end if;
  insert into public.conversa_atividades (organizacao_id, conversa_id, usuario_id, tipo, motivo)
  values (v_org, p_conversa, v_uid, 'fechado', v_motivo)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.atd_conversa_registrar_fechamento(uuid, text) from public, anon;
grant execute on function public.atd_conversa_registrar_fechamento(uuid, text) to authenticated, service_role;
