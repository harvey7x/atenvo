-- Reviza — faixa do benefício (pedido do dono 11/09): em vez do salário exato,
-- só o que a tabela do INSS precisa: até 1 salário mínimo ou acima.
-- (a coluna salario continua existindo pros dados importados; a ficha passa a usar a faixa)
alter table public.leads add column if not exists faixa_beneficio text
  check (faixa_beneficio in ('ate_1sm','acima_1sm'));

-- preenche a faixa dos leads que já têm salário informado (1.630 = mínimo 2026)
update public.leads set faixa_beneficio = case when salario <= 1630 then 'ate_1sm' else 'acima_1sm' end
 where salario is not null and faixa_beneficio is null;
