-- Fix: pg_net expõe http_post no schema `net` (não `extensions`). Recria a RPC manual com net.http_post.
create or replace function public.wa_canal_executar_health_check_manual(p_canal uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp, net as $$
declare v_org uuid; v_secret text; v_req bigint;
begin
  select organizacao_id into v_org from canais where id = p_canal;
  if v_org is null then raise exception 'canal_nao_encontrado'; end if;
  if not (public.is_platform_admin() or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[]))) then
    raise exception 'sem_permissao';
  end if;
  select secret into v_secret from webhook_config where chave = 'health_check';
  if v_secret is null then raise exception 'health_secret_ausente'; end if;
  select net.http_post(
    url := 'https://afmzuoavvnpfossiiypz.supabase.co/functions/v1/wa-health-check',
    body := jsonb_build_object('canal_id', p_canal, 'tipo', 'manual', 'criado_por', auth.uid()),
    headers := jsonb_build_object('Content-Type','application/json','x-health-secret', v_secret)
  ) into v_req;
  insert into audit_log (usuario_id, acao, entidade, entidade_id, dados_depois, organizacao_id)
  values (auth.uid(), 'health_check_manual', 'canais', p_canal, jsonb_build_object('request_id', v_req), v_org);
  return jsonb_build_object('ok', true, 'request_id', v_req);
end $$;
grant execute on function public.wa_canal_executar_health_check_manual(uuid) to authenticated;
notify pgrst, 'reload schema';
