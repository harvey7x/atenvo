-- Fix: opt-out do remarketing move a opp p/ PERDIDO, mas o trigger opp_sync_fechamento EXIGE
-- motivo_perda ao entrar em coluna 'perdido' (senão RAISE 'motivo_perda_obrigatorio'/23514).
-- Sem isso, bot_remarketing_inbound falhava no opt-out: o move + status='optout' revertiam juntos,
-- e o webhook (try/catch) engolia o erro → o bot poderia reengajar quem pediu pra parar.
-- motivo_perda é texto livre (sem check) → gravamos 'opt_out_remarketing' (≠ 'outro', não exige desc),
-- preservando um motivo pré-existente via coalesce.
create or replace function public.bot_remarketing_inbound(p_conversa uuid, p_texto text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_contato uuid; v_br uuid; v_opp uuid; v_funil uuid; v_optout boolean; v_col uuid; v_alvo text;
begin
  select contato_id into v_contato from public.conversas where id = p_conversa;
  if v_contato is null then return 'sem_remarketing'; end if;

  select br.id, o.id, o.funil_id into v_br, v_opp, v_funil
  from public.bot_remarketing br
  join public.oportunidades o on o.id = br.oportunidade_id
  where o.contato_id = v_contato and br.status in ('ativo','pausado')
  order by br.criado_em desc
  limit 1;
  if v_br is null then return 'sem_remarketing'; end if;

  v_optout := (
       coalesce(p_texto,'') ~* '\y(sair|parar|pare|para de|n[ãa]o quero|remover|stop)\y'
    or coalesce(p_texto,'') ~* '\y(descadastr|cancelar? inscri)'
  );

  if v_optout then
    update public.bot_remarketing set status = 'optout' where id = v_br;
    v_alvo := 'PERDIDO';
  else
    update public.bot_remarketing set status = 'respondeu' where id = v_br;
    v_alvo := 'LEAD NOVO';
  end if;

  select id into v_col from public.funil_colunas
  where funil_id = v_funil and nome = v_alvo and arquivada = false limit 1;
  if v_col is not null then
    if v_optout then
      -- coluna PERDIDA exige motivo_perda (trigger). Preserva motivo já existente.
      update public.oportunidades
        set coluna_id = v_col, motivo_perda = coalesce(motivo_perda, 'opt_out_remarketing')
        where id = v_opp;
    else
      update public.oportunidades set coluna_id = v_col where id = v_opp;
    end if;
  end if;

  return case when v_optout then 'optout' else 'respondeu' end;
end $$;

grant execute on function public.bot_remarketing_inbound(uuid, text) to service_role;
