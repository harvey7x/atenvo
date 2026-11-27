-- =====================================================================
-- 43 — Endurecimento pós-caçada de erros (17/09):
-- (a) mover_turma/esvaziar_ciclos ficaram com EXECUTE herdado pra PUBLIC/anon
--     (as RPCs irmãs têm revoke). O gate is_at_least já barrava anon
--     (current_papel() = null), mas defesa em profundidade é padrão da casa.
-- (b) tg_leads_dia_carimbo v2: se o próprio UPDATE setar dia_alterado_em
--     explicitamente, o trigger RESPEITA (não sobrescreve com now()). Não muda
--     nenhum comportamento atual (ninguém seta explícito ainda); habilita o
--     futuro "Desfazer repõe o carimbo antigo" sem mexer de novo no trigger.
-- =====================================================================

revoke execute on function public.mover_turma(smallint, smallint) from public, anon;
revoke execute on function public.esvaziar_ciclos() from public, anon;

create or replace function public.tg_leads_dia_carimbo()
returns trigger language plpgsql as $$
begin
  if new.dia is distinct from old.dia
     and new.dia_alterado_em is not distinct from old.dia_alterado_em then
    new.dia_alterado_em := now();
  end if;
  return new;
end $$;
