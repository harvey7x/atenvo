-- Reviza — MENSALIDADE DO SISTEMA (pedido do dono 01/10): todo dia 5, R$ 100,00 via Pix
-- (PushinPay) para manter o sistema no ar (WhatsApp, Square Cloud e Supabase).
-- · aparece DENTRO do sistema: faixa no topo para quem paga (admin/gestor/financeiro);
-- · sem pagamento em 8h a partir do Pix gerado → o painel BLOQUEIA (tela de pagamento)
--   até o Pix cair; destrava sozinho na confirmação (webhook + consulta a cada 5 min);
-- · o bloqueio é de TELA: nenhum dado é apagado, régua/envios seguem rodando;
-- · NINGUÉM da Reviza escreve aqui (nem admin): tabelas sem policy; quem grava é a edge
--   reviza-mensalidade (service_role). Liberação manual = só nós, por SQL.
-- · nasce DESLIGADA (mensalidade_config.ativa=false): ligar depois do token no ar.

create table if not exists public.mensalidade_config (
  id boolean primary key default true check (id),
  ativa boolean not null default false,          -- liga a geração automática do mês
  valor_centavos int not null default 10000 check (valor_centavos >= 50),
  dia_mes int not null default 5 check (dia_mes between 1 and 28),
  hora_brt int not null default 8 check (hora_brt between 0 and 23),
  prazo_horas int not null default 8 check (prazo_horas between 1 and 240),
  primeira_competencia text not null default '2026-10' check (primeira_competencia ~ '^\d{4}-\d{2}$'),
  isentos uuid[] not null default '{}',          -- nunca bloqueados (suporte)
  updated_at timestamptz not null default now()
);
insert into public.mensalidade_config(id) values (true) on conflict do nothing;
update public.mensalidade_config
   set isentos = array(select p.id from public.profiles p where p.nome = 'Matheus' and p.papel = 'admin')
 where id and isentos = '{}';

