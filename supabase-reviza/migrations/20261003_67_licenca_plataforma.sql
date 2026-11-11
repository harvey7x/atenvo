-- ============================================================================
-- Reviza · mig 67 — MENSALIDADE DA PLATAFORMA (licença) — dono 03/10, via Matheus
--
-- O escritório paga R$ 100,00/mês (custo de infraestrutura: Supabase + Square
-- Cloud) por Pix via PushinPay. Regras de produto:
-- · a fatura do mês nasce no dia 1º (cron da edge reviza-licenca; roda todo dia,
--   então um dia 1º com a PushinPay fora do ar se recupera sozinho no dia 2);
-- · vencimento dia 5; BLOQUEIO dia 5 às 14:00 de Brasília;
-- · do dia 1º até o bloqueio, SÓ ADMINS veem a faixa de aviso (decisão do front
--   — a RPC devolve o mesmo estado para todos);
-- · das 14h do dia 5 em diante, com a fatura ainda aberta: tela cheia de
--   bloqueio para TODOS, com QR + copia-e-cola; pagou → libera sozinho
--   (webhook da PushinPay + botão "Já paguei" que re-confere na API).
-- · FAIL-OPEN: sem licença ativa, sem fatura do mês corrente ou fatura
--   cancelada → o sistema NUNCA trava (PushinPay fora do ar, token ausente,
--   recurso desligado… tudo cai no "ok"). Um mês que virou sem pagar também
--   não trava: a régua é sempre a fatura do MÊS CORRENTE. `ativo` nasce FALSE.
--
-- Escrita SÓ pela edge reviza-licenca (service_role): as duas tabelas ficam com
-- RLS ligada e SEM policy de escrita. authenticated só LÊ sistema_faturas (a
-- tela de bloqueio é de todos); sistema_licenca não tem select direto — o front
-- enxerga tudo pela RPC licenca_estado(). A baixa é de confiança zero no
-- payload: o webhook re-consulta a transação na API da PushinPay com o nosso
-- token antes de marcar paga (gravação na edge, não aqui).
--
-- Este desenho SUBSTITUI o da mig 66 (20261001_66_mensalidade_sistema): regras
-- novas do dono (bloqueio em dia/hora fixos, não 8h após o Pix). As tabelas e o
-- cron reviza_mensalidade da mig 66 estão APLICADOS em produção porém inertes
-- (mensalidade_config.ativa = false, zero faturas) — ficam intocados aqui; a
-- aposentadoria deles é uma decisão à parte, antes de ligar sistema_licenca.ativo.
--
-- Tudo idempotente: if not exists / on conflict / drop policy if exists /
-- create or replace / revoke+grant re-executam limpos.
-- ============================================================================

-- ---------------------------------------------------------------------
-- 1) Configuração (singleton) — nasce DESLIGADA
-- ---------------------------------------------------------------------
create table if not exists public.sistema_licenca (
  singleton      boolean primary key default true check (singleton),
  ativo          boolean not null default false,                                  -- master switch: false = recurso inexistente (fail-open)
  valor_centavos int not null default 10000 check (valor_centavos > 0),           -- R$ 100,00
  dia_venc       smallint not null default 5 check (dia_venc between 1 and 28),   -- ≤ 28: existe em todo mês
  hora_bloqueio  smallint not null default 14 check (hora_bloqueio between 0 and 23), -- hora BRT do dia_venc
  atualizado_em  timestamptz not null default now()
);
insert into public.sistema_licenca (singleton) values (true) on conflict do nothing;

