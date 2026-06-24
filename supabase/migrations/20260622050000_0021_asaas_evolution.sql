-- ============================================================
-- 0021 — Integrações reais: Asaas (assinatura) + Evolution (WhatsApp por QR Code).
-- Apenas aditivo. Não altera RLS de papéis (0015) nem grants base (0020),
-- exceto conceder o necessário às novas colunas/tabela.
-- ============================================================

-- ===================== ASAAS (faturamento da assinatura) =====================
-- Novo estado: assinatura criada, aguardando confirmação de pagamento.
alter type public.assinatura_status add value if not exists 'aguardando_pagamento';

alter table public.organizacoes add column if not exists asaas_customer_id text;
alter table public.assinaturas   add column if not exists asaas_subscription_id text;
alter table public.assinaturas   add column if not exists checkout_url text;

create unique index if not exists uq_org_asaas_customer on public.organizacoes (asaas_customer_id) where asaas_customer_id is not null;
create unique index if not exists uq_assinatura_asaas    on public.assinaturas   (asaas_subscription_id) where asaas_subscription_id is not null;

-- Referência idempotente da cobrança Asaas (paymentId) em faturas/pagamentos.
alter table public.faturas    add column if not exists asaas_payment_id text;
alter table public.pagamentos add column if not exists asaas_payment_id text;
create unique index if not exists uq_faturas_asaas    on public.faturas    (asaas_payment_id) where asaas_payment_id is not null;
create unique index if not exists uq_pagamentos_asaas on public.pagamentos (asaas_payment_id) where asaas_payment_id is not null;

-- ===================== EVOLUTION / WHATSAPP (provider em canais) =====================
alter table public.canais add column if not exists provider text;          -- ex.: 'evolution'
alter table public.canais add column if not exists instancia_externa text; -- nome/id da instância no provedor
alter table public.canais add column if not exists numero_conectado text;
alter table public.canais add column if not exists conectado_em timestamptz;
create unique index if not exists uq_canais_instancia on public.canais (instancia_externa) where instancia_externa is not null;

-- ===================== Idempotência de webhooks (Asaas + Evolution) =====================
create table if not exists public.webhook_eventos (
  id             uuid primary key default gen_random_uuid(),
  provider       text not null,                 -- 'asaas' | 'evolution'
  evento_id      text not null,                 -- id único do evento no provedor
  tipo           text,
  organizacao_id uuid references public.organizacoes(id) on delete set null,
  payload        jsonb not null default '{}',
  processado_em  timestamptz,
  criado_em      timestamptz not null default now(),
  unique (provider, evento_id)
);
alter table public.webhook_eventos enable row level security;
-- Sem policies: anon/authenticated não acessam. Apenas service_role (edge functions).
revoke all on public.webhook_eventos from anon, authenticated;
grant all on public.webhook_eventos to service_role;

-- ===================== Fontes de aquisição por organização =====================
-- Corrige a unicidade global de slug (multi-tenant): slug é único POR organização.
alter table public.fontes_aquisicao drop constraint if exists fontes_aquisicao_slug_key;
drop index if exists fontes_aquisicao_slug_key;
create unique index if not exists uq_fontes_org_slug on public.fontes_aquisicao (organizacao_id, slug);

-- Fontes padrão para organizações existentes (Tráfego 1/2, Sistema URA, Orgânico, Outra).
insert into public.fontes_aquisicao (organizacao_id, nome, slug)
select o.id, v.nome, v.slug
from public.organizacoes o
cross join (values
  ('Tráfego 1','trafego_1'),
  ('Tráfego 2','trafego_2'),
  ('Sistema URA','sistema_ura'),
  ('Orgânico','organico'),
  ('Outra','outra')
) v(nome, slug)
on conflict (organizacao_id, slug) do nothing;

-- ===================== Realtime (mensagens chegam na tela em tempo real) =====================
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.mensagens'; exception when duplicate_object then null; when others then null; end;
  begin execute 'alter publication supabase_realtime add table public.conversas'; exception when duplicate_object then null; when others then null; end;
end $$;

notify pgrst, 'reload schema';
