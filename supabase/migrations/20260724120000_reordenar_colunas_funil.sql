-- Reordenação de colunas do Kanban por arrasto.
--
-- Por que RPC e não N updates do front: renumerar N colunas com N chamadas PostgREST NÃO é
-- transacional — se uma falhar no meio (rede/RLS/trigger), o funil fica com ordens duplicadas ou
-- com buracos e o quadro embaralha para todo mundo. Aqui é uma função só = uma transação só.
--
-- COLUNA DE ENTRADA: existe o trigger trg_protege_coluna_entrada, que ABORTA se a coluna de
-- entrada sair da ordem 0. Decisão do dono: manter a entrada fixa na primeira posição. Esta função
-- respeita isso por construção — força a entrada em 0 e numera as demais a partir de 1, na ordem
-- recebida. Assim o front nunca consegue produzir um estado que o trigger recusaria.

create or replace function public.reordenar_colunas_funil(p_funil uuid, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_entrada uuid; v_id uuid; v_i int := 0;
begin
  select organizacao_id into v_org from public.funis where id = p_funil;
  if v_org is null then raise exception 'funil_invalido'; end if;
  -- chamada autenticada exige membership; service_role (auth.uid() null) é backend confiável.
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;

  -- nenhuma coluna de outro funil pode entrar na lista (evita reordenar o quadro alheio)
  if exists (
    select 1 from unnest(p_ids) as x(id)
    where not exists (select 1 from public.funil_colunas c where c.id = x.id and c.funil_id = p_funil)
  ) then raise exception 'coluna_de_outro_funil'; end if;

  select id into v_entrada from public.funil_colunas
   where funil_id = p_funil and entrada and not arquivada limit 1;

  if v_entrada is not null then
    update public.funil_colunas set ordem = 0 where id = v_entrada and ordem <> 0;
  end if;

  foreach v_id in array p_ids loop
    if v_entrada is not null and v_id = v_entrada then continue; end if;  -- entrada não se move
    v_i := v_i + 1;
    update public.funil_colunas set ordem = v_i where id = v_id and funil_id = p_funil;
  end loop;
end $function$;

revoke all on function public.reordenar_colunas_funil(uuid, uuid[]) from public, anon;
grant execute on function public.reordenar_colunas_funil(uuid, uuid[]) to authenticated, service_role;
