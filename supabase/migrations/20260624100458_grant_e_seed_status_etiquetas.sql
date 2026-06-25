-- ============================================================================
-- CORREÇÃO (homologação) — NÃO altera migrations antigas já aplicadas.
--
-- (1) GRANTs de tabela para os papéis da Data API em conversa_status_def e
--     etiquetas. A migration 20260624020643 criou as tabelas com RLS+policies,
--     mas sem GRANT; como o default do Supabase cloud não auto-expõe tabelas
--     novas (ver config.toml [api]), o PostgREST respondia 403.
--     A RLS continua sendo a AUTORIDADE de isolamento/permissão:
--       - leitura: membros da org (inclui atendente) — policies csd_sel/etq_sel;
--       - escrita: apenas admin/supervisor — policies *_ins/_upd/_del.
--     anon NÃO recebe acesso. service_role recebe ALL (Edge Functions).
--     As duas tabelas usam uuid (gen_random_uuid) — não há sequences a conceder.
--
-- (2) Provisionamento: garante que TODA organização nova receba, de forma
--     idempotente, os 5 status de sistema. O backfill da 20260624020643 só
--     cobriu as orgs existentes naquele momento. Trigger AFTER INSERT em
--     organizacoes (consistente com o projeto; cobre a RPC provisionar_organizacao
--     e qualquer outro caminho de criação). Não modifica orgs já configuradas.
-- ============================================================================

-- (1) GRANTS ------------------------------------------------------------------
grant select, insert, update, delete on table public.conversa_status_def to authenticated;
grant select, insert, update, delete on table public.etiquetas            to authenticated;
grant all on table public.conversa_status_def to service_role;
grant all on table public.etiquetas            to service_role;

-- (2) SEED DE STATUS PADRÃO PARA ORGS NOVAS -----------------------------------
create or replace function public.seed_status_conversa_padrao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- idempotente: unique (organizacao_id, slug) impede duplicação.
  insert into public.conversa_status_def (organizacao_id, slug, nome, cor, ordem, padrao, ativo, sistema)
  values
    (new.id, 'aberta',         'Aberta',         '#3b82f6', 0, true,  true, true),
    (new.id, 'em_atendimento', 'Em atendimento', '#f59e0b', 1, false, true, true),
    (new.id, 'pendente',       'Pendente',       '#a855f7', 2, false, true, true),
    (new.id, 'resolvida',      'Resolvida',      '#22c55e', 3, false, true, true),
    (new.id, 'fechada',        'Fechada',        '#64748b', 4, false, true, true)
  on conflict (organizacao_id, slug) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_org_seed_status on public.organizacoes;
create trigger trg_org_seed_status
  after insert on public.organizacoes
  for each row execute function public.seed_status_conversa_padrao();