-- ---------------------------------------------------------------------
-- 2) Faturas — uma por competência ('AAAA-MM'); criada pelo cron da edge
-- ---------------------------------------------------------------------
create table if not exists public.sistema_faturas (
  id                  uuid primary key default gen_random_uuid(),
  comp                text not null unique check (comp ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  valor_centavos      int not null check (valor_centavos > 0),  -- congelado da config na criação
  status              text not null default 'aberta' check (status in ('aberta', 'paga', 'cancelada')),
  pix_id              text,                                     -- id da transação na PushinPay
  pix_copia_cola      text,                                     -- qr_code (copia-e-cola)
  qr_base64           text,                                     -- qr_code_base64 (imagem)
  criado_em           timestamptz not null default now(),
  pago_em             timestamptz,
  pago_valor_centavos int,
  pago_nome           text
);

-- ---------------------------------------------------------------------
-- 3) RLS + grants (escrita SÓ service_role; grants no padrão da mig 65:
--    anon sem nada, authenticated sem TRUNCATE/TRIGGER/REFERENCES — aqui
--    só SELECT em sistema_faturas, e nada em sistema_licenca)
-- ---------------------------------------------------------------------
alter table public.sistema_licenca enable row level security;
alter table public.sistema_faturas enable row level security;

revoke all on table public.sistema_licenca, public.sistema_faturas from public, anon, authenticated;

-- a tela de bloqueio é de todos os usuários logados (com profile)
drop policy if exists sistema_faturas_sel on public.sistema_faturas;
create policy sistema_faturas_sel on public.sistema_faturas for select to authenticated
  using ((select public.current_papel()) is not null);
grant select on table public.sistema_faturas to authenticated;

-- ---------------------------------------------------------------------
-- 4) RPC licenca_estado() — único caminho de leitura do front.
--    O relógio é o do SERVIDOR, calculado em America/Sao_Paulo:
--    · 'ok'        → sem licença ativa / sem fatura do mês / paga / cancelada
--    · 'aviso'     → fatura do mês aberta, antes do dia_venc às hora_bloqueio
--    · 'bloqueado' → fatura do mês aberta, do bloqueio em diante
-- ---------------------------------------------------------------------
create or replace function public.licenca_estado()
  returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cfg public.sistema_licenca;
  f public.sistema_faturas;
  v_agora timestamp;        -- agora, visto de Brasília (sem fuso)
  v_vence date;             -- dia_venc do mês corrente (BRT)
  v_bloqueia timestamptz;   -- dia_venc às hora_bloqueio BRT, como instante absoluto
begin
  v_agora := now() at time zone 'America/Sao_Paulo';
  select * into v_cfg from public.sistema_licenca where singleton;
  select * into f from public.sistema_faturas where comp = to_char(v_agora, 'YYYY-MM');

  -- FAIL-OPEN: qualquer coisa que não seja "fatura do mês corrente em aberto" libera
  if not coalesce(v_cfg.ativo, false) or f.id is null or f.status = 'cancelada' then
    return jsonb_build_object('estado', 'ok');
  end if;
  if f.status = 'paga' then
    return jsonb_build_object('estado', 'ok', 'pago_em', f.pago_em);
  end if;

  -- fatura ABERTA — monta a régua do mês. O cast "timestamp at time zone" lê a
  -- data/hora como PAREDE de São Paulo e devolve o timestamptz certo (não usar
  -- "timestamptz at time zone", que faria a conversão inversa).
  v_vence := make_date(extract(year from v_agora)::int, extract(month from v_agora)::int, v_cfg.dia_venc::int);
  v_bloqueia := (v_vence::timestamp + make_interval(hours => v_cfg.hora_bloqueio::int)) at time zone 'America/Sao_Paulo';

  return jsonb_build_object(
    'estado', case when now() >= v_bloqueia then 'bloqueado' else 'aviso' end,
    'comp', f.comp,
    'valor_centavos', f.valor_centavos,
    'vence_em', to_char(v_vence, 'YYYY-MM-DD'),
    'bloqueia_em', v_bloqueia,
    'pix_copia_cola', f.pix_copia_cola,
    'qr_base64', f.qr_base64,
    'pago_em', f.pago_em
  );
end $$;
revoke all on function public.licenca_estado() from public, anon;
grant execute on function public.licenca_estado() to authenticated;
