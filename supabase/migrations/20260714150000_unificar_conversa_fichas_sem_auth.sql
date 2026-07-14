-- Fix: fichas_judiciais tem trigger (fn_ficha_before) que EXIGE usuário autenticado
-- ('usuario_autenticado_obrigatorio'). Num backfill de manutenção (service_role, sem sessão),
-- auth.uid() é null e o UPDATE da ficha aborta a unificação inteira.
--
-- Solução: só re-vincula fichas QUANDO há sessão autenticada (chamada pelo app). No backfill sem
-- sessão, a ficha PERMANECE apontando para a conversa secundária — que continua existindo como
-- registro/auditoria (não é deletada). Nada se perde; o vínculo segue válido e é reportado no
-- retorno como 'fichas_nao_revinculadas_sem_auth'.
create or replace function public.unificar_conversa_duplicada(
  p_principal uuid,
  p_secundaria uuid,
  p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cp public.conversas; cs public.conversas;
  v_msgs uuid[]; v_ativ uuid[]; v_exec uuid[]; v_opps uuid[]; v_fichas uuid[];
  v_bloqueio text := null;
  v_tem_auth boolean := auth.uid() is not null;
  v_fichas_mov uuid[] := '{}';
  v_res jsonb;
begin
  if p_principal = p_secundaria then raise exception 'principal_igual_secundaria'; end if;
  select * into cp from public.conversas where id = p_principal;
  select * into cs from public.conversas where id = p_secundaria;
  if cp.id is null or cs.id is null then raise exception 'conversa_inexistente'; end if;
  if cp.contato_id is distinct from cs.contato_id then raise exception 'conversas_de_contatos_diferentes'; end if;
  if cp.organizacao_id is distinct from cs.organizacao_id then raise exception 'conversas_de_orgs_diferentes'; end if;
  if v_tem_auth and not (public.is_platform_admin()
       or public.papel_na_org(cs.organizacao_id) in ('admin','supervisor'))
    then raise exception 'sem_permissao'; end if;

  if cp.arquivada_em is not null then v_bloqueio := 'principal_arquivada'; end if;
  if cp.status = 'fechada' then v_bloqueio := coalesce(v_bloqueio, 'principal_fechada'); end if;

  select coalesce(array_agg(id), '{}') into v_msgs   from public.mensagens          where conversa_id = p_secundaria;
  select coalesce(array_agg(id), '{}') into v_ativ   from public.conversa_atividades where conversa_id = p_secundaria;
  select coalesce(array_agg(id), '{}') into v_exec   from public.script_execucoes    where conversa_id = p_secundaria;
  select coalesce(array_agg(id), '{}') into v_opps   from public.oportunidades       where conversa_origem_id = p_secundaria;
  select coalesce(array_agg(id), '{}') into v_fichas from public.fichas_judiciais    where conversa_id = p_secundaria;

  v_res := jsonb_build_object(
    'principal', p_principal, 'secundaria', p_secundaria,
    'mensagens_a_mover', cardinality(v_msgs),
    'atividades_a_mover', cardinality(v_ativ),
    'execucoes_a_mover', cardinality(v_exec),
    'opps_a_revincular', cardinality(v_opps),
    'fichas_a_revincular', cardinality(v_fichas),
    'fichas_revinculadas', case when v_tem_auth then cardinality(v_fichas) else 0 end,
    'fichas_nao_revinculadas_sem_auth', case when v_tem_auth then 0 else cardinality(v_fichas) end,
    'ja_arquivada', cs.arquivada_em is not null,
    'bloqueio', v_bloqueio,
    'seguro', v_bloqueio is null
  );

  if v_bloqueio is not null then return v_res || jsonb_build_object('status','bloqueado'); end if;
  if p_dry_run then return v_res || jsonb_build_object('status','dry_run'); end if;

  if cs.arquivada_em is not null and cardinality(v_msgs) = 0 and cardinality(v_ativ) = 0
     and cardinality(v_exec) = 0 and cardinality(v_opps) = 0 then
    return v_res || jsonb_build_object('status','noop','motivo','ja_unificada');
  end if;

  -- fichas: só move COM sessão (trigger exige usuário). Sem sessão, ficam na secundária (preservada).
  if v_tem_auth then v_fichas_mov := v_fichas; end if;

  insert into public.conversa_unificacao_log(
    organizacao_id, principal_id, secundaria_id, mensagens_ids, atividades_ids, execucoes_ids, opps_ids, fichas_ids, executado_por)
  values (cs.organizacao_id, p_principal, p_secundaria, v_msgs, v_ativ, v_exec, v_opps, v_fichas_mov, auth.uid());

  update public.mensagens           set conversa_id = p_principal         where conversa_id = p_secundaria;
  update public.conversa_atividades set conversa_id = p_principal         where conversa_id = p_secundaria;
  update public.script_execucoes    set conversa_id = p_principal         where conversa_id = p_secundaria;
  update public.oportunidades       set conversa_origem_id = p_principal  where conversa_origem_id = p_secundaria;
  if v_tem_auth then
    update public.fichas_judiciais  set conversa_id = p_principal         where conversa_id = p_secundaria;
  end if;

  update public.conversas
     set nao_lidas = coalesce(cp.nao_lidas,0) + coalesce(cs.nao_lidas,0),
         ultima_interacao_em = greatest(
           coalesce(cp.ultima_interacao_em, cp.criado_em),
           coalesce(cs.ultima_interacao_em, cs.criado_em))
   where id = p_principal;

  update public.conversas
     set arquivada_em = now(), arquivada_por = auth.uid(), nao_lidas = 0
   where id = p_secundaria;

  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_depois)
  values (cs.organizacao_id, auth.uid(), 'unificar_conversa_duplicada', 'conversas', p_secundaria,
          v_res || jsonb_build_object('status','executado'));

  return v_res || jsonb_build_object('status','executado');
end $$;

grant execute on function public.unificar_conversa_duplicada(uuid, uuid, boolean) to service_role, authenticated;
