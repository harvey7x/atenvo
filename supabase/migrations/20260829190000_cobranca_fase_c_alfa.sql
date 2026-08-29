-- ============================================================
-- MODO COBRANÇA — Fase C-alfa (dono 29/08: "coloca pra funcionar")
-- 1) Números de cobrança viram instâncias Evolution PRÓPRIAS,
--    ISOLADAS do atendimento: nada de linha em `canais` — o webhook
--    do atendimento não conhece a instância, então conversas de
--    cobrança NUNCA aparecem no inbox (exigência do dono: "somente
--    em cobranças"). canal_id herdado da Fase A fica sem uso.
-- 2) Mensagens da régua viram SEQUÊNCIA de itens (mais de uma bolha
--    por passo) com mídia: texto, imagem, áudio, documento.
-- Reset dos clientes executado à parte (backup bkp_reset_*_20260829).
-- ============================================================

alter table public.cobranca_numeros
  add column if not exists instancia text,
  add column if not exists telefone text,
  add column if not exists estado text not null default 'desconectado'
    check (estado in ('desconectado', 'aguardando_qr', 'conectado'));
create unique index if not exists uq_cobranca_numeros_instancia
  on public.cobranca_numeros (instancia) where instancia is not null;

create table if not exists public.cobranca_mensagem_itens (
  id uuid primary key default gen_random_uuid(),
  organizacao_id uuid not null references public.organizacoes(id) on delete cascade,
  mensagem_id uuid not null references public.cobranca_mensagens(id) on delete cascade,
  ordem int not null default 0,
  tipo text not null default 'texto' check (tipo in ('texto', 'imagem', 'audio', 'documento')),
  corpo text,                 -- texto da bolha, ou legenda da mídia
  midia_url text,
  midia_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_cmi_mensagem on public.cobranca_mensagem_itens (mensagem_id, ordem);

drop trigger if exists trg_cobranca_mensagem_itens_touch on public.cobranca_mensagem_itens;
create trigger trg_cobranca_mensagem_itens_touch before update on public.cobranca_mensagem_itens
  for each row execute function public.fn_ciclo_venc_touch();

alter table public.cobranca_mensagem_itens enable row level security;
create policy cobranca_mensagem_itens_sel on public.cobranca_mensagem_itens for select
  using (is_platform_admin() or (is_member(organizacao_id) and org_operacional(organizacao_id)));
create policy cobranca_mensagem_itens_ins on public.cobranca_mensagem_itens for insert
  with check (public.cobranca_gestor(organizacao_id));
create policy cobranca_mensagem_itens_upd on public.cobranca_mensagem_itens for update
  using (public.cobranca_gestor(organizacao_id)) with check (public.cobranca_gestor(organizacao_id));
-- diferente das irmãs, item PODE ser deletado pelo gestor: editar a
-- régua é recompor a sequência de bolhas
create policy cobranca_mensagem_itens_del on public.cobranca_mensagem_itens for delete
  using (public.cobranca_gestor(organizacao_id));
grant select, insert, update, delete on public.cobranca_mensagem_itens to authenticated;
