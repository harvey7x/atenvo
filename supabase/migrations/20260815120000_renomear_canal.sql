-- Renomear conexão (nome_interno) sem tocar em NADA da origem comercial.
--
-- Por que uma função nova: `atualizar_canal_comercial` grava os seis campos de uma vez
-- (origem_tipo, gestor, fonte, campanha, observação). Usá-la para um rename inline
-- apagaria em silêncio a origem comercial de canais que o front não carrega inteiros
-- (os da Cloud API, por exemplo) — e a origem do lead depende disso nos relatórios.
--
-- Autorização idêntica à do comercial: admin/supervisor da org, ou admin de plataforma.
create or replace function public.renomear_canal(p_canal uuid, p_nome text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org  uuid;
  v_uid  uuid := auth.uid();
  v_nome text := nullif(btrim(p_nome), '');
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  if v_nome is null then raise exception 'nome_obrigatorio'; end if;
  if length(v_nome) > 60 then raise exception 'nome_muito_longo'; end if;

  select organizacao_id into v_org from public.canais where id = p_canal;
  if v_org is null then raise exception 'canal_invalido'; end if;

  if not coalesce(
       public.is_platform_admin()
       or (public.is_member(v_org) and public.papel_na_org(v_org) = any (array['admin','supervisor']::user_role[])),
     false) then
    raise exception 'sem_permissao';
  end if;

  update public.canais
     set nome_interno = v_nome,
         atualizado_em = now()
   where id = p_canal;
end
$function$;

revoke all on function public.renomear_canal(uuid, text) from public;
revoke all on function public.renomear_canal(uuid, text) from anon;
grant execute on function public.renomear_canal(uuid, text) to authenticated;
