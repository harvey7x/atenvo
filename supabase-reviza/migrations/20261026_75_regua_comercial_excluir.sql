-- 75 — Excluir mensagem na régua do comercial (dono 26/10: "quero que aqui dê para excluir a mensagem,
-- quero que o comercial também consiga fazer isso").
-- Excluir na régua de UM comercial = aquele passo da sequência padrão NÃO sai para os clientes dele
-- (a padrão e os outros comerciais não mudam). Fica gravado como uma versão com excluida = true;
-- "Voltar a usar" apaga a linha (volta a padrão). Mesmas regras de acesso da mig 74 (RLS por linha).
alter table public.wa_regua_comercial add column if not exists excluida boolean not null default false;
alter table public.wa_regua_comercial drop constraint if exists wa_regua_comercial_blocos;
alter table public.wa_regua_comercial add constraint wa_regua_comercial_blocos
  check (jsonb_typeof(blocos) = 'array' and (excluida or jsonb_array_length(blocos) > 0));
