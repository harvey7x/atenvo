create unique index if not exists idx_mensagens_id_externo_unico
on mensagens (id_externo) where id_externo is not null;
