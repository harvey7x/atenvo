-- Reviza — motor automático da RÉGUA (fase 1: chave global + trava de dedup).
-- A régua nasce DESLIGADA (regra da casa: nenhum envio automático sem o gestor
-- ligar de propósito). Quando ligada, o reviza-wa-motor (cron por minuto) gera
-- 1x/dia os envios "Régua: <mensagem>" — cada cliente ativo no dia certo do
-- ciclo dele, pelo canal do atendente, e a trava garante que ninguém recebe a
-- mesma mensagem duas vezes na mesma competência.
-- Aplicada 2026-09-12 via MCP como "reviza_23_regua_motor".

-- chave global + hora do disparo diário (janela do contrato: 8h–20h)
create table public.wa_regua_config (
  id          smallint primary key default 1 check (id = 1),
  ativa       boolean  not null default false,
  hora_envio  smallint not null default 9 check (hora_envio between 8 and 19),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
insert into public.wa_regua_config (id) values (1);
create trigger wa_regua_config_updated_at before update on public.wa_regua_config
  for each row execute function public.tg_set_updated_at();

alter table public.wa_regua_config enable row level security;
create policy wa_rcfg_sel on public.wa_regua_config for select to authenticated
  using (public.current_papel() is not null);
create policy wa_rcfg_upd on public.wa_regua_config for update to authenticated
  using (public.is_at_least('gestor')) with check (public.is_at_least('gestor'));

-- trava de dedup: 1 disparo por cliente × mensagem × competência (chave =
-- 'YYYY-MM' do vencimento; p/ mensagem de cliente específico, 'dia:YYYY-MM-DD').
-- Escrita SÓ pelo motor (service role) — nenhuma policy de insert/update/delete.
create table public.wa_regua_disparos (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  regua_msg_id  uuid not null references public.wa_regua_msgs(id) on delete cascade,
  chave         text not null,
  envio_id      uuid references public.wa_envios(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (lead_id, regua_msg_id, chave)
);
alter table public.wa_regua_disparos enable row level security;
create policy wa_rdis_sel on public.wa_regua_disparos for select to authenticated
  using (public.current_papel() is not null);
