-- Correção: cobrancas.ciclos_restantes é GENERATED ALWAYS (GREATEST(ciclos_totais - ciclos_pagos, 0)).
-- As funções não devem escrever nessa coluna. Substitui criar_cobranca_com_parcelas e fn_cobranca_recalc.

create or replace function public.criar_cobranca_com_parcelas(
  p_contato uuid, p_valor numeric, p_data_primeira date, p_ciclos int default 6,
  p_responsavel uuid default null, p_servico text default null, p_observacoes text default null)
  returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid; v_uid uuid := auth.uid(); i int; v_venc date; v_dia int;
begin
  if v_uid is null then raise exception 'usuario_autenticado_obrigatorio'; end if;
  select organizacao_id into v_org from public.contatos where id = p_contato;
  if v_org is null then raise exception 'contato_invalido'; end if;
  if not public.cobranca_gestor(v_org) then raise exception 'sem_permissao'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'valor_invalido'; end if;
  if p_ciclos < 1 or p_ciclos > 60 then raise exception 'ciclos_invalido'; end if;
  if p_data_primeira is null then raise exception 'data_invalida'; end if;
  v_dia := extract(day from p_data_primeira)::int;
  insert into public.cobrancas(organizacao_id, contato_id, responsavel_id, servico, valor_mensal,
      ciclos_totais, ciclos_pagos, dia_cobranca, data_inicio, proxima_cobranca, status, observacoes)
    values (v_org, p_contato, p_responsavel, p_servico, p_valor, p_ciclos, 0, v_dia,
      p_data_primeira, p_data_primeira, 'ativo', p_observacoes)
    returning id into v_id;   -- ciclos_restantes é gerada (não inserir)
  for i in 0..(p_ciclos-1) loop
    v_venc := least(
      ((date_trunc('month', p_data_primeira) + (i||' months')::interval)::date + ((v_dia-1)||' days')::interval)::date,
      (date_trunc('month', (date_trunc('month', p_data_primeira) + (i||' months')::interval)) + interval '1 month - 1 day')::date);
    insert into public.cobranca_pagamentos(organizacao_id, cobranca_id, ciclo, valor, data_prevista, status)
      values (v_org, v_id, i+1, p_valor, v_venc, 'prevista');
  end loop;
  return v_id;
end $$;

create or replace function public.fn_cobranca_recalc() returns trigger
  language plpgsql set search_path = public as $$
declare cid uuid; pagas int; restantes int; prox date; cur text; total_nc int;
begin
  if tg_op = 'DELETE' then cid := OLD.cobranca_id; else cid := NEW.cobranca_id; end if;
  select status::text into cur from public.cobrancas where id = cid;
  if cur = 'cancelado' then return null; end if;
  select count(*) filter (where status='paga'),
         count(*) filter (where status in ('prevista','nao_paga')),
         count(*) filter (where status <> 'cancelada')
    into pagas, restantes, total_nc from public.cobranca_pagamentos where cobranca_id = cid;
  select coalesce(
    (select min(data_prevista) from public.cobranca_pagamentos where cobranca_id=cid and status='nao_paga'),
    (select min(data_prevista) from public.cobranca_pagamentos where cobranca_id=cid and status='prevista' and data_prevista < current_date),
    (select min(data_prevista) from public.cobranca_pagamentos where cobranca_id=cid and status='prevista' and data_prevista >= current_date)
  ) into prox;
  update public.cobrancas
     set ciclos_pagos = coalesce(pagas,0), proxima_cobranca = prox,  -- ciclos_restantes é gerada
         status = case when coalesce(total_nc,0) > 0 and coalesce(restantes,0) = 0 then 'finalizado' else 'ativo' end
   where id = cid;
  return null;
end $$;
