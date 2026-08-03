create table if not exists public.checklist_modelo (
  item_slug   text primary key,
  secao       text not null,
  rotulo      text not null,
  ordem       int  not null,
  obrigatorio boolean not null default true
);

insert into public.checklist_modelo (item_slug, secao, rotulo, ordem, obrigatorio) values
  ('carta_concessao',             'meu_inss',           'Carta de concessão',                1, true),
  ('extrato_consignado',          'meu_inss',           'Extrato de consignado',             2, true),
  ('extrato_pagamento_beneficio', 'meu_inss',           'Extrato de pagamento do benefício', 3, true),
  ('comprovante_renda',           'meu_inss',           'Comprovante de renda',              4, true),
  ('situacao_cadastral',          'gov',                'Situação cadastral',                5, true),
  ('irpf_2026',                   'gov',                'IRPF 2026',                         6, true),
  ('irpf_2025',                   'gov',                'IRPF 2025',                         7, true),
  ('irpf_2024',                   'gov',                'IRPF 2024',                         8, true),
  ('rg_frente',                   'documentos_cliente', 'RG frente',                         9, true),
  ('rg_verso',                    'documentos_cliente', 'RG verso',                         10, true),
  ('comprovante_residencia',      'documentos_cliente', 'Comprovante de residência',        11, true),
  ('selfie',                      'documentos_cliente', 'Selfie',                           12, true),
  ('email',                       'documentos_cliente', 'E-mail',                           13, true),
  ('documento_declarante',        'documentos_cliente', 'Documento do declarante',          14, false)
on conflict (item_slug) do nothing;

create table if not exists public.oportunidade_checklist (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null,
  oportunidade_id uuid not null references public.oportunidades(id) on delete cascade,
  item_slug       text not null references public.checklist_modelo(item_slug),
  feito           boolean not null default false,
  feito_em        timestamptz,
  feito_por       uuid,
  criado_em       timestamptz not null default now(),
  unique (oportunidade_id, item_slug)
);
create index if not exists idx_opp_checklist_opp on public.oportunidade_checklist(oportunidade_id);

create or replace function public.fn_checklist_stamp()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if NEW.feito and (TG_OP='INSERT' or not coalesce(OLD.feito,false)) then
    NEW.feito_em := now();
    NEW.feito_por := coalesce(NEW.feito_por, auth.uid());
  elsif not NEW.feito then
    NEW.feito_em := null; NEW.feito_por := null;
  end if;
  return NEW;
end $fn$;

drop trigger if exists trg_checklist_stamp on public.oportunidade_checklist;
create trigger trg_checklist_stamp
  before insert or update on public.oportunidade_checklist
  for each row execute function public.fn_checklist_stamp();

alter table public.checklist_modelo enable row level security;
alter table public.oportunidade_checklist enable row level security;

drop policy if exists checklist_modelo_sel on public.checklist_modelo;
create policy checklist_modelo_sel on public.checklist_modelo
  for select using (auth.uid() is not null);

drop policy if exists opp_checklist_sel on public.oportunidade_checklist;
create policy opp_checklist_sel on public.oportunidade_checklist
  for select using (public.is_platform_admin() or public.is_member(organizacao_id));

drop policy if exists opp_checklist_ins on public.oportunidade_checklist;
create policy opp_checklist_ins on public.oportunidade_checklist
  for insert with check (public.is_member(organizacao_id));

drop policy if exists opp_checklist_upd on public.oportunidade_checklist;
create policy opp_checklist_upd on public.oportunidade_checklist
  for update using (public.is_member(organizacao_id)) with check (public.is_member(organizacao_id));
