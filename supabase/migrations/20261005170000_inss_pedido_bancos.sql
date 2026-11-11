-- Coletor INSS: bancos identificados no consignado (05/10/2026).
--
-- O extrato de consignado revela COM QUAIS BANCOS o cliente tem contrato ativo
-- (empréstimos e cartões RMC/RCC) — é o dado que decide elegibilidade para a
-- equipe. O coletor extrai do PDF (bancos.py) e manda junto com o `concluir`;
-- fica no pedido e aparece na ficha do cliente, sem o atendente abrir o PDF.
-- Formato dos itens: "Banco BMG (318)" ou "Facta Financeira (935) — cartão RCC".

alter table public.inss_pedidos add column bancos text[];
