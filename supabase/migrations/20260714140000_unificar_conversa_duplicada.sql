-- Unificação de conversa duplicada (troca de canal / corrida / merge de contatos).
--
-- POR QUE NÃO BASTA secundarizar_conversa: ela arquiva a duplicata, mas as mensagens FICAM na
-- conversa arquivada — somem do fio ativo e o atendente perde histórico. Aqui MOVEMOS as mensagens
-- para a principal e só então arquivamos a secundária (que vira registro/auditoria).
--
-- NADA é apagado: nenhuma mensagem, nenhuma conversa. Só re-aponta conversa_id e arquiva.
--
-- O QUE MOVE:  mensagens, conversa_atividades, script_execucoes
-- O QUE RE-VINCULA: oportunidades.conversa_origem_id, fichas_judiciais.conversa_id
-- O QUE NÃO TOCA (fica na secundária arquivada, inerte — e por instrução explícita):
--   sla_alertas, bot_conversa_estado (unique por conversa: mover colidiria), bot_mensagens_saida,
--   bot_remarketing. A secundária permanece como registro; esses vínculos seguem coerentes com ela.
--
-- ORDEM CRONOLÓGICA: preservada naturalmente — a UI ordena por criado_em/enviada_em/recebida_em,
-- que não são alterados. Só o conversa_id muda.

-- Backup lógico p/ rollback (guarda os ids exatos movidos em cada operação).
create table if not exists public.conversa_unificacao_log (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  principal_id    uuid not null,
  secundaria_id   uuid not null,
  mensagens_ids   uuid[] not null default '{}',
  atividades_ids  uuid[] not null default '{}',
  execucoes_ids   uuid[] not null default '{}',
  opps_ids        uuid[] not null default '{}',
  fichas_ids      uuid[] not null default '{}',
  executado_por   uuid,
  executado_em    timestamptz not null default now()
);
alter table public.conversa_unificacao_log enable row level security;
drop policy if exists conversa_unificacao_log_sel on public.conversa_unificacao_log;
create policy conversa_unificacao_log_sel on public.conversa_unificacao_log
  for select using (is_platform_admin() or is_member(organizacao_id));
create index if not exists conversa_unificacao_log_sec_idx on public.conversa_unificacao_log (secundaria_id);

