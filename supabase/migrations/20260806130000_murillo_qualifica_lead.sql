-- ─────────────────────────────────────────────────────────────────────────────
-- KANBAN — auto-qualificação: lead de DISPARO que chama o Murillo chip vira
-- "Lead Qualificado" automaticamente (pedido do dono 2026-08-06).
--
-- Regra: mensagem INBOUND numa conversa do canal Murillo chip (numero_conectado
-- 555191035329), de um contato que RECEBEU disparo (existe em disparo_envios) e cuja
-- oportunidade em_andamento está na coluna de ENTRADA (Lead Novo) → move p/ Lead Qualificado.
-- Só quem veio de disparo; não move quem já passou do Lead Novo; idempotente (2ª msg não
-- reencontra opp na entrada). Trigger AFTER INSERT em mensagens, gated por direcao='entrada'
-- (não dispara função em outbound). SECURITY DEFINER (webhook insere via service_role).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.fn_murillo_qualifica_lead()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare v_org uuid; v_contato uuid; v_canal uuid; v_lq uuid;
begin
  select cv.canal_id, cv.contato_id, cv.organizacao_id into v_canal, v_contato, v_org
  from public.conversas cv where cv.id = new.conversa_id;
  if v_contato is null or v_org is null then return new; end if;
  if not exists (select 1 from public.canais c where c.id = v_canal and c.numero_conectado = '555191035329') then return new; end if;
  if not exists (select 1 from public.disparo_envios e where e.contato_id = v_contato) then return new; end if;
  select id into v_lq from public.funil_colunas where organizacao_id = v_org and nome = 'Lead Qualificado' and arquivada = false limit 1;
  if v_lq is null then return new; end if;
  update public.oportunidades o set coluna_id = v_lq
  where o.contato_id = v_contato and o.organizacao_id = v_org and o.status = 'em_andamento'
    and exists (select 1 from public.funil_colunas fc where fc.id = o.coluna_id and fc.entrada = true);
  return new;
end $fn$;

drop trigger if exists trg_murillo_qualifica on public.mensagens;
create trigger trg_murillo_qualifica after insert on public.mensagens
for each row when (new.direcao = 'entrada')
execute function public.fn_murillo_qualifica_lead();
