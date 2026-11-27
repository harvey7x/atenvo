-- 82 — Régua: horário de INÍCIO por comercial (dono 28/10: "o Eduardo quer que comece às 7 da manhã… o
-- Júnior… às 8… o Augusto também às 8… o resto pode manter igual").
-- wa_regua_config.horario_comercial = { "<NOME NORMALIZADO>": hora } — antes dessa hora a régua NÃO começa
-- mensagem pros clientes daquele comercial (a fila espera); o fim da janela (hora_fim) segue o mesmo pra
-- todos. Comercial fora do mapa = o início geral (hora_envio). Chave = wa_nome_chave (igual à régua do
-- comercial e ao motor: sem acento, espaços simples, maiúsculo).

create or replace function public.wa_horario_comercial_ok(h jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(h) = 'object'
     and not exists (
       select 1 from jsonb_each(h) e
        where e.key <> public.wa_nome_chave(e.key) or e.key = ''
           or jsonb_typeof(e.value) <> 'number'
           or (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
           or (e.value #>> '{}')::int not between 5 and 21)
$$;
revoke all on function public.wa_horario_comercial_ok(jsonb) from public, anon;
grant execute on function public.wa_horario_comercial_ok(jsonb) to authenticated, service_role;

alter table public.wa_regua_config add column if not exists horario_comercial jsonb not null default '{}'::jsonb;
alter table public.wa_regua_config drop constraint if exists wa_regua_config_horario_comercial;
alter table public.wa_regua_config add constraint wa_regua_config_horario_comercial
  check (public.wa_horario_comercial_ok(horario_comercial));

update public.wa_regua_config set horario_comercial = '{"EDUARDO": 7, "JUNIOR": 8, "AUGUSTO": 8}'::jsonb where id = 1;
