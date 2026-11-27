-- NOTIFICADOR sai do seletor "Responder por" (e das listagens tipo='whatsapp' em geral,
-- incluindo o contador de limite de chips): vira tipo='notificacao'.
-- Efeito colateral aceito: o card some das Integrações — reconectar o chip exige voltar
-- o tipo pra 'whatsapp' temporariamente (registrado na memória do projeto).
-- Cinto e suspensório: envio_restrito=true segue no canal — mesmo que algum cache antigo
-- do front ainda o mostre, o evolution-send recusa envio humano (409).

update public.canais set tipo = 'notificacao'
 where id = 'ce48aa0d-1cdb-4939-a7a8-aec5b0352d4a' and papel = 'notificacao';
