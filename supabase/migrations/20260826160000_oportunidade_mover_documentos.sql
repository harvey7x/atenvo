-- Move o card do Kanban para "Documentos" quando o lead envia documentação.
--
-- Chamada pela IA SDR (worker) quando reconhece um documento (identidade / comprovante / extrato).
-- FORWARD-ONLY: só move quem está ANTES de "Documentos" (Lead Novo/Qualificado/Reunião ou sem
-- coluna) — nunca puxa de volta quem já está em Assinar/Fechado, e nunca mexe em opp fechada.
-- Idempotente: se já está em Documentos (ou adiante), não faz nada.

create or replace function public.oportunidade_mover_documentos(p_conversa uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org uuid; v_contato uuid; v_doc uuid; v_doc_ordem int;
begin
  select organizacao_id, contato_id into v_org, v_contato from public.conversas where id = p_conversa;
  if v_contato is null or v_org is null then return; end if;

  select id, ordem into v_doc, v_doc_ordem
    from public.funil_colunas
    where organizacao_id = v_org and nome = 'Documentos' and arquivada = false
    order by ordem limit 1;
  if v_doc is null then return; end if;

  update public.oportunidades o
    set coluna_id = v_doc
  where o.contato_id = v_contato
    and o.organizacao_id = v_org
    and o.status = 'em_andamento'
    and o.coluna_id is distinct from v_doc
    and ( o.coluna_id is null
          or exists (select 1 from public.funil_colunas fc where fc.id = o.coluna_id and fc.ordem < v_doc_ordem) );
end $function$;

grant execute on function public.oportunidade_mover_documentos(uuid) to service_role;

notify pgrst, 'reload schema';
