-- "Não elegível" + arquivar perdido (limpar o inbox)
--
-- Decisões do dono (27/08):
--  1) Renomear a coluna "Já tem processo" -> "Não elegível". Passa a ser o balde de
--     descarte/encerramento do funil (já tem processo + não recebe benefício). Filosofia:
--     "a gente não perde cliente, retrabalha" — por isso "não elegível" e não "perdido".
--  2) Quando a IA/qualificação detecta que a pessoa NÃO recebe benefício do INSS, o card vai
--     automaticamente para "Não elegível" com motivo_perda='nao_elegivel' (que o dashboard já
--     trata como DESCARTE, não como perda real — dashboard_motivos_descarte()).
--  3) Toda oportunidade que vira PERDIDA arquiva as conversas do contato, para não poluir o
--     inbox. É reversível: mensagem nova do cliente reabre a conversa (evolution-webhook).

-- 1) Rename da coluna (nada referencia por nome em código/funções; dashboard lê o nome dinâmico)
update public.funil_colunas
   set nome = 'Não elegível'
 where nome = 'Já tem processo';

-- 2) Trigger: opp vira PERDIDA -> arquiva as conversas abertas do contato.
--    Não arquiva se o contato ainda tem OUTRA oportunidade em andamento (negócio vivo).
--    Reversível: o webhook desarquiva quando chega mensagem nova.
create or replace function public.fn_arquivar_conversa_perdido()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if exists (
    select 1 from public.oportunidades o2
    where o2.contato_id = NEW.contato_id
      and o2.organizacao_id = NEW.organizacao_id
      and o2.status = 'em_andamento'
  ) then
    return NEW;
  end if;

  update public.conversas c
     set arquivada_em = now(), arquivada_por = null
   where c.contato_id = NEW.contato_id
     and c.organizacao_id = NEW.organizacao_id
     and c.arquivada_em is null;

  return NEW;
end $function$;

-- AFTER UPDATE sem "OF status": o status é alterado por opp_sync_fechamento (BEFORE, ao mover
-- coluna), e "UPDATE OF status" NÃO dispara para colunas mexidas só por trigger BEFORE. O WHEN de
-- um AFTER enxerga o NEW já modificado pelo BEFORE, então pega a virada coluna->perdido também.
drop trigger if exists trg_opp_arquivar_perdido on public.oportunidades;
create trigger trg_opp_arquivar_perdido
  after update on public.oportunidades
  for each row
  when (new.status = 'perdido' and old.status is distinct from 'perdido')
  execute function public.fn_arquivar_conversa_perdido();

-- 3) RPC: marca o contato como NÃO ELEGÍVEL (não recebe benefício).
--    Move a opp em andamento para a coluna perdida (resultado='perdido') com motivo 'nao_elegivel'
--    (descarte) e etiqueta. O trigger opp_sync_fechamento fecha como perdido; o
--    trg_opp_arquivar_perdido arquiva a conversa. Idempotente e forward-safe (só mexe em em_andamento).
create or replace function public.oportunidade_nao_elegivel(p_conversa uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org uuid; v_contato uuid; v_col uuid;
begin
  select organizacao_id, contato_id into v_org, v_contato
    from public.conversas where id = p_conversa;
  if v_contato is null or v_org is null then return; end if;

  -- coluna de descarte do funil (a única com resultado='perdido')
  select id into v_col
    from public.funil_colunas
    where organizacao_id = v_org
      and resultado = 'perdido'
      and coalesce(arquivada, false) = false
    order by ordem
    limit 1;
  if v_col is null then return; end if;

  update public.oportunidades o
     set coluna_id = v_col,
         motivo_perda = 'nao_elegivel',
         etiquetas = case
           when 'nao_elegivel' = any (coalesce(o.etiquetas, '{}'::text[])) then o.etiquetas
           else array_append(coalesce(o.etiquetas, '{}'::text[]), 'nao_elegivel')
         end
   where o.contato_id = v_contato
     and o.organizacao_id = v_org
     and o.status = 'em_andamento';
end $function$;

grant execute on function public.oportunidade_nao_elegivel(uuid) to service_role;

notify pgrst, 'reload schema';
