-- Documentos do INSS pelo Atenvo (modelo central, 05/10/2026).
--
-- Por quê: instalar o coletor nas máquinas dos atendentes falhou (Windows sem
-- acesso), e expor o coletor na rede local também não destravou. O desenho que
-- não depende de rede nenhuma: o atendente PEDE os documentos na ficha do
-- cliente; o coletor (rodando só no Mac do escritório) mostra a fila, quem está
-- lá faz o login gov.br e dispara; os PDFs sobem para o bucket `inss-docs` e o
-- atendente baixa direto da ficha, de qualquer computador.
--
-- A ponte coletor->Supabase é a edge function `coletor-inss` (service role no
-- servidor), autenticada por secret em webhook_config (chave 'coletor-inss',
-- linha criada fora desta migration para o valor não ir ao repositório) — o
-- mesmo padrão do mensagens-agendadas-processar. O coletor nunca vê chave do
-- banco; o atendente nunca vê nada além das suas tabelas com RLS.

-- ─── fila de pedidos ────────────────────────────────────────────────────────

create table public.inss_pedidos (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  contato_id      uuid not null,
  -- snapshot no momento do pedido: a coleta usa estes valores (nome da pasta e
  -- conferência de identidade do login gov.br), mesmo que o contato mude depois
  nome            text not null,
  cpf             text not null,
  documentos      text[] not null
                    default '{extrato_pagamento,extrato_consignado,carta_concessao,irpf,situacao_cadastral}',
  status          text not null default 'aberto'
                    check (status in ('aberto','em_andamento','pronto','falhou','cancelado')),
  erro            text,
  solicitante_id  uuid references public.usuarios(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  finalizado_em   timestamptz,
  constraint fk_inss_pedido_contato foreign key (contato_id, organizacao_id)
    references public.contatos(id, organizacao_id) on delete cascade
);

create index inss_pedidos_org_status on public.inss_pedidos (organizacao_id, status, criado_em desc);
create index inss_pedidos_contato    on public.inss_pedidos (contato_id, organizacao_id);

-- toque de atualizado_em + carimbo de finalizado_em quando o status encerra
create or replace function public.fn_inss_pedido_before()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.atualizado_em := now();
  if new.status in ('pronto','falhou','cancelado') and new.status is distinct from old.status then
    new.finalizado_em := coalesce(new.finalizado_em, now());
  end if;
  return new;
end $$;

create trigger trg_inss_pedido_before before update on public.inss_pedidos
  for each row execute function public.fn_inss_pedido_before();

create trigger trg_audit after insert or update or delete on public.inss_pedidos
  for each row execute function public.fn_audit();

-- ─── documentos coletados ───────────────────────────────────────────────────

create table public.inss_documentos (
  id              uuid primary key default gen_random_uuid(),
  organizacao_id  uuid not null references public.organizacoes(id) on delete cascade,
  pedido_id       uuid not null references public.inss_pedidos(id) on delete cascade,
  contato_id      uuid not null,
  titulo          text not null,            -- nome do arquivo como o coletor salvou
  caminho         text not null unique,     -- <org>/<contato>/<pedido>/<arquivo> no bucket inss-docs
  tamanho_bytes   bigint,
  criado_em       timestamptz not null default now(),
  constraint fk_inss_doc_contato foreign key (contato_id, organizacao_id)
    references public.contatos(id, organizacao_id) on delete cascade
);

create index inss_documentos_pedido  on public.inss_documentos (pedido_id);
create index inss_documentos_contato on public.inss_documentos (contato_id, organizacao_id);

-- ─── permissões ─────────────────────────────────────────────────────────────
-- atendente: pede, acompanha, cancela (update), lê documentos. Quem escreve
-- documentos e conclui pedidos é só a edge function (service role, fora do RLS).

alter table public.inss_pedidos    enable row level security;
alter table public.inss_documentos enable row level security;

create policy inss_pedidos_sel on public.inss_pedidos
  for select using (public.is_member(organizacao_id));
create policy inss_pedidos_ins on public.inss_pedidos
  for insert with check (public.is_member(organizacao_id));
create policy inss_pedidos_upd on public.inss_pedidos
  for update using (public.is_member(organizacao_id))
  with check (public.is_member(organizacao_id));

create policy inss_documentos_sel on public.inss_documentos
  for select using (public.is_member(organizacao_id));

revoke all on public.inss_pedidos    from anon;
revoke all on public.inss_documentos from anon;
grant select, insert, update on public.inss_pedidos to authenticated;
grant select on public.inss_documentos to authenticated;
-- a edge function (service role) conclui pedidos e registra documentos; tabela
-- nova NÃO herda grant automático para service_role neste projeto
grant all on public.inss_pedidos    to service_role;
grant all on public.inss_documentos to service_role;

-- ─── storage ────────────────────────────────────────────────────────────────
-- bucket privado, pasta raiz = uuid da organização (mesmo molde do script-midia).
-- atendente só LÊ (createSignedUrl exige select); quem grava é a edge function.

insert into storage.buckets (id, name, public)
  values ('inss-docs', 'inss-docs', false)
  on conflict (id) do nothing;

create policy inss_docs_sel on storage.objects for select to authenticated
  using (bucket_id = 'inss-docs'
         and public.is_member(nullif((storage.foldername(name))[1], '')::uuid));
