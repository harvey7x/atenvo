-- 78 — Régua: janela da MANHÃ + proteção contra queda do número (dono 27/10: "a cobrança começaria tipo
-- às 5 da manhã e terminaria às 10 no máximo… com um ajuste muito bom para que o WhatsApp não caia").
--  · hora_envio (início) pode ser a partir das 5h; hora_fim = até que horas sai (exclusivo);
--  · pausa longa por número: a cada `pausa_cada` mensagens enviadas no dia, o número descansa
--    `pausa_min` minutos (além do intervalo sorteado entre clientes). 0 = sem pausa longa.
alter table public.wa_regua_config drop constraint if exists wa_regua_config_hora_envio_check;
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.wa_regua_config'::regclass and contype = 'c'
            and pg_get_constraintdef(oid) ilike '%hora_envio >= 8%' loop
    execute format('alter table public.wa_regua_config drop constraint %I', c);
  end loop;
end $$;
alter table public.wa_regua_config add column if not exists hora_fim smallint not null default 20;
alter table public.wa_regua_config add column if not exists pausa_cada smallint not null default 15;
alter table public.wa_regua_config add column if not exists pausa_min smallint not null default 5;
alter table public.wa_regua_config drop constraint if exists wa_regua_config_janela;
alter table public.wa_regua_config add constraint wa_regua_config_janela
  check (hora_envio between 5 and 21 and hora_fim between 6 and 22 and hora_fim > hora_envio);
alter table public.wa_regua_config drop constraint if exists wa_regua_config_pausa;
alter table public.wa_regua_config add constraint wa_regua_config_pausa
  check (pausa_cada between 0 and 200 and pausa_min between 0 and 120);