create table if not exists public.mensalidades (
  id uuid primary key default gen_random_uuid(),
  competencia text not null unique check (competencia ~ '^\d{4}-\d{2}$'),
  valor_centavos int not null check (valor_centavos >= 50),
  status text not null default 'aberta' check (status in ('aberta', 'paga', 'liberada', 'cancelada')),
  vence_em timestamptz,            -- 1º Pix gerado + prazo (gerar outro Pix NÃO reinicia o relógio)
  paga_em timestamptz,
  pix_atual text,                  -- transação PushinPay mostrada na tela
  obs text,                        -- liberação manual / cancelamento
  ultimo_erro text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mensalidade_pix (
  id text primary key,             -- id da transação no PushinPay (minúsculo)
  mensalidade_id uuid not null references public.mensalidades(id) on delete cascade,
  valor_centavos int not null,
  status text not null default 'created',   -- created | paid | canceled | expired (último visto)
  copia_cola text not null,
  qr_base64 text,
  expira_em timestamptz,
  pagador_nome text,
  e2e_id text,
  pago_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mensalidade_pix_mens_idx on public.mensalidade_pix(mensalidade_id);

alter table public.mensalidade_config enable row level security;
alter table public.mensalidades enable row level security;
alter table public.mensalidade_pix enable row level security;
revoke all on public.mensalidade_config, public.mensalidades, public.mensalidade_pix from anon, authenticated;

-- Estado para a TELA (único caminho de leitura do front). Bloqueio decidido pelo relógio
-- do SERVIDOR. O Pix só vai para quem paga; os demais só sabem que está bloqueado.
create or replace function public.mensalidade_estado()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_papel public.papel_usuario := public.current_papel();
  v_cfg public.mensalidade_config;
  m public.mensalidades;
  p public.mensalidade_pix;
  v_isento boolean;
  v_paga boolean;
begin
  if v_papel is null then return null; end if;
  select * into v_cfg from public.mensalidade_config where id;
  v_isento := auth.uid() = any(coalesce(v_cfg.isentos, '{}'));
  v_paga := v_papel in ('admin', 'gestor', 'financeiro') or v_isento;
  -- a mais ANTIGA em aberto (um mês que ficou pra trás é o que trava)
  select * into m from public.mensalidades where status = 'aberta' order by competencia limit 1;
  if m.id is null then
    return jsonb_build_object('aberta', false, 'agora', now());
  end if;
  if m.pix_atual is not null then
    select * into p from public.mensalidade_pix where id = m.pix_atual;
  end if;
  return jsonb_build_object(
    'aberta', true,
    'id', m.id,
    'competencia', m.competencia,
    'valor_centavos', m.valor_centavos,
    'vence_em', m.vence_em,
    'agora', now(),
    'vencida', m.vence_em is not null and now() >= m.vence_em,
    'bloqueado', m.vence_em is not null and now() >= m.vence_em and not v_isento,
    'isento', v_isento,
    'pode_pagar', v_paga,
    'pix', case when v_paga and p.id is not null and p.status = 'created'
                     and (p.expira_em is null or p.expira_em > now())
                then jsonb_build_object('copia_cola', p.copia_cola, 'qr', p.qr_base64, 'expira_em', p.expira_em) end,
    'erro', case when v_paga then m.ultimo_erro end
  );
end $$;
revoke all on function public.mensalidade_estado() from public, anon;
grant execute on function public.mensalidade_estado() to authenticated;

-- Baixa ATÔMICA (chamada só pela edge, depois de reconsultar a transação no PushinPay).
-- Retorna true se ESTA chamada deu a baixa (idempotente: webhook repetido = false).
create or replace function public.mensalidade_confirmar_pix(p_pix text, p_valor int, p_e2e text, p_pagador text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_pix public.mensalidade_pix;
  v_m public.mensalidades;
  v_rot text;
  u record;
begin
  select * into v_pix from public.mensalidade_pix where id = lower(p_pix) for update;
  if v_pix.id is null then return false; end if;
  update public.mensalidade_pix
     set status = 'paid', pago_em = coalesce(pago_em, now()), e2e_id = coalesce(p_e2e, e2e_id),
         pagador_nome = coalesce(p_pagador, pagador_nome), updated_at = now()
   where id = v_pix.id;
  select * into v_m from public.mensalidades where id = v_pix.mensalidade_id for update;
  if v_m.status <> 'aberta' or p_valor < v_m.valor_centavos then return false; end if;
  update public.mensalidades
     set status = 'paga', paga_em = now(), pix_atual = v_pix.id, ultimo_erro = null, updated_at = now()
   where id = v_m.id;
  v_rot := to_char(to_date(v_m.competencia || '-01', 'YYYY-MM-DD'), 'MM/YYYY');
  for u in select id from public.profiles where ativo and papel in ('admin', 'gestor', 'financeiro') loop
    perform public.notificar(u.id, 'mensalidade_paga', 'Mensalidade do sistema paga',
      'Pix de R$ ' || replace(to_char(v_m.valor_centavos / 100.0, 'FM999990.00'), '.', ',') || ' (' || v_rot || ') confirmado. Obrigado!', null);
  end loop;
  return true;
end $$;
revoke all on function public.mensalidade_confirmar_pix(text, int, text, text) from public, anon, authenticated;

-- Liberação MANUAL (só nós, via SQL): ex. pagou por fora, ou cortesia.
--   select public.mensalidade_liberar('2026-10', 'pagou por transferência');
create or replace function public.mensalidade_liberar(p_competencia text, p_obs text)
returns boolean language sql security definer set search_path = '' as $$
  with x as (
    update public.mensalidades set status = 'liberada', obs = p_obs, updated_at = now()
     where competencia = p_competencia and status = 'aberta' returning 1)
  select exists(select 1 from x)
$$;
revoke all on function public.mensalidade_liberar(text, text) from public, anon, authenticated;

-- cron a cada 5 min: gera a do mês no dia/hora e consulta Pix em aberto. Reaproveita o
-- header secreto do cron do motor (o segredo NÃO entra no repositório).
do $$
declare v_cmd text;
begin
  select replace(command, '/functions/v1/reviza-wa-motor', '/functions/v1/reviza-mensalidade')
    into v_cmd from cron.job where jobname = 'reviza_wa_motor';
  if v_cmd is null or v_cmd not like '%reviza-mensalidade%' then
    raise exception 'cron reviza_wa_motor não encontrado — sem ele não há o header x-motor-secret';
  end if;
  begin perform cron.unschedule('reviza_mensalidade'); exception when others then null; end;
  perform cron.schedule('reviza_mensalidade', '*/5 * * * *', v_cmd);
end $$;
