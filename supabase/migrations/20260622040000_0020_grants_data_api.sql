-- ============================================================
-- 0020 — GRANTs explícitos do Data API (PostgREST).
-- Não dependemos das permissões automáticas do Supabase: revogamos os GRANTs
-- amplos de anon/authenticated e concedemos apenas o necessário. RLS continua
-- sendo a camada de autorização por linha/papel (estas migrations NÃO alteram RLS).
-- ============================================================

-- 0) USAGE do schema (o Data API precisa para resolver objetos)
grant usage on schema public to anon, authenticated, service_role;

-- 1) Reset dos GRANTs automáticos amplos em anon/authenticated
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
-- anon: sem acesso a dados (login obrigatório) — mantém apenas USAGE do schema.

-- 2) service_role: acesso total (futuras Edge Functions; já opera com BYPASSRLS)
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- 3) authenticated: SOMENTE o necessário (sempre sob RLS)

-- 3a) Tabelas operacionais — CRUD (RLS limita por organização/papel)
grant select, insert, update, delete on
  public.canais, public.fontes_aquisicao, public.contatos, public.contato_identidades,
  public.conversas, public.mensagens, public.anexos_mensagem, public.oportunidades,
  public.scripts, public.script_categorias, public.script_anexos,
  public.cobrancas, public.cobranca_pagamentos, public.cobranca_eventos,
  public.configuracoes, public.integracoes, public.organizacao_usuarios
to authenticated;

-- 3b) Logs de integração — leitura + inserção (RLS)
grant select, insert on public.integracao_logs to authenticated;

-- 3c) Catálogo de planos — somente leitura
grant select on public.planos to authenticated;

-- 3d) usuarios — leitura + atualização APENAS de nome e avatar_url
grant select on public.usuarios to authenticated;
grant update (nome, avatar_url) on public.usuarios to authenticated;

-- 3e) organizacoes — leitura + UPDATE apenas das colunas administrativas
--     (sem status/plano/assinatura_*; sem insert/delete pelo frontend).
--     O provisionamento usa RPC SECURITY DEFINER, que não depende deste grant.
grant select on public.organizacoes to authenticated;
grant update (nome, nome_fantasia, slug, documento, logo_url, email, telefone, timezone, moeda, configuracoes)
  on public.organizacoes to authenticated;

-- 3f) Comerciais/financeiras — SOMENTE leitura (frontend não escreve)
grant select on
  public.organizacao_limites, public.assinaturas, public.assinatura_itens,
  public.assinatura_eventos, public.faturas, public.pagamentos, public.pagamento_eventos
to authenticated;

-- 3g) audit_log — SOMENTE leitura (gravação apenas por trigger/serviço)
grant select on public.audit_log to authenticated;

-- 4) Funções: remove o execute automático de anon/authenticated e concede apenas
--    as funções usadas pelo RLS e a RPC de provisionamento.
revoke execute on all functions in schema public from anon, authenticated;
grant execute on function public.is_platform_admin()              to authenticated;
grant execute on function public.is_member(uuid)                  to authenticated;
grant execute on function public.papel_na_org(uuid)               to authenticated;
grant execute on function public.org_operacional(uuid)            to authenticated;
grant execute on function public.compartilha_org(uuid)            to authenticated;
grant execute on function public.provisionar_organizacao(text, text) to authenticated;
