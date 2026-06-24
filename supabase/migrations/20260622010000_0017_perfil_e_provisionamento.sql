-- ===== Fluxo de perfil do usuario + provisionamento do primeiro administrador =====

-- 1) Ao criar um usuario no Auth, cria automaticamente o perfil em public.usuarios.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.usuarios (id, nome, email)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'nome',''), nullif(new.raw_user_meta_data->>'name',''), split_part(coalesce(new.email,'Usuario'),'@',1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Provisiona a PRIMEIRA organizacao do usuario logado e o vincula como admin.
--    Security definer: cria org + limites + assinatura (somente via este fluxo
--    controlado; o frontend nao escreve direto nessas tabelas).
--    Regra: so funciona se o usuario ainda nao tiver vinculo (primeiro acesso).
create or replace function public.provisionar_organizacao(p_nome text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_org uuid; v_plano uuid; v_base int;
begin
  if v_uid is null then
    raise exception 'Sem usuario autenticado' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.organizacao_usuarios where usuario_id = v_uid) then
    raise exception 'Usuario ja vinculado a uma organizacao' using errcode = 'unique_violation';
  end if;

  select id, valor_base_centavos into v_plano, v_base
    from public.planos where ativo order by versao desc limit 1;

  insert into public.organizacoes (nome, slug, status, plano, assinatura_status, assinatura_inicio, assinatura_vencimento)
    values (p_nome, p_slug, 'ativa', 'Plano Atenvo', 'ativa', current_date, (current_date + interval '30 days')::date)
    returning id into v_org;

  insert into public.organizacao_limites (organizacao_id) values (v_org);  -- defaults: 2 usuarios, 1 WhatsApp, 1 Facebook

  insert into public.assinaturas (organizacao_id, plano_id, status, ciclo_inicio, ciclo_fim, proxima_cobranca)
    values (v_org, v_plano, 'ativa',
            date_trunc('month', now())::date,
            (date_trunc('month', now()) + interval '1 month - 1 day')::date,
            (date_trunc('month', now()) + interval '1 month')::date);

  insert into public.assinatura_itens (assinatura_id, organizacao_id, tipo, descricao, quantidade, valor_unitario_centavos, valor_total_centavos)
    select a.id, v_org, 'plano_base', 'Plano Atenvo', 1, v_base, v_base
    from public.assinaturas a where a.organizacao_id = v_org;

  update public.assinaturas
     set valor_total_centavos = public.calcular_valor_assinatura(v_org)
   where organizacao_id = v_org;

  insert into public.organizacao_usuarios (organizacao_id, usuario_id, papel, status)
    values (v_org, v_uid, 'admin', 'ativo');

  insert into public.configuracoes (organizacao_id, chave, valor, descricao) values
    (v_org, 'cobranca_percentual_padrao', '50',                  'Percentual padrao cobrado sobre o valor economizado'),
    (v_org, 'cobranca_ciclos_padrao',     '6',                   'Numero padrao de ciclos mensais de cobranca'),
    (v_org, 'timezone',                   '"America/Sao_Paulo"', 'Fuso horario');

  return v_org;
end $$;

revoke all on function public.provisionar_organizacao(text, text) from public;
grant execute on function public.provisionar_organizacao(text, text) to authenticated;
