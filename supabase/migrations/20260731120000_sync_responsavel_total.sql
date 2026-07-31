-- Responsabilidade unificada do cliente — sincronização TOTAL e BIDIRECIONAL.
-- Evolui 20260711120000_sync_responsavel_cliente (que só fazia contato → conversa + Kanban).
--
-- Fonte única da verdade: contatos.responsavel_id. "Assumir o cliente" (em qualquer superfície)
-- passa a refletir o mesmo dono em TUDO:
--   • conversas.atendente_id        — conversas ABERTAS (aberta/em_atendimento/pendente)
--   • oportunidades.responsavel_id  — oportunidades EM ANDAMENTO (Kanban)
--   • fichas_judiciais.responsavel_id — apenas fichas em RASCUNHO (finalizada é imutável)
--   • cobrancas.responsavel_id      — apenas cobranças ATIVAS (e só se o novo dono for membro ATIVO)
--   • agendamentos.atendente_id     — apenas compromissos FUTUROS/ABERTOS (pendente/confirmado/remarcado)
--
-- BIDIRECIONAL: além de contato → tudo (fan-out), agora Kanban → contato (reverse). Trocar o
-- responsável direto no card de uma oportunidade EM ANDAMENTO grava em contatos.responsavel_id,
-- que re-espalha para as demais superfícies. Contato e card do Kanban são as duas ÚNICAS "fontes";
-- cobrança/agenda/ficha são só destinos (reatribuir uma cobrança isolada NÃO sequestra o dono).
--
-- Anti-loop: uma flag transaction-local (atenvo.sync_resp) sinaliza que o fan-out está rodando,
-- para o trigger reverso não re-disparar durante a propagação.
-- Coexiste com trg_sla_contato_assumido (S4.5). O Edge atribuir-atendimento (portão de permissão)
-- continua inalterado.

-- ===== 1. fan-out estendido: contato → tudo =====
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
  v_org     uuid;
  v_conv    int := 0;
  v_opp     int := 0;
  v_ficha   int := 0;
  v_cob     int := 0;
  v_agd     int := 0;
  v_resp_ok boolean;
begin
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then return; end if;

  -- guarda de recursão: durante o fan-out, os triggers reversos devem ficar inertes.
  perform set_config('atenvo.sync_resp', '1', true);

  -- o novo dono é válido para tabelas que exigem membro ATIVO (cobranças)? null (liberar) é sempre ok.
  -- se não for, cobranças é pulada — nunca deixamos a validação de cobrança quebrar o "assumir".
  v_resp_ok := p_novo_resp is null or exists (
    select 1 from public.organizacao_usuarios
     where organizacao_id = v_org and usuario_id = p_novo_resp and status = 'ativo');

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

  -- fichas judiciais em RASCUNHO do contato (a finalizada é imutável — não se toca)
  update public.fichas_judiciais
     set responsavel_id = p_novo_resp
   where organizacao_id = v_org
     and contato_id     = p_contato
     and status         = 'rascunho'
     and responsavel_id is distinct from p_novo_resp;
  get diagnostics v_ficha = row_count;

  -- cobranças ATIVAS do contato → responsavel_id (carteira). Só quando o novo dono é válido.
  if v_resp_ok then
    update public.cobrancas
       set responsavel_id = p_novo_resp
     where organizacao_id = v_org
       and contato_id     = p_contato
       and status         = 'ativo'
       and responsavel_id is distinct from p_novo_resp;
    get diagnostics v_cob = row_count;
  end if;

  -- agendamentos FUTUROS/ABERTOS do contato → atendente_id (não mexe em realizado/cancelado/nao_compareceu)
  update public.agendamentos
     set atendente_id = p_novo_resp
   where organizacao_id = v_org
     and contato_id     = p_contato
     and status in ('pendente','confirmado','remarcado')
     and atendente_id is distinct from p_novo_resp;
  get diagnostics v_agd = row_count;

  -- fim do fan-out: libera os triggers reversos.
  perform set_config('atenvo.sync_resp', '0', true);

  -- auditoria (o Edge já audita assumir/transferir/liberar; aqui ficam as contagens sincronizadas).
  insert into public.audit_log(organizacao_id, usuario_id, acao, entidade, entidade_id, dados_antes, dados_depois)
  values (
    v_org, p_ator, 'sync_responsavel_cliente', 'contatos', p_contato,
    jsonb_build_object('responsavel_id', p_resp_anterior),
    jsonb_build_object(
      'responsavel_id',         p_novo_resp,
      'conversas_afetadas',     v_conv,
      'oportunidades_afetadas', v_opp,
      'fichas_afetadas',        v_ficha,
      'cobrancas_afetadas',     v_cob,
      'agendamentos_afetados',  v_agd
    )
  );
end $$;

revoke all on function public.sync_responsavel_cliente(uuid, uuid, uuid, uuid) from public, anon;

comment on function public.sync_responsavel_cliente is
  'Fan-out da responsabilidade do cliente: contatos.responsavel_id → conversas (abertas), oportunidades (em_andamento), fichas_judiciais (rascunho), cobrancas (ativas, se novo dono ativo) e agendamentos (futuros). Fonte única de verdade. Chamada pelo trigger trg_sync_responsavel_cliente. Usa a flag transaction-local atenvo.sync_resp para inibir os triggers reversos.';

-- ===== 2. reverse: Kanban (oportunidade em andamento) → contato =====
-- Trocar o responsável direto no card grava na fonte da verdade; o fan-out de contatos re-espalha
-- para conversa/ficha/cobrança/agenda. Inerte durante o fan-out (flag) e só para oportunidade
-- EM ANDAMENTO com contato vinculado (won/lost não reatribui o dono atual do cliente).
create or replace function public.trg_fn_reverse_resp_oportunidade()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if coalesce(current_setting('atenvo.sync_resp', true), '0') = '1' then
    return new;                       -- estamos dentro do fan-out: não voltar
  end if;
  if new.contato_id is null then
    return new;                       -- lead solto, sem contato para sincronizar
  end if;

  update public.contatos
     set responsavel_id = new.responsavel_id
   where id             = new.contato_id
     and organizacao_id = new.organizacao_id
     and responsavel_id is distinct from new.responsavel_id;
  return new;
end $$;

revoke all on function public.trg_fn_reverse_resp_oportunidade() from public, anon;

comment on function public.trg_fn_reverse_resp_oportunidade is
  'Reverse-sync do Kanban: AFTER UPDATE OF responsavel_id em oportunidades EM ANDAMENTO grava contatos.responsavel_id (fonte única), que re-espalha via trg_sync_responsavel_cliente. Inerte durante o fan-out (flag atenvo.sync_resp).';

drop trigger if exists trg_reverse_resp_oportunidade on public.oportunidades;
create trigger trg_reverse_resp_oportunidade
  after update of responsavel_id on public.oportunidades
  for each row
  when (new.responsavel_id is distinct from old.responsavel_id
        and new.status = 'em_andamento')
  execute function public.trg_fn_reverse_resp_oportunidade();
