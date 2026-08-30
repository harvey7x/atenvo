-- Fecho de janela: o GUC de bypass (atenvo.ia_chave) é transacional; sem reset,
-- um UPDATE posterior NA MESMA transação da RPC passaria pela proteção de coluna.
-- (No PostgREST cada request é uma transação, mas defesa em profundidade é grátis.)
create or replace function public.ia_agente_salvar_chave(p_agente uuid, p_chave text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_secret uuid;
begin
  select organizacao_id, chave_secret_id into v_org, v_secret
    from public.ia_agentes where id = p_agente;
  if v_org is null then
    raise exception 'Agente não encontrado';
  end if;
  if not (is_platform_admin()
          or papel_na_org(v_org) = any (array['admin'::user_role,'supervisor'::user_role])) then
    raise exception 'Sem permissão para definir a chave';
  end if;
  if coalesce(btrim(p_chave), '') = '' then
    raise exception 'Chave vazia';
  end if;

  if v_secret is null then
    v_secret := vault.create_secret(p_chave, 'ia_agente_' || p_agente::text,
                                    'Chave de API do atendente de IA');
  else
    perform vault.update_secret(v_secret, p_chave, 'ia_agente_' || p_agente::text,
                                'Chave de API do atendente de IA');
  end if;

  perform set_config('atenvo.ia_chave', '1', true);
  update public.ia_agentes
     set chave_secret_id = v_secret, chave_definida_em = now()
   where id = p_agente;
  perform set_config('atenvo.ia_chave', '', true);  -- fecha a janela na hora
end $$;
