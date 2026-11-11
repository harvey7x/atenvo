-- ─────────────────────────────────────────────────────────────────────────────
-- BOT — roteamento de consultor: PLACAR ACUMULADO (pedido do dono 2026-08-26).
--
-- Correção de justiça: o placar deixa de ser "do dia" e passa a ser o ACUMULADO
-- TOTAL de atribuições automáticas por atendente (org inteira, todas as campanhas).
-- Motivo: o teto era reavaliado por dia (fuso SP), então pequenas sobras diárias
-- se somavam e o total dos três drenava para longe (Matheus abriu ~23 de folga).
--
-- Nova regra (decisão do dono: "ninguém pode ficar com mais que o outro"):
--   • distribuição EXATAMENTE IGUAL → sempre vai pra quem tem MENOS no acumulado;
--   • gênero é só DESEMPATE entre quem está no menor placar:
--       mulher  → prefere Matheus;
--       homem   → prefere Giovana/Juliana;
--     a preferência só vale se o preferido JÁ estiver no menor placar (teto = 0),
--     senão o lead vai para quem tem menos — diferença máxima entre os três = 1;
--   • incerto → menor placar, desempate pela ordem fixa (Giovana → Juliana → Matheus);
--   • TRAVA: conversa que já tem atendente humano NÃO é tocada.
--
-- Efeito imediato: como Matheus está à frente no acumulado, os próximos leads vão
-- para Juliana/Giovana (as de menor placar) até os três encostarem — auto-nivela.
-- Placar consultável: vw_placar_roteamento_dia (mantida como quebra diária).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.bot_rotear_consultor(p_conversa uuid, p_genero text)
returns table (consultor_id uuid, consultor_chave text, ja_tinha_atendente boolean)
language plpgsql security definer set search_path to 'public'
as $fn$
declare
  v_org uuid; v_contato uuid; v_atendente uuid;
  v_genero text;
  v_escolhido uuid; v_chave text;
begin
  select cv.organizacao_id, cv.contato_id, cv.atendente_id
    into v_org, v_contato, v_atendente
    from public.conversas cv where cv.id = p_conversa;
  if v_org is null then raise exception 'conversa_invalida'; end if;
  -- mesma guarda das primitivas do bot: autenticado exige membership; service_role passa.
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;

  -- TRAVA: já tem atendente humano -> não atribui e não conta no placar.
  if v_atendente is not null then
    return query select null::uuid, null::text, true; return;
  end if;

  v_genero := case when p_genero in ('homem','mulher') then p_genero else 'ambiguo' end;

  -- Elegíveis = os três consultores fixos ainda membros ATIVOS da org, cada um com
  -- o placar ACUMULADO (total de atribuições automáticas na org). A escolha em um
  -- SELECT só:
  --   grupo 0 = preferido do gênero que JÁ está no menor placar (teto = 0);
  --   grupo 1 = todo o resto, por menor placar (desempate pela ordem fixa).
  -- Como o teto é 0, a preferência só decide EMPATE no topo do rodízio; quem estiver
  -- atrás sempre recebe primeiro. Diferença máxima entre os três permanece <= 1.
  select x.id, x.chave into v_escolhido, v_chave
  from (
    select c.id, c.chave, c.ordem, coalesce(p.cnt, 0) as placar,
           min(coalesce(p.cnt, 0)) over () as menor,
           ((v_genero = 'mulher' and c.chave = 'matheus')
             or (v_genero = 'homem' and c.chave in ('giovana','juliana'))) as preferido
    from (values
      ('a31b5fcb-d378-4490-83fe-a47a7c1ee847'::uuid, 'giovana', 1),
      ('d7e59652-d3eb-4d7d-8830-7fc780701a8e'::uuid, 'juliana', 2),
      ('4ac197b4-9600-4756-81aa-1ac29280df09'::uuid, 'matheus', 3)
    ) as c(id, chave, ordem)
    left join lateral (
      select count(*) as cnt from public.bot_roteamentos r
       where r.organizacao_id = v_org and r.consultor_id = c.id
    ) p on true
    where exists (select 1 from public.organizacao_usuarios ou
                   where ou.organizacao_id = v_org and ou.usuario_id = c.id and ou.status = 'ativo')
  ) x
  order by (case when x.preferido and (x.placar - x.menor) <= 0 then 0 else 1 end),
           x.placar asc, x.ordem asc
  limit 1;

  if v_escolhido is null then
    return query select null::uuid, null::text, false; return;   -- roteamento indefinido
  end if;

  insert into public.bot_roteamentos (organizacao_id, conversa_id, contato_id, consultor_id, genero)
  values (v_org, p_conversa, v_contato, v_escolhido, v_genero);

  return query select v_escolhido, v_chave, false;
end $fn$;

revoke execute on function public.bot_rotear_consultor(uuid, text) from public, anon;
grant execute on function public.bot_rotear_consultor(uuid, text) to authenticated, service_role;
