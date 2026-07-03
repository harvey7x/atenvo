-- WhatsApp @lid: identidade protegida. O LID NUNCA deve virar nome do contato.
-- Reutiliza a infra existente (contato_identidades guarda jid/lid; wa_vincular_numero faz o vínculo manual
-- auditado; evolution-send v23 valida destino no onWhatsApp; webhook #7 auto-recupera PN). Esta migration:
--  1) estado de identidade em contatos (tipo/resolvida_em/fonte) — telefone_confirmado = telefone not null;
--     whatsapp_jid/whatsapp_lid permanecem em contato_identidades (tipo whatsapp / outro+evolution_lid).
--  2) mapa canônico LID->PN por organização E CANAL (LID é por-conexão: o mesmo LID pode ser pessoas
--     diferentes em números de WhatsApp diferentes — por isso canal_id entra na chave).
--  3) backfill: renomeia contatos cujo NOME é um LID cru para "Identidade protegida" (sem inventar telefone).

-- ===== 1) Estado de identidade no contato =====
alter table public.contatos
  add column if not exists identidade_tipo text,           -- 'telefone' | 'lid_pendente' | 'resolvido_manual'
  add column if not exists identidade_resolvida_em timestamptz,
  add column if not exists identidade_fonte text;          -- 'webhook_pn' | 'backfill' | 'manual' | 'historico'

comment on column public.contatos.identidade_tipo is 'telefone=PN confirmado; lid_pendente=só LID (sem telefone); resolvido_manual=vínculo manual. telefone_confirmado := (telefone is not null).';

-- ===== 2) Mapa LID<->PN por organização e canal =====
create table if not exists public.wa_lid_map (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  canal_id uuid references public.canais(id) on delete set null,
  lid text not null,                       -- dígitos do LID (sem @lid)
  jid_telefone text,                       -- ...@s.whatsapp.net quando conhecido
  telefone_normalizado text,               -- dígitos do PN quando conhecido
  fonte text not null default 'webhook',   -- webhook | backfill | manual
  confirmado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- Unicidade por (org, canal, lid). canal_id null tratado como um "balde" único por org+lid.
create unique index if not exists uq_wa_lid_map_org_canal_lid
  on public.wa_lid_map (organizacao_id, coalesce(canal_id,'00000000-0000-0000-0000-000000000000'::uuid), lid);
create index if not exists idx_wa_lid_map_org_tel on public.wa_lid_map (organizacao_id, telefone_normalizado);

alter table public.wa_lid_map enable row level security;
-- Leitura: membros ativos da organização. Escrita: só service_role (webhook / RPC de vínculo).
drop policy if exists wa_lid_map_sel on public.wa_lid_map;
create policy wa_lid_map_sel on public.wa_lid_map for select to authenticated
  using (public.is_member(organizacao_id) or public.is_platform_admin());

create or replace function public.fn_wa_lid_map_touch() returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists trg_wa_lid_map_touch on public.wa_lid_map;
create trigger trg_wa_lid_map_touch before update on public.wa_lid_map
  for each row execute function public.fn_wa_lid_map_touch();

-- ===== 3) Backfill (sem inventar telefone) =====
-- 3a) popula o mapa a partir das identidades LID já existentes (canal = conversa mais recente do contato).
insert into public.wa_lid_map (organizacao_id, canal_id, lid, jid_telefone, telefone_normalizado, fonte, confirmado)
select ci.organizacao_id,
       (select cv.canal_id from public.conversas cv where cv.contato_id=ci.contato_id and cv.canal_id is not null order by cv.criado_em desc limit 1),
       ci.valor_normalizado,
       (select w.valor from public.contato_identidades w where w.contato_id=ci.contato_id and w.tipo='whatsapp' order by w.principal desc limit 1),
       c.telefone,
       'backfill',
       (c.telefone is not null)
from public.contato_identidades ci
  join public.contatos c on c.id=ci.contato_id
where ci.provedor='evolution_lid' and ci.valor_normalizado is not null
on conflict do nothing;

-- 3b) marca estado dos contatos já resolvidos (têm telefone).
update public.contatos set identidade_tipo='telefone', identidade_fonte=coalesce(identidade_fonte,'historico')
where telefone is not null and identidade_tipo is null;

-- 3c) renomeia contatos cujo NOME é um LID cru (só dígitos, >=12) E que têm identidade LID E não têm telefone.
update public.contatos c
set nome='Identidade protegida', identidade_tipo='lid_pendente', identidade_fonte='backfill'
where c.telefone is null
  and c.nome ~ '^[0-9]{12,}$'
  and exists (select 1 from public.contato_identidades ci where ci.contato_id=c.id and ci.provedor='evolution_lid');
