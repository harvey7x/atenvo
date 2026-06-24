-- ===== organizacao_id em todas as tabelas de negocio (multiempresa) =====
-- Aditivo. Em banco vazio nao ha backfill; o vinculo de dados a um tenant
-- acontece via seed (homologacao) ou pelo fluxo real de provisionamento.
do $$
declare t text;
begin
  foreach t in array array[
    'canais','fontes_aquisicao','contatos','contato_identidades','conversas','mensagens',
    'anexos_mensagem','oportunidades','cobrancas','cobranca_pagamentos','cobranca_eventos',
    'script_categorias','scripts','script_anexos','integracoes','integracao_logs','audit_log'
  ] loop
    execute format('alter table public.%I add column organizacao_id uuid not null', t);
    execute format('alter table public.%I add constraint %I foreign key (organizacao_id) references public.organizacoes(id) on delete cascade', t, t||'_org_fk');
    execute format('create index %I on public.%I (organizacao_id)', 'idx_'||t||'_org', t);
  end loop;
end $$;

-- configuracoes: passa a ser por organizacao (PK composta)
alter table public.configuracoes add column organizacao_id uuid not null;
alter table public.configuracoes drop constraint configuracoes_pkey;
alter table public.configuracoes add constraint configuracoes_pkey primary key (organizacao_id, chave);
alter table public.configuracoes add constraint configuracoes_org_fk foreign key (organizacao_id) references public.organizacoes(id) on delete cascade;
