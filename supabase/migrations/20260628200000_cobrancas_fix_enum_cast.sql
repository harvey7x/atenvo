-- Correção: status de cobrancas é enum cobranca_status; o CASE no recálculo precisa de cast explícito.
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
     set ciclos_pagos = coalesce(pagas,0), proxima_cobranca = prox,
         status = (case when coalesce(total_nc,0) > 0 and coalesce(restantes,0) = 0 then 'finalizado' else 'ativo' end)::public.cobranca_status
   where id = cid;
  return null;
end $$;
