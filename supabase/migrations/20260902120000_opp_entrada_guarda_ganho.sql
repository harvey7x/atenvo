-- Corrige: cliente GANHO (Fechado) "ressuscitando" como lead novo.
--
-- Causa raiz: a caixa "Kanban" da conversa (KanbanContatoBox) só olha se há oportunidade
-- ABERTA; para um cliente já fechado ela mostra "Sem oportunidade aberta" + botão
-- "Adicionar ao Kanban", que chama a PRIMITIVA garantir_oportunidade_entrada direto.
-- Essa primitiva NÃO tinha a trava de fechado — a trava vivia só na
-- garantir_oportunidade_lead_novo (usada pelos webhooks de inbound). Resultado: clicar no
-- botão criava uma oportunidade nova na coluna de entrada e o cliente ganho reaparecia como
-- lead/aguardando, ofuscando o card "Fechado".
--
-- Regra do dono (2026-09-02): contato com oportunidade GANHA no funil NÃO reentra como lead
-- novo automaticamente. Perdido/cancelado seguem podendo reentrar (recuperação é desejável).
-- A garantir_oportunidade_lead_novo (webhooks) já barra qualquer status fechado ANTES de
-- chamar esta primitiva, então esta guarda não altera o caminho de inbound.

create or replace function public.garantir_oportunidade_entrada(p_contato uuid, p_funil uuid, p_origem text DEFAULT NULL::text, p_conversa uuid DEFAULT NULL::uuid, p_canal uuid DEFAULT NULL::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_org uuid; v_col uuid; v_id uuid; v_resp uuid; v_tags text[];
begin
  select organizacao_id, etiquetas into v_org, v_tags from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  -- chamadas autenticadas precisam ser membros; service_role (auth.uid() null) é backend confiável
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;
  perform 1 from public.funis where id = p_funil and organizacao_id = v_org and not arquivado;
  if not found then raise exception 'funil_invalido'; end if;
  select id into v_col from public.funil_colunas
    where funil_id = p_funil and organizacao_id = v_org and entrada and not arquivada limit 1;
  if v_col is null then raise exception 'sem_coluna_entrada'; end if;
  -- atendente herdado da conversa (quando informada)
  if p_conversa is not null then
    select atendente_id into v_resp from public.conversas where id = p_conversa and organizacao_id = v_org;
  end if;
  -- já aberta? retorna a existente
  select id into v_id from public.oportunidades
    where organizacao_id = v_org and contato_id = p_contato and funil_id = p_funil and status = 'em_andamento' limit 1;
  if v_id is not null then return v_id; end if;

  -- GUARDA (2026-09-02): cliente com oportunidade GANHA no funil não reentra como lead novo.
  -- Só bloqueia 'ganho'; perdido/cancelado continuam podendo reentrar (recuperação).
  if exists (
    select 1 from public.oportunidades
    where organizacao_id = v_org and contato_id = p_contato and funil_id = p_funil and status = 'ganho'
  ) then
    raise exception 'cliente_ja_fechado_ganho' using errcode = 'check_violation';
  end if;

  -- cria (protegido pelo índice parcial; concorrência: on conflict do nothing + re-select)
  insert into public.oportunidades (organizacao_id, contato_id, funil_id, coluna_id, conversa_origem_id, canal_origem_id,
      responsavel_id, origem, status, etiquetas, tipo_servico, status_cancelamento, status_ressarcimento, ordem)
    values (v_org, p_contato, p_funil, v_col, p_conversa, p_canal, v_resp, p_origem, 'em_andamento',
      coalesce(v_tags, '{}'), 'analise_inicial', 'nao_se_aplica', 'nao_se_aplica', 0)
    on conflict (organizacao_id, contato_id, funil_id) where (status = 'em_andamento' and contato_id is not null) do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from public.oportunidades
      where organizacao_id = v_org and contato_id = p_contato and funil_id = p_funil and status = 'em_andamento' limit 1;
  end if;
  return v_id;
end $function$;
