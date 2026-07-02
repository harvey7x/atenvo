-- convite_estado(): estado real do convite/vínculo para o usuário autenticado (auth.uid()).
-- A página /definir-senha decide a tela por AQUI (não por ?ativar=1 nem por tem_senha, que é
-- fantasma em usuários criados pelo convite). Assim, convidado que ainda não ativou SEMPRE recebe
-- o formulário de senha; conta já ativa vai para "ir ao login"; cancelado/expirado tem erro próprio.
create or replace function public.convite_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'auth'
as $function$
declare
  uid uuid := auth.uid();
  v_conv public.convites;
  v_vinc text;
  v_exp boolean := false;
begin
  if uid is null then
    return jsonb_build_object('sessao', false);
  end if;

  -- convite mais relevante deste usuário: pendente primeiro, senão o mais recente.
  select * into v_conv from public.convites
    where auth_user_id = uid
    order by (status = 'pendente') desc, criado_em desc
    limit 1;
  if v_conv.id is not null then
    v_exp := v_conv.expira_em < now();
  end if;

  -- vínculo do usuário (prioriza 'ativo' quando houver em qualquer organização).
  select status::text into v_vinc from public.organizacao_usuarios
    where usuario_id = uid
    order by (status = 'ativo') desc, atualizado_em desc nulls last
    limit 1;

  return jsonb_build_object(
    'sessao', true,
    'convite', v_conv.status::text,  -- pendente|aceito|expirado|cancelado|null
    'vinculo', v_vinc,               -- convidado|ativo|inativo|null
    'expirado', v_exp
  );
end
$function$;

grant execute on function public.convite_estado() to authenticated;
