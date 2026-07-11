-- Unificação de responsabilidade do cliente.
-- Fonte única de verdade: contatos.responsavel_id.
-- Quando ele muda (assumir / transferir / liberar via Edge atribuir-atendimento, ou qualquer
-- outro caminho que altere o campo), propaga automaticamente para:
--   • conversas.atendente_id     — apenas conversas ABERTAS do contato (aberta/em_atendimento/pendente)
--   • oportunidades.responsavel_id — apenas oportunidades EM ANDAMENTO do contato (nunca fechadas)
-- Não cria oportunidade nova. Não toca ficha judicial. Não mexe em ganho/perdido/cancelado.
-- Coexiste com trg_sla_contato_assumido (S4.5), que limpa precisa_humano e resolve alertas SLA.
-- O Edge atribuir-atendimento continua sendo o portão de permissão/concorrência (inalterado).

-- ===== função central de propagação =====
create or replace function public.sync_responsavel_cliente(
  p_contato       uuid,
  p_resp_anterior uuid,
  p_novo_resp     uuid,
  p_ator          uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_org  uuid;
  v_conv int := 0;
  v_opp  int := 0;
begin
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then return; end if;

  -- conversas abertas do contato → atendente_id (não mexe em resolvida/fechada)
  update public.conversas
     set atendente_id = p_novo_resp
   where organizacao_id = v_org
     and contato_id     = p_contato
     and status in ('aberta','em_atendimento','pendente')
     and atendente_id is distinct from p_novo_resp;
  get diagnostics v_conv = row_count;

  -- oportunidades EM ANDAMENTO do contato → responsavel_id (nunca ganho/perdido/cancelado)
  update public.oportunidades
     set responsavel_id = p_novo_resp
   where organizacao_id = v_org
     and contato_id     = p_contato
     and status         = 'em_andamento'
     and responsavel_id is distinct from p_novo_resp;
  get diagnostics v_opp = row_count;

  -- auditoria complementar (o Edge já audita assumir/transferir/liberar).
  -- registra: contato, responsável anterior/novo e quantos registros foram sincronizados.
  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois)
  values (
    v_org, p_ator, 'sync_responsavel_cliente', 'contatos', p_contato,
    jsonb_build_object('responsavel_id', p_resp_anterior),
    jsonb_build_object(
      'responsavel_id',          p_novo_resp,
      'conversas_afetadas',      v_conv,
      'oportunidades_afetadas',  v_opp
    )
  );
end $$;

revoke all on function public.sync_responsavel_cliente(uuid, uuid, uuid, uuid) from public, anon;

comment on function public.sync_responsavel_cliente is
  'Propaga contatos.responsavel_id para conversas.atendente_id (abertas) e oportunidades.responsavel_id (em_andamento) do contato, com auditoria. Fonte única de verdade da responsabilidade do cliente. Chamada pelo trigger trg_sync_responsavel_cliente.';

-- ===== trigger: dispara só quando o dono realmente muda =====
create or replace function public.trg_fn_sync_responsavel_cliente()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  -- ator: usuário autenticado se houver; senão o novo responsável (mesmo padrão do trg_sla_contato_assumido).
  -- O Edge atribuir-atendimento roda via service_role, então auth.uid() é null aqui.
  perform public.sync_responsavel_cliente(
    new.id, old.responsavel_id, new.responsavel_id,
    coalesce(auth.uid(), new.responsavel_id)
  );
  return new;
end $$;

drop trigger if exists trg_sync_responsavel_cliente on public.contatos;
create trigger trg_sync_responsavel_cliente
  after update of responsavel_id on public.contatos
  for each row
  when (new.responsavel_id is distinct from old.responsavel_id)
  execute function public.trg_fn_sync_responsavel_cliente();

comment on function public.trg_fn_sync_responsavel_cliente is
  'Trigger de contatos (AFTER UPDATE OF responsavel_id, WHEN novo IS DISTINCT FROM antigo): chama sync_responsavel_cliente. Coexiste com trg_sla_contato_assumido.';
