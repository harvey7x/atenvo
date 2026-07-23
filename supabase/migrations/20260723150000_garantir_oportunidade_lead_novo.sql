-- Regra: TODO lead real precisa ter oportunidade no Kanban (Funil principal → LEAD NOVO).
--
-- Buraco atual: os webhooks só chamam garantir_oportunidade_entrada para contato RECÉM-CRIADO.
-- Contato que já existia (criado antes da feature, à mão, por evolution-start, ou alvo de merge)
-- volta a falar e NÃO entra no Kanban. Além disso o funil é resolvido no caller (.eq padrao) —
-- se o padrão sumir, ninguém entra, silenciosamente.
--
-- Esta RPC CENTRALIZA a regra: resolve o funil principal sozinha, é idempotente, e aplica a
-- decisão do dono — contato que JÁ TEVE oportunidade FECHADA (ganho/perdido/cancelado) NÃO
-- reentra sozinho (só com p_forcar). Assim um cliente ganho que volta a mandar mensagem não
-- reaparece como lead novo no topo do funil.
--
-- Reaproveita a primitiva garantir_oportunidade_entrada para o INSERT (mesma coluna de entrada,
-- herança de atendente/etiquetas, mesmo índice único de idempotência). Uma fonte da verdade.

create or replace function public.garantir_oportunidade_lead_novo(
  p_contato uuid,
  p_conversa uuid default null,
  p_canal uuid default null,
  p_origem text default null,
  p_forcar boolean default false
)
returns table (oportunidade_id uuid, criou boolean, motivo text)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_org uuid; v_funil uuid; v_id uuid; v_tem_fechada boolean;
begin
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  -- mesma guarda da primitiva: chamada autenticada exige membership; service_role (uid null) é backend confiável.
  if auth.uid() is not null and not public.is_member(v_org) then raise exception 'sem_permissao'; end if;

  -- Funil principal = padrao=true (não pelo nome). Desempate determinístico.
  select id into v_funil from public.funis
   where organizacao_id = v_org and padrao and not arquivado
   order by ordem asc, criado_em asc, id asc limit 1;
  -- Fallback: org sem padrão marcado -> funil não-arquivado mais antigo (evita "lead sumido" silencioso).
  if v_funil is null then
    select id into v_funil from public.funis
     where organizacao_id = v_org and not arquivado
     order by ordem asc, criado_em asc, id asc limit 1;
  end if;
  if v_funil is null then
    return query select null::uuid, false, 'sem_funil'; return;
  end if;

  -- Já tem oportunidade ATIVA no funil? Retorna a existente (não duplica).
  select id into v_id from public.oportunidades
   where organizacao_id = v_org and contato_id = p_contato and funil_id = v_funil and status = 'em_andamento'
   limit 1;
  if v_id is not null then
    return query select v_id, false, 'ja_ativa'; return;
  end if;

  -- DECISÃO DO DONO: contato que já teve oportunidade FECHADA não reentra automático.
  -- (p_forcar=true reserva o caminho manual para reengajar um perdido/ganho, se um dia houver regra.)
  if not p_forcar then
    select exists(
      select 1 from public.oportunidades
       where organizacao_id = v_org and contato_id = p_contato and funil_id = v_funil
         and status in ('ganho','perdido','cancelado')
    ) into v_tem_fechada;
    if v_tem_fechada then
      return query select null::uuid, false, 'tem_opp_fechada'; return;
    end if;
  end if;

  -- Cria via primitiva idempotente (coluna de entrada, atendente/etiquetas herdados, ON CONFLICT).
  v_id := public.garantir_oportunidade_entrada(p_contato, v_funil, p_origem, p_conversa, p_canal);
  return query select v_id, (v_id is not null), coalesce(case when v_id is not null then 'criada' end, 'nao_criada');
end $function$;

revoke all on function public.garantir_oportunidade_lead_novo(uuid, uuid, uuid, text, boolean) from public, anon;
grant execute on function public.garantir_oportunidade_lead_novo(uuid, uuid, uuid, text, boolean) to authenticated, service_role;
