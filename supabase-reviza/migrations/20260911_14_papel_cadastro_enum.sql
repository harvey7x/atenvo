-- Reviza — papel "cadastro" (pedido do dono 11/09): usuário que SÓ cadastra clientes
-- novos e marca reclamação/débito parado; sem painel, sem números, sem financeiro.
-- Parte 1: valor novo do enum. Fica numa migration própria porque um valor de enum
-- não pode ser USADO na mesma transação em que foi criado (policies entram na parte 2).
alter type public.papel_usuario add value if not exists 'cadastro';
