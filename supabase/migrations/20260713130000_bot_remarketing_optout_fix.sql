-- Fix do regex de opt-out em bot_remarketing_inbound:
--  * tokens-PREFIXO (descadastr, cancelar inscri) NÃO podem ter \y no fim — "descadastrar" tem
--    letra depois de "descadastr", então \y falhava e o opt-out não era detectado.
--  * separa em dois grupos: palavra-inteira (\y...\y) e prefixo (só \y no início).
--  * remove "chega" (ambíguo: "a análise chega hoje" não é opt-out).
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

  -- opt-out (sagrado): palavra-inteira OU prefixo. Acento inline (sem unaccent). Conservador.
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
    update public.oportunidades set coluna_id = v_col where id = v_opp;
  end if;

  return case when v_optout then 'optout' else 'respondeu' end;
end $$;

grant execute on function public.bot_remarketing_inbound(uuid, text) to service_role;