create or replace function public.unificar_conversa_duplicada(
  p_principal uuid,
  p_secundaria uuid,
  p_dry_run boolean default true
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cp public.conversas; cs public.conversas;
  v_msgs uuid[]; v_ativ uuid[]; v_exec uuid[]; v_opps uuid[]; v_fichas uuid[];
  v_bloqueio text := null;
  v_res jsonb;
begin
  -- ---------- validações ----------
  if p_principal = p_secundaria then raise exception 'principal_igual_secundaria'; end if;
  select * into cp from public.conversas where id = p_principal;
  select * into cs from public.conversas where id = p_secundaria;
  if cp.id is null or cs.id is null then raise exception 'conversa_inexistente'; end if;
  if cp.contato_id is distinct from cs.contato_id then raise exception 'conversas_de_contatos_diferentes'; end if;
  if cp.organizacao_id is distinct from cs.organizacao_id then raise exception 'conversas_de_orgs_diferentes'; end if;
  if auth.uid() is not null and not (public.is_platform_admin()
       or public.papel_na_org(cs.organizacao_id) in ('admin','supervisor'))
    then raise exception 'sem_permissao'; end if;

  -- principal precisa estar ATIVA (é o fio que vai receber o histórico)
  if cp.arquivada_em is not null then v_bloqueio := 'principal_arquivada'; end if;
  if cp.status = 'fechada' then v_bloqueio := coalesce(v_bloqueio, 'principal_fechada'); end if;

  -- ---------- o que seria movido ----------
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
    'ja_arquivada', cs.arquivada_em is not null,
    'bloqueio', v_bloqueio,
    'seguro', v_bloqueio is null
  );

  if v_bloqueio is not null then return v_res || jsonb_build_object('status','bloqueado'); end if;
  if p_dry_run then return v_res || jsonb_build_object('status','dry_run'); end if;

  -- idempotência: já unificada (arquivada e sem nada pra mover) -> noop
  if cs.arquivada_em is not null and cardinality(v_msgs) = 0 and cardinality(v_ativ) = 0
     and cardinality(v_exec) = 0 and cardinality(v_opps) = 0 and cardinality(v_fichas) = 0 then
    return v_res || jsonb_build_object('status','noop','motivo','ja_unificada');
  end if;

  -- ---------- backup lógico ANTES de mover (permite rollback) ----------
  insert into public.conversa_unificacao_log(
    organizacao_id, principal_id, secundaria_id, mensagens_ids, atividades_ids, execucoes_ids, opps_ids, fichas_ids, executado_por)
  values (cs.organizacao_id, p_principal, p_secundaria, v_msgs, v_ativ, v_exec, v_opps, v_fichas, auth.uid());

  -- ---------- move o fio (NADA é deletado; só re-aponta conversa_id) ----------
  update public.mensagens          set conversa_id = p_principal        where conversa_id = p_secundaria;
  update public.conversa_atividades set conversa_id = p_principal       where conversa_id = p_secundaria;
  update public.script_execucoes    set conversa_id = p_principal       where conversa_id = p_secundaria;
  update public.oportunidades       set conversa_origem_id = p_principal where conversa_origem_id = p_secundaria;
  update public.fichas_judiciais    set conversa_id = p_principal        where conversa_id = p_secundaria;

  -- principal absorve não-lidas e a interação mais recente das duas
  update public.conversas
     set nao_lidas = coalesce(cp.nao_lidas,0) + coalesce(cs.nao_lidas,0),
         ultima_interacao_em = greatest(
           coalesce(cp.ultima_interacao_em, cp.criado_em),
           coalesce(cs.ultima_interacao_em, cs.criado_em))
   where id = p_principal;

  -- ---------- arquiva a secundária (registro/auditoria; NÃO deletada) ----------
  update public.conversas
     set arquivada_em = now(), arquivada_por = auth.uid(), nao_lidas = 0
   where id = p_secundaria;

  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_depois)
  values (cs.organizacao_id, auth.uid(), 'unificar_conversa_duplicada', 'conversas', p_secundaria,
          v_res || jsonb_build_object('status','executado'));

  return v_res || jsonb_build_object('status','executado');
end $$;

grant execute on function public.unificar_conversa_duplicada(uuid, uuid, boolean) to service_role, authenticated;

-- ---------- ROLLBACK (desfaz uma unificação usando o backup lógico) ----------
create or replace function public.desfazer_unificacao_conversa(p_log_id uuid, p_dry_run boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.conversa_unificacao_log;
begin
  select * into l from public.conversa_unificacao_log where id = p_log_id;
  if l.id is null then raise exception 'log_inexistente'; end if;
  if auth.uid() is not null and not (public.is_platform_admin()
       or public.papel_na_org(l.organizacao_id) in ('admin','supervisor'))
    then raise exception 'sem_permissao'; end if;

  if p_dry_run then
    return jsonb_build_object('status','dry_run','mensagens_a_devolver', cardinality(l.mensagens_ids),
      'principal', l.principal_id, 'secundaria', l.secundaria_id);
  end if;

  update public.mensagens           set conversa_id = l.secundaria_id        where id = any(l.mensagens_ids);
  update public.conversa_atividades set conversa_id = l.secundaria_id        where id = any(l.atividades_ids);
  update public.script_execucoes    set conversa_id = l.secundaria_id        where id = any(l.execucoes_ids);
  update public.oportunidades       set conversa_origem_id = l.secundaria_id where id = any(l.opps_ids);
  update public.fichas_judiciais    set conversa_id = l.secundaria_id        where id = any(l.fichas_ids);
  update public.conversas set arquivada_em = null, arquivada_por = null where id = l.secundaria_id;

  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_depois)
  values (l.organizacao_id, auth.uid(), 'desfazer_unificacao_conversa', 'conversas', l.secundaria_id,
          jsonb_build_object('log', p_log_id, 'mensagens', cardinality(l.mensagens_ids)));

  delete from public.conversa_unificacao_log where id = p_log_id;
  return jsonb_build_object('status','executado','mensagens_devolvidas', cardinality(l.mensagens_ids));
end $$;

grant execute on function public.desfazer_unificacao_conversa(uuid, boolean) to service_role;
