drop index if exists idx_mensagens_id_externo_unico;
create unique index if not exists idx_mensagens_id_externo_unico_full on mensagens (id_externo);
