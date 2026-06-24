-- Estados de exclusão lógica do canal (#5). Aditivo; não usados nesta migration.
ALTER TYPE integracao_status ADD VALUE IF NOT EXISTS 'removido';
ALTER TYPE integracao_status ADD VALUE IF NOT EXISTS 'arquivado';
